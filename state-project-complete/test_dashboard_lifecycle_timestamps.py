"""Regression coverage for lifecycle fields a future Project Pulse will aggregate.

These tests intentionally use State's real human-resolution service. The goal is
not to create a second analytics record; it is to prove the authoritative State
objects already carry the timestamps/outcomes the dashboard needs.
"""

import sqlite3
import unittest

from database_migration_backed import get_test_db
from review_service import create_question, resolve_review, stop_question


class DashboardLifecycleTimestampTests(unittest.TestCase):
    def setUp(self):
        self._db_context = get_test_db()
        self.connection = self._db_context.__enter__()
        self.connection.row_factory = sqlite3.Row
        self.addCleanup(self._db_context.__exit__, None, None, None)

    def test_state_change_path_has_complete_lifecycle_timestamps(self):
        self.connection.execute(
            "INSERT INTO evidence(id, content, processing_status) VALUES (?, ?, 'processed')",
            ("evidence_metrics", "The launch date is now October 15."),
        )
        self.connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential) "
            "VALUES (?, 'proposed_update', ?, ?)",
            ("review_metrics", "Should State record the October 15 launch date?", "The maintained launch date changed."),
        )
        self.connection.execute(
            "INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
            ("review_metrics", "evidence_metrics"),
        )
        self.connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, state_item_id, proposed_statement, rationale, "
            "expected_state_version, operation, status) VALUES (?, ?, NULL, ?, ?, NULL, 'create', 'pending')",
            ("proposal_metrics", "review_metrics", "The launch date is October 15.", "Reviewed Evidence establishes a launch date."),
        )
        self.connection.commit()

        evidence_before = self.connection.execute(
            "SELECT submitted_at, processing_status FROM evidence WHERE id='evidence_metrics'"
        ).fetchone()
        review_before = self.connection.execute(
            "SELECT created_at, resolved_at FROM review_issues WHERE id='review_metrics'"
        ).fetchone()
        proposal_before = self.connection.execute(
            "SELECT created_at, decided_at FROM proposed_state_changes WHERE id='proposal_metrics'"
        ).fetchone()

        self.assertIsNotNone(evidence_before["submitted_at"])
        self.assertEqual(evidence_before["processing_status"], "processed")
        self.assertIsNotNone(review_before["created_at"])
        self.assertIsNone(review_before["resolved_at"])
        self.assertIsNotNone(proposal_before["created_at"])
        self.assertIsNone(proposal_before["decided_at"])

        resolve_review(self.connection, "review_metrics", "accept")

        review = self.connection.execute(
            "SELECT status, resolution, resolved_at FROM review_issues WHERE id='review_metrics'"
        ).fetchone()
        proposal = self.connection.execute(
            "SELECT status, decided_at FROM proposed_state_changes WHERE id='proposal_metrics'"
        ).fetchone()
        history = self.connection.execute(
            "SELECT transition_type, changed_at FROM history_transitions "
            "WHERE proposed_change_id='proposal_metrics'"
        ).fetchone()

        self.assertEqual((review["status"], review["resolution"]), ("resolved", "updated"))
        self.assertIsNotNone(review["resolved_at"])
        self.assertEqual(proposal["status"], "accepted")
        self.assertIsNotNone(proposal["decided_at"])
        self.assertIsNotNone(history)
        self.assertEqual(history["transition_type"], "created")
        self.assertIsNotNone(history["changed_at"])

    def test_review_without_state_change_is_timed_without_fake_history(self):
        before_history = self.connection.execute("SELECT COUNT(*) FROM history_transitions").fetchone()[0]
        self.connection.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential) "
            "VALUES (?, 'missing_understanding', ?, ?)",
            ("review_no_change", "Does this Evidence establish a maintained fact?", "A human should decide whether anything changes."),
        )
        self.connection.commit()

        resolve_review(self.connection, "review_no_change", "keep")

        review = self.connection.execute(
            "SELECT status, resolution, resolved_at FROM review_issues WHERE id='review_no_change'"
        ).fetchone()
        after_history = self.connection.execute("SELECT COUNT(*) FROM history_transitions").fetchone()[0]

        self.assertEqual((review["status"], review["resolution"]), ("resolved", "confirmed_current"))
        self.assertIsNotNone(review["resolved_at"])
        self.assertEqual(after_history, before_history, "A no-State-change Review must not manufacture History")

    def test_question_created_and_stopped_has_resolution_timestamps(self):
        question = create_question(
            self.connection,
            "question_metrics",
            "Who owns the launch checklist?",
            blocking=True,
            blocks="Launch readiness sign-off",
        )
        self.assertEqual(question["status"], "open")
        self.assertIsNotNone(question["created_at"])
        self.assertIsNone(question["resolved_at"])

        stop_question(self.connection, "question_metrics")
        resolved = self.connection.execute(
            "SELECT status, resolved_at, resolution FROM questions WHERE id='question_metrics'"
        ).fetchone()
        self.assertEqual(resolved["status"], "stopped")
        self.assertIsNotNone(resolved["resolved_at"])
        self.assertEqual(resolved["resolution"], "Stopped tracking")


if __name__ == "__main__":
    unittest.main()
