"""Basic integration test: verify pipeline works with migration-backed schema.

This test confirms that:
1. Migration-backed database initializes correctly
2. Interpretation pipeline can process Evidence
3. Reviews and Proposals are created atomically
"""

from __future__ import annotations

import json
import unittest
from typing import Any, Mapping

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import new_id, process_evidence


class SimpleTestProvider:
    """Minimal provider for integration testing."""

    def __init__(self, name: str, model_identifier: str):
        self.name = name
        self.model_identifier = model_identifier
        self.response = None

    def interpret(self, *, context, evidence):
        return self.response


class IntegrationBasicTest(unittest.TestCase):
    """Verify integrated pipeline on migration-backed schema."""

    def setUp(self) -> None:
        """Create test database with migrations."""
        self.db_context = get_test_db()
        self.conn = self.db_context.__enter__()
        self.conn.row_factory = None  # Reset for setup
        self.conn.execute("PRAGMA foreign_keys = ON")

    def tearDown(self) -> None:
        """Clean up database."""
        self.db_context.__exit__(None, None, None)

    def _insert_evidence(self, content: str) -> str:
        """Insert Evidence and return ID."""
        evidence_id = new_id("evidence")
        self.conn.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            (evidence_id, content),
        )
        self.conn.commit()
        return evidence_id

    def _insert_state(self, state_id: str, statement: str, topic: str = "default") -> None:
        """Insert Current State Item."""
        self.conn.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, 1),
        )
        self.conn.commit()

    def test_no_review_interpretation(self) -> None:
        """Test: no_review interpretation (Evidence → Interpretation Record only)."""
        evidence_id = self._insert_evidence("Feature X is documented and working")

        provider = SimpleTestProvider(name="test-fake", model_identifier="fake-no-op-v1")
        provider.response = {
            "summary": "Feature X documentation is current and complete.",
            "topics": ["documentation"],
            "outcome": "no_review",
            "no_review_explanation": "This is routine documentation update.",
            "review_recommendations": [],
        }

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)

        # Verify result
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 0)
        self.assertTrue(result.interpretation_record_id.startswith("interpretation_"))

        # Verify Interpretation Record was created
        record = self.conn.execute(
            "SELECT id, processing_status, structured_result, error_code FROM interpretation_records WHERE id=?",
            (result.interpretation_record_id,),
        ).fetchone()
        self.assertIsNotNone(record)
        self.assertEqual(record[1], "succeeded")
        self.assertIsNotNone(record[2])  # structured_result
        self.assertIsNone(record[3])  # no error_code

        # Verify no Reviews were created
        review_count = self.conn.execute("SELECT COUNT(*) FROM review_issues").fetchone()[0]
        self.assertEqual(review_count, 0)

        # Verify Evidence status is processed
        evidence = self.conn.execute(
            "SELECT processing_status FROM evidence WHERE id=?",
            (evidence_id,),
        ).fetchone()
        self.assertEqual(evidence[0], "processed")

    def test_proposed_update_interpretation(self) -> None:
        """Test: proposed_update interpretation (Evidence → Review + Proposal)."""
        # Setup: create State to be updated
        state_id = "state_feature_a"
        self._insert_state(state_id, "Feature A is partially documented")

        evidence_id = self._insert_evidence("Feature A is now fully documented with examples")

        provider = SimpleTestProvider(name="test-fake", model_identifier="fake-no-op-v1")
        provider.response = {
            "summary": "Feature A documentation needs updating.",
            "topics": ["documentation", "feature-a"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create",
                    "review_type": "proposed_update",
                    "decision_question": "Should Feature A's documentation be updated?",
                    "why_consequential": "The state is now stale.",
                    "affected_state_item_ids": [state_id],
                    "proposed_changes": [
                        {
                            "operation": "update",
                            "state_item_id": state_id,
                            "expected_version": 1,
                            "proposed_statement": "Feature A is fully documented with examples",
                            "rationale": "Evidence shows Feature A now has full documentation.",
                        }
                    ],
                }
            ],
        }

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)

        # Verify result
        self.assertEqual(result.processing_status, "succeeded")
        self.assertEqual(len(result.review_ids), 1)

        review_id = result.review_ids[0]

        # Verify Review was created
        review = self.conn.execute(
            "SELECT id, review_type, status FROM review_issues WHERE id=?",
            (review_id,),
        ).fetchone()
        self.assertIsNotNone(review)
        self.assertEqual(review[1], "proposed_update")
        self.assertEqual(review[2], "open")

        # Verify Proposal was created
        proposal = self.conn.execute(
            "SELECT id, review_id, operation, state_item_id, proposed_statement, status FROM proposed_state_changes WHERE review_id=?",
            (review_id,),
        ).fetchone()
        self.assertIsNotNone(proposal)
        self.assertEqual(proposal[2], "update")  # operation
        self.assertEqual(proposal[3], state_id)  # state_item_id
        self.assertEqual(proposal[5], "pending")  # status

        # Verify Evidence is linked to Review
        link = self.conn.execute(
            "SELECT review_id FROM review_evidence WHERE review_id=? AND evidence_id=?",
            (review_id, evidence_id),
        ).fetchone()
        self.assertIsNotNone(link)

        # Verify State item is linked to Review
        state_link = self.conn.execute(
            "SELECT review_id FROM review_state_items WHERE review_id=? AND state_item_id=?",
            (review_id, state_id),
        ).fetchone()
        self.assertIsNotNone(state_link)

    def test_schema_violation_is_safe_failure(self) -> None:
        """Test: structural schema violation causes safe failure (no Reviews created)."""
        evidence_id = self._insert_evidence("Some evidence")

        provider = SimpleTestProvider(name="test-fake", model_identifier="fake-no-op-v1")
        provider.response = {
            "summary": "Test summary",
            "topics": ["test"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    # Missing required "review_action" field — schema violation
                    "review_type": "proposed_update",
                    "decision_question": "Should we update?",
                    "why_consequential": "Evidence is new",
                    "affected_state_item_ids": [],
                    "proposed_changes": [],
                }
            ],
        }

        result = process_evidence(self.conn, evidence_id=evidence_id, provider=provider)

        # Verify result is failed
        self.assertEqual(result.processing_status, "failed")
        self.assertEqual(len(result.review_ids), 0)

        # Verify Interpretation Record exists with error code
        record = self.conn.execute(
            "SELECT processing_status, error_code FROM interpretation_records WHERE id=?",
            (result.interpretation_record_id,),
        ).fetchone()
        self.assertIsNotNone(record)
        self.assertEqual(record[0], "failed")
        self.assertEqual(record[1], "schema_violation")

        # Verify no Reviews or Proposals were created
        review_count = self.conn.execute("SELECT COUNT(*) FROM review_issues").fetchone()[0]
        proposal_count = self.conn.execute("SELECT COUNT(*) FROM proposed_state_changes").fetchone()[0]
        self.assertEqual(review_count, 0)
        self.assertEqual(proposal_count, 0)

        # Verify Evidence status is failed
        evidence = self.conn.execute(
            "SELECT processing_status FROM evidence WHERE id=?",
            (evidence_id,),
        ).fetchone()
        self.assertEqual(evidence[0], "failed")


if __name__ == "__main__":
    unittest.main()
