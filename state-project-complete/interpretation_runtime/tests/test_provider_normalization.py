import copy
import unittest

from validation.interpretation_validation import validate_schema
from validation.provider_normalization import normalize_provider_payload
from validation.semantic_validation import (
    ApplicationStateSnapshot,
    InterpretationContextSnapshot,
    ReviewContextItem,
    StateContextItem,
    validate_semantics,
)

from tests.test_interpretation_schema import proposed_update_payload
from tests.test_semantic_validation import application_snapshot, context_snapshot


def update_existing_payload(review_type="proposed_update"):
    payload = proposed_update_payload()
    rec = payload["review_recommendations"][0]
    rec["review_action"] = "update_existing"
    rec["existing_review_id"] = "review_1"
    rec["review_type"] = review_type
    return payload


def open_question_payload():
    return {
        "summary": "Legal confirmed vendor retention is 30 days.",
        "topics": ["retention"],
        "outcome": "review_recommended",
        "review_recommendations": [
            {
                "review_action": "create",
                "review_type": "open_question",
                "decision_question": "Does the confirmed 30-day retention window cover pilot outputs as well as prompts?",
                "why_consequential": "Scope of what's covered by the confirmed window is still unclear.",
                "affected_state_item_ids": [],
                "proposed_changes": [],
            }
        ],
    }


class ProviderNormalizationExistingReviewTypeTests(unittest.TestCase):
    """Regression coverage for a staging finding (2026-09-13): a provider
    correctly identified and referenced an existing open Review
    (existing_review_id) but emitted a review_type that didn't match that
    Review's persisted type ('proposed_update' vs. the Review's actual
    'state_at_risk'). Semantic validation hard-rejected the entire evidence
    submission with review_type_mismatch, even though the reference itself
    was completely valid -- discarding real evidence over a mechanical
    labeling slip rather than a substantive judgment call.

    The existing Review's type is an application fact the model was already
    shown in its own context snapshot, so normalize_provider_payload now
    treats it as authoritative for any recommendation that references it via
    existing_review_id, the same way it already owns concurrency versions.
    """

    def test_mismatched_review_type_is_normalized_to_the_existing_reviews_type(self):
        payload = update_existing_payload(review_type="proposed_update")
        review = ReviewContextItem("review_1", "state_at_risk", "open")
        ctx = context_snapshot(reviews={"review_1": review})

        normalized = normalize_provider_payload(payload, context=ctx)

        self.assertEqual(
            normalized["review_recommendations"][0]["review_type"],
            "state_at_risk",
        )

    def test_normalized_payload_then_passes_semantic_validation(self):
        payload = update_existing_payload(review_type="proposed_update")
        review = ReviewContextItem("review_1", "state_at_risk", "open")
        ctx = context_snapshot(reviews={"review_1": review})
        app = application_snapshot(reviews={"review_1": review})

        normalized = normalize_provider_payload(payload, context=ctx)

        # Must not raise -- this is the exact 422 review_type_mismatch path
        # from the staging finding.
        validate_semantics(normalized, context=ctx, application_state=app)

    def test_already_matching_review_type_is_left_unchanged(self):
        payload = update_existing_payload(review_type="state_at_risk")
        review = ReviewContextItem("review_1", "state_at_risk", "open")
        ctx = context_snapshot(reviews={"review_1": review})

        normalized = normalize_provider_payload(payload, context=ctx)

        self.assertEqual(
            normalized["review_recommendations"][0]["review_type"],
            "state_at_risk",
        )

    def test_unknown_existing_review_id_is_left_untouched_for_validation_to_reject(self):
        # existing_review_id isn't in the supplied context at all -- software
        # must not guess a type for a reference it cannot verify. Semantic
        # validation should still see (and reject) the original mismatch.
        payload = update_existing_payload(review_type="proposed_update")
        ctx = context_snapshot()  # no reviews in context
        app = application_snapshot()  # no reviews persisted either

        normalized = normalize_provider_payload(payload, context=ctx)

        self.assertEqual(
            normalized["review_recommendations"][0]["review_type"],
            "proposed_update",
        )
        with self.assertRaises(Exception) as raised:
            validate_semantics(normalized, context=ctx, application_state=app)
        self.assertEqual(raised.exception.code, "invalid_review_reference")

    def test_create_action_is_unaffected_by_existing_review_normalization(self):
        # review_action == "create" has no existing_review_id to be
        # authoritative over -- the model's own review_type choice for a
        # brand-new Review must pass through untouched.
        payload = proposed_update_payload()
        ctx = context_snapshot()

        normalized = normalize_provider_payload(payload, context=ctx)

        self.assertEqual(
            normalized["review_recommendations"][0]["review_type"],
            "proposed_update",
        )

    def test_existing_review_type_wins_over_the_missing_understanding_heuristic(self):
        # Without the existing-review guard, the generic "missing_understanding
        # + an update/retire proposal implies proposed_update" heuristic would
        # relabel this right back to something that mismatches the persisted
        # Review, reintroducing the exact bug being fixed.
        payload = update_existing_payload(review_type="missing_understanding")
        review = ReviewContextItem("review_1", "state_at_risk", "open")
        ctx = context_snapshot(reviews={"review_1": review})
        app = application_snapshot(reviews={"review_1": review})

        normalized = normalize_provider_payload(payload, context=ctx)

        self.assertEqual(
            normalized["review_recommendations"][0]["review_type"],
            "state_at_risk",
        )
        validate_semantics(normalized, context=ctx, application_state=app)


class ProviderNormalizationOpenQuestionIllegalFieldsTests(unittest.TestCase):
    """Regression coverage for a staging finding (2026-09-13): a provider
    correctly chose review_type open_question for evidence that raises a new
    unknown, but also pointed resolves_question_ids at a related existing
    Question -- illegal per schema (open_question can never resolve a
    Question; the whole point is that it's a new, separate unknown). The
    schema_violation this caused hard-rejected the entire evidence
    submission even though the review_type choice itself was fine.
    """

    def test_resolves_question_ids_is_cleared_for_open_question(self):
        payload = open_question_payload()
        payload["review_recommendations"][0]["resolves_question_ids"] = ["q-retention"]

        normalized = normalize_provider_payload(payload, context=context_snapshot())

        self.assertNotIn("resolves_question_ids", normalized["review_recommendations"][0])
        validate_schema(normalized)

    def test_nonempty_affected_state_item_ids_on_open_question_is_left_uncorrected(self):
        """Deliberately narrow fix: only resolves_question_ids (optional,
        redundant with the type itself) is repaired. A non-empty
        affected_state_item_ids on open_question is a required-field
        violation the schema also forbids, but signals a more fundamental
        confusion than a mechanical labeling slip -- it must still fail (see
        test_invalid_or_mixed_outcomes_are_rejected_without_side_effects in
        test_question_review_creation.py, which asserts exactly this stays a
        hard failure with zero side effects)."""
        payload = open_question_payload()
        payload["review_recommendations"][0]["affected_state_item_ids"] = ["state_02"]

        normalized = normalize_provider_payload(payload, context=context_snapshot())

        self.assertEqual(normalized["review_recommendations"][0]["affected_state_item_ids"], ["state_02"])

    def test_nonempty_proposed_changes_on_open_question_is_left_uncorrected(self):
        payload = open_question_payload()
        rec = payload["review_recommendations"][0]
        rec["affected_state_item_ids"] = ["state_02"]
        rec["proposed_changes"] = [{
            "operation": "update", "state_item_id": "state_02", "expected_version": 1,
            "proposed_statement": "x", "rationale": "x",
        }]

        normalized = normalize_provider_payload(payload, context=context_snapshot())

        self.assertEqual(len(normalized["review_recommendations"][0]["proposed_changes"]), 1)

    def test_normalized_open_question_with_illegal_fields_then_passes_semantic_validation(self):
        payload = open_question_payload()
        payload["review_recommendations"][0]["resolves_question_ids"] = ["q-retention"]
        ctx = context_snapshot()
        app = application_snapshot()

        normalized = normalize_provider_payload(payload, context=ctx)
        validate_schema(normalized)
        # Must not raise -- this is the exact 422 schema_violation path from
        # the staging finding.
        validate_semantics(normalized, context=ctx, application_state=app)

    def test_legal_open_question_payload_is_left_alone(self):
        payload = open_question_payload()

        normalized = normalize_provider_payload(payload, context=context_snapshot())

        self.assertEqual(
            normalized["review_recommendations"][0]["decision_question"],
            payload["review_recommendations"][0]["decision_question"],
        )
        self.assertNotIn("resolves_question_ids", normalized["review_recommendations"][0])
        validate_schema(normalized)


if __name__ == "__main__":
    unittest.main()
