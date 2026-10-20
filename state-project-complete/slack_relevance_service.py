"""Slack Phase 2: relevance evaluation and Evidence creation.

Consumes the deterministic slack_checkpoints queue that Phase 1's
create_due_checkpoints() already materializes (immutable conversation
snapshots, no model calls, no Evidence). This module is the first place
Slack activity is allowed to call a model or create Evidence -- see
docs/architecture/SLACK_INTEGRATION_PLAN.md, "Phase 4 - relevance and
Evidence checkpoints".

A checkpoint is "due" when evaluated_at IS NULL. Every checkpoint is
marked evaluated exactly once, whether or not it produced Evidence, so
the queue always drains -- casual conversation is expected to outnumber
consequential conversation by a wide margin.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from db import Connection
from interpretation_pipeline_integrated import InterpretationProvider, new_id, process_evidence
from slack_intake_service import utc_now_iso

logger = logging.getLogger(__name__)


class RelevanceClassifier(Protocol):
    def classify(self, conversation_text: str) -> Mapping[str, Any]:
        """Return {"relevant": bool, "summary": str}.

        summary is only used when relevant is true; it becomes the new
        Evidence's content, so it should read as a standalone statement of
        what the conversation established, not a transcript excerpt.
        """
        ...


class ProviderRelevanceClassifier:
    """Adapts an InterpretationProvider's classify_slack_relevance() to RelevanceClassifier.

    Lets the relevance worker reuse whichever provider is already configured
    for Evidence interpretation (same STATE_PROVIDER/model, same API key)
    instead of introducing a second, separately-configured model.
    """

    def __init__(self, provider: InterpretationProvider) -> None:
        self._provider = provider

    def classify(self, conversation_text: str) -> Mapping[str, Any]:
        return self._provider.classify_slack_relevance(conversation_text)


class FakeSlackRelevanceClassifier:
    """Deterministic classifier for tests and local dev -- never calls a model.

    Flags a conversation as relevant only if it contains one of a small set
    of decision/change/risk signal words, mirroring the architecture doc's
    "start slightly permissive" guidance without needing a live provider.
    """

    _SIGNAL_WORDS = (
        "decid", "risk", "block", "requir", "must", "agreed", "correction",
        "changed", "owns", "ownership", "deadline", "blocker",
    )

    def classify(self, conversation_text: str) -> Mapping[str, Any]:
        lowered = conversation_text.lower()
        if any(word in lowered for word in self._SIGNAL_WORDS):
            return {"relevant": True, "summary": conversation_text.strip()[:500]}
        return {"relevant": False, "summary": ""}


def _conversation_text(connection: Connection, team_id: str, channel_id: str, thread_root_ts: str) -> str:
    messages = connection.execute(
        "SELECT user_id, text FROM slack_messages WHERE team_id=? AND channel_id=? AND thread_root_ts=? "
        "AND removed_at_source_at IS NULL ORDER BY message_ts",
        (team_id, channel_id, thread_root_ts),
    ).fetchall()
    return "\n".join(f"{row['user_id'] or 'unknown'}: {row['text']}" for row in messages if row["text"])


def _channel_display_name(connection: Connection, team_id: str, channel_id: str) -> str:
    row = connection.execute(
        "SELECT channel_name FROM slack_channels WHERE team_id=? AND channel_id=?",
        (team_id, channel_id),
    ).fetchone()
    name = row["channel_name"] if row else None
    return f"#{name}" if name else channel_id


def _previous_evidence_id(connection: Connection, previous_checkpoint_id: str | None) -> str | None:
    if not previous_checkpoint_id:
        return None
    row = connection.execute(
        "SELECT evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id=?", (previous_checkpoint_id,)
    ).fetchone()
    return row["evidence_id"] if row else None


# #519: channels approved before projects were recorded on them have no project_id. They keep
# today's behaviour (Northstar) until someone re-approves them from a project; whether they should
# instead stop creating Evidence is an open product question.
LEGACY_SLACK_PROJECT_ID = "northstar"


def channel_project_id(connection: Connection, team_id: str, channel_id: str) -> str:
    """The project a channel's Evidence belongs to (#519)."""
    row = connection.execute(
        "SELECT project_id FROM slack_channels WHERE team_id=? AND channel_id=?", (team_id, channel_id)
    ).fetchone()
    value = (row[0] if not hasattr(row, "keys") else row["project_id"]) if row else None
    return value or LEGACY_SLACK_PROJECT_ID


def _evaluate_one(
    connection: Connection,
    checkpoint: Mapping[str, Any],
    classifier: RelevanceClassifier,
    provider: InterpretationProvider,
    now_iso: str,
) -> None:
    conversation_text = _conversation_text(
        connection, checkpoint["team_id"], checkpoint["channel_id"], checkpoint["thread_root_ts"]
    )
    result = classifier.classify(conversation_text) if conversation_text else {"relevant": False}

    evidence_id = None
    summary = str(result.get("summary") or "").strip()
    if result.get("relevant") and summary:
        evidence_id = new_id("evidence")
        project_id = channel_project_id(connection, checkpoint["team_id"], checkpoint["channel_id"])
        connection.execute(
            "INSERT INTO evidence(id, content, source_type, supersedes_evidence_id, source_name, project_id) "
            "VALUES (?,?,?,?,?,?)",
            (
                evidence_id,
                summary,
                "slack_thread",
                _previous_evidence_id(connection, checkpoint["previous_checkpoint_id"]),
                _channel_display_name(connection, checkpoint["team_id"], checkpoint["channel_id"]),
                project_id,
            ),
        )
        connection.commit()
        # Feeds Slack Evidence through the exact same interpretation ->
        # Review/Question pipeline as every other source. No special-casing
        # beyond the provenance fields set above. The pipeline writes Reviews and
        # Questions into connection.project_id, so it runs in the channel's project (#519).
        previous_project = getattr(connection, "project_id", None)
        if previous_project is None:  # a raw sqlite3 connection (tests) has no project; Northstar applies
            process_evidence(connection, evidence_id=evidence_id, provider=provider)
        else:
            try:
                connection.project_id = project_id
                process_evidence(connection, evidence_id=evidence_id, provider=provider)
            finally:
                connection.project_id = previous_project

    # slack_checkpoints itself is immutable (a DB trigger blocks every
    # UPDATE), so the evaluation outcome is recorded as its own row rather
    # than mutating the checkpoint.
    connection.execute(
        "INSERT INTO slack_checkpoint_evaluations (id, checkpoint_id, evaluated_at, evidence_id) VALUES (?,?,?,?)",
        (new_id("slkeval"), checkpoint["id"], now_iso, evidence_id),
    )
    connection.commit()


# #548 (Paige, Oct 20): a checkpoint that keeps failing used to be retried on every poll forever, with a
# paid classifier call each time. After MAX_CHECKPOINT_ATTEMPTS failures it is recorded as evaluated with
# no Evidence and logged. The count lives in memory, so a restart allows at most that many more tries.
MAX_CHECKPOINT_ATTEMPTS = 3
_FAILED_ATTEMPTS: dict[str, int] = {}


def _give_up_on_checkpoint(connection: Connection, checkpoint_id: str, now_iso: str) -> None:
    logger.error("Slack checkpoint %s failed %s times; giving up (no Evidence created)",
                 checkpoint_id, MAX_CHECKPOINT_ATTEMPTS)
    try:
        connection.execute(
            "INSERT INTO slack_checkpoint_evaluations (id, checkpoint_id, evaluated_at, evidence_id) VALUES (?,?,?,NULL)",
            (new_id("slkeval"), checkpoint_id, now_iso),
        )
        connection.commit()
        _FAILED_ATTEMPTS.pop(checkpoint_id, None)
    except Exception:
        logger.exception("Could not record giving up on Slack checkpoint %s", checkpoint_id)
        connection.rollback()


def evaluate_due_checkpoints(
    connection: Connection,
    classifier: RelevanceClassifier,
    provider: InterpretationProvider,
    now: datetime | None = None,
) -> list[str]:
    """Evaluate every pending checkpoint. Returns the ids evaluated.

    One checkpoint's classifier or provider failure is logged and skipped
    (left pending for the next pass) rather than blocking the rest of the
    queue -- mirrors the error isolation in slack_intake_service's own
    checkpoint poll loop.
    """
    now_iso = utc_now_iso(now or datetime.now(timezone.utc))
    checkpoints = connection.execute(
        "SELECT sc.id, sc.previous_checkpoint_id, "
        "conv.team_id, conv.channel_id, conv.thread_root_ts "
        "FROM slack_checkpoints sc "
        "JOIN slack_conversations conv ON conv.id = sc.conversation_id "
        "LEFT JOIN slack_checkpoint_evaluations sce ON sce.checkpoint_id = sc.id "
        "WHERE sce.id IS NULL"
    ).fetchall()

    evaluated: list[str] = []
    for checkpoint in checkpoints:
        try:
            _evaluate_one(connection, checkpoint, classifier, provider, now_iso)
        except Exception:
            logger.exception("Slack relevance evaluation failed for checkpoint %s", checkpoint["id"])
            _FAILED_ATTEMPTS[checkpoint["id"]] = _FAILED_ATTEMPTS.get(checkpoint["id"], 0) + 1
            # Discard this checkpoint's half-finished writes before the next one: otherwise Postgres
            # stays aborted for the rest of the batch, and on SQLite the next commit would keep them.
            connection.rollback()
            if _FAILED_ATTEMPTS[checkpoint["id"]] >= MAX_CHECKPOINT_ATTEMPTS:
                _give_up_on_checkpoint(connection, checkpoint["id"], now_iso)
            continue
        _FAILED_ATTEMPTS.pop(checkpoint["id"], None)
        evaluated.append(checkpoint["id"])
    return evaluated


async def run_relevance_poll_loop(get_connection, classifier, provider, interval_seconds: int, logger=None) -> None:
    """Background loop: periodically evaluate due checkpoints.

    Intended to run as a single asyncio task for the life of the process,
    mirroring slack_intake_service.run_checkpoint_poll_loop.
    """
    import asyncio

    log = logger or globals()["logger"]
    while True:
        try:
            with get_connection() as connection:
                evaluate_due_checkpoints(connection, classifier, provider)
        except Exception:
            log.exception("Slack relevance poll loop iteration failed")
        await asyncio.sleep(interval_seconds)
