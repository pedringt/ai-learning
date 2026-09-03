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

    def test_evidence_archive_lists_processed_items_after_review_resolution(self):
        response = self.client.post("/api/evidence", json={"content": "Launch moved to October 15."})
        self.assertEqual(response.status_code, 201)
        evidence_id = response.json()["evidence_id"]
        review_id = response.json()["reviews"][0]["id"]
        self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"})
        items = self.client.get("/api/evidence").json()["items"]
        row = next(item for item in items if item["id"] == evidence_id)
        self.assertEqual(row["content"], "Launch moved to October 15.")
        self.assertEqual(row["processing_status"], "processed")

    def test_history_read_model_includes_source_evidence_provenance(self):
        response = self.client.post("/api/evidence", json={"content": "Launch moved to October 15."})
        review_id = response.json()["reviews"][0]["id"]
        self.client.post(f"/api/reviews/{review_id}/resolve", json={"decision": "accept"})
        history = self.client.get("/api/history").json()["items"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["review_id"], review_id)
        self.assertEqual(history[0]["decision_question"], "Accept the new launch date?")
        self.assertEqual(history[0]["evidence_items"][0]["content"], "Launch moved to October 15.")


class DemoExperienceApiTests(unittest.TestCase):
    def test_bootstrap_and_reset_routes_restore_curated_demo(self):
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = str(Path(tempdir) / "state.db")
            app = create_app(
                Settings(database_path=db_path, provider="anthropic", cors_origins=[], demo_bootstrap=True),
                provider=LaunchDateProvider(),
            )
            with TestClient(app) as client:
                bootstrap = client.get("/api/bootstrap")
                self.assertEqual(bootstrap.status_code, 200)
                self.assertEqual(len(bootstrap.json()["state"]), 25)
                self.assertEqual(len(bootstrap.json()["open_reviews"]), 4)
                client.post("/api/questions", json={"text": "Temporary demo question"})
                reset = client.post("/api/demo/reset")
                self.assertEqual(reset.status_code, 200)
                self.assertEqual(reset.json()["status"], "reset")
                questions = client.get("/api/questions?status=open").json()["items"]
                self.assertEqual(len(questions), 20)
                self.assertNotIn("Temporary demo question", {item["text"] for item in questions})

    def test_reset_route_is_hidden_outside_demo_mode(self):
        with tempfile.TemporaryDirectory() as tempdir:
            app = create_app(
                Settings(database_path=str(Path(tempdir) / "state.db"), provider="anthropic", cors_origins=[], demo_bootstrap=False),
                provider=LaunchDateProvider(),
            )
            with TestClient(app) as client:
                self.assertEqual(client.post("/api/demo/reset").status_code, 404)


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

class QuestionLifecycleApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=[]),
            provider=LaunchDateProvider(),
        )
        self.ctx = TestClient(app)
        self.client = self.ctx.__enter__()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
                ("state_launch", "launch", "Launch is October 1.", 1),
            )
            connection.commit()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_manual_question_persists_and_can_be_stopped(self):
        created = self.client.post("/api/questions", json={"text": "Which account source is authoritative?"})
        self.assertEqual(created.status_code, 201)
        item = created.json()
        self.assertFalse(bool(item["blocking"]))
        listed = self.client.get("/api/questions?status=open").json()["items"]
        self.assertEqual([q["id"] for q in listed], [item["id"]])
        stopped = self.client.post(f"/api/questions/{item['id']}/stop")
        self.assertEqual(stopped.status_code, 200)
        self.assertEqual(self.client.get("/api/questions?status=open").json()["items"], [])

    def test_duplicate_open_question_text_is_idempotent(self):
        first = self.client.post("/api/questions", json={"text": "Which account source is authoritative?"}).json()
        second = self.client.post("/api/questions", json={"text": "  which   account source is AUTHORITATIVE?  "}).json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.client.get("/api/questions?status=open").json()["items"]), 1)

    def test_blocker_requires_named_dependency(self):
        response = self.client.post("/api/questions", json={"text": "What is the threshold?", "blocking": True})
        self.assertEqual(response.status_code, 422)
        ok = self.client.post(
            "/api/questions",
            json={"text": "What is the threshold?", "blocking": True, "blocks": "Pilot launch decision"},
        )
        self.assertEqual(ok.status_code, 201)
        self.assertTrue(bool(ok.json()["blocking"]))

    def test_accepted_question_response_resolves_question(self):
        q = self.client.post("/api/questions", json={"text": "When does launch start?"}).json()
        evidence = self.client.post(
            "/api/evidence",
            json={"content": "Launch moved to October 15.", "source_type": f"question_response:{q['id']}"},
        ).json()
        self.client.post(f"/api/reviews/{evidence['reviews'][0]['id']}/resolve", json={"decision": "accept"})
        self.assertEqual(self.client.get("/api/questions?status=open").json()["items"], [])
        resolved = self.client.get("/api/questions?status=resolved").json()["items"]
        self.assertEqual(resolved[0]["id"], q["id"])
        self.assertEqual(resolved[0]["resolution"], "Resolved by reviewed evidence")


class RetryAnalysisApiTests(unittest.TestCase):
    def test_retry_reuses_saved_evidence_instead_of_creating_duplicate(self):
        class FailOnceProvider:
            name = "fail-once"
            model_identifier = "test"
            def __init__(self): self.calls = 0
            def interpret(self, *, context, evidence, connection=None):
                self.calls += 1
                if self.calls == 1:
                    raise TimeoutError("temporary provider failure")
                return {
                    "summary": "No maintained change.",
                    "topics": ["note"],
                    "outcome": "no_review",
                    "no_review_explanation": "The note does not change maintained understanding.",
                    "review_recommendations": [],
                }

        provider = FailOnceProvider()
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = str(Path(tempdir) / "state.db")
            app = create_app(Settings(database_path=db_path, provider="anthropic", cors_origins=[]), provider=provider)
            with TestClient(app) as client:
                first = client.post("/api/evidence", json={"content": "FYI only."})
                self.assertEqual(first.status_code, 503)
                evidence_id = first.json()["detail"]["evidence_id"]
                retry = client.post(f"/api/evidence/{evidence_id}/reanalyze")
                self.assertEqual(retry.status_code, 200)
                self.assertEqual(retry.json()["evidence_id"], evidence_id)
                evidence_items = client.get("/api/evidence").json()["items"]
                self.assertEqual(len(evidence_items), 1)

class IndirectQuestionResolutionApiTests(unittest.TestCase):
    def test_new_note_can_link_an_open_question_but_only_acceptance_resolves_it(self):
        class QuestionAnswerProvider:
            name = "question-answer"
            model_identifier = "test"
            def __init__(self): self.question_id = None
            def interpret(self, *, context, evidence, connection=None):
                return {
                    "summary": "Approval is now established.",
                    "topics": ["automation"],
                    "outcome": "review_recommended",
                    "review_recommendations": [{
                        "review_action": "create",
                        "review_type": "missing_understanding",
                        "decision_question": "Add the password-reset automation approval to Current State?",
                        "why_consequential": "The note explicitly establishes an approval that was previously unknown.",
                        "affected_state_item_ids": [],
                        "resolves_question_ids": [self.question_id],
                        "proposed_changes": [{
                            "operation": "create",
                            "state_item_id": None,
                            "proposed_statement": "Password reset tickets are approved for automation.",
                            "rationale": "The submitted evidence explicitly establishes approval, not implementation.",
                        }],
                    }],
                }

        provider = QuestionAnswerProvider()
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = str(Path(tempdir) / "state.db")
            app = create_app(Settings(database_path=db_path, provider="anthropic", cors_origins=[]), provider=provider)
            with TestClient(app) as client:
                q = client.post("/api/questions", json={"text": "Are password reset tickets approved for automation?"}).json()
                provider.question_id = q["id"]
                evidence = client.post("/api/evidence", json={"content": "Password reset tickets were approved for automation."})
                self.assertEqual(evidence.status_code, 201)
                review = evidence.json()["reviews"][0]
                self.assertEqual(review["resolves_question_ids"], [q["id"]])
                self.assertEqual([x["id"] for x in client.get("/api/questions?status=open").json()["items"]], [q["id"]])
                client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "accept"})
                self.assertEqual(client.get("/api/questions?status=open").json()["items"], [])
                resolved = client.get("/api/questions?status=resolved").json()["items"]
                self.assertEqual(resolved[0]["id"], q["id"])
                self.assertEqual(resolved[0]["resolution"], "Resolved by reviewed evidence")

    def test_provider_cannot_resolve_unknown_question_id(self):
        class BadQuestionProvider:
            name = "bad-question"
            model_identifier = "test"
            def interpret(self, *, context, evidence, connection=None):
                return {
                    "summary": "Bad reference.", "topics": [], "outcome": "review_recommended",
                    "review_recommendations": [{
                        "review_action": "create", "review_type": "missing_understanding",
                        "decision_question": "Accept?", "why_consequential": "Test.",
                        "affected_state_item_ids": [], "resolves_question_ids": ["question_missing"],
                        "proposed_changes": [{"operation": "create", "state_item_id": None,
                            "proposed_statement": "A new fact.", "rationale": "Test."}],
                    }],
                }
        with tempfile.TemporaryDirectory() as tempdir:
            app = create_app(Settings(database_path=str(Path(tempdir) / "state.db"), provider="anthropic", cors_origins=[]), provider=BadQuestionProvider())
            with TestClient(app) as client:
                response = client.post("/api/evidence", json={"content": "Some evidence."})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["detail"]["code"], "invalid_question_reference")
