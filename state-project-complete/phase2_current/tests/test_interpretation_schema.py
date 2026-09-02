import copy
import unittest

from state_spike.interpretation_validation import (
    StructuredInterpretationSchemaError,
    validate_schema,
)


def no_review_payload():
    return {
        "summary": "Billing agents will attend training on September 15.",
        "topics": ["training"],
        "outcome": "no_review",
        "no_review_explanation": "Operational detail does not materially change maintained State.",
        "review_recommendations": [],
    }


def proposed_update_payload():
    return {
        "summary": "The launch date moved from October 1 to October 15.",
        "topics": ["launch timing"],
        "outcome": "review_recommended",
        "review_recommendations": [
            {
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Should the maintained launch date move to October 15?",
                "why_consequential": "The recorded launch date would otherwise be stale.",
                "affected_state_item_ids": ["state_02"],
                "proposed_changes": [
                    {
                        "operation": "update",
                        "state_item_id": "state_02",
                        "expected_version": 1,
                        "proposed_statement": "The AI Support Pilot will launch to the billing-support team on October 15.",
                        "rationale": "Evidence explicitly says the launch moved to October 15.",
                    }
                ],
            }
        ],
    }


class StructuredInterpretationSchemaTests(unittest.TestCase):
    def assert_invalid(self, payload):
        with self.assertRaises(StructuredInterpretationSchemaError):
            validate_schema(payload)

    def test_valid_no_review(self):
        validate_schema(no_review_payload())

    def test_no_review_requires_explanation(self):
        payload = no_review_payload()
        del payload["no_review_explanation"]
        self.assert_invalid(payload)

    def test_no_review_requires_empty_recommendations(self):
        payload = no_review_payload()
        payload["review_recommendations"] = proposed_update_payload()["review_recommendations"]
        self.assert_invalid(payload)

    def test_review_recommended_forbids_no_review_explanation(self):
        payload = proposed_update_payload()
        payload["no_review_explanation"] = "Should not be present."
        self.assert_invalid(payload)

    def test_review_recommended_requires_recommendation(self):
        payload = proposed_update_payload()
        payload["review_recommendations"] = []
        self.assert_invalid(payload)

    def test_unknown_top_level_field_is_rejected(self):
        payload = no_review_payload()
        payload["confidence"] = 0.9
        self.assert_invalid(payload)

    def test_create_review_forbids_existing_review_id(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["existing_review_id"] = "review_1"
        self.assert_invalid(payload)

    def test_update_existing_requires_existing_review_id(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["review_action"] = "update_existing"
        self.assert_invalid(payload)

    def test_update_existing_accepts_existing_review_id(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["review_action"] = "update_existing"
        recommendation["existing_review_id"] = "review_1"
        validate_schema(payload)

    def test_proposed_update_requires_proposal(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["proposed_changes"] = []
        self.assert_invalid(payload)

    def test_state_at_risk_may_have_no_proposal(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["review_type"] = "state_at_risk"
        recommendation["decision_question"] = "Which system is authoritative?"
        recommendation["proposed_changes"] = []
        validate_schema(payload)

    def test_missing_understanding_may_have_no_proposal(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["review_type"] = "missing_understanding"
        recommendation["affected_state_item_ids"] = []
        recommendation["decision_question"] = "What residency rule applies?"
        recommendation["proposed_changes"] = []
        validate_schema(payload)

    def test_missing_understanding_may_have_create_proposal(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["review_type"] = "missing_understanding"
        recommendation["affected_state_item_ids"] = []
        recommendation["proposed_changes"] = [
            {
                "operation": "create",
                "proposed_statement": "Pilot customer data must be stored in the United States.",
                "rationale": "Evidence explicitly establishes the missing residency requirement.",
            }
        ]
        validate_schema(payload)

    def test_missing_understanding_rejects_update_proposal(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["review_type"] = "missing_understanding"
        self.assert_invalid(payload)

    def test_multiple_affected_items_require_grouping_reason(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["affected_state_item_ids"] = ["state_03", "state_04"]
        self.assert_invalid(payload)

    def test_multiple_proposals_require_grouping_reason(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        second = copy.deepcopy(recommendation["proposed_changes"][0])
        second["state_item_id"] = "state_03"
        second["proposed_statement"] = "Another supported replacement."
        recommendation["proposed_changes"].append(second)
        self.assert_invalid(payload)

    def test_grouping_reason_allowed_when_grouping_is_required(self):
        payload = proposed_update_payload()
        recommendation = payload["review_recommendations"][0]
        recommendation["affected_state_item_ids"] = ["state_04", "state_05"]
        recommendation["grouping_reason"] = "Both changes are conditions of the same security approval."
        validate_schema(payload)

    def test_grouping_reason_forbidden_for_single_item_single_proposal(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["grouping_reason"] = "Unnecessary grouping explanation."
        self.assert_invalid(payload)

    def test_create_proposal_requires_statement(self):
        payload = proposed_update_payload()
        proposal = payload["review_recommendations"][0]["proposed_changes"][0]
        proposal.clear()
        proposal.update({"operation": "create", "rationale": "Supported new understanding."})
        self.assert_invalid(payload)

    def test_create_proposal_forbids_state_id_and_version(self):
        payload = proposed_update_payload()
        proposal = payload["review_recommendations"][0]["proposed_changes"][0]
        proposal["operation"] = "create"
        self.assert_invalid(payload)

    def test_update_proposal_requires_state_id_version_statement(self):
        for missing in ("state_item_id", "expected_version", "proposed_statement"):
            with self.subTest(missing=missing):
                payload = proposed_update_payload()
                del payload["review_recommendations"][0]["proposed_changes"][0][missing]
                self.assert_invalid(payload)

    def test_retire_requires_state_id_and_version(self):
        payload = proposed_update_payload()
        proposal = payload["review_recommendations"][0]["proposed_changes"][0]
        proposal["operation"] = "retire"
        del proposal["proposed_statement"]
        validate_schema(payload)

    def test_retire_forbids_proposed_statement(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["proposed_changes"][0]["operation"] = "retire"
        self.assert_invalid(payload)

    def test_every_proposal_requires_rationale(self):
        payload = proposed_update_payload()
        del payload["review_recommendations"][0]["proposed_changes"][0]["rationale"]
        self.assert_invalid(payload)

    def test_effective_date_accepts_calendar_date(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["proposed_changes"][0]["effective_date"] = "2026-10-01"
        validate_schema(payload)

    def test_effective_date_rejects_non_date_text(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["proposed_changes"][0]["effective_date"] = "next month"
        self.assert_invalid(payload)

    def test_duplicate_topics_are_rejected(self):
        payload = no_review_payload()
        payload["topics"] = ["training", "training"]
        self.assert_invalid(payload)

    def test_duplicate_affected_state_ids_are_rejected_structurally(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["affected_state_item_ids"] = ["state_02", "state_02"]
        self.assert_invalid(payload)

    def test_human_resolution_fields_are_rejected_as_unknown_properties(self):
        for field in ("status", "resolution", "decided_at", "decided_by"):
            with self.subTest(field=field):
                payload = proposed_update_payload()
                payload["review_recommendations"][0][field] = "forbidden"
                self.assert_invalid(payload)


if __name__ == "__main__":
    unittest.main()
