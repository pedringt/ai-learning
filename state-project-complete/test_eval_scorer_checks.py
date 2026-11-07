"""#639: the eval scorers reject deliberately wrong answers and still accept correct paraphrases."""
import ast
import json
from pathlib import Path

import pytest

from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS
from eval.quality_harness import _asserts, score_ask_answer, unsupported_numbers
from eval.scorer_checks import (
    ASK_MUST_FAIL, ASK_MUST_PASS, REVIEW_MUST_FAIL, REVIEW_MUST_PASS, score_ask_case, score_review_case,
)


@pytest.mark.parametrize("case", ASK_MUST_FAIL, ids=lambda case: f"{case.scenario_id}: {case.why}")
def test_ask_scorer_rejects_wrong_answers(case):
    assert not score_ask_case(case).passed


@pytest.mark.parametrize("case", ASK_MUST_PASS, ids=lambda case: f"{case.scenario_id}: {case.why}")
def test_ask_scorer_accepts_correct_paraphrases(case):
    result = score_ask_case(case)
    assert result.passed, result.failed_items


@pytest.mark.parametrize("case", REVIEW_MUST_FAIL, ids=lambda case: f"{case.scenario_id}: {case.why}")
def test_review_scorer_rejects_wrong_proposals(case):
    assert not score_review_case(case).passed


@pytest.mark.parametrize("case", REVIEW_MUST_PASS, ids=lambda case: f"{case.scenario_id}: {case.why}")
def test_review_scorer_accepts_correct_paraphrases(case):
    result = score_review_case(case)
    assert result.passed, result.interpretation_problems


# Real Haiku 5.5 answers (eval matrix run 38966540732, Oct 16). They are not human-graded, so this is not proof they are
# correct: it checks that #639's stricter scoring adds no new failure on answers the scorer passed before. Answers to
# ask_question_answer_no_state_mutation were written for its old fixture (no Question seeded) and are left out (#640).
_CALIBRATION = Path(__file__).parent / "eval" / "calibration" / "ask_calibration_answers.json"
_OLD_FIXTURE = {"ask_question_answer_no_state_mutation"}


def _recorded_answers():
    scenarios = {scenario.id: scenario for scenario in ASK_SCENARIOS}
    for item in json.loads(_CALIBRATION.read_text())["answers"]:
        if item["scenario_id"] in _OLD_FIXTURE:
            continue
        answer = item["answer"]
        yield pytest.param(scenarios[item["scenario_id"]], ast.literal_eval(answer) if isinstance(answer, str) else answer,
                           id=item["answer_id"])


@pytest.mark.parametrize("scenario,answer", list(_recorded_answers()))
def test_recorded_real_answers_still_pass(scenario, answer):
    result = score_ask_answer(scenario, answer)
    assert result.passed, result.failed_items


def test_a_number_claim_does_not_match_inside_a_longer_number():
    assert not _asserts("it is not 100% automated today", "0%")
    assert _asserts("the target is 0% for now", "0%")


def test_unsupported_numbers_ignore_record_ids_and_negated_figures():
    supplied = "a safe autonomous-resolution percentage has not been established. ask-state-0"
    assert unsupported_numbers("see ask-state-0 and ask-question-0", supplied) == []
    assert unsupported_numbers("it is not 100% today", supplied) == []
    assert unsupported_numbers("use 75% as the agreed target", supplied) == ["75"]


def test_unsupported_numbers_accept_numbers_from_the_records_in_another_format():
    assert unsupported_numbers("the cap is $40,000, set on 2026-09-10", "budget approved at 40000 on 10 sept 2026 09") == []


def test_the_question_resolution_scenario_seeds_a_resolved_question():
    from eval.quality_harness import _close, _new_test_connection, _seed_ask_scenario
    from review_service import list_questions, list_state

    scenario = next(s for s in ASK_SCENARIOS if s.id == "ask_question_answer_no_state_mutation")
    connection = _new_test_connection()
    try:
        _seed_ask_scenario(connection, scenario)
        resolved = list_questions(connection, "resolved")
        assert [(q["text"], q["resolution"]) for q in resolved] == list(scenario.closed_questions)
        assert list_questions(connection, "open") == []
        assert [s["statement"] for s in list_state(connection)] == ["The vendor contract remains under review."]
    finally:
        _close(connection)


def test_the_grader_sees_the_evidence_and_resolved_questions_the_ask_call_was_seeded_with():
    from eval.ask_grader import supplied_records

    scenarios = {s.id: s for s in ASK_SCENARIOS}
    budget = supplied_records(scenarios["ask_evidence_backed_approval_qualified"])
    assert budget["evidence"] == list(scenarios["ask_evidence_backed_approval_qualified"].evidence)
    vendor = supplied_records(scenarios["ask_question_answer_no_state_mutation"])
    assert vendor["resolved_questions"] == [{"text": text, "answer": answer}
                                            for text, answer in scenarios["ask_question_answer_no_state_mutation"].closed_questions]
