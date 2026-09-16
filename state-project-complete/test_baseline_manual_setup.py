"""Regression coverage for direct Starting State entry during Baseline Setup."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app


class SentinelProvider:
    """The manual path must not need this model provider."""

    name = "sentinel"
    model_identifier = "sentinel-v1"

    def interpret(self, *, context, evidence, connection=None):
        raise AssertionError("manual Starting State unexpectedly called the model provider")


class BaselineManualSetupTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        self.client_context = TestClient(create_app(
            Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True),
            provider=SentinelProvider(),
        ))
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "Manual Baseline"})
        self.assertEqual(created.status_code, 200, created.text)
        self.project = created.json()
        self.headers = {"X-State-Project-Id": self.project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_direct_facts_become_draft_only_until_human_confirmation(self):
        payload = {
            "items": [
                {
                    "area_name": "Purpose & Scope",
                    "topic": "Purpose",
                    "statement": "State maintains a trustworthy picture of what a project currently treats as true.",
                },
                {
                    "area_name": "Governance",
                    "topic": "Authority model",
                    "statement": "AI interprets, software enforces, and people authorize Current State changes.",
                },
            ]
        }
        created = self.client.post("/api/baseline/manual", headers=self.headers, json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["processing_status"], "succeeded")
        self.assertEqual(created.json()["draft_fact_count"], 2)

        # Direct entry still stops at the draft authority boundary.
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])
        self.assertEqual(self.client.get("/api/reviews", headers=self.headers).json()["items"], [])

        evidence = self.client.get("/api/evidence", headers=self.headers).json()["items"]
        manual = [item for item in evidence if item["source_type"] == "manual_starting_state"]
        self.assertEqual(len(manual), 1)
        self.assertIn(payload["items"][0]["statement"], manual[0]["content"])
        self.assertIn(payload["items"][1]["statement"], manual[0]["content"])

        draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(draft["status"], "baseline_setup")
        self.assertTrue(draft["can_confirm"])
        proposed = [item for item in draft["draft"]["items"] if item["kind"] == "proposed"]
        self.assertEqual(len(proposed), 2)
        by_statement = {item["statement"]: item for item in proposed}
        for fact in payload["items"]:
            item = by_statement[fact["statement"]]
            self.assertEqual(item["area_name"], fact["area_name"])
            self.assertEqual(item["topic"], fact["topic"])

        confirmed = self.client.post(
            "/api/baseline/confirm",
            headers=self.headers,
            json={"items": [
                {"proposal_id": item["proposal_id"], "decision": "accept"}
                for item in proposed
            ]},
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["status"], "established")

        state = self.client.get("/api/state", headers=self.headers).json()["items"]
        self.assertEqual({item["statement"] for item in state}, {fact["statement"] for fact in payload["items"]})
        history = self.client.get("/api/history", headers=self.headers).json()["items"]
        self.assertEqual(len(history), 2)

    def test_direct_entry_is_rejected_after_baseline_is_established(self):
        # An intentionally empty Starting State is still a human baseline decision.
        finished = self.client.post("/api/baseline/confirm", headers=self.headers, json={"items": []})
        self.assertEqual(finished.status_code, 200, finished.text)
        before = self.client.get("/api/evidence", headers=self.headers).json()["items"]

        response = self.client.post(
            "/api/baseline/manual",
            headers=self.headers,
            json={"items": [{
                "area_name": "General",
                "topic": "Purpose",
                "statement": "This must not bypass the established-project workflow.",
            }]},
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "baseline_not_active")
        after = self.client.get("/api/evidence", headers=self.headers).json()["items"]
        self.assertEqual(len(after), len(before))


if __name__ == "__main__":
    unittest.main()
