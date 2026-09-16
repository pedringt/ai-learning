"""Integration regression test for the exact end-to-end scenario that
originally exposed the blank-project bugs (Notes leakage, stalled first-
evidence interpretation, lifecycle controls, onboarding banner -- see the
2026-09-15 bug report and its fixes in test_project_isolation.py,
test_blank_project_notes-tests.js, test_evidence_upload.py, and
test_evidence_upload_documents.py).

Those suites cover every individual piece: a blank project starts empty and
isolated, upload extracts text and preserves provenance, and interpretation
runs through the normal authority pipeline -- but none of them chain the
FULL path starting from a genuinely blank project:

  create a blank project -> upload its first-ever Evidence file ->
  the AI interprets it -> a Review is generated -> Current State stays
  empty until a human decides -> accepting the Review establishes Current
  State -> History records the transition.

The upload tests start from a project seeded with an existing
current_state_items row (so the fake provider can propose an "update").
This test instead uses a create-operation proposal (a brand new Current
State item, no prior item to reference), since that's the only kind of
proposal a genuinely empty project's first Review can produce.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api import Settings, create_app


class FirstEvidenceCreateProvider:
    """Deterministic provider for a blank project's first Evidence: proposes
    a brand-new Current State item (operation="create"), matching what a
    real project with nothing established yet would actually produce --
    there is no existing state_item_id for it to reference an "update"
    proposal against.
    """
    name = "test"
    model_identifier = "deterministic-test-v1"

    def interpret(self, *, context, evidence):
        return {
            "summary": "The vendor confirmed a launch date.",
            "topics": ["pilot", "launch"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Accept the launch date as Current State?",
                "why_consequential": "This would establish the project's first authoritative fact.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": "Launch is October 15.",
                    "rationale": "The uploaded brief explicitly states the launch date.",
                }],
            }],
        }


class BlankProjectFirstUploadE2ETest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"], demo_bootstrap=True),
            provider=FirstEvidenceCreateProvider(),
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_blank_project_first_uploaded_evidence_reaches_review_then_establishes_current_state(self):
        # 1. Create a genuinely blank project (Issue #129) and switch to it.
        created = self.client.post("/api/projects", json={"name": "New Client Kickoff"})
        self.assertEqual(created.status_code, 200)
        project = created.json()
        self.assertFalse(project["seeded"])

        switched = self.client.post("/api/projects/switch", json={"project_id": project["id"]})
        self.assertEqual(switched.status_code, 200)

        # Confirm it's actually blank before anything happens -- this is the
        # exact precondition the original bug report started from.
        bootstrap_before = self.client.get("/api/bootstrap", headers={"X-State-Project-Id": project["id"]}).json()
        self.assertEqual(bootstrap_before["state"], [])
        self.assertEqual(bootstrap_before["evidence"], [])
        self.assertEqual(bootstrap_before["open_reviews"], [])
        self.assertEqual(bootstrap_before["questions"], [])

        # 2. Upload the project's first-ever Evidence file (not pasted text --
        # the exact "add first evidence" path from Notes/Workspace).
        file_bytes = (
            b"Kickoff brief: the vendor confirmed the launch date is now "
            b"October 15, following the discovery call this week."
        )
        upload_response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("kickoff-brief.txt", file_bytes, "text/plain")},
            headers={"X-State-Project-Id": project["id"]},
        )
        self.assertEqual(upload_response.status_code, 201, upload_response.text)
        upload_body = upload_response.json()

        # 3. The AI interpreted it and a Review was generated -- this is the
        # step that silently never happened in the original bug (evidence
        # landed in Notes with "no apparent interpretation").
        self.assertEqual(len(upload_body["reviews"]), 1)
        review = upload_body["reviews"][0]
        review_id = review["id"]

        # 4. Current State must NOT have been established automatically --
        # AI interprets, people authorize. This is the core invariant the
        # whole feature exists to protect.
        state_after_upload = self.client.get("/api/state", headers={"X-State-Project-Id": project["id"]}).json()
        self.assertEqual(state_after_upload["items"], [])

        # The uploaded file itself must be preserved as Evidence with its
        # provenance, regardless of what happens to the Review next.
        evidence_items = self.client.get("/api/evidence", headers={"X-State-Project-Id": project["id"]}).json()["items"]
        self.assertEqual(len(evidence_items), 1)
        self.assertEqual(evidence_items[0]["source_type"], "uploaded_note")
        self.assertEqual(evidence_items[0]["source_name"], "kickoff-brief.txt")

        # 5. A human authorizes the proposal.
        resolved = self.client.post(
            f"/api/reviews/{review_id}/resolve",
            json={"decision": "accept"},
            headers={"X-State-Project-Id": project["id"]},
        )
        self.assertEqual(resolved.status_code, 200, resolved.text)
        resolved_body = resolved.json()

        # 6. Current State now reflects the accepted proposal -- established
        # only after, and only because of, explicit human authorization.
        self.assertEqual(len(resolved_body["state"]), 1)
        established_item = resolved_body["state"][0]
        self.assertEqual(established_item["statement"], "Launch is October 15.")
        self.assertEqual(established_item["version"], 1)

        # 7. History records the authorized transition.
        self.assertEqual(len(resolved_body["history"]), 1)
        history_entry = resolved_body["history"][0]
        self.assertEqual(history_entry["new_statement"], "Launch is October 15.")

        # 8. Project A (Northstar) must remain completely unchanged by any
        # of this -- the same isolation guarantee test_project_isolation.py
        # and test_project_lifecycle.py already lock in, re-checked here at
        # the end of the exact scenario that originally broke it.
        northstar_state = self.client.get("/api/state", headers={"X-State-Project-Id": "northstar"}).json()
        self.assertEqual(len(northstar_state["items"]), 25)
        northstar_evidence = self.client.get("/api/evidence", headers={"X-State-Project-Id": "northstar"}).json()
        self.assertTrue(len(northstar_evidence["items"]) > 0)
        self.assertFalse(any(e["source_name"] == "kickoff-brief.txt" for e in northstar_evidence["items"]))


if __name__ == "__main__":
    unittest.main()
