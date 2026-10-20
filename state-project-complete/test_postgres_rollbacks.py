"""Oct 20 audit: a caught database error must not poison the connection on Postgres (CLAUDE.md, Sept 14
incident). Each test fails a statement mid-operation and checks the code recovers. They run on SQLite
everywhere and on Postgres when STATE_TEST_POSTGRES_URL is set (CI runs postgres:16)."""
from __future__ import annotations

from interpretation_pipeline_integrated import process_evidence
from slack_relevance_service import evaluate_due_checkpoints
from test_project_isolation import db  # noqa: F401  (pytest fixture: sqlite and postgres)


class _BadSqlThenRaise:
    """A provider whose interpretation hits a database error, then fails."""
    name = "rollback-test"
    model_identifier = "deterministic"

    def interpret(self, *, context, evidence, connection=None):
        try:
            connection.execute("SELECT no_such_column FROM evidence")
        except Exception:
            pass  # swallowed, as several real call sites did before the fix
        raise RuntimeError("provider failed after a database error")


def test_interpretation_failure_is_recorded_after_a_database_error(db):  # noqa: F811
    db.execute("INSERT INTO evidence(id, content, source_type) VALUES ('e-rb', 'Launch moved.', 'manual_note')")
    db.commit()
    result = process_evidence(db, evidence_id="e-rb", provider=_BadSqlThenRaise())
    assert result.processing_status == "failed"
    status = db.execute("SELECT processing_status FROM evidence WHERE id='e-rb'").fetchone()[0]
    assert status == "failed"  # before the fix, Postgres raised InFailedSqlTransaction here


class _FlakyClassifier:
    """Fails the first checkpoint after a database error; classifies the rest as not relevant."""

    def __init__(self, connection):
        self.connection = connection
        self.calls = 0

    def classify(self, text):
        self.calls += 1
        if self.calls == 1:
            try:
                self.connection.execute("SELECT no_such_column FROM slack_messages")
            except Exception:
                pass
            raise RuntimeError("classifier failed after a database error")
        return {"relevant": False}


def test_one_failed_slack_checkpoint_does_not_poison_the_rest_of_the_batch(db):  # noqa: F811
    db.execute(
        "INSERT INTO slack_channels (id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, "
        "ingestion_started_at) VALUES ('ch-rb', 'T1', 'C1', 'rb', 1, 1, 0, '2000-01-01T00:00:00+00:00')")
    for n in ("1", "2"):
        db.execute(
            "INSERT INTO slack_conversations (id, team_id, channel_id, thread_root_ts, last_activity_at, "
            "next_checkpoint_at) VALUES (?, 'T1', 'C1', ?, '2026-01-01T00:00:00+00:00', '9999-12-31T00:00:00+00:00')",
            (f"conv-{n}", f"{n}00.0"))
        db.execute(
            "INSERT INTO slack_messages (id, team_id, channel_id, message_ts, thread_root_ts, user_id, text) "
            "VALUES (?, 'T1', 'C1', ?, ?, 'U1', 'Weekly sync notes.')", (f"msg-{n}", f"{n}00.0", f"{n}00.0"))
        db.execute(
            "INSERT INTO slack_checkpoints (id, conversation_id, version, previous_checkpoint_id, included_message_ids, "
            "status) VALUES (?, ?, 1, NULL, '[]', 'ready_for_relevance')", (f"chk-{n}", f"conv-{n}"))
    db.commit()
    evaluated = evaluate_due_checkpoints(db, _FlakyClassifier(db), provider=None)
    assert len(evaluated) == 1  # the second checkpoint still evaluates after the first one failed
