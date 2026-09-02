from __future__ import annotations


import pytest

from api import Settings
from database_migration_backed import get_test_db, initialize_db
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


class DuplicateCreateReviewProvider:
    name = "duplicate-create-test"
    model_identifier = "deterministic"

    def interpret(self, *, context, evidence, connection=None):
        return {
            "summary": "The same missing understanding remains open.",
            "topics": ["access"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": "Should Current State represent temporary entitlements separately?",
                    "why_consequential": "Access can differ from the plan matrix.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [
                        {
                            "operation": "create",
                            "proposed_statement": "Temporary entitlements can override standard plan access.",
                            "rationale": "Repeated support evidence establishes the exception class.",
                        }
                    ],
                }
            ],
        }


def test_repeated_create_recommendation_reuses_exact_open_review():
    from interpretation_pipeline_integrated import process_evidence
    from review_service import list_reviews, resolve_review

    with get_test_db() as connection:
        for evidence_id in ("e1", "e2"):
            connection.execute(
                "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
                (evidence_id, "Same access exception evidence", "manual_note"),
            )
            connection.commit()
            result = process_evidence(connection, evidence_id=evidence_id, provider=DuplicateCreateReviewProvider())
            assert result.processing_status == "succeeded"

        reviews = list_reviews(connection, "open")
        matching = [r for r in reviews if r["decision_question"] == "Should Current State represent temporary entitlements separately?"]
        assert len(matching) == 1
        assert {e["id"] for e in matching[0]["evidence_items"]} == {"e1", "e2"}
        proposals = matching[0]["proposals"]
        assert len([p for p in proposals if p["status"] == "pending"]) == 1
        assert len([p for p in proposals if p["status"] == "superseded"]) == 1

        resolve_review(connection, matching[0]["id"], "accept")
        created = connection.execute(
            "SELECT count(*) AS count FROM current_state_items WHERE statement=?",
            ("Temporary entitlements can override standard plan access.",),
        ).fetchone()["count"]
        assert created == 1


def test_startup_consolidates_legacy_duplicate_open_reviews():
    with get_test_db() as connection:
        # Simulate a database created by the older build before the uniqueness
        # backstop existed.
        connection.execute("DROP INDEX uq_open_review_identity")
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) VALUES (?, ?, ?, ?, 'open')",
            ("r-old", "missing_understanding", "Should access exceptions be represented?", "old"),
        )
        connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) VALUES (?, ?, ?, ?, 'open')",
            ("r-new", "missing_understanding", "  should access exceptions be represented?  ", "new"),
        )
        connection.execute("INSERT INTO evidence(id, content, source_type) VALUES ('e-old','old','manual_note')")
        connection.execute("INSERT INTO evidence(id, content, source_type) VALUES ('e-new','new','manual_note')")
        connection.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES ('r-old','e-old')")
        connection.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES ('r-new','e-new')")
        connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, proposed_statement, rationale, status) "
            "VALUES ('p-old','r-old','create','Represent access exceptions.','old','pending')"
        )
        connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, proposed_statement, rationale, status) "
            "VALUES ('p-new','r-new','create','Represent access exceptions.','new','pending')"
        )
        connection.commit()

        initialize_db(connection)

        rows = connection.execute(
            "SELECT id FROM review_issues WHERE status='open' AND review_type='missing_understanding' "
            "AND lower(trim(decision_question))='should access exceptions be represented?'"
        ).fetchall()
        assert len(rows) == 1
        keeper = rows[0]["id"]
        evidence = connection.execute(
            "SELECT evidence_id FROM review_evidence WHERE review_id=? ORDER BY evidence_id", (keeper,)
        ).fetchall()
        assert [r["evidence_id"] for r in evidence] == ["e-new", "e-old"]
        proposal_statuses = connection.execute(
            "SELECT status FROM proposed_state_changes WHERE review_id=? ORDER BY id", (keeper,)
        ).fetchall()
        assert sorted(r["status"] for r in proposal_statuses) == ["pending", "superseded"]

        with pytest.raises(Exception):
            connection.execute(
                "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
                "VALUES ('r-third','missing_understanding','SHOULD ACCESS EXCEPTIONS BE REPRESENTED?','again','open')"
            )
        connection.rollback()
