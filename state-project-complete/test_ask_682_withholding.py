"""#682 candidates: correct claims Ask withheld in the compound scenario (run 43817087174), and the cases that must
still be withheld. Deterministic: no model calls."""
import ask_assertions
from ask_claims import ClaimChecker

REVIEW = {"id": "ask-review-0", "decision_question": "Is the approved pilot budget of $40,000 ready to be recorded?"}
LAUNCH = {"id": "ask-state-0", "statement": "Implementation planning can proceed with the bounded use case."}
SCOPE = {"id": "ask-state-1", "statement": "The core pilot use case is Tier 1 troubleshooting assistance."}


def test_v1_status_word_under_a_pending_frame_is_not_asserted():
    for text in (
        "State has no confirmed pilot budget recorded; the approved $40,000 pilot budget is a pending Review proposal, not yet accepted into Current State.",
        "The approved $40,000 pilot budget is proposed in an open Review and has not been recorded in Current State.",
        "The approved $40,000 pilot budget is only a proposal awaiting review, not an accepted Current State fact.",
    ):
        assert ask_assertions.check(text, "pending_review", {}).ok, text


def test_v1_still_withholds_a_status_the_frame_does_not_cover():
    for text in ("The approved $40,000 pilot budget is pending implementation.",
                 "The budget is approved at $40,000.",
                 "The approved budget is $40,000 and planning can use it."):
        assert not ask_assertions.check(text, "pending_review", {}).ok, text


def _checker(selected_state, shown_state):
    return ClaimChecker({"state": selected_state, "reviews": [REVIEW]}, state_pool=shown_state)


def test_v2_current_state_claim_may_use_a_number_from_another_current_state_record_shown():
    claim = {"text": "Implementation planning can proceed with the bounded Tier 1 troubleshooting use case.",
             "basis": "current_state", "primary_record_id": "ask-state-0", "supporting_record_ids": []}
    assert _checker([LAUNCH], [LAUNCH, SCOPE]).check_claim(claim) == "Current State"


def test_v2_never_lets_a_pending_figure_onto_a_current_state_claim():
    claim = {"text": "Current State sets the pilot budget at $40,000.", "basis": "current_state",
             "primary_record_id": "ask-state-0", "supporting_record_ids": []}
    assert _checker([LAUNCH], [LAUNCH, SCOPE]).check_claim(claim) is None
