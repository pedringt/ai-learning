"""Regression coverage for fast-ack Baseline Evidence intake."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app
from baseline_async_intake import _analyze_in_background, _store_pending_evidence
from baseline_setup import record_interpretation_metadata, strip_internal_provider_metadata
from db import connect


class AsyncFixtureProvider:
    name = "async-baseline-fixture"
    model_identifier = "async-baseline-fixture-v1"

    def interpret(self, *, context, evidence, connection=None):
        raw = {
            "summary": "The source establishes a routine Starting State fact.",
            "topics": ["Product"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_type": "missing_understanding",
                "decision_question": "Should the Starting State include this purpose?",
                "why_consequential": "The fact explains what the project is for.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": "State maintains a trustworthy picture of current project truth.",
                    "rationale": "The Evidence states this directly.",
                    "proposed_area_name": "Product",
                    "proposed_topic": "Purpose",
                }],
            }],
        }
        record_interpretation_metadata(str(evidence.get("id") or ""), raw, [raw])
        return strip_internal_provider_metadata(raw)


class BaselineAsyncIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            database_path=str(Path(self.tempdir.name) / "state.db"),
            cors_origins=[],
            demo_bootstrap=True,
        )
        self.provider = AsyncFixtureProvider()
        self.client_context = TestClient(create_app(self.settings, provider=self.provider))
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "Async Baseline"})
        self.assertEqual(created.status_code, 200, created.text)
        self.project = created.json()
        self.headers = {"X-State-Project-Id": self.project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_pending_evidence_is_saved_before_analysis_and_blocks_confirmation(self):
        content = "State is a project-understanding prototype."
        evidence_id = _store_pending_evidence(
            self.settings,
            self.project["id"],
            content,
            "manual_note",
            None,
        )

        connection = connect(self.settings.connection_url())
        try:
            connection.project_id = self.project["id"]
            row = connection.execute(
                "SELECT content, processing_status FROM evidence WHERE id=? AND project_id=?",
                (evidence_id, self.project["id"]),
            ).fetchone()
            self.assertEqual(row["content"], content)
            self.assertEqual(row["processing_status"], "pending")
        finally:
            connection.close()

        pending_draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(pending_draft["counts"]["processing_evidence"], 1)
        self.assertFalse(pending_draft["can_confirm"])

        _analyze_in_background(
            self.settings,
            self.provider,
            self.project["id"],
            evidence_id,
        )

        draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(draft["counts"]["processing_evidence"], 0)
        self.assertTrue(draft["can_confirm"])
        proposed = [item for item in draft["draft"]["items"] if item["kind"] == "proposed"]
        self.assertEqual(len(proposed), 1)
        self.assertEqual(proposed[0]["area_name"], "Product")
        self.assertEqual(proposed[0]["topic"], "Purpose")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])

    def test_registered_fast_ack_route_preserves_authority_boundary(self):
        response = self.client.post(
            "/api/baseline/evidence",
            headers=self.headers,
            json={"content": "State is a project-understanding prototype.", "source_type": "manual_note"},
        )
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["processing_status"], "pending")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])

        # TestClient completes BackgroundTasks before control returns, so the
        # draft may already be ready here even though the HTTP contract is a
        # fast 202 acknowledgement in the deployed ASGI server.
        draft = self.client.get("/api/baseline/draft", headers=self.headers).json()
        self.assertEqual(draft["counts"]["failed_evidence"], 0)
        self.assertGreaterEqual(draft["counts"]["proposed_items"], 1)

    def test_fast_ack_path_rejects_established_projects(self):
        finished = self.client.post("/api/baseline/confirm", headers=self.headers, json={"items": []})
        self.assertEqual(finished.status_code, 200, finished.text)
        response = self.client.post(
            "/api/baseline/evidence",
            headers=self.headers,
            json={"content": "New information", "source_type": "manual_note"},
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "baseline_not_active")


if __name__ == "__main__":
    unittest.main()
