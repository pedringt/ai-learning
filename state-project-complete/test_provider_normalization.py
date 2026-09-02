import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "phase2_current"))

from state_spike.provider_normalization import normalize_provider_payload
from state_spike.interpretation_validation import validate_schema
from state_spike.semantic_validation import InterpretationContextSnapshot, StateContextItem


def context():
    return InterpretationContextSnapshot(
        state_items={
            "state_1": StateContextItem("state_1", 4),
            "state_2": StateContextItem("state_2", 2),
        },
        open_reviews={},
    )


def base_update():
    return {
        "summary": "Timing changed.",
        "topics": ["timing"],
        "outcome": "review_recommended",
        "review_recommendations": [{
            "review_action": "create",
            "review_type": "proposed_update",
            "decision_question": "Update timing?",
            "why_consequential": "Current State is stale.",
            "affected_state_item_ids": ["state_1"],
            "proposed_changes": [{
                "operation": "update",
                "state_item_id": "state_1",
                "expected_version": 1,
                "proposed_statement": "The launch is September 15.",
                "rationale": "Evidence changes timing.",
            }],
        }],
    }


def test_injects_authoritative_expected_version():
    payload = normalize_provider_payload(base_update(), context=context())
    assert payload["review_recommendations"][0]["proposed_changes"][0]["expected_version"] == 4
    validate_schema(payload)


def test_adds_update_target_to_affected_ids():
    raw = base_update()
    raw["review_recommendations"][0]["affected_state_item_ids"] = []
    payload = normalize_provider_payload(raw, context=context())
    assert payload["review_recommendations"][0]["affected_state_item_ids"] == ["state_1"]
    validate_schema(payload)


def test_missing_understanding_with_update_becomes_proposed_update():
    raw = base_update()
    raw["review_recommendations"][0]["review_type"] = "missing_understanding"
    payload = normalize_provider_payload(raw, context=context())
    assert payload["review_recommendations"][0]["review_type"] == "proposed_update"
    validate_schema(payload)


def test_create_strips_state_id_and_version():
    raw = base_update()
    proposal = raw["review_recommendations"][0]["proposed_changes"][0]
    proposal.update(operation="create", state_item_id="state_1", expected_version=4)
    raw["review_recommendations"][0]["review_type"] = "missing_understanding"
    raw["review_recommendations"][0]["affected_state_item_ids"] = []
    payload = normalize_provider_payload(raw, context=context())
    proposal = payload["review_recommendations"][0]["proposed_changes"][0]
    assert "state_item_id" not in proposal
    assert "expected_version" not in proposal
    validate_schema(payload)


def test_retire_strips_replacement_statement_and_injects_version():
    raw = base_update()
    proposal = raw["review_recommendations"][0]["proposed_changes"][0]
    proposal["operation"] = "retire"
    payload = normalize_provider_payload(raw, context=context())
    proposal = payload["review_recommendations"][0]["proposed_changes"][0]
    assert "proposed_statement" not in proposal
    assert proposal["expected_version"] == 4
    validate_schema(payload)


def test_known_date_sentinels_and_partial_dates_are_omitted():
    for bad_date in ("upon_decision", "immediately", "TBD", "2026-10", None):
        raw = base_update()
        raw["review_recommendations"][0]["proposed_changes"][0]["effective_date"] = bad_date
        payload = normalize_provider_payload(raw, context=context())
        assert "effective_date" not in payload["review_recommendations"][0]["proposed_changes"][0]
        validate_schema(payload)


def test_real_iso_date_is_preserved():
    raw = base_update()
    raw["review_recommendations"][0]["proposed_changes"][0]["effective_date"] = "2026-09-15"
    payload = normalize_provider_payload(raw, context=context())
    assert payload["review_recommendations"][0]["proposed_changes"][0]["effective_date"] == "2026-09-15"
    validate_schema(payload)


def test_grouped_review_does_not_require_grouping_reason():
    raw = base_update()
    rec = raw["review_recommendations"][0]
    rec["affected_state_item_ids"] = ["state_1", "state_2"]
    payload = normalize_provider_payload(raw, context=context())
    assert "grouping_reason" not in payload["review_recommendations"][0]
    validate_schema(payload)


def test_singleton_accidental_grouping_reason_is_removed():
    raw = base_update()
    raw["review_recommendations"][0]["grouping_reason"] = "Accidental metadata."
    payload = normalize_provider_payload(raw, context=context())
    assert "grouping_reason" not in payload["review_recommendations"][0]
    validate_schema(payload)


def test_duplicate_topics_and_affected_ids_are_deduped():
    raw = base_update()
    raw["topics"] = ["timing", "timing"]
    raw["review_recommendations"][0]["affected_state_item_ids"] = ["state_1", "state_1"]
    payload = normalize_provider_payload(raw, context=context())
    assert payload["topics"] == ["timing"]
    assert payload["review_recommendations"][0]["affected_state_item_ids"] == ["state_1"]
    validate_schema(payload)


def test_review_recommended_strips_redundant_no_review_explanation():
    raw = base_update()
    raw["no_review_explanation"] = "Redundant."
    payload = normalize_provider_payload(raw, context=context())
    assert "no_review_explanation" not in payload
    validate_schema(payload)


def test_no_review_missing_explanation_uses_summary():
    raw = {
        "summary": "Operational detail does not change maintained State.",
        "topics": ["ops"],
        "outcome": "no_review",
        "review_recommendations": [],
    }
    payload = normalize_provider_payload(raw, context=context())
    assert payload["no_review_explanation"] == raw["summary"]
    validate_schema(payload)


def test_create_review_strips_accidental_existing_review_id():
    raw = base_update()
    raw["review_recommendations"][0]["existing_review_id"] = "review_accidental"
    payload = normalize_provider_payload(raw, context=context())
    assert "existing_review_id" not in payload["review_recommendations"][0]
    validate_schema(payload)


def test_normalizes_enum_casing_and_whitespace():
    raw = base_update()
    raw["outcome"] = " Review_Recommended "
    rec = raw["review_recommendations"][0]
    rec["review_action"] = " Create "
    rec["review_type"] = " Proposed_Update "
    rec["proposed_changes"][0]["operation"] = " Update "
    payload = normalize_provider_payload(raw, context=context())
    assert payload["outcome"] == "review_recommended"
    assert rec["review_action"] != payload["review_recommendations"][0]["review_action"]
    validate_schema(payload)


def test_nonempty_recommendations_promote_accidental_no_review_label():
    raw = base_update()
    raw["outcome"] = "no_review"
    raw["no_review_explanation"] = "Contradictory label from provider."
    payload = normalize_provider_payload(raw, context=context())
    assert payload["outcome"] == "review_recommended"
    assert "no_review_explanation" not in payload
    validate_schema(payload)


def test_derives_outcome_when_provider_omits_redundant_field():
    raw = base_update()
    del raw["outcome"]
    payload = normalize_provider_payload(raw, context=context())
    assert payload["outcome"] == "review_recommended"
    validate_schema(payload)


def test_derives_no_review_and_explanation_when_provider_omits_outcome():
    raw = {
        "summary": "No maintained understanding changes.",
        "topics": ["ops"],
        "review_recommendations": [],
    }
    payload = normalize_provider_payload(raw, context=context())
    assert payload["outcome"] == "no_review"
    assert payload["no_review_explanation"] == raw["summary"]
    validate_schema(payload)


def test_derives_review_action_from_existing_review_id_presence():
    raw = base_update()
    rec = raw["review_recommendations"][0]
    del rec["review_action"]
    payload = normalize_provider_payload(raw, context=context())
    assert payload["review_recommendations"][0]["review_action"] == "create"
    validate_schema(payload)
