"""Issue #140 stage 1: uploading a .txt/.md file as Evidence.

Covers the new POST /api/evidence/upload endpoint -- it must behave exactly
like POST /api/evidence (same interpretation pipeline, same authority rules)
except for how the raw content arrives, and it must reject anything outside
the deliberately small initial format/size scope with a clear client error
rather than a confusing 500 or a silent no-op.
"""
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


class EvidenceUploadTests(unittest.TestCase):
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

    def test_txt_upload_flows_through_the_same_pipeline_as_manual_evidence(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("meeting-notes.txt", b"Launch moved to October 15.", "text/plain")},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(len(body["reviews"]), 1)

        before = self.client.get("/api/state").json()["items"][0]
        self.assertEqual(before["statement"], "Launch is October 1.")

        review_id = body["reviews"][0]["id"]
        resolved = self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"})
        self.assertEqual(resolved.json()["state"][0]["statement"], "Launch is October 15.")

    def test_md_extension_is_accepted(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("transcript.md", b"# Notes\nLaunch moved to October 15.", "text/markdown")},
        )
        self.assertEqual(response.status_code, 201)

    def test_upload_preserves_original_filename_as_source_name(self):
        self.client.post(
            "/api/evidence/upload",
            files={"file": ("q3-standup-transcript.txt", b"Launch moved to October 15.", "text/plain")},
        )
        items = self.client.get("/api/evidence").json()["items"]
        uploaded = next(e for e in items if e["source_type"] == "uploaded_note")
        self.assertEqual(uploaded["source_name"], "q3-standup-transcript.txt")

    def test_unsupported_extension_is_rejected_with_a_clear_error(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("deck.pptx", b"fake bytes", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "unsupported_file_type")

    def test_empty_file_is_rejected(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("empty.txt", b"   \n  ", "text/plain")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "empty_file")

    def test_non_utf8_file_is_rejected_not_500ed(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("bad.txt", b"\xff\xfe\x00\xff not text", "text/plain")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "unreadable_file")

    def test_oversized_file_is_rejected(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("huge.txt", b"x" * 15_000_001, "text/plain")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "file_too_large")

    def test_missing_filename_extension_is_rejected(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("noextension", b"Launch moved to October 15.", "text/plain")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "unsupported_file_type")


if __name__ == "__main__":
    unittest.main()
