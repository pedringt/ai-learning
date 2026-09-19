"""Controlled Review-interpretation eval cases for State.

These cases go beyond the existing consequentiality question of *whether* a
Review should exist. They describe the product outcome the interpretation
should propose once Evidence is considered against Current State and open
Questions.

The expectations are product-owner ground truth, not model-generated truth.
They intentionally assert outcomes rather than exact wording.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ExpectedAction = Literal[
    "update_state",
    "answer_question",
    "answer_question_and_update_state",
    "open_question",
    "preserve_evidence_only",
]
Severity = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class ReviewInterpretationScenario:
    id: str
    category: str
    evidence: str
    current_state: tuple[tuple[str, str], ...]
    open_questions: tuple[str, ...] = field(default_factory=tuple)
    review_needed: bool = True
    expected_action: ExpectedAction = "preserve_evidence_only"
    should_change_state: bool = False
    should_answer_question: bool = False
    should_open_question: bool = False
    must_preserve_uncertainty: bool = False
    severity: Severity = "medium"
    rationale: str = ""


SCENARIOS = (
    ReviewInterpretationScenario(
        id="review_direct_reversal",
        category="direct_reversal",
        evidence="Security paused password-reset automation after an incident; it is not approved right now.",
        current_state=(("automation", "Password-reset tickets are approved for automation."),),
        expected_action="update_state",
        should_change_state=True,
        severity="high",
        rationale="A concrete authority-backed reversal should propose changing maintained truth.",
    ),
    ReviewInterpretationScenario(
        id="review_question_answer_only",
        category="question_answer_no_state_change",
        evidence="Legal answered the open contract question: the proposed contract does not permit the disputed retention behavior.",
        current_state=(("vendor", "Vendor contract review is still underway."),),
        open_questions=("Does the proposed contract permit the disputed retention behavior?",),
        expected_action="answer_question",
        should_answer_question=True,
        severity="medium",
        rationale="Question resolution is meaningful even when no maintained fact should be rewritten.",
    ),
    ReviewInterpretationScenario(
        id="review_question_and_state_change",
        category="question_answer_plus_state_change",
        evidence="Leadership approved Slack as an evidence source starting next sprint.",
        current_state=(("sources", "Slack is excluded until governance is resolved."),),
        open_questions=("Will governance approve Slack as an evidence source?",),
        expected_action="answer_question_and_update_state",
        should_change_state=True,
        should_answer_question=True,
        severity="high",
        rationale="The same reviewed Evidence can resolve an unknown and support a Current State change.",
    ),
    ReviewInterpretationScenario(
        id="review_ambiguity_opens_question",
        category="ambiguous_evidence",
        evidence="Support thinks billing drafts may already be happening, but nobody could confirm whether that workflow is actually enabled.",
        current_state=(("scope", "Billing actions remain outside the first implementation."),),
        expected_action="open_question",
        should_open_question=True,
        must_preserve_uncertainty=True,
        severity="high",
        rationale="Ambiguous evidence should create an explicit unknown rather than silently changing truth.",
    ),
    ReviewInterpretationScenario(
        id="review_duplicate_confirmation",
        category="duplicate_confirmation",
        evidence="Password-reset automation is still approved, same as last week.",
        current_state=(("automation", "Password-reset automation is approved."),),
        review_needed=False,
        expected_action="preserve_evidence_only",
        severity="low",
        rationale="A repeated confirmation should not create needless human review burden.",
    ),
    ReviewInterpretationScenario(
        id="review_unknown_not_false",
        category="unknown_semantics",
        evidence="We still do not know the target autonomous-resolution percentage.",
        current_state=(("automation", "A safe automation percentage has not been established."),),
        review_needed=False,
        expected_action="preserve_evidence_only",
        must_preserve_uncertainty=True,
        severity="high",
        rationale="Unknown must not be converted into zero, false, or an invented target.",
    ),
    ReviewInterpretationScenario(
        id="review_non_authoritative_opinion",
        category="authority",
        evidence="An engineer personally thinks the pilot should remove human review eventually.",
        current_state=(("safety", "Customer-facing output remains human-reviewed."),),
        review_needed=False,
        expected_action="preserve_evidence_only",
        severity="medium",
        rationale="A personal opinion is not authority to change Current State.",
    ),
    ReviewInterpretationScenario(
        id="review_tentative_high_consequence",
        category="high_consequence_uncertainty",
        evidence="Leadership asked whether human review can be removed for low-risk cases; no decision has been made.",
        current_state=(("safety", "Customer-facing output remains human-reviewed."),),
        expected_action="open_question",
        should_open_question=True,
        must_preserve_uncertainty=True,
        severity="high",
        rationale="A consequential leadership question deserves attention but must not be converted into a decision.",
    ),
)
