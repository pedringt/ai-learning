"""Deterministic coverage for the separate omission-detection safeguard (#144)."""
from __future__ import annotations

import unittest

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence
from omission_detection import list_candidates, run_check


class PrimaryNoReviewProvider:
    name = "test-primary"
    model_identifier = "deterministic-primary-v1"

    def interpret(self, *, context, evidence, connection=None):
        return {
            "summary": "Primary pass judged the note non-consequential.",
            "topics": [],
            "outcome": "no_review",
            "no_review_explanation": "No maintained understanding appeared to change.",
            "review_recommendations": [],
        }


class DetectorProvider:
    name = "test-detector"
    model_identifier = "deterministic-detector-v1"

    def __init__(self, *, detects: bool):
        self.detects = detects

    def detect_omissions(self, *, connection, candidate):
        if not self.detects:
            return {
                "summary": "Second pass confirmed the primary no-Review result.",
                "topics": [],
                "outcome": "no_review",
                "no_review_explanation": "No concrete consequential omission was found.",
                "review_recommendations": [],
            }
        return {
            "summary": "The primary pass omitted an explicit launch approval.",
            "topics": ["launch"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "missing_understanding",
                "decision_question": "Should the launch approval be maintained in Current State?",
                "why_consequential": "The Evidence explicitly establishes an approval that is not represented in Current State.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": "The October launch was approved.",
                    "rationale": "The Evidence explicitly states that the October launch was approved.",
                }],
            }],
        }


def add_evidence(connection, evidence_id: str, content: str, source_type: str = "manual_note") -> None:
    connection.execute(
        "INSERT INTO evidence(id, content, source_type, processing_status, project_id) VALUES (?, ?, ?, 'pending', ?)",
        (evidence_id, content, source_type, connection.project_id),
    )
    connection.commit()


class OmissionDetectionTests(unittest.TestCase):
    def test_high_signal_primary_no_review_becomes_candidate(self):
        with get_test_db() as connection:
            add_evidence(connection, "ev-1", "The October launch was approved and the deadline is Oct 3.")
            process_evidence(connection, "ev-1", PrimaryNoReviewProvider())
            candidates = list_candidates(connection)
            self.assertEqual([item.evidence_id for item in candidates], ["ev-1"])
            self.assertIn("decision", candidates[0].consequence_signals)

    def test_low_signal_no_review_is_not_selected_for_extra_model_call(self):
        with get_test_db() as connection:
            add_evidence(connection, "ev-1", "Thanks, sounds good. I'll follow up later.")
            process_evidence(connection, "ev-1", PrimaryNoReviewProvider())
            self.assertEqual(list_candidates(connection), [])

    def test_detected_omission_surfaces_normal_review_but_does_not_mutate_state(self):
        with get_test_db() as connection:
            add_evidence(connection, "ev-1", "The October launch was approved and the deadline is Oct 3.")
            process_evidence(connection, "ev-1", PrimaryNoReviewProvider())
            candidate = list_candidates(connection)[0]
            result = run_check(connection, candidate, DetectorProvider(detects=True))

            self.assertTrue(result.detected)
            self.assertEqual(len(result.review_ids), 1)
            review = connection.execute(
                "SELECT status, review_type FROM review_issues WHERE id=?", (result.review_ids[0],)
            ).fetchone()
            self.assertEqual(review["status"], "open")
            self.assertEqual(review["review_type"], "missing_understanding")
            self.assertEqual(
                connection.execute("SELECT COUNT(*) AS n FROM current_state_items WHERE status='active'").fetchone()["n"],
                0,
            )

    def test_negative_second_pass_is_recorded_and_not_repeated(self):
        with get_test_db() as connection:
            add_evidence(connection, "ev-1", "The October launch was approved and the deadline is Oct 3.")
            process_evidence(connection, "ev-1", PrimaryNoReviewProvider())
            candidate = list_candidates(connection)[0]
            result = run_check(connection, candidate, DetectorProvider(detects=False))
            self.assertFalse(result.detected)
            self.assertEqual(list_candidates(connection), [])
            providers = [
                row["provider"]
                for row in connection.execute(
                    "SELECT provider FROM interpretation_records WHERE evidence_id=? ORDER BY created_at, id", ("ev-1",)
                ).fetchall()
            ]
            self.assertTrue(any("omission-check" in provider for provider in providers))

    def test_candidates_are_project_scoped(self):
        with get_test_db() as connection:
            add_evidence(connection, "northstar-ev", "The launch was approved.")
            process_evidence(connection, "northstar-ev", PrimaryNoReviewProvider())

            connection.execute("INSERT INTO projects(id, name) VALUES ('other', 'Other')")
            connection.commit()
            connection.project_id = "other"
            add_evidence(connection, "other-ev", "The budget was approved.")
            process_evidence(connection, "other-ev", PrimaryNoReviewProvider())

            connection.project_id = "northstar"
            self.assertEqual([item.evidence_id for item in list_candidates(connection)], ["northstar-ev"])


if __name__ == "__main__":
    unittest.main()
