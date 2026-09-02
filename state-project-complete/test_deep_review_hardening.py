from __future__ import annotations


import pytest

from api import Settings
from database_migration_backed import get_test_db
from db import Connection, connect_sqlite
from interpretation_pipeline_integrated import _persist_success
from interpretation_pipeline_integrated import StructuredInterpretationSemanticError


class DummyProvider:
    name = "test"
    model_identifier = "test-model"


def test_settings_from_env_is_importable_without_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings.from_env()
    assert settings.database_url is None
    with pytest.raises(RuntimeError, match="No database configured"):
        settings.connection_url()


def test_sqlite_foreign_keys_are_enabled():
    with connect_sqlite(":memory:") as connection:
        enabled = connection.execute("PRAGMA foreign_keys").fetchone()[0]
        assert enabled == 1


def test_evidence_core_is_immutable_but_processing_status_can_change():
    with get_test_db() as connection:
        connection.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            ("e1", "Original evidence", "manual_note"),
        )
        connection.commit()
        connection.execute(
            "UPDATE evidence SET processing_status=? WHERE id=?", ("processed", "e1")
        )
        connection.commit()
        assert connection.execute(
            "SELECT processing_status FROM evidence WHERE id=?", ("e1",)
        ).fetchone()["processing_status"] == "processed"

        with pytest.raises(Exception, match="Evidence core fields are immutable"):
            connection.execute("UPDATE evidence SET content=? WHERE id=?", ("Changed", "e1"))
        connection.rollback()


def test_postgres_sql_conversion_for_runtime_dialect():
    query = Connection._convert_sql(
        "INSERT OR IGNORE INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
        is_postgres=True,
    )
    assert "INSERT OR IGNORE" not in query
    assert query.count("%s") == 2
    assert query.endswith("ON CONFLICT DO NOTHING")
    assert Connection._convert_sql("BEGIN IMMEDIATE", is_postgres=True) == "BEGIN"


def test_persistence_rechecks_existing_review_lifecycle():
    with get_test_db() as connection:
        connection.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            ("e1", "New evidence", "manual_note"),
        )
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
            "VALUES (?, ?, ?, ?, ?)",
            ("r1", "proposed_update", "Update?", "It matters", "resolved"),
        )
        connection.commit()

        payload = {
            "summary": "Update existing review.",
            "topics": ["timing"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "update_existing",
                    "existing_review_id": "r1",
                    "review_type": "proposed_update",
                    "decision_question": "Update?",
                    "why_consequential": "It matters",
                    "affected_state_item_ids": [],
                    "proposed_changes": [],
                }
            ],
        }

        with pytest.raises(StructuredInterpretationSemanticError) as exc:
            _persist_success(connection, evidence_id="e1", provider=DummyProvider(), payload=payload)
        assert exc.value.code == "review_not_open"
        assert connection.execute("SELECT count(*) AS count FROM interpretation_records").fetchone()["count"] == 0
