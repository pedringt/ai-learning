"""Slack Phase 1 acceptance tests: deterministic intake plumbing only.

Covers the acceptance matrix in the Phase 1 contract: signature/replay
verification, URL verification, dedup, channel approval, deterministic
noise filtering, conversation/thread aggregation, quiet-window checkpoints,
edits, deletes, and workspace isolation. None of this may call a model or
touch Evidence/Review/Question tables.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import Settings, create_app
from database_migration_backed import get_test_db
from slack_intake_service import (
    DEFAULT_QUIET_WINDOW_SECONDS,
    classify_event,
    create_due_checkpoints,
    handle_slack_event,
    run_checkpoint_poll_loop,
)
from slack_signing import SlackSignatureError, verify_slack_request

TEAM_ID = "T123"
CHANNEL_ID = "C_APPROVED"

# Slack timestamps are real Unix-epoch seconds (with a fractional dedup
# suffix), not small decorative numbers. Build test timestamps off a fixed
# real-world epoch base so they fall after any sane ingestion_started_at
# default instead of landing in 1970.
_BASE_EPOCH = 1_700_000_000.0


def ts(offset: float) -> str:
    return f"{_BASE_EPOCH + offset:.6f}"


def _insert_channel(conn, *, team_id=TEAM_ID, channel_id=CHANNEL_ID, enabled=1,
                     include_threads=1, include_bots=0, ingestion_started_at="2000-01-01T00:00:00+00:00"):
    conn.execute(
        "INSERT INTO slack_channels "
        "(id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, ingestion_started_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (
            f"slkch_{channel_id}", team_id, channel_id, "northstar-project",
            enabled, include_threads, include_bots, ingestion_started_at,
        ),
    )


def _message_event(event_ts, *, text="Meaningful project update", user="U1", thread_ts=None, bot_id=None, subtype=None):
    event = {"type": "message", "channel": CHANNEL_ID, "user": user, "text": text, "ts": event_ts}
    if thread_ts:
        event["thread_ts"] = thread_ts
    if bot_id:
        event["bot_id"] = bot_id
        event["subtype"] = "bot_message"
    if subtype:
        event["subtype"] = subtype
    return event


def _payload(event, *, event_id, team_id=TEAM_ID):
    return {
        "type": "event_callback",
        "team_id": team_id,
        "event_id": event_id,
        "event": event,
    }


# ---------------------------------------------------------------------------
# Pure classification
# ---------------------------------------------------------------------------

def test_classify_plain_message_is_content():
    assert classify_event(_message_event(ts(1))) == "content_message"


def test_classify_reaction_is_noise():
    assert classify_event({"type": "reaction_added", "item": {"channel": CHANNEL_ID}}) == "noise"


def test_classify_join_leave_is_noise():
    assert classify_event({"type": "message", "subtype": "channel_join"}) == "noise"


def test_classify_empty_message_is_noise():
    assert classify_event(_message_event(ts(1), text="   ")) == "noise"


def test_classify_bot_message_is_flagged_separately_from_plain_content():
    assert classify_event(_message_event(ts(1), bot_id="B1")) == "bot_message"


def test_classify_short_reply_is_not_filtered_by_length():
    assert classify_event(_message_event(ts(2), text="thanks", thread_ts=ts(1))) == "content_message"


# ---------------------------------------------------------------------------
# Channel approval + noise filtering via the full intake pipeline
# ---------------------------------------------------------------------------

def test_unapproved_channel_creates_no_conversation():
    with get_test_db() as conn:
        # No slack_channels row at all -> not approved.
        result = handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"))
        assert result["disposition"] == "unapproved_channel"
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_conversations").fetchone()["n"] == 0


def test_approved_channel_casual_bot_noise_is_a_deterministic_no_op():
    with get_test_db() as conn:
        _insert_channel(conn, include_bots=0)
        result = handle_slack_event(
            conn, _payload(_message_event(ts(1), bot_id="B1"), event_id="ev1")
        )
        assert result["disposition"] == "noise"
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_conversations").fetchone()["n"] == 0


def test_approved_channel_standalone_message_creates_one_conversation():
    with get_test_db() as conn:
        _insert_channel(conn)
        result = handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"))
        assert result["disposition"] == "conversation_updated"
        rows = conn.execute("SELECT * FROM slack_conversations").fetchall()
        assert len(rows) == 1
        assert rows[0]["thread_root_ts"] == ts(1)


def test_busy_thread_with_many_replies_stays_one_conversation():
    with get_test_db() as conn:
        _insert_channel(conn)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"))
        for i, offset in enumerate([3, 4, 7], start=2):
            handle_slack_event(
                conn,
                _payload(_message_event(ts(offset), thread_ts=ts(1), text=f"reply {i}"), event_id=f"ev{i}"),
            )
        conversations = conn.execute("SELECT * FROM slack_conversations").fetchall()
        assert len(conversations) == 1
        messages = conn.execute("SELECT * FROM slack_messages WHERE thread_root_ts=?", (ts(1),)).fetchall()
        assert len(messages) == 4


# ---------------------------------------------------------------------------
# Dedup / idempotency
# ---------------------------------------------------------------------------

def test_duplicate_event_id_does_zero_downstream_work():
    with get_test_db() as conn:
        _insert_channel(conn)
        first = handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="dup-1"))
        assert first["duplicate"] is False
        second = handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="dup-1"))
        assert second["duplicate"] is True
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_events").fetchone()["n"] == 1
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_messages").fetchone()["n"] == 1


# ---------------------------------------------------------------------------
# Quiet window / checkpoints
# ---------------------------------------------------------------------------

def test_quiet_window_creates_checkpoint_only_after_it_elapses():
    with get_test_db() as conn:
        _insert_channel(conn)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=start)

        too_soon = start + timedelta(minutes=5)
        assert create_due_checkpoints(conn, now=too_soon) == []

        after_window = start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1)
        created = create_due_checkpoints(conn, now=after_window)
        assert len(created) == 1
        checkpoint = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (created[0],)).fetchone()
        assert checkpoint["version"] == 1
        assert checkpoint["status"] == "ready_for_relevance"
        assert json.loads(checkpoint["included_message_ids"]) == [ts(1)]


def test_reply_resets_quiet_window_and_dormant_thread_wakes_up():
    with get_test_db() as conn:
        _insert_channel(conn)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=start)

        # A reply just before the window elapses resets it.
        almost_due = start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS - 30)
        handle_slack_event(
            conn, _payload(_message_event(ts(50), thread_ts=ts(1), text="still going"), event_id="ev2"),
            now=almost_due,
        )
        assert create_due_checkpoints(conn, now=start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1)) == []

        # Dormant for weeks, then a new reply wakes the same conversation identity.
        weeks_later = start + timedelta(weeks=3)
        handle_slack_event(
            conn, _payload(_message_event(ts(100), thread_ts=ts(1), text="reviving this"), event_id="ev3"),
            now=weeks_later,
        )
        conversations = conn.execute("SELECT * FROM slack_conversations").fetchall()
        assert len(conversations) == 1  # same identity, not a new conversation

        created = create_due_checkpoints(conn, now=weeks_later + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        assert len(created) == 1
        checkpoint = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (created[0],)).fetchone()
        assert checkpoint["new_reply_count"] == 3


def test_checkpoint_is_immutable():
    with get_test_db() as conn:
        _insert_channel(conn)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=start)
        created = create_due_checkpoints(conn, now=start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        checkpoint_id = created[0]

        with pytest.raises(Exception):
            conn.execute("UPDATE slack_checkpoints SET status='ready_for_relevance' WHERE id=?", (checkpoint_id,))


def test_second_checkpoint_supersedes_the_first_via_previous_checkpoint_id():
    with get_test_db() as conn:
        _insert_channel(conn)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=start)
        first_batch = create_due_checkpoints(conn, now=start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        assert len(first_batch) == 1

        later = start + timedelta(hours=1)
        handle_slack_event(
            conn, _payload(_message_event(ts(500), thread_ts=ts(1), text="new info"), event_id="ev2"),
            now=later,
        )
        second_batch = create_due_checkpoints(conn, now=later + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        assert len(second_batch) == 1
        second = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (second_batch[0],)).fetchone()
        assert second["version"] == 2
        assert second["previous_checkpoint_id"] == first_batch[0]


def test_edit_and_deletion_counts_are_deltas_since_previous_checkpoint_not_totals():
    with get_test_db() as conn:
        _insert_channel(conn)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=start)
        handle_slack_event(
            conn, _payload(_message_event(ts(2), thread_ts=ts(1), text="reply"), event_id="ev2"), now=start,
        )
        first_batch = create_due_checkpoints(conn, now=start + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        first = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (first_batch[0],)).fetchone()
        assert first["new_edit_count"] == 0

        later = start + timedelta(hours=1)
        edit_event = {
            "type": "message", "subtype": "message_changed", "channel": CHANNEL_ID,
            "message": {"ts": ts(1), "text": "corrected", "user": "U1"},
        }
        handle_slack_event(conn, _payload(edit_event, event_id="ev-edit"), now=later)
        handle_slack_event(
            conn, _payload(_message_event(ts(3), thread_ts=ts(1), text="another reply"), event_id="ev3"), now=later,
        )
        second_batch = create_due_checkpoints(conn, now=later + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        second = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (second_batch[0],)).fetchone()
        assert second["new_edit_count"] == 1  # only the edit since checkpoint 1, not a running total

        even_later = later + timedelta(hours=1)
        handle_slack_event(
            conn, _payload(_message_event(ts(4), thread_ts=ts(1), text="yet another reply"), event_id="ev4"),
            now=even_later,
        )
        third_batch = create_due_checkpoints(conn, now=even_later + timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 1))
        third = conn.execute("SELECT * FROM slack_checkpoints WHERE id=?", (third_batch[0],)).fetchone()
        # No new edit since checkpoint 2. A cumulative (buggy) count would still show 1.
        assert third["new_edit_count"] == 0


def test_checkpoint_poll_loop_actually_creates_due_checkpoints():
    # This is the only thing that calls create_due_checkpoints in a deployed
    # environment; without it, quiet-window checkpoints never materialize.
    with get_test_db() as conn:
        _insert_channel(conn)
        real_past = datetime.now(timezone.utc) - timedelta(seconds=DEFAULT_QUIET_WINDOW_SECONDS + 5)
        handle_slack_event(conn, _payload(_message_event(ts(1)), event_id="ev1"), now=real_past)

        class _StaticConnection:
            def __enter__(self):
                return conn

            def __exit__(self, *exc_info):
                return False  # the outer get_test_db() owns closing this connection

        import asyncio as _asyncio

        async def run_one_iteration():
            task = _asyncio.create_task(run_checkpoint_poll_loop(lambda: _StaticConnection(), 0.01))
            await _asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except _asyncio.CancelledError:
                pass

        _asyncio.run(run_one_iteration())
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_checkpoints").fetchone()["n"] == 1


# ---------------------------------------------------------------------------
# Edits and deletes
# ---------------------------------------------------------------------------

def test_edit_supersedes_projection_without_losing_event_history():
    with get_test_db() as conn:
        _insert_channel(conn)
        handle_slack_event(conn, _payload(_message_event(ts(1), text="original"), event_id="ev1"))
        edit_event = {
            "type": "message",
            "subtype": "message_changed",
            "channel": CHANNEL_ID,
            "message": {"ts": ts(1), "text": "corrected", "user": "U1"},
        }
        handle_slack_event(conn, _payload(edit_event, event_id="ev2"))

        assert conn.execute("SELECT COUNT(*) AS n FROM slack_events").fetchone()["n"] == 2
        message = conn.execute("SELECT * FROM slack_messages WHERE message_ts=?", (ts(1),)).fetchone()
        assert message["text"] == "corrected"
        assert message["edited_at"] is not None


def test_delete_marks_removed_and_preserves_prior_text():
    with get_test_db() as conn:
        _insert_channel(conn)
        handle_slack_event(conn, _payload(_message_event(ts(1), text="original"), event_id="ev1"))
        delete_event = {
            "type": "message",
            "subtype": "message_deleted",
            "channel": CHANNEL_ID,
            "previous_message": {"ts": ts(1), "text": "original", "user": "U1"},
        }
        handle_slack_event(conn, _payload(delete_event, event_id="ev2"))

        message = conn.execute("SELECT * FROM slack_messages WHERE message_ts=?", (ts(1),)).fetchone()
        assert message["removed_at_source_at"] is not None
        assert message["text"] == "original"  # source history preserved, not blanked


def test_messages_before_ingestion_start_are_excluded():
    with get_test_db() as conn:
        _insert_channel(conn, ingestion_started_at="2026-06-01T00:00:00+00:00")
        old_ts = str(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())
        result = handle_slack_event(conn, _payload(_message_event(old_ts), event_id="ev1"))
        assert result["disposition"] == "noise"
        assert conn.execute("SELECT COUNT(*) AS n FROM slack_conversations").fetchone()["n"] == 0


# ---------------------------------------------------------------------------
# HTTP layer: signature verification, replay, URL verification, workspace isolation
# ---------------------------------------------------------------------------

SIGNING_SECRET = "test-signing-secret"


def _sign(body: bytes, timestamp: str) -> str:
    basestring = b"v0:" + timestamp.encode("ascii") + b":" + body
    digest = hmac.new(SIGNING_SECRET.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return f"v0={digest}"


class SlackSignatureUnitTests(unittest.TestCase):
    def test_valid_signature_passes(self):
        body = b'{"type":"url_verification"}'
        request_ts = str(int(time.time()))
        verify_slack_request(
            signing_secret=SIGNING_SECRET, timestamp_header=request_ts,
            signature_header=_sign(body, request_ts), raw_body=body,
        )  # must not raise

    def test_forged_signature_is_rejected(self):
        body = b'{"type":"url_verification"}'
        request_ts = str(int(time.time()))
        with self.assertRaises(SlackSignatureError):
            verify_slack_request(
                signing_secret=SIGNING_SECRET, timestamp_header=request_ts,
                signature_header="v0=deadbeef", raw_body=body,
            )

    def test_stale_timestamp_is_rejected(self):
        body = b'{"type":"url_verification"}'
        request_ts = str(int(time.time()) - 10_000)
        with self.assertRaises(SlackSignatureError):
            verify_slack_request(
                signing_secret=SIGNING_SECRET, timestamp_header=request_ts,
                signature_header=_sign(body, request_ts), raw_body=body,
            )


class SlackEventsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(
                database_path=self.db_path,
                provider="anthropic",
                cors_origins=["http://localhost:8000"],
                slack_signing_secret=SIGNING_SECRET,
                slack_team_id=TEAM_ID,
            ),
            provider=_BoomProvider(),
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO slack_channels "
                "(id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, ingestion_started_at) "
                "VALUES (?,?,?,?,1,1,0,'2000-01-01T00:00:00+00:00')",
                ("slkch_1", TEAM_ID, CHANNEL_ID, "northstar-project"),
            )
            connection.commit()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _post(self, body: dict, *, sign=True):
        raw = json.dumps(body).encode("utf-8")
        request_ts = str(int(time.time()))
        headers = {"Content-Type": "application/json"}
        if sign:
            headers["X-Slack-Request-Timestamp"] = request_ts
            headers["X-Slack-Signature"] = _sign(raw, request_ts)
        return self.client.post("/api/integrations/slack/events", content=raw, headers=headers)

    def test_forged_request_is_rejected(self):
        response = self._post({"type": "event_callback"}, sign=False)
        self.assertEqual(response.status_code, 401)

    def test_url_verification_returns_the_challenge(self):
        response = self._post({"type": "url_verification", "challenge": "abc123"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["challenge"], "abc123")

    def test_same_event_delivered_twice_is_one_processing_action(self):
        payload = _payload(_message_event(ts(1)), event_id="dup-http-1")
        first = self._post(payload)
        second = self._post(payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["duplicate"])

    def test_unrecognized_workspace_is_rejected(self):
        payload = _payload(_message_event(ts(1)), event_id="ev-other-team", team_id="T_OTHER")
        response = self._post(payload)
        self.assertEqual(response.status_code, 403)

    def test_provider_is_never_invoked_by_slack_intake(self):
        payload = _payload(_message_event(ts(1)), event_id="ev-no-llm")
        response = self._post(payload)
        self.assertEqual(response.status_code, 200)
        # _BoomProvider.interpret raises if ever called; reaching here proves it wasn't.


class _BoomProvider:
    name = "boom"
    model_identifier = "should-never-be-called"

    def interpret(self, *, context, evidence):
        raise AssertionError("Slack Phase 1 must never invoke the interpretation provider")


if __name__ == "__main__":
    unittest.main()
