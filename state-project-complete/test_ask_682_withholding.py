"""#682 (Paige, Nov 16): Ask may repeat a pending item's own wording when the same clause says it is still pending
review. Correct claims Ask withheld in the compound scenario (run 43817087174), and the cases that must still be
withheld. Deterministic: no model calls."""
import ask_assertions


def test_status_word_under_a_pending_frame_is_not_asserted():
    for text in (
        "State has no confirmed pilot budget recorded; the approved $40,000 pilot budget is a pending Review proposal, not yet accepted into Current State.",
        "The approved $40,000 pilot budget is proposed in an open Review and has not been recorded in Current State.",
        "The approved $40,000 pilot budget is only a proposal awaiting review, not an accepted Current State fact.",
    ):
        assert ask_assertions.check(text, "pending_review", {}).ok, text


def test_still_withholds_a_status_the_frame_does_not_cover():
    for text in ("The approved $40,000 pilot budget is pending implementation.",
                 "The budget is approved at $40,000.",
                 "The approved budget is $40,000 and planning can use it."):
        assert not ask_assertions.check(text, "pending_review", {}).ok, text
