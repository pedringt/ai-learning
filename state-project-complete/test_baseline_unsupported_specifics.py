"""#240: a Baseline fact may not add a year or amount its source never states.

The real model (the Baseline provider the deployed app uses) twice wrote a year into a
Starting State fact for a source that gives dates without one ("March 6" became
"March 6, 2025"). Routine Baseline facts are confirmed together in one click, so an
invented specific could become Current State without anyone seeing that the source
never said it. Software must keep such a fact out of the routine draft and send its
Review to individual human review. No model calls in this file.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from baseline_api import Settings, create_app
from baseline_grounding import review_unsupported_specifics, unsupported_specifics
from baseline_setup import record_interpretation_metadata, strip_internal_provider_metadata

# What the provider "says" for each source: the model added a year the source never states.
STATEMENTS = {
    "Launch is on March 3.": "The launch is on March 3, 2025.",
    "Launch is on March 3, 2026.": "The launch is on March 3, 2026.",
    "The approved budget is $180,000.": "The approved budget is $250,000.",
    "Atlas has a weekly status report.": "Atlas has a weekly status report.",
}


class InventedYearProvider:
    name = "invented-year-fixture"
    model_identifier = "invented-year-fixture-v1"

    def interpret(self, *, context, evidence, connection=None):
        statement = STATEMENTS[evidence["content"].strip()]
        raw = {
            "summary": "The evidence establishes a baseline fact.",
            "topics": ["delivery"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "missing_understanding",
                "decision_question": f"Should Current State record: {statement}",
                "why_consequential": "The fact is needed to understand the project baseline.",
                "affected_state_item_ids": [],
                "proposed_changes": [{
                    "operation": "create",
                    "proposed_statement": statement,
                    "rationale": "The Evidence states this directly.",
                    "proposed_area_name": "Delivery",
                    "proposed_topic": "Launch",
                }],
            }],
        }
        record_interpretation_metadata(evidence["id"], raw, [raw])
        return strip_internal_provider_metadata(raw)


class UnsupportedSpecificsInBaselineTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.client_context = TestClient(create_app(
            Settings(database_path=str(Path(self.tempdir.name) / "state.db"), cors_origins=[], demo_bootstrap=True),
            provider=InventedYearProvider(),
        ))
        self.client = self.client_context.__enter__()
        project = self.client.post("/api/projects", json={"name": "Invented year"}).json()
        self.headers = {"X-State-Project-Id": project["id"]}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def _submit(self, content):
        response = self.client.post("/api/evidence", headers=self.headers,
                                    json={"content": content, "source_type": "manual_note"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _draft(self):
        response = self.client.get("/api/baseline/draft", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _proposed_statements(self, draft):
        return [i["statement"] for i in draft["draft"]["items"] if i["kind"] == "proposed"]

    def test_an_invented_year_is_not_a_routine_fact_and_cannot_be_confirmed_in_the_batch(self):
        self._submit("Launch is on March 3.")
        draft = self._draft()

        self.assertNotIn("The launch is on March 3, 2025.", self._proposed_statements(draft))
        self.assertFalse(draft["can_confirm"])
        self.assertEqual(draft["counts"]["needs_individual_review"], 1)
        flagged = draft["needs_individual_review"][0]
        self.assertEqual(flagged["unsupported_specifics"], ["2025"])
        self.assertIn("2025", flagged["reason"])
        self.assertEqual(flagged["statements"], ["The launch is on March 3, 2025."])

        # The Review is visible in the person's Review queue, not hidden as routine draft material.
        reviews = self.client.get("/api/reviews", headers=self.headers).json()["items"]
        self.assertEqual([r["id"] for r in reviews], [flagged["review_id"]])

        # A batch confirm cannot authorize it, even when the client names the proposal.
        proposal_id = reviews[0]["proposals"][0]["id"]
        blocked = self.client.post("/api/baseline/confirm", headers=self.headers,
                                   json={"items": [{"proposal_id": proposal_id, "decision": "accept"}]})
        self.assertEqual(blocked.status_code, 409, blocked.text)
        self.assertEqual(blocked.json()["detail"]["code"], "baseline_review_required")
        self.assertEqual(self.client.get("/api/state", headers=self.headers).json()["items"], [])

    def test_a_person_can_correct_the_fact_in_its_individual_review(self):
        self._submit("Launch is on March 3.")
        review = self.client.get("/api/reviews", headers=self.headers).json()["items"][0]
        resolved = self.client.post(
            f"/api/reviews/{review['id']}/resolve", headers=self.headers,
            json={"decision": "accept", "adjustments": [
                {"proposal_id": review["proposals"][0]["id"], "adjusted_statement": "The launch is on March 3."}]},
        )
        self.assertEqual(resolved.status_code, 200, resolved.text)
        self.assertEqual([i["statement"] for i in self.client.get("/api/state", headers=self.headers).json()["items"]],
                         ["The launch is on March 3."])
        draft = self._draft()
        self.assertTrue(draft["can_confirm"], draft)
        self.assertEqual(draft["needs_individual_review"], [])

    def test_a_year_the_source_states_stays_routine(self):
        self._submit("Launch is on March 3, 2026.")
        draft = self._draft()
        self.assertEqual(self._proposed_statements(draft), ["The launch is on March 3, 2026."])
        self.assertTrue(draft["can_confirm"])
        self.assertEqual(self.client.get("/api/reviews", headers=self.headers).json()["items"], [])

    def test_an_invented_amount_is_flagged_too(self):
        self._submit("The approved budget is $180,000.")
        draft = self._draft()
        self.assertEqual(self._proposed_statements(draft), [])
        self.assertEqual(draft["needs_individual_review"][0]["unsupported_specifics"], ["$250,000"])

    def test_a_flagged_fact_does_not_hold_back_unrelated_routine_facts_from_the_draft(self):
        self._submit("Atlas has a weekly status report.")
        self._submit("Launch is on March 3.")
        draft = self._draft()
        self.assertEqual(self._proposed_statements(draft), ["Atlas has a weekly status report."])
        self.assertEqual(draft["counts"]["needs_individual_review"], 1)
        self.assertFalse(draft["can_confirm"])


class UnsupportedSpecificsCheckTests(unittest.TestCase):
    def test_years(self):
        # The two real #233 cases.
        self.assertEqual(unsupported_specifics(
            "Design freeze is March 6, 2025. General availability is June 2, 2025.",
            "Design freeze is March 6. General availability is June 2."), ["2025"])
        self.assertEqual(unsupported_specifics(
            "Kestrel migration is scheduled for September 30, 2024.",
            "The migration is scheduled for September 30."), ["2024"])
        self.assertEqual(unsupported_specifics("Launch is October 15, 2026.", "Launch: October 15, 2026"), [])
        # A two-digit form in the source supports the full year.
        self.assertEqual(unsupported_specifics("GA is in Q3 2026.", "GA is Q3 '26."), [])
        self.assertEqual(unsupported_specifics("The FY2026 plan is approved.", "The FY26 plan is approved."), [])
        # A year inside a longer number, or a dollar figure, is not a year.
        self.assertEqual(unsupported_specifics("Support covers 20250 tickets.", "Support covers 20250 tickets."), [])
        self.assertEqual(unsupported_specifics("Ticket volume is 12,019 a month.", "Ticket volume is 12,019 a month."), [])

    def test_amounts(self):
        self.assertEqual(unsupported_specifics("Budget is $180,000.", "The approved budget is $180,000."), [])
        self.assertEqual(unsupported_specifics("Budget is $180,000.", "Budget: $180k."), [])
        self.assertEqual(unsupported_specifics("Budget is $1.5 million.", "Budget is 1,500,000 dollars."), [])
        self.assertEqual(unsupported_specifics("Contractor cap is $60,000; reserve is $25,000.",
                                               "Contractor spend is capped at $60,000."), ["$25,000"])
        self.assertEqual(unsupported_specifics("Budget is $180,000 for 2025.", "Budget is $180,000."), ["2025"])

    def test_human_adjusted_wording_is_not_checked(self):
        review = {
            "evidence_items": [{"content": "Launch is on March 3."}],
            "proposals": [{"status": "pending", "operation": "create",
                           "proposed_statement": "Launch is on March 3, 2025.",
                           "adjusted_statement": "Launch is on March 3, 2027.", "proposed_topic": "Launch"}],
        }
        self.assertEqual(review_unsupported_specifics(review), [])
        review["proposals"][0]["adjusted_statement"] = None
        self.assertEqual(review_unsupported_specifics(review), ["2025"])
        review["proposals"][0]["proposed_topic"] = "Launch 2024"
        self.assertEqual(review_unsupported_specifics(review), ["2025", "2024"])


if __name__ == "__main__":
    unittest.main()
