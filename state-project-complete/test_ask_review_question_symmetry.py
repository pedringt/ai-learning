"""Regression coverage for a logic-review finding (2026-09-07): Ask's
deterministic selection safety net only ran in one direction.

_validate_selection() in ask_service.py already guaranteed "selected Review
-> include its linked Question" (so meeting-prep-style answers can't surface
a Review while hiding the concrete Question it's tracking). The reverse
wasn't guaranteed: "selected Question -> include any open Review explicitly
linked as potentially resolving it". Example from the review: asking "What
are we still waiting to learn about vendor retention?" should not surface
the vendor-retention Question while omitting a pending Review the backend
already knows might resolve it.

These tests call _validate_selection() directly with hand-built candidates
so the symmetric rule is exercised without needing a real or fake model
selection -- what's under test is the deterministic safety net itself, not
model judgment.
"""
from ask_contract import AskSelection
from ask_service import _validate_selection


def _candidates(*, reviews=(), questions=(), state=(), history=(), evidence=()):
    return {
        "reviews": list(reviews),
        "questions": list(questions),
        "state": list(state),
        "history": list(history),
        "evidence": list(evidence),
        "rules": [],
    }


def _selection(**overrides):
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
    return AskSelection.model_validate(base)


def test_selecting_a_question_pulls_in_its_explicitly_linked_open_review():
    candidates = _candidates(
        reviews=[{"id": "review_retention", "question_ids": ["q-retention"], "affected_state_ids": []}],
        questions=[{"id": "q-retention", "blocking": False}],
    )
    selection = _selection(question_ids=["q-retention"])

    validated = _validate_selection(selection, candidates)

    assert "review_retention" in validated.review_ids, (
        "Ask selected the vendor-retention Question but omitted the pending "
        "Review the backend already knows may resolve it -- the symmetric "
        "safety net (Question -> linked Review) did not fire."
    )


def test_selecting_a_blocking_question_also_pulls_in_its_linked_review():
    candidates = _candidates(
        reviews=[{"id": "review_launch", "question_ids": ["q-launch-gate"], "affected_state_ids": []}],
        questions=[{"id": "q-launch-gate", "blocking": True}],
    )
    selection = _selection(blocking_question_ids=["q-launch-gate"])

    validated = _validate_selection(selection, candidates)

    assert "review_launch" in validated.review_ids


def test_a_question_with_no_linked_review_does_not_spuriously_add_one():
    candidates = _candidates(
        reviews=[{"id": "review_unrelated", "question_ids": ["q-other"], "affected_state_ids": []}],
        questions=[{"id": "q-standalone", "blocking": False}, {"id": "q-other", "blocking": False}],
    )
    selection = _selection(question_ids=["q-standalone"])

    validated = _validate_selection(selection, candidates)

    assert "review_unrelated" not in validated.review_ids


def test_the_forward_direction_still_works_review_selection_pulls_in_its_question():
    """Existing rule, re-asserted here so both directions of the symmetric
    relationship are covered by the same test file."""
    candidates = _candidates(
        reviews=[{"id": "review_retention", "question_ids": ["q-retention"], "affected_state_ids": []}],
        questions=[{"id": "q-retention", "blocking": False}],
    )
    selection = _selection(review_ids=["review_retention"])

    validated = _validate_selection(selection, candidates)

    assert "q-retention" in validated.question_ids
