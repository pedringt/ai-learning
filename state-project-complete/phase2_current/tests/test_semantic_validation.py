import copy
import unittest

from state_spike.semantic_validation import (
    ApplicationStateSnapshot,
    InterpretationContextSnapshot,
    ReviewContextItem,
    StateContextItem,
    StructuredInterpretationSemanticError,
    validate_semantics,
)
from tests.test_interpretation_schema import no_review_payload, proposed_update_payload


def context_snapshot(*, include_state_02=True, reviews=None):
    states = {}
    if include_state_02:
        states["state_02"] = StateContextItem("state_02", 1)
    return InterpretationContextSnapshot(
        state_items=states,
        open_reviews=reviews or {},
    )


def application_snapshot(*, state_version=1, reviews=None, include_state_02=True):
    states = {}
    if include_state_02:
        states["state_02"] = StateContextItem("state_02", state_version)
    return ApplicationStateSnapshot(
        state_items=states,
        reviews=reviews or {},
    )


class SemanticValidationTests(unittest.TestCase):
    def assert_code(self, code, payload, *, context=None, application_state=None):
        with self.assertRaises(StructuredInterpretationSemanticError) as raised:
            validate_semantics(
                payload,
                context=context or context_snapshot(),
                application_state=application_state or application_snapshot(),
            )
        self.assertEqual(raised.exception.code, code)

    def test_no_review_is_semantically_valid(self):
        validate_semantics(
            no_review_payload(),
            context=context_snapshot(),
            application_state=application_snapshot(),
        )

    def test_valid_new_proposed_update(self):
        validate_semantics(
            proposed_update_payload(),
            context=context_snapshot(),
            application_state=application_snapshot(),
        )

    def test_affected_state_must_exist(self):
        payload = proposed_update_payload()
        self.assert_code(
            "invalid_state_reference",
            payload,
            application_state=application_snapshot(include_state_02=False),
        )

    def test_affected_state_must_have_been_in_context(self):
        payload = proposed_update_payload()
        self.assert_code(
            "state_not_in_context",
            payload,
            context=context_snapshot(include_state_02=False),
        )

    def test_proposal_target_must_exist(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["affected_state_item_ids"] = []
        # It must first exist as an affected reference, so use a different valid
        # affected State while leaving the proposal target nonexistent.
        payload["review_recommendations"][0]["affected_state_item_ids"] = ["state_03"]
        app = ApplicationStateSnapshot(
            state_items={"state_03": StateContextItem("state_03", 1)},
            reviews={},
        )
        ctx = InterpretationContextSnapshot(
            state_items={"state_03": StateContextItem("state_03", 1)},
            open_reviews={},
        )
        self.assert_code("invalid_state_reference", payload, context=ctx, application_state=app)

    def test_proposal_target_must_have_been_in_context(self):
        payload = proposed_update_payload()
        # Affected reference itself would fail first if absent. Give the
        # validator an affected item through context then mutate the proposal
        # target to another persisted item that was not supplied.
        payload["review_recommendations"][0]["proposed_changes"][0]["state_item_id"] = "state_99"
        payload["review_recommendations"][0]["proposed_changes"][0]["expected_version"] = 1
        app = ApplicationStateSnapshot(
            state_items={
                "state_02": StateContextItem("state_02", 1),
                "state_99": StateContextItem("state_99", 1),
            },
            reviews={},
        )
        self.assert_code("state_not_in_context", payload, application_state=app)

    def test_proposal_target_must_be_listed_as_affected(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["affected_state_item_ids"] = ["state_03"]
        app = ApplicationStateSnapshot(
            state_items={
                "state_02": StateContextItem("state_02", 1),
                "state_03": StateContextItem("state_03", 1),
            },
            reviews={},
        )
        ctx = InterpretationContextSnapshot(
            state_items={
                "state_02": StateContextItem("state_02", 1),
                "state_03": StateContextItem("state_03", 1),
            },
            open_reviews={},
        )
        self.assert_code("proposal_target_not_affected", payload, context=ctx, application_state=app)

    def test_expected_version_must_match_captured_context_version(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["proposed_changes"][0]["expected_version"] = 2
        self.assert_code("proposal_version_mismatch", payload)

    def test_current_database_version_does_not_replace_context_version(self):
        # Interpretation validity is judged against what the model actually saw.
        # A later State version is handled by the acceptance concurrency guard,
        # not by silently changing interpretation-time authority.
        payload = proposed_update_payload()
        validate_semantics(
            payload,
            context=context_snapshot(),
            application_state=application_snapshot(state_version=2),
        )

    def test_duplicate_proposal_targets_are_rejected(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        duplicate = copy.deepcopy(rec["proposed_changes"][0])
        duplicate["proposed_statement"] = "A second replacement for the same State item."
        rec["proposed_changes"].append(duplicate)
        rec["grouping_reason"] = "Two proposals were emitted together."
        self.assert_code("duplicate_proposal_target", payload)

    def test_update_existing_review_must_exist(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_action"] = "update_existing"
        rec["existing_review_id"] = "review_1"
        self.assert_code("invalid_review_reference", payload)

    def test_update_existing_review_must_be_open(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_action"] = "update_existing"
        rec["existing_review_id"] = "review_1"
        review = ReviewContextItem("review_1", "proposed_update", "resolved")
        app = application_snapshot(reviews={"review_1": review})
        self.assert_code("review_not_open", payload, application_state=app)

    def test_update_existing_review_must_have_been_in_context(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_action"] = "update_existing"
        rec["existing_review_id"] = "review_1"
        review = ReviewContextItem("review_1", "proposed_update", "open")
        app = application_snapshot(reviews={"review_1": review})
        self.assert_code("review_not_in_context", payload, application_state=app)

    def test_update_existing_review_type_must_match(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_action"] = "update_existing"
        rec["existing_review_id"] = "review_1"
        review = ReviewContextItem("review_1", "state_at_risk", "open")
        app = application_snapshot(reviews={"review_1": review})
        ctx = context_snapshot(reviews={"review_1": review})
        self.assert_code("review_type_mismatch", payload, context=ctx, application_state=app)

    def test_valid_update_existing_review(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_action"] = "update_existing"
        rec["existing_review_id"] = "review_1"
        review = ReviewContextItem("review_1", "proposed_update", "open")
        validate_semantics(
            payload,
            context=context_snapshot(reviews={"review_1": review}),
            application_state=application_snapshot(reviews={"review_1": review}),
        )

    def test_confirmed_state_may_be_affected_without_proposal(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["affected_state_item_ids"] = ["state_02", "state_03"]
        rec["grouping_reason"] = "The Evidence changes launch timing and confirms an existing constraint."
        app = ApplicationStateSnapshot(
            state_items={
                "state_02": StateContextItem("state_02", 1),
                "state_03": StateContextItem("state_03", 4),
            },
            reviews={},
        )
        ctx = InterpretationContextSnapshot(
            state_items={
                "state_02": StateContextItem("state_02", 1),
                "state_03": StateContextItem("state_03", 4),
            },
            open_reviews={},
        )
        validate_semantics(payload, context=ctx, application_state=app)

    def test_state_at_risk_with_no_proposals_is_valid(self):
        payload = proposed_update_payload()
        rec = payload["review_recommendations"][0]
        rec["review_type"] = "state_at_risk"
        rec["decision_question"] = "Which source is authoritative?"
        rec["proposed_changes"] = []
        validate_semantics(payload, context=context_snapshot(), application_state=application_snapshot())

    def test_human_resolution_fields_are_defensively_rejected_semantically(self):
        payload = proposed_update_payload()
        payload["review_recommendations"][0]["status"] = "resolved"
        self.assert_code("forbidden_human_resolution_field", payload)

    def test_one_invalid_recommendation_rejects_entire_interpretation(self):
        payload = proposed_update_payload()
        second = copy.deepcopy(payload["review_recommendations"][0])
        second["affected_state_item_ids"] = ["state_missing"]
        second["proposed_changes"][0]["state_item_id"] = "state_missing"
        payload["review_recommendations"].append(second)
        self.assert_code("invalid_state_reference", payload)


if __name__ == "__main__":
    unittest.main()
