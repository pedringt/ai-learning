"""Nov 7 (Paige, #640/#642): a narrow exception for one held capability. The #640 scenario keeps running and is
reported as failing, but the Ask gate leaves it out; every other gate rule is unchanged. No model calls."""
import dataclasses
import inspect

import ask_service
from eval.ask_quality_scenarios import SCENARIOS as SUITE
from eval.quality_harness import AskQualityResult, ask_quality_metrics
from eval.quality_report import failure_details
from eval.release_gate import ASK_SUITE, REVIEW_SUITE, gate, not_counted
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW

HELD = "ask_question_answer_no_state_mutation"
OTHER, THIRD = "ask_blocker_not_omitted", "ask_change_summary"
REASON = "#640: held capability. Remove this exception when #640 ships."
# The gate tests mark the held scenario themselves, so they hold on every branch: main carries the marker while
# #640's retrieval is held; staging, which has the retrieval, must not (see the guard test below).
ASK = tuple(dataclasses.replace(s, known_unsupported=REASON) if s.id == HELD else s for s in SUITE)
RETRIEVES_ANSWERED_QUESTIONS = "answered_questions" in inspect.getsource(ask_service._compact_candidates)


def _report(failed):
    return {"suite": ASK_SUITE, "results": [{"id": s.id, "passed": s.id not in failed} for s in ASK]}


def _gate(failed, previous=None):
    return gate([_report(failed)], {REVIEW_SUITE: REVIEW, ASK_SUITE: ASK}, {ASK_SUITE: previous})[ASK_SUITE]


def test_a_marked_scenario_says_why_and_when_the_exception_comes_off():
    for s in SUITE:
        if s.known_unsupported:
            assert s.id == HELD, "only #640's held capability may be exempted"
            assert "#640" in s.known_unsupported and "Remove this exception when #640 ships" in s.known_unsupported
            assert "not counted" not in s.known_unsupported  # the page's label says that once


def test_the_exception_is_off_wherever_ask_retrieves_answered_questions():
    held = next(s for s in SUITE if s.id == HELD)
    if RETRIEVES_ANSWERED_QUESTIONS:
        assert not held.known_unsupported, "Ask retrieves answered Questions here: remove the #640 exception"
    else:
        assert held.known_unsupported, "Ask cannot retrieve answered Questions here: the #640 scenario needs its exception"


def test_the_held_scenario_failing_every_run_does_not_block():
    assert _gate({HELD}) == []
    assert _gate({HELD}, previous={HELD}) == []


def test_other_failures_still_block_exactly_as_before():
    assert _gate({HELD, OTHER}) == []                               # one other miss is still allowed
    assert _gate({HELD, OTHER, THIRD}) == ["10 of 12 passed; the Ask reading needs at least 11"]
    assert _gate({HELD, OTHER}, previous={OTHER}) == ["failed in two consecutive runs: " + OTHER]


def test_the_held_scenario_is_still_reported_as_failing():
    report = _report({HELD})
    lines = not_counted([report], {ASK_SUITE: ASK})
    assert len(lines) == 1 and HELD in lines[0] and "FAILED" in lines[0] and "#640" in lines[0]
    rows = [{"id": s.id, "category": s.category, "severity": s.severity, "passed": s.id != HELD,
             "grounding_ok": s.id != HELD, "required_facts_ok": s.id != HELD, "failed_items": []} for s in ASK]
    assert [d["scenario_id"] for d in failure_details({"suite": ASK_SUITE, "results": rows})] == [HELD]
    results = [AskQualityResult(scenario=s, answer={}, required_facts_ok=s.id != HELD, forbidden_claims_ok=True,
                                uncertainty_ok=True, open_item_ok=True, authority_ok=True) for s in ASK]
    assert ask_quality_metrics(results)["overall_pass_rate"] == 12 / 13  # the headline score still discloses it


def test_a_passing_held_scenario_is_flagged_for_removal_not_hidden():
    [line] = not_counted([_report(set())], {ASK_SUITE: ASK})
    assert "passed (check whether the exception can come off)" in line
