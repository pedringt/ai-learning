"""Mechanical (non-live-model) coverage for POST /api/evidence/{id}/promote:
the plumbing works end-to-end (endpoint -> process_evidence ->
user_requested_maintenance reaches the provider -> a Review can be created
through the normal path), independent of whether a real model would
actually change its answer -- that's test_bootstrap_and_promotion_guidance.py
(prompt contract) and test_evidence_intake_consequentiality.py's live-model
suite's job.
"""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app


class TogglingProvider:
    """First call (the normal submission) returns no_review, mirroring a
    real "nothing consequential here" verdict. Any call carrying
    user_requested_maintenance returns a real recommendation -- this is
    exactly the observable contract promote() depends on: the SAME evidence
    can flip outcomes based on that one flag, without anything else about
    the request changing.
    """
    name = "test"
    model_identifier = "deterministic-test-v1"

    def interpret(self, *, context, evidence):
        if evidence.get("user_requested_maintenance"):
            return {
                "summary": "User asked State to reconsider; a concrete fact is present.",
                "topics": ["promotion"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": "Should this be tracked as Current State?",
                    "why_consequential": "The user explicitly flagged this as worth maintaining.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create",
                        "proposed_statement": "Promoted fact from Evidence.",
                        "rationale": "User-requested promotion surfaced a fact worth tracking.",
                    }],
                }],
            }
        return {
            "summary": "Nothing consequential here on first pass.",
            "topics": [],
            "outcome": "no_review",
            "no_review_explanation": "Too vague to establish Current State.",
            "review_recommendations": [],
        }


class EvidencePromotionTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"]),
            provider=TogglingProvider(),
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_first_submission_gets_no_review_then_promotion_creates_a_review(self):
        submitted = self.client.post("/api/evidence", json={"content": "State needs a Question Agent."})
        self.assertEqual(submitted.status_code, 201)
        self.assertEqual(submitted.json()["reviews"], [])
        evidence_id = submitted.json()["evidence_id"]

        # Confirmed genuinely no_review before promotion (not just no reviews
        # returned by coincidence).
        evidence_items = self.client.get("/api/evidence").json()["items"]
        self.assertEqual(evidence_items[0]["processing_status"], "processed")

        promoted = self.client.post(f"/api/evidence/{evidence_id}/promote")
        self.assertEqual(promoted.status_code, 200, promoted.text)
        body = promoted.json()
        self.assertEqual(len(body["reviews"]), 1)
        self.assertEqual(body["reviews"][0]["review_type"], "missing_understanding")

    def test_promotion_never_bypasses_review_current_state_unchanged_until_accept(self):
        submitted = self.client.post("/api/evidence", json={"content": "State needs a Question Agent."})
        evidence_id = submitted.json()["evidence_id"]

        promoted = self.client.post(f"/api/evidence/{evidence_id}/promote")
        review_id = promoted.json()["reviews"][0]["id"]

        # The promoted Review exists and is open, but Current State must
        # still be untouched -- promotion changes the consequentiality
        # judgment, never the authority model.
        state = self.client.get("/api/state").json()["items"]
        self.assertEqual(state, [])

        resolved = self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"})
        self.assertEqual(resolved.status_code, 200)
        self.assertEqual(len(resolved.json()["state"]), 1)
        self.assertEqual(resolved.json()["state"][0]["statement"], "Promoted fact from Evidence.")

    def test_promoting_nonexistent_evidence_is_a_404(self):
        response = self.client.post("/api/evidence/does-not-exist/promote")
        self.assertEqual(response.status_code, 404)

    def test_promote_is_scoped_to_the_active_project(self):
        # Evidence created in Project A must not be promotable via a request
        # scoped to Project B (project_id_of() filters the SELECT inside
        # process_evidence()).
        submitted = self.client.post("/api/evidence", json={"content": "State needs a Question Agent."})
        evidence_id = submitted.json()["evidence_id"]

        other_project = self.client.post("/api/projects", json={"name": "Other Project"}).json()
        response = self.client.post(
            f"/api/evidence/{evidence_id}/promote",
            headers={"X-State-Project-Id": other_project["id"]},
        )
        self.assertEqual(response.status_code, 404)

    def test_reanalyze_is_also_scoped_to_the_active_project(self):
        # /reanalyze shares _reanalyze() with /promote -- same fix, same
        # regression risk. A cross-project evidence_id used to raise an
        # uncaught KeyError (a 500) instead of a clean 404, since the
        # existence check here was unscoped while process_evidence()'s own
        # SELECT was already correctly project-scoped.
        submitted = self.client.post("/api/evidence", json={"content": "State needs a Question Agent."})
        evidence_id = submitted.json()["evidence_id"]

        other_project = self.client.post("/api/projects", json={"name": "Other Project"}).json()
        response = self.client.post(
            f"/api/evidence/{evidence_id}/reanalyze",
            headers={"X-State-Project-Id": other_project["id"]},
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
