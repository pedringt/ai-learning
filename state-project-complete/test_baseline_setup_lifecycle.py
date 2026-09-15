"""Regression coverage for Issue #155's explicit Baseline Setup lifecycle."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app
from baseline_setup import (
    merge_interpretation_payloads,
    record_interpretation_metadata,
    split_evidence_text,
    strip_internal_provider_metadata,
)


class BaselineFixtureProvider:
    name = "baseline-fixture"
    model_identifier = "baseline-fixture-v1"

    def interpret(self, *, context, evidence, connection=None):
        content = evidence["content"]
        if "open product question" in content.lower():
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
            statement = (
                "State maintains a trustworthy understanding of what a project currently treats as true."
                if "first" in content.lower()
                else "State is primarily a learning and portfolio project."
            )
            topic = "Purpose" if "first" in content.lower() else "Product boundary"
            area = "Product" if "first" in content.lower() else "Development"
            raw = {
                "summary": "The evidence establishes a durable baseline fact.",
                "topics": [area.lower()],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": f"Should Current State record {topic.lower()}?",
                    "why_consequential": "The fact is needed to understand the project baseline.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create",
                        "proposed_statement": statement,
                        "rationale": "The Evidence states this directly.",
                        "proposed_area_name": area,
                        "proposed_topic": topic,
                    }],
                }],
            }
        record_interpretation_metadata(evidence["id"], raw, [raw])
        return strip_internal_provider_metadata(raw)


class BaselineLifecycleApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        self.provider = BaselineFixtureProvider()
        self.client_context = TestClient(create_app(
            Settings(database_path=self.db_path, cors_origins=[], demo_bootstrap=True),
            provider=self.provider,
        ))
        self.client = self.client_context.__enter__()
        created = self.client.post("/api/projects", json={"name": "State Planning"})
        self.assertEqual(created.status_code, 200)
        self.project = created.json()
        self.headers = {"X-State-Project-Id": self.project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _submit(self, content: str):
        response = self.client.post(
            "/api/evidence",
            headers=self.headers,
            json={"content": content, "source_type": "manual_note"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _accept(self, review_id: str):
        response = self.client.post(
            f"/api/reviews/{review_id}/resolve",
            headers=self.headers,
            json={"decision": "accept"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_user_project_starts_baseline_while_seeded_project_is_established(self):
        baseline = self.client.get("/api/baseline", headers=self.headers).json()
        self.assertEqual(baseline["status"], "baseline_setup")
        self.assertTrue(baseline["can_finish"])

        seeded = self.client.get(
            "/api/baseline", headers={"X-State-Project-Id": "northstar"}
        ).json()
        self.assertEqual(seeded["status"], "established")
        self.assertFalse(seeded["can_finish"])

    def test_baseline_stays_active_after_first_accepted_fact_and_creates_area_on_accept(self):
        result = self._submit("First baseline note about what State is.")
        self.assertEqual(len(result["reviews"]), 1)

        before = self.client.get("/api/project-areas", headers=self.headers).json()["items"]
        self.assertEqual(before, [])

        self._accept(result["reviews"][0]["id"])
        baseline = self.client.get("/api/baseline", headers=self.headers).json()
        self.assertEqual(baseline["status"], "baseline_setup")
        self.assertEqual(baseline["counts"]["current_state"], 1)
        self.assertEqual(baseline["counts"]["project_areas"], 1)

        state = self.client.get("/api/state", headers=self.headers).json()["items"]
        self.assertEqual(state[0]["area_name"], "Product")
        self.assertEqual(state[0]["topic"], "Purpose")

    def test_explicit_question_becomes_question_only_after_human_acceptance(self):
        result = self._submit("Open product question: How should baseline coverage be checked?")
        self.assertEqual(result["reviews"][0]["review_type"], "open_question")
        self.assertEqual(self.client.get("/api/questions", headers=self.headers).json()["items"], [])

        self._accept(result["reviews"][0]["id"])
        questions = self.client.get("/api/questions", headers=self.headers).json()["items"]
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["text"], "How should baseline coverage be checked?")

    def test_finish_is_human_controlled_and_blocked_by_pending_review(self):
        result = self._submit("First baseline note about what State is.")
        blocked = self.client.post("/api/baseline/finish", headers=self.headers)
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], "baseline_not_ready")

        self._accept(result["reviews"][0]["id"])
        finished = self.client.post("/api/baseline/finish", headers=self.headers)
        self.assertEqual(finished.status_code, 200)
        self.assertEqual(finished.json()["status"], "established")

        refreshed = self.client.get("/api/baseline", headers=self.headers).json()
        self.assertEqual(refreshed["status"], "established")


class BaselineChunkingTests(unittest.TestCase):
    def test_question_dense_note_is_bounded_even_when_short(self):
        source = """## Open product questions
- Question one?
- Question two?
- Question three?
- Question four?
- Question five?
- Question six?
"""
        chunks = split_evidence_text(source, max_chars=5000)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(sum(chunk.count("?") for chunk in chunks), 6)
        self.assertTrue(all(chunk.count("?") <= 2 for chunk in chunks))
        self.assertTrue(all("Open product questions" in chunk for chunk in chunks))

    def test_large_source_is_split_without_requiring_separate_evidence(self):
        source = "\n\n".join(f"Section {i}. " + ("detail " * 120) for i in range(8))
        chunks = split_evidence_text(source, max_chars=900)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 900 for chunk in chunks))

    def test_chunk_merge_dedupes_exact_repeated_recommendation(self):
        recommendation = {
            "review_action": "create",
            "review_type": "missing_understanding",
            "decision_question": "Should State record the project purpose?",
            "why_consequential": "It is baseline knowledge.",
            "affected_state_item_ids": [],
            "proposed_changes": [{
                "operation": "create",
                "proposed_statement": "State maintains current project truth.",
                "rationale": "The source says so.",
            }],
        }
        payload = {
            "summary": "Purpose found.", "topics": ["purpose"],
            "outcome": "review_recommended", "review_recommendations": [recommendation],
        }
        merged = merge_interpretation_payloads([payload, payload])
        self.assertEqual(len(merged["review_recommendations"]), 1)
        self.assertEqual(len(merged["review_recommendations"][0]["proposed_changes"]), 1)


if __name__ == "__main__":
    unittest.main()
