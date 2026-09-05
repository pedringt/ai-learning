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
        connection.execute(
            "INSERT INTO evidence(id, content, source_type, supersedes_evidence_id, source_name) "
            "VALUES (?,?,?,?,?)",
            (
                evidence_id,
                summary,
                "slack_thread",
                _previous_evidence_id(connection, checkpoint["previous_checkpoint_id"]),
                _channel_display_name(connection, checkpoint["team_id"], checkpoint["channel_id"]),
            ),
        )
        connection.commit()
        # Feeds Slack Evidence through the exact same interpretation ->
        # Review/Question pipeline as every other source. No special-casing
        # beyond the provenance fields set above.
        process_evidence(connection, evidence_id=evidence_id, provider=provider)

    # slack_checkpoints itself is immutable (a DB trigger blocks every
    # UPDATE), so the evaluation outcome is recorded as its own row rather
    # than mutating the checkpoint.
    connection.execute(
        "INSERT INTO slack_checkpoint_evaluations (id, checkpoint_id, evaluated_at, evidence_id) VALUES (?,?,?,?)",
        (new_id("slkeval"), checkpoint["id"], now_iso, evidence_id),
    )
    connection.commit()


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
            continue
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
