"""Checks on the eval scorers themselves (#639).

A scorer that passes a wrong answer gives false confidence; one that fails a correct answer gives false alarms.
MUST_FAIL holds deliberately wrong answers and proposals the scorers must reject. MUST_PASS holds correct answers
worded differently from the expected phrases, which the scorers must still accept. Both are hand-written and
synthetic; neither is evidence about what the live model produces. Recorded real answers are checked separately
(test_eval_scorer_checks.py) against eval/calibration/ask_calibration_answers.json.

Deterministic: runs in `make qa-fast` and makes no model calls.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from eval.ask_quality_scenarios import SCENARIOS as ASK_SCENARIOS
from eval.quality_harness import ReviewQualityResult, score_ask_answer
from eval.review_interpretation_scenarios import SCENARIOS as REVIEW_SCENARIOS


@dataclass(frozen=True)
class AskCase:
    scenario_id: str
    answer: dict[str, Any]
    why: str


@dataclass(frozen=True)
class ReviewCase:
    scenario_id: str
    proposed_state_text: str
    why: str
    observed_action: str = ""  # defaults to the scenario's expected action


ASK_MUST_FAIL = (
    # The outside review's example (Nov 7): uncertainty words present, invented target elsewhere.
    AskCase("ask_unknown_stays_unknown",
            {"headline": "The percentage is not established.",
             "summary": "The open question is pending. For planning purposes, use 75% as the agreed target."},
            "invents a target percentage alongside the right uncertainty words"),
    AskCase("ask_false_premise",
            {"headline": "We have not decided to fully automate support.",
             "summary": "The first implementation remains human-reviewed. The open question is pending, but the plan "
                        "is to automate 80% of tickets after the pilot."},
            "corrects the premise but invents an automation figure"),
    AskCase("ask_question_answer_no_state_mutation",
            {"headline": "Yes, the vendor-retention question was answered.",
             "summary": "Legal confirmed the vendor deletes customer content within 30 days of contract end. "
                        "The contract review is complete."},
            "reports the answer, then presents it as closing the contract review"),
    AskCase("ask_question_answer_no_state_mutation",
            {"headline": "The record does not show whether it was answered.",
             "summary": "The vendor contract remains under review."},
            "misses that the Question was answered and what the answer was"),
    AskCase("ask_current_over_stale",
            {"headline": "Yes, password-reset automation is currently approved.",
             "summary": "History shows it was approved; it was paused after an incident on 2026-09-10."},
            "presents stale History as current truth"),
)

ASK_MUST_PASS = (
    AskCase("ask_unknown_stays_unknown",
            {"headline": "That percentage has not been established yet.",
             "summary": "Current State says a safe autonomous-resolution percentage is not established, and the "
                        "open Question about what is safe and achievable is still unresolved. It is not 100% or any "
                        "other figure today."},
            "correct; names a figure only to deny it"),
    AskCase("ask_false_premise",
            {"headline": "That premise is not right: we did not decide to fully automate support.",
             "summary": "Current State says the first implementation remains human-reviewed. How much automation "
                        "is safe after the pilot is still an open Question."},
            "correct premise correction"),
    AskCase("ask_question_answer_no_state_mutation",
            {"headline": "Yes, the vendor-retention question was answered.",
             "summary": "Legal confirmed the vendor deletes customer content within 30 days of contract end. That "
                        "answers the Question, but it does not change Current State: the vendor contract remains "
                        "under review."},
            "correct; keeps the contract fact unchanged"),
    AskCase("ask_question_answer_no_state_mutation",
            {"headline": "The retention Question is resolved: content is deleted within 30 days after the contract ends.",
             "summary": "This came from Legal. Separately, the vendor contract is still under review, so the contract "
                        "itself has not been approved."},
            "correct, different wording"),
    AskCase("ask_current_over_stale",
            {"headline": "No. Password-reset automation is paused.",
             "summary": "Current State says it was paused after a security incident, so it is not currently "
                        "approved. It was approved before 2026-09-10."},
            "correct; mentions the old approval as History"),
)

REVIEW_MUST_FAIL = (
    # The outside review's example (Nov 7): right action, wrong direction.
    ReviewCase("review_direct_reversal", "Password-reset automation is approved and fully operational.",
               "proposes the opposite of the reversal"),
    ReviewCase("review_direct_reversal", "Password-reset automation remains approved and was never paused.",
               "names the pause only to deny it"),
    ReviewCase("review_question_and_state_change", "Slack remains excluded until governance is resolved.",
               "keeps the old exclusion after leadership approved Slack"),
    ReviewCase("review_new_evidence_over_pending_review", "The pilot budget cap is $50,000.",
               "keeps the stale pending figure"),
    ReviewCase("review_partial_reversal", "All password-reset automation is paused.",
               "widens a scoped reversal to everything"),
)

REVIEW_MUST_PASS = (
    ReviewCase("review_direct_reversal",
               "Password-reset automation is paused after a security incident and is not approved right now.",
               "correct"),
    ReviewCase("review_direct_reversal",
               "Password-reset tickets are no longer approved for automation; Security suspended it after an incident.",
               "correct, different wording"),
    ReviewCase("review_question_and_state_change", "Slack is approved as an evidence source starting next sprint.",
               "correct"),
    ReviewCase("review_question_and_state_change", "Slack is now included as an evidence source from next sprint.",
               "correct, different wording"),
    ReviewCase("review_partial_reversal",
               "Password-reset automation is paused for privileged-account resets; standard resets remain approved.",
               "correct"),
)

_ASK = {scenario.id: scenario for scenario in ASK_SCENARIOS}
_REVIEW = {scenario.id: scenario for scenario in REVIEW_SCENARIOS}


def score_ask_case(case: AskCase):
    return score_ask_answer(_ASK[case.scenario_id], case.answer)


def score_review_case(case: ReviewCase) -> ReviewQualityResult:
    scenario = _REVIEW[case.scenario_id]
    return ReviewQualityResult(
        scenario=scenario,
        review_recommended=True,
        observed_action=case.observed_action or scenario.expected_action,
        processing_status="succeeded",
        proposed_state_text=case.proposed_state_text,
    )
