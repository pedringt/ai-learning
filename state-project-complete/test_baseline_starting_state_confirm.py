"""Regression coverage for the one-pass Starting State confirmation flow (#163)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app
from baseline_setup import record_interpretation_metadata, strip_internal_provider_metadata


class StartingStateFixtureProvider:
    name = "starting-state-fixture"
    model_identifier = "starting-state-fixture-v1"

    def interpret(self, *, context, evidence, connection=None):
        content = evidence["content"]
        lower = content.lower()
        if "open product question" in lower:
            raw = {
                "summary": "The evidence states an unresolved product question.",
                "topics": ["product questions"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "open_question",
                    "decision_question": "How should baseline coverage be checked?",
                    "why_consequential": "The baseline process is not yet settled.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [],
                }],
            }
        else:
            first = "first" in lower
            raw = {
                "summary": "The evidence establishes a durable baseline fact.",
                "topics": ["product" if first else "development"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": "Should Current State record this baseline fact?",
                    "why_consequential": "The fact is needed to understand the project baseline.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create",
                        "proposed_statement": (
                            "State maintains a trustworthy understanding of what a project currently treats as true."
                            if first else "State is primarily a learning and portfolio project."
                        ),
                        "rationale": "The Evidence states this directly.",
                        "proposed_area_name": "Product" if first else "Development",
                        "proposed_topic": "Purpose" if first else "Product boundary",
                    }],
                }],
            }
        record_interpretation_metadata(evidence["id"], raw, [raw])
        return strip_internal_provider_metadata(raw)


class StartingStateConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        self.client_context = TestClient(create_app(
            Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True),
            provider=StartingStateFixtureProvider(),
        ))
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "Starting State Test"})
        self.assertEqual(created.status_code, 200)
        self.project = created.json()
        self.headers = {"X-State-Project-Id": self.project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _submit(self, content):
        response = self.client.post(
            "/api/evidence", headers=self.headers,
            json={"content": content, "source_type": "manual_note"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _draft(self):
        response = self.client.get("/api/baseline/draft", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_question_review_stays_individual_and_blocks_bulk_confirmation(self):
        self._submit("Open product question: How should baseline coverage be checked?")
        draft = self._draft()
        self.assertFalse(draft["can_confirm"])
        self.assertEqual(draft["counts"]["needs_individual_review"], 1)
        self.assertEqual(draft["needs_individual_review"][0]["review_type"], "open_question")

        blocked = self.client.post("/api/baseline/confirm", headers=self.headers, json={"items": []})
        self.assertEqual(blocked.status_code, 409, blocked.text)
        self.assertEqual(blocked.json()["detail"]["code"], "baseline_review_required")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])
        self.assertEqual(self.client.get("/api/questions", headers=self.headers).json()["items"], [])
        self.assertEqual(self.client.get("/api/baseline", headers=self.headers).json()["status"], "baseline_setup")

    def test_confirm_applies_and_rejects_routine_facts_in_one_authorization(self):
        first_evidence = "First baseline note about what State is."
        second_evidence = "Second baseline note about the project boundary."
        self._submit(first_evidence)
        self._submit(second_evidence)

        draft = self._draft()
        self.assertTrue(draft["can_confirm"])
        proposed = [item for item in draft["draft"]["items"] if item["kind"] == "proposed"]
        self.assertEqual(len(proposed), 2)
        by_statement = {item["statement"]: item for item in proposed}
        first = by_statement["State maintains a trustworthy understanding of what a project currently treats as true."]
        second = by_statement["State is primarily a learning and portfolio project."]

        adjusted = "State keeps a human-authorized picture of what the project currently treats as true."
        confirmed = self.client.post(
            "/api/baseline/confirm",
            headers=self.headers,
            json={"items": [
                {
                    "proposal_id": first["proposal_id"],
                    "decision": "accept",
                    "statement": adjusted,
                    "topic": "Purpose",
                    "area_name": "Product & Authority",
                },
                {"proposal_id": second["proposal_id"], "decision": "reject"},
            ]},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["status"], "established")

        state = self.client.get("/api/state", headers=self.headers).json()["items"]
        self.assertEqual(len(state), 1)
        self.assertEqual(state[0]["statement"], adjusted)
        self.assertEqual(state[0]["topic"], "Purpose")
        self.assertEqual(state[0]["area_name"], "Product & Authority")
        self.assertEqual(state[0]["area_description"], "")

        history = self.client.get("/api/history", headers=self.headers).json()["items"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["new_statement"], adjusted)
        self.assertEqual(history[0]["accepted_as_adjusted"], 1)
        self.assertEqual(history[0]["ai_proposed_statement"], first["statement"])

        evidence = self.client.get("/api/evidence", headers=self.headers).json()["items"]
        self.assertEqual({item["content"] for item in evidence}, {first_evidence, second_evidence})

        resolved = self.client.get("/api/reviews?status=resolved", headers=self.headers).json()["items"]
        resolutions = {item["resolution"] for item in resolved}
        self.assertEqual(resolutions, {"updated", "not_applied"})
        self.assertEqual(self.client.get("/api/baseline", headers=self.headers).json()["status"], "established")

    def test_confirmation_requires_an_exhaustive_current_draft(self):
        self._submit("First baseline note about what State is.")
        self._submit("Second baseline note about the project boundary.")
        proposed = [item for item in self._draft()["draft"]["items"] if item["kind"] == "proposed"]

        stale = self.client.post(
            "/api/baseline/confirm", headers=self.headers,
            json={"items": [{"proposal_id": proposed[0]["proposal_id"], "decision": "accept"}]},
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["detail"]["code"], "baseline_draft_changed")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])
        self.assertEqual(len(self.client.get("/api/reviews", headers=self.headers).json()["items"]), 2)

    def test_confirmation_rolls_back_everything_if_one_fact_is_invalid(self):
        self._submit("First baseline note about what State is.")
        self._submit("Second baseline note about the project boundary.")
        proposed = [item for item in self._draft()["draft"]["items"] if item["kind"] == "proposed"]

        failed = self.client.post(
            "/api/baseline/confirm", headers=self.headers,
            json={"items": [
                {"proposal_id": proposed[0]["proposal_id"], "decision": "accept"},
                {"proposal_id": proposed[1]["proposal_id"], "decision": "accept", "statement": "   "},
            ]},
        )
        self.assertEqual(failed.status_code, 422, failed.text)
        self.assertEqual(failed.json()["detail"]["code"], "blank_starting_state_fact")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])
        self.assertEqual(len(self.client.get("/api/reviews", headers=self.headers).json()["items"]), 2)
        self.assertEqual(self.client.get("/api/baseline", headers=self.headers).json()["status"], "baseline_setup")


if __name__ == "__main__":
    unittest.main()
