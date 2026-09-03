from ask_contract import AskSelection, SELECTOR_JSON_SCHEMA
from ask_service import _bounded_selection_raw


def _selection_with(**overrides):
    base = {
        "job": "general_project_synthesis",
        "state_ids": [],
        "review_ids": [],
        "blocking_question_ids": [],
        "question_ids": [],
        "history_ids": [],
        "evidence_ids": [],
    }
    base.update(overrides)
    return base


def test_provider_schema_matches_application_selection_limits():
    expected = {
        "state_ids": 12,
        "review_ids": 8,
        "blocking_question_ids": 8,
        "question_ids": 10,
        "history_ids": 12,
        "evidence_ids": 12,
    }
    for field, limit in expected.items():
        assert SELECTOR_JSON_SCHEMA["properties"][field]["maxItems"] == limit


def test_thirteen_state_ids_are_bounded_before_strict_validation():
    raw = _selection_with(state_ids=[f"k-{i}" for i in range(13)])

    bounded = _bounded_selection_raw(raw)
    selection = AskSelection.model_validate(bounded)

    assert selection.state_ids == [f"k-{i}" for i in range(12)]


def test_bounding_deduplicates_without_reordering_provider_choices():
    raw = _selection_with(
        state_ids=["k-a", "k-a"] + [f"k-{i}" for i in range(12)]
    )

    bounded = _bounded_selection_raw(raw)

    assert bounded["state_ids"] == ["k-a"] + [f"k-{i}" for i in range(11)]
