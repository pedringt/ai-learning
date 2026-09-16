"""Dogfood regressions for Baseline Setup review burden (#163)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from ask_service import _compact_candidates
from baseline_api import Settings, create_app
from baseline_setup import record_interpretation_metadata, strip_internal_provider_metadata
from db import connect_sqlite


class DenseBaselineFixtureProvider:
    name = "dense-baseline-fixture"
    model_identifier = "dense-baseline-fixture-v1"

    def interpret(self, *, context, evidence, connection=None):
        proposals = [
            {
                "operation": "create",
                "proposed_statement": f"Durable starting fact {index} is established by the source.",
                "rationale": "The starting material states this directly.",
                "proposed_area_name": "Product" if index <= 6 else "Quality & Governance",
                "proposed_topic": f"Fact {index}",
            }
            for index in range(1, 13)
        ]
        raw = {
            "summary": "The source establishes a substantial project baseline and one unresolved question.",
            "topics": ["product", "quality", "governance"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": "Should Current State include these routine starting facts?",
                    "why_consequential": "They make up the project's starting picture.",
                    "affected_state_item_ids": [],
                    "proposed_changes": proposals,
                },
                {
                    "review_action": "create",
                    "review_type": "open_question",
                    "decision_question": "Which rollout date should the project treat as current?",
                    "why_consequential": "The starting material does not establish one current date.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [],
                },
            ],
        }
        record_interpretation_metadata(evidence["id"], raw, [raw])
        return strip_internal_provider_metadata(raw)


class BaselineReviewBurdenTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        self.client_context = TestClient(create_app(
            Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True),
            provider=DenseBaselineFixtureProvider(),
        ))
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "Dense Baseline"})
        self.assertEqual(created.status_code, 200)
        self.project = created.json()
        self.headers = {"X-State-Project-Id": self.project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_many_routine_facts_are_one_draft_not_many_review_actions(self):
        submitted = self.client.post(
            "/api/evidence", headers=self.headers,
            json={"content": "Dense starting material", "source_type": "manual_note"},
        )
        self.assertEqual(submitted.status_code, 201, submitted.text)
        visible_reviews = submitted.json()["reviews"]
        self.assertEqual(len(visible_reviews), 1)
        self.assertEqual(visible_reviews[0]["review_type"], "open_question")

        draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(draft["counts"]["proposed_items"], 12)
        self.assertEqual(draft["counts"]["proposed_questions"], 1)
        self.assertEqual(draft["counts"]["needs_individual_review"], 1)
        self.assertFalse(draft["can_confirm"])

        # Workspace/Open Items and Ask agree: only the real unresolved question
        # is a separate Review action. The 12 routine facts live in Starting State.
        attention = self.client.get("/api/attention", headers=self.headers).json()
        self.assertEqual(len(attention["open_reviews"]), 1)
        self.assertEqual(attention["open_reviews"][0]["review_type"], "open_question")

        connection = connect_sqlite(self.db_path)
        try:
            connection.project_id = self.project["id"]
            ask_reviews = _compact_candidates(connection)["reviews"]
        finally:
            connection.close()
        self.assertEqual(len(ask_reviews), 1)
        self.assertEqual(ask_reviews[0]["review_type"], "open_question")

    def test_after_question_is_handled_routine_draft_can_be_confirmed_together(self):
        submitted = self.client.post(
            "/api/evidence", headers=self.headers,
            json={"content": "Dense starting material", "source_type": "manual_note"},
        ).json()
        question_review = submitted["reviews"][0]
        question_proposal = question_review["question_to_create"]
        resolved = self.client.post(
            f"/api/reviews/{question_review['id']}/resolve",
            headers=self.headers,
            json={"decision": "accept", "expected_question_proposal_id": question_proposal["id"]},
        )
        self.assertEqual(resolved.status_code, 200, resolved.text)

        self.assertEqual(self.client.get("/api/reviews", headers=self.headers).json()["items"], [])
        draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(draft["counts"]["proposed_items"], 12)
        self.assertEqual(draft["counts"]["current_questions"], 1)
        self.assertEqual(draft["counts"]["needs_individual_review"], 0)
        self.assertTrue(draft["can_confirm"])


if __name__ == "__main__":
    unittest.main()
