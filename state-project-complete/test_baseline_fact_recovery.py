"""Regression coverage for long-source Baseline fact recovery."""
from __future__ import annotations

import unittest

from baseline_fact_recovery import should_recover_baseline_facts


class BaselineFactRecoveryTests(unittest.TestCase):
    def _long_settled_source(self) -> str:
        settled = (
            "State is a prototype for maintaining trustworthy project understanding. "
            "Evidence is immutable. Current State contains maintained facts people authorize. "
            "AI interprets, software enforces the rules, and a human authorizes Current State changes. "
            "The product includes Workspace, Open Items, Project, Notes, History, and Ask. "
            "The backend uses FastAPI and the frontend is deployed on Vercel. "
            "Important behavior is evaluated across repeated model runs. "
        )
        return (settled * 5) + (
            "Exactly how should consequential information be identified? "
            "How should omission detection work? "
            "Which evals deserve repeated runs?"
        )

    def test_question_only_result_from_substantial_mixed_source_gets_recovery(self):
        payload = {
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_type": "open_question",
                    "decision_question": "How should omission detection work?",
                    "proposed_changes": [],
                }
            ],
        }
        self.assertTrue(should_recover_baseline_facts(self._long_settled_source(), payload))

    def test_no_review_result_from_substantial_settled_source_gets_recovery(self):
        payload = {"outcome": "no_review", "review_recommendations": []}
        self.assertTrue(should_recover_baseline_facts(self._long_settled_source(), payload))

    def test_existing_starting_state_proposal_does_not_trigger_recovery(self):
        payload = {
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_type": "missing_understanding",
                    "decision_question": "What should Starting State include?",
                    "proposed_changes": [
                        {"operation": "create", "proposed_statement": "Evidence is immutable."}
                    ],
                }
            ],
        }
        self.assertFalse(should_recover_baseline_facts(self._long_settled_source(), payload))

    def test_short_question_note_does_not_spend_recovery_call(self):
        payload = {
            "outcome": "review_recommended",
            "review_recommendations": [
                {"review_type": "open_question", "decision_question": "Which source wins?", "proposed_changes": []}
            ],
        }
        self.assertFalse(should_recover_baseline_facts("We have not decided which source wins?", payload))


if __name__ == "__main__":
    unittest.main()
