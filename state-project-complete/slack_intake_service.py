"""Slack Phase 1: deterministic intake plumbing.

This module answers "what legitimate, approved Slack conversations changed
since I last processed them?" It never decides whether a conversation
matters to the project. It must never call an LLM, create Evidence, create
a Review or Question, or mutate Current State. See
docs/architecture/SLACK_INTEGRATION_PLAN.md and the Phase 1 contract for the
full product rationale.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from db import Connection
from interpretation_pipeline_integrated import new_id

DEFAULT_QUIET_WINDOW_SECONDS = 15 * 60

# Sentinel meaning "no checkpoint is currently due." A real timestamp is
# always in the past relative to this, so `next_checkpoint_at <= now` never
# matches a conversation that was just checkpointed until new activity
# resets it forward again.
_NO_PENDING_CHECKPOINT = "9999-12-31T00:00:00+00:00"

_SYSTEM_SUBTYPES = {
    "channel_join", "channel_leave", "bot_add", "bot_remove",
    "channel_topic", "channel_purpose", "channel_name",
    "pinned_item", "unpinned_item", "channel_archive", "channel_unarchive",
    "group_join", "group_leave",
}


def utc_now_iso(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).isoformat()


def _parse_db_timestamp(value: Any) -> datetime:
    """Parse a timestamp read back from either SQLite (text) or Postgres (datetime)."""
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        dt = datetime.fromisoformat(text.replace(" ", "T", 1) if "T" not in text else text)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _add_seconds_iso(base_iso: str, seconds: int) -> str:
    return (_parse_db_timestamp(base_iso) + timedelta(seconds=seconds)).isoformat()


def classify_event(event: dict) -> str:
    """Deterministic, channel-agnostic classification of a Slack event.

    Returns one of: "content_message", "content_edit", "content_delete",
    "bot_message" (content, but subject to per-channel include_bots), "noise".
    """
    event_type = event.get("type")
    if event_type in ("reaction_added", "reaction_removed"):
        return "noise"
    if event_type != "message":
        return "noise"

    subtype = event.get("subtype")
    if subtype == "message_deleted":
        return "content_delete"
    if subtype == "message_changed":
        text = ((event.get("message") or {}).get("text") or "").strip()
        return "content_edit" if text else "noise"
    if subtype in _SYSTEM_SUBTYPES:
        return "noise"
    if subtype == "bot_message" or event.get("bot_id"):
        return "bot_message"

    text = (event.get("text") or "").strip()
    if not text:
        return "noise"
    return "content_message"


def _extract_channel_id(event: dict) -> str:
    if event.get("channel"):
        return event["channel"]
    item = event.get("item") or {}
    return item.get("channel", "")


def _message_identity_ts(kind: str, event: dict) -> str:
    if kind == "content_edit":
        return (event.get("message") or {}).get("ts", "")
    if kind == "content_delete":
        prev = event.get("previous_message") or {}
        return prev.get("ts") or event.get("deleted_ts", "")
    return event.get("ts", "")


def _message_thread_root(kind: str, event: dict) -> str:
    if kind == "content_edit":
        msg = event.get("message") or {}
        return msg.get("thread_ts") or msg.get("ts", "")
    if kind == "content_delete":
        prev = event.get("previous_message") or {}
        return prev.get("thread_ts") or prev.get("ts") or event.get("deleted_ts", "")
    return event.get("thread_ts") or event.get("ts", "")


def _message_user(kind: str, event: dict) -> str | None:
    if kind == "content_edit":
        return (event.get("message") or {}).get("user")
    if kind == "content_delete":
        return (event.get("previous_message") or {}).get("user")
    return event.get("user")


def _message_text(kind: str, event: dict) -> str:
    if kind == "content_edit":
        return (event.get("message") or {}).get("text", "") or ""
    if kind == "content_delete":
        return ""
    return event.get("text", "") or ""


def _get_channel(connection: Connection, team_id: str, channel_id: str) -> dict | None:
    return connection.execute(
        "SELECT * FROM slack_channels WHERE team_id=? AND channel_id=?",
        (team_id, channel_id),
    ).fetchone()


def _before_ingestion_start(channel: dict, message_ts: str) -> bool:
    if not message_ts:
        return False
    try:
        message_at = datetime.fromtimestamp(float(message_ts), tz=timezone.utc)
    except (TypeError, ValueError):
        return False
    started_at = _parse_db_timestamp(channel["ingestion_started_at"])
    return message_at < started_at


def _record_slack_event(
    connection: Connection,
    *,
    event_id: str,
    team_id: str,
    channel_id: str,
    event_type: str,
    event_ts: str,
    thread_root_ts: str,
    payload: dict,
) -> tuple[str, bool]:
    """Insert the immutable event log row. Returns (row_id, was_new)."""
    existing = connection.execute(
        "SELECT id FROM slack_events WHERE event_id=?", (event_id,)
    ).fetchone()
    if existing:
        return existing["id"], False

    row_id = new_id("slkev")
    try:
        connection.execute(
            "INSERT INTO slack_events "
            "(id, event_id, team_id, channel_id, event_type, event_ts, thread_root_ts, payload, disposition) "
            "VALUES (?,?,?,?,?,?,?,?, 'pending')",
            (row_id, event_id, team_id, channel_id, event_type, event_ts, thread_root_ts, json.dumps(payload)),
        )
    except Exception:
        # A concurrent delivery of the same Slack retry raced us on the
        # UNIQUE(event_id) constraint. Treat it as the duplicate it is.
        existing = connection.execute(
            "SELECT id FROM slack_events WHERE event_id=?", (event_id,)
        ).fetchone()
        if existing:
            return existing["id"], False
        raise
    return row_id, True


def _upsert_message(
    connection: Connection,
    *,
    team_id: str,
    channel_id: str,
    message_ts: str,
    thread_root_ts: str,
    user_id: str | None,
    text: str,
    edited: bool,
    deleted: bool,
    now_iso: str,
) -> None:
    existing = connection.execute(
        "SELECT id, text, user_id, edited_at, removed_at_source_at FROM slack_messages "
        "WHERE team_id=? AND channel_id=? AND message_ts=?",
        (team_id, channel_id, message_ts),
    ).fetchone()
    if existing is None:
        connection.execute(
            "INSERT INTO slack_messages "
            "(id, team_id, channel_id, message_ts, thread_root_ts, user_id, text, edited_at, removed_at_source_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                new_id("slkmsg"), team_id, channel_id, message_ts, thread_root_ts, user_id, text,
                now_iso if edited else None, now_iso if deleted else None, now_iso,
            ),
        )
        return

    # A delete carries no reliable text/user of its own to trust over what's
    # already stored; preserve the existing projection and just mark removal.
    final_text = existing["text"] if deleted else text
    final_user = existing["user_id"] if deleted else user_id
    new_edited_at = now_iso if edited else existing["edited_at"]
    new_removed_at = now_iso if deleted else existing["removed_at_source_at"]
    connection.execute(
        "UPDATE slack_messages SET user_id=?, text=?, edited_at=?, removed_at_source_at=?, updated_at=? WHERE id=?",
        (final_user, final_text, new_edited_at, new_removed_at, now_iso, existing["id"]),
    )


def _touch_conversation(
    connection: Connection,
    *,
    team_id: str,
    channel_id: str,
    thread_root_ts: str,
    activity_at_iso: str,
    quiet_window_seconds: int,
) -> str:
    row = connection.execute(
        "SELECT id FROM slack_conversations WHERE team_id=? AND channel_id=? AND thread_root_ts=?",
        (team_id, channel_id, thread_root_ts),
    ).fetchone()
    next_checkpoint_iso = _add_seconds_iso(activity_at_iso, quiet_window_seconds)
    if row is None:
        conversation_id = new_id("slkconv")
        connection.execute(
            "INSERT INTO slack_conversations "
            "(id, team_id, channel_id, thread_root_ts, last_activity_at, next_checkpoint_at, "
            "last_checkpointed_message_count, latest_checkpoint_id) VALUES (?,?,?,?,?,?,0,NULL)",
            (conversation_id, team_id, channel_id, thread_root_ts, activity_at_iso, next_checkpoint_iso),
        )
        return conversation_id
    connection.execute(
        "UPDATE slack_conversations SET last_activity_at=?, next_checkpoint_at=? WHERE id=?",
        (activity_at_iso, next_checkpoint_iso, row["id"]),
    )
    return row["id"]


def process_slack_event(
    connection: Connection,
    *,
    team_id: str,
    channel_id: str,
    event: dict,
    quiet_window_seconds: int = DEFAULT_QUIET_WINDOW_SECONDS,
    now: datetime | None = None,
) -> dict:
    """Apply deterministic filtering/aggregation for one already-deduplicated event."""
    now_iso = utc_now_iso(now)
    kind = classify_event(event)
    channel = _get_channel(connection, team_id, channel_id)
    approved = channel is not None and channel["enabled"] == 1

    if kind == "bot_message":
        kind = "content_message" if approved and channel["include_bots"] == 1 else "noise"

    if not approved:
        return {"disposition": "unapproved_channel", "kind": kind}

    if kind not in ("content_message", "content_edit", "content_delete"):
        return {"disposition": "noise", "kind": kind}

    message_ts = _message_identity_ts(kind, event)
    thread_root_ts = _message_thread_root(kind, event)

    if not message_ts:
        return {"disposition": "noise", "kind": "noise"}

    if kind == "content_message" and thread_root_ts != message_ts and channel["include_threads"] != 1:
        return {"disposition": "noise", "kind": "noise"}

    if _before_ingestion_start(channel, message_ts):
        return {"disposition": "noise", "kind": "noise"}

    _upsert_message(
        connection,
        team_id=team_id,
        channel_id=channel_id,
        message_ts=message_ts,
        thread_root_ts=thread_root_ts,
        user_id=_message_user(kind, event),
        text=_message_text(kind, event),
        edited=(kind == "content_edit"),
        deleted=(kind == "content_delete"),
        now_iso=now_iso,
    )
    _touch_conversation(
        connection,
        team_id=team_id,
        channel_id=channel_id,
        thread_root_ts=thread_root_ts,
        activity_at_iso=now_iso,
        quiet_window_seconds=quiet_window_seconds,
    )
    return {"disposition": "conversation_updated", "kind": kind}


def handle_slack_event(
    connection: Connection,
    payload: dict,
    *,
    quiet_window_seconds: int = DEFAULT_QUIET_WINDOW_SECONDS,
    now: datetime | None = None,
) -> dict:
    """Top-level entry point for one Slack `event_callback` payload.

    Dedupes by Slack's own event_id first; a duplicate delivery does zero
    downstream work regardless of what the event contains.
    """
    inner_event = payload.get("event") or {}
    event_id = payload.get("event_id")
    team_id = payload.get("team_id") or inner_event.get("team", "")
    channel_id = _extract_channel_id(inner_event)
    event_type = inner_event.get("type", "unknown")
    event_ts = inner_event.get("ts") or ""
    thread_root_ts = inner_event.get("thread_ts") or event_ts

    if not event_id:
        raise ValueError("Slack event payload missing event_id")

    stored_id, is_new = _record_slack_event(
        connection,
        event_id=event_id,
        team_id=team_id,
        channel_id=channel_id,
        event_type=event_type,
        event_ts=event_ts,
        thread_root_ts=thread_root_ts,
        payload=payload,
    )
    if not is_new:
        return {"duplicate": True, "disposition": None, "kind": None}

    result = process_slack_event(
        connection,
        team_id=team_id,
        channel_id=channel_id,
        event=inner_event,
        quiet_window_seconds=quiet_window_seconds,
        now=now,
    )
    connection.execute(
        "UPDATE slack_events SET disposition=? WHERE id=?", (result["disposition"], stored_id)
    )
    return {"duplicate": False, **result}


def create_due_checkpoints(connection: Connection, now: datetime | None = None) -> list[str]:
    """Create immutable checkpoints for every conversation whose quiet window elapsed.

    Never calls a model and never touches Evidence/Review/Question tables.
    Returns the ids of newly created checkpoints.
    """
    now = now or datetime.now(timezone.utc)
    now_iso = utc_now_iso(now)
    rows = connection.execute(
        "SELECT id, team_id, channel_id, thread_root_ts, next_checkpoint_at, latest_checkpoint_id, "
        "last_checkpointed_message_count, last_checkpointed_at FROM slack_conversations"
    ).fetchall()

    created: list[str] = []
    for row in rows:
        if _parse_db_timestamp(row["next_checkpoint_at"]) > now:
            continue

        messages = connection.execute(
            "SELECT message_ts, edited_at, removed_at_source_at FROM slack_messages "
            "WHERE team_id=? AND channel_id=? AND thread_root_ts=? ORDER BY message_ts",
            (row["team_id"], row["channel_id"], row["thread_root_ts"]),
        ).fetchall()
        if not messages:
            connection.execute(
                "UPDATE slack_conversations SET next_checkpoint_at=? WHERE id=?",
                (_NO_PENDING_CHECKPOINT, row["id"]),
            )
            continue

        version = 1
        if row["latest_checkpoint_id"]:
            prev = connection.execute(
                "SELECT version FROM slack_checkpoints WHERE id=?", (row["latest_checkpoint_id"],)
            ).fetchone()
            version = (prev["version"] if prev else 0) + 1

        # Deltas are relative to the previous checkpoint, not the whole
        # conversation. last_checkpointed_at is NULL before the first
        # checkpoint, so everything counts as new for version 1.
        cutoff = _parse_db_timestamp(row["last_checkpointed_at"]) if row["last_checkpointed_at"] else None
        new_message_count = max(len(messages) - row["last_checkpointed_message_count"], 0)
        new_edit_count = sum(
            1 for m in messages if m["edited_at"] and (cutoff is None or _parse_db_timestamp(m["edited_at"]) > cutoff)
        )
        new_deletion_count = sum(
            1 for m in messages
            if m["removed_at_source_at"] and (cutoff is None or _parse_db_timestamp(m["removed_at_source_at"]) > cutoff)
        )

        checkpoint_id = new_id("slkchk")
        connection.execute(
            "INSERT INTO slack_checkpoints "
            "(id, conversation_id, version, previous_checkpoint_id, included_message_ids, "
            "new_reply_count, new_edit_count, new_deletion_count, status) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                checkpoint_id, row["id"], version, row["latest_checkpoint_id"],
                json.dumps([m["message_ts"] for m in messages]),
                new_message_count, new_edit_count, new_deletion_count,
                "ready_for_relevance",
            ),
        )
        connection.execute(
            "UPDATE slack_conversations SET latest_checkpoint_id=?, last_checkpointed_message_count=?, "
            "last_checkpointed_at=?, next_checkpoint_at=? WHERE id=?",
            (checkpoint_id, len(messages), now_iso, _NO_PENDING_CHECKPOINT, row["id"]),
        )
        created.append(checkpoint_id)
    return created


async def run_checkpoint_poll_loop(get_connection, interval_seconds: int, logger=None) -> None:
    """Background loop: periodically materialize due checkpoints.

    Intended to run as a single asyncio task for the life of the process.
    Never calls a model; only wraps create_due_checkpoints with scheduling
    and error isolation so one bad iteration doesn't kill the loop.
    """
    import asyncio

    while True:
        await asyncio.sleep(interval_seconds)
        try:
            with get_connection() as connection:
                created = create_due_checkpoints(connection)
                connection.commit()
            if created and logger:
                logger.info("slack_checkpoints_created count=%d", len(created))
        except asyncio.CancelledError:
            raise
        except Exception:
            if logger:
                logger.exception("slack_checkpoint_poll_iteration_failed")
