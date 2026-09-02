from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app


class LaunchDateProvider:
    name = "test"
    model_identifier = "deterministic-test-v1"

    def interpret(self, *, context, evidence):
        return {
            "summary": "The launch date moved.",
            "topics": ["pilot", "launch"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Accept the new launch date?",
                "why_consequential": "The current launch date would be stale.",
                "affected_state_item_ids": ["state_launch"],
                "proposed_changes": [{
                    "operation": "update",
                    "state_item_id": "state_launch",
                    "expected_version": 1,
                    "proposed_statement": "Launch is October 15.",
                    "rationale": "The submitted evidence explicitly changes the date.",
                }],
            }],
        }


class ApiWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"]),
            provider=LaunchDateProvider(),
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
                ("state_launch", "launch", "Launch is October 1.", 1),
            )
            connection.commit()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_evidence_requires_human_acceptance_before_state_mutation(self):
        response = self.client.post("/api/evidence", json={"content": "Launch moved to October 15."})
        self.assertEqual(response.status_code, 201)
        review_id = response.json()["reviews"][0]["id"]
        before = self.client.get("/api/state").json()["items"][0]
        self.assertEqual(before["statement"], "Launch is October 1.")
        self.assertEqual(before["version"], 1)

        resolved = self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"})
        self.assertEqual(resolved.status_code, 200)
        after = resolved.json()["state"][0]
        self.assertEqual(after["statement"], "Launch is October 15.")
        self.assertEqual(after["version"], 2)
        self.assertEqual(len(resolved.json()["history"]), 1)

    def test_keep_and_reject_do_not_mutate_current_state(self):
        for decision in ("keep", "reject"):
            response = self.client.post("/api/evidence", json={"content": f"Candidate date for {decision}."})
            review_id = response.json()["reviews"][0]["id"]
            resolved = self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": decision})
            self.assertEqual(resolved.status_code, 200)
            self.assertEqual(resolved.json()["state"][0]["statement"], "Launch is October 1.")
            self.assertEqual(resolved.json()["history"], [])

    def test_review_read_model_preserves_evidence_source_type(self):
        response = self.client.post(
            "/api/evidence",
            json={"content": "Launch moved to October 15.", "source_type": "question_response:q-launch"},
        )
        self.assertEqual(response.status_code, 201)
        review = response.json()["reviews"][0]
        self.assertEqual(review["evidence_source_type"], "question_response:q-launch")
        listed = self.client.get("/api/reviews?status=open").json()["items"]
        self.assertEqual(listed[0]["evidence_source_type"], "question_response:q-launch")

    def test_rejects_invalid_input_and_duplicate_resolution(self):
        self.assertEqual(self.client.post("/api/evidence", json={"content": "   "}).status_code, 422)
        response = self.client.post("/api/evidence", json={"content": "Launch moved."})
        review_id = response.json()["reviews"][0]["id"]
        self.assertEqual(self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "keep"}).status_code, 200)
        self.assertEqual(self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"}).status_code, 409)


if __name__ == "__main__":
    unittest.main()


class ProviderFailureApiTests(unittest.TestCase):
    def test_provider_failure_is_503_not_422(self):
        class FailingProvider:
            name = "failing"
            model_identifier = "failure-test"
            def interpret(self, *, context, evidence, connection=None):
                raise TimeoutError("provider timed out")

        with tempfile.TemporaryDirectory() as tempdir:
            app = create_app(
                Settings(database_path=str(Path(tempdir) / "state.db"), provider="anthropic", cors_origins=[]),
                provider=FailingProvider(),
            )
            with TestClient(app) as client:
                response = client.post("/api/evidence", json={"content": "A valid note."})
                self.assertEqual(response.status_code, 503)
                detail = response.json()["detail"]
                self.assertEqual(detail["code"], "provider_error")
                self.assertIn("Please try again", detail["error_details"]["error_message"])
                self.assertNotIn("TimeoutError", detail["error_details"]["error_message"])
                with sqlite3.connect(str(Path(tempdir) / "state.db")) as connection:
                    stored = connection.execute(
                        "SELECT structured_result FROM interpretation_records WHERE id=?",
                        (detail["interpretation_record_id"],),
                    ).fetchone()[0]
                    self.assertIn("TimeoutError", stored)
