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
    import slack_relevance_service as srs
    srs._FAILED_ATTEMPTS.clear()
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


# ---- #548 (Oct 20): hidden failures made visible or bounded --------------------------------------

def test_baseline_check_fails_closed_on_a_database_error():
    from baseline_setup import is_baseline_setup

    class _Broken:
        project_id = "project_x"
        is_postgres = False

        def execute(self, *args, **kwargs):
            raise RuntimeError("database unavailable")

    import pytest
    with pytest.raises(RuntimeError):
        is_baseline_setup(_Broken())


def test_the_unscoped_questions_read_is_only_for_a_schema_without_projects():
    import anthropic_provider
    import openai_provider
    for module in (anthropic_provider, openai_provider):
        assert module._missing_project_id_column(Exception("no such column: project_id"))
        assert module._missing_project_id_column(Exception('column "project_id" does not exist'))
        assert not module._missing_project_id_column(Exception("database is locked"))
        assert not module._missing_project_id_column(Exception("connection reset"))


class _AlwaysFails:
    def __init__(self):
        self.calls = 0

    def classify(self, text):
        self.calls += 1
        raise RuntimeError("classifier down")


def test_a_slack_checkpoint_stops_retrying_after_three_failures(db):  # noqa: F811
    import slack_relevance_service as srs
    srs._FAILED_ATTEMPTS.clear()
    db.execute(
        "INSERT INTO slack_channels (id, team_id, channel_id, channel_name, enabled, include_threads, include_bots, "
        "ingestion_started_at) VALUES ('ch-gu', 'T2', 'C2', 'gu', 1, 1, 0, '2000-01-01T00:00:00+00:00')")
    db.execute(
        "INSERT INTO slack_conversations (id, team_id, channel_id, thread_root_ts, last_activity_at, next_checkpoint_at) "
        "VALUES ('conv-gu', 'T2', 'C2', '900.0', '2026-01-01T00:00:00+00:00', '9999-12-31T00:00:00+00:00')")
    db.execute(
        "INSERT INTO slack_messages (id, team_id, channel_id, message_ts, thread_root_ts, user_id, text) "
        "VALUES ('msg-gu', 'T2', 'C2', '900.0', '900.0', 'U1', 'We decided the vendor owns retention.')")
    db.execute(
        "INSERT INTO slack_checkpoints (id, conversation_id, version, previous_checkpoint_id, included_message_ids, status) "
        "VALUES ('chk-gu', 'conv-gu', 1, NULL, '[]', 'ready_for_relevance')")
    db.commit()
    classifier = _AlwaysFails()
    for _ in range(4):
        evaluate_due_checkpoints(db, classifier, provider=None)
    assert classifier.calls == 3  # the fourth poll no longer pays for another attempt
    row = db.execute("SELECT evidence_id FROM slack_checkpoint_evaluations WHERE checkpoint_id='chk-gu'").fetchone()
    assert row is not None and row[0] is None
    srs._FAILED_ATTEMPTS.clear()
