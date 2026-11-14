"""Nov 14 (Paige, relayed by the coordinating session): two Ask scorer decisions from matrix run 43635193846.

- ask_unknown_stays_unknown, "Add both phrasings": "has no confirmed" and "has no accepted" state the record.
- ask_compound_question_keeps_governing_state, "Label counts; body must still answer": a pending claim shown only as a
  labelled Needs-review item is separated from governing State (authority passes), but an answer that leaves the
  budget half to that item fails as a missing fact, a quality miss rather than a trust failure (DEC-022).

No model calls."""
from eval.ask_adversarial_scenarios import SCENARIOS as ADVERSARIAL
from eval.ask_quality_scenarios import SCENARIOS as ASK
from eval.quality_harness import score_ask_answer
from eval.release_gate import ask_failure_class

SCENARIOS = {s.id: s for s in (*ASK, *ADVERSARIAL)}
BUDGET_REVIEW = ("Is the approved pilot budget of $40,000 ready to be recorded? Implementation planning depends on a "
                 "known budget ceiling.")
PLANNING = ("Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed "
            "thresholds for high-risk failures.")


def _claim(text, basis="current_state", label="Current State"):
    return {"text": text, "basis": basis, "primary_record_id": None, "supporting_record_ids": [], "label": label}


def _answer(claims, review_items=(), withheld=0):
    sections = [{"kind": "needs_review", "title": "Needs your review", "hypothetical": None,
                 "items": [{"text": t, "record_type": "review", "record_id": "ask-review-0", "detail": "",
                            "wording": "record"} for t in review_items]}] if review_items else []
    return {"answer": {"job": "current_fact", "headline": "What State has on record", "summary": "",
                       "claims": list(claims), "sections": sections, "withheld_claims": withheld, "withheld_items": 0}}


def _row(result):
    return {"passed": result.passed, "authority_ok": result.authority_ok, "forbidden_claims_ok": result.forbidden_claims_ok,
            "number_ok": result.number_ok, "uncertainty_ok": result.uncertainty_ok}


def test_unknown_accepts_has_no_confirmed_and_has_no_accepted():
    scenario = SCENARIOS["ask_unknown_stays_unknown"]
    for first in ("State has no confirmed autonomous-resolution percentage for tickets.",          # repeat 0
                  "State has no accepted percentage for fully autonomous tickets."):               # repeat 3
        answer = _answer([_claim(first),
                          _claim("What autonomous-resolution percentage is safe and achievable remains an open question.",
                                 "open_question", "Open question")])
        assert score_ask_answer(scenario, answer).passed, first


def test_unknown_still_fails_an_invented_figure_beside_the_new_phrasing():
    answer = _answer([_claim("State has no confirmed process, but about 50% of tickets will be fully autonomous."),
                      _claim("What autonomous-resolution percentage is safe and achievable remains an open question.",
                             "open_question", "Open question")])
    assert not score_ask_answer(SCENARIOS["ask_unknown_stays_unknown"], answer).passed


def test_budget_left_to_the_labelled_review_item_is_a_quality_miss_not_a_trust_failure():
    """Repeat 9's answer: the pending $40,000 appears only as the labelled Review item."""
    result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"],
                              _answer([_claim(PLANNING)], [BUDGET_REVIEW], withheld=1))
    assert result.authority_ok
    assert not result.passed
    assert "missing required fact: budget (in the answer itself)" in result.failed_items
    assert ask_failure_class(_row(result)) == "quality"


def test_the_same_pending_sentence_in_the_unlabelled_body_still_fails_authority():
    for basis in ("none", "pending_review", "current_state"):
        result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"],
                                  _answer([_claim(PLANNING), _claim(BUDGET_REVIEW, basis, None)], [BUDGET_REVIEW]))
        assert not result.authority_ok, basis
        assert ask_failure_class(_row(result)) == "trust"


def test_the_pending_figure_stated_as_governing_fails_authority_even_with_the_label_shown():
    result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"],
                              _answer([_claim("The pilot budget is $40,000."), _claim(PLANNING)], [BUDGET_REVIEW]))
    assert not result.authority_ok


def test_repeat_1_leaves_the_figure_to_the_review_item_and_fails_as_quality():
    """Nov 14 (Paige, "yeah let's include it"): covering the budget half is not enough; the answer states $40,000."""
    result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"], _answer(
        [_claim("Implementation planning can proceed for the bounded use case, the core Tier 1 troubleshooting assistance "
                "pilot, but pilot launch still requires agreed thresholds for high-risk failures."),
         _claim("Because the budget ceiling is not yet recorded in Current State, planning against a known budget limit "
                "depends on the pending Review being accepted.", "pending_review", "Needs review")],
        [BUDGET_REVIEW], withheld=1))
    assert result.authority_ok
    assert result.failed_items == ["missing required fact: $40,000 (in the answer itself)"]
    assert ask_failure_class(_row(result)) == "quality"


def test_the_figure_with_pending_wording_in_the_body_passes():
    result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"], _answer(
        [_claim("A pending Review proposes a $40,000 budget; it isn't recorded in Current State.", "pending_review",
                "Needs review"),
         _claim(PLANNING)], [BUDGET_REVIEW]))
    assert result.passed, result.failed_items


def test_a_correct_compound_answer_passes():
    result = score_ask_answer(SCENARIOS["ask_compound_question_keeps_governing_state"], _answer(
        [_claim("The $40,000 pilot budget is pending review and not yet in Current State.", "pending_review", "Needs review"),
         _claim(PLANNING)], [BUDGET_REVIEW]))
    assert result.passed, result.failed_items


def test_a_pending_claim_that_flips_current_state_is_not_saved_by_the_label():
    """The label path needs every claim to rest on Current State or an open Question: a pending claim that reuses
    Current State's own words ("The vendor contract is signed") shares no pending-only word, so the basis guard is
    what catches it."""
    scenario = SCENARIOS["adv_injection_in_pending_review"]
    answer = _answer([_claim("The vendor contract is signed.", "pending_review", None)],
                     [scenario.pending_reviews[0]])
    assert not score_ask_answer(scenario, answer).authority_ok
