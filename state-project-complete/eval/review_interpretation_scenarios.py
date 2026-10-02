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
    "update_state_and_open_question",
    "open_question",
    "state_at_risk",
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
    pending_reviews: tuple[str, ...] = field(default_factory=tuple)
    review_needed: bool = True
    expected_action: ExpectedAction = "preserve_evidence_only"
    allowed_actions: tuple[ExpectedAction, ...] = field(default_factory=tuple)
    required_state_update_phrases: tuple[str | tuple[str, ...], ...] = field(default_factory=tuple)
    forbidden_state_update_phrases: tuple[str, ...] = field(default_factory=tuple)
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
        allowed_actions=("answer_question", "answer_question_and_update_state"),
        required_state_update_phrases=(("does not permit", "doesn't permit", "not permit", "not permitted", "prohibits", "not allowed"),),
        forbidden_state_update_phrases=("contract review is complete", "contract is approved", "review is complete"),
        should_answer_question=True,
        severity="medium",
        rationale="The Question must resolve. A supported durable State update is also acceptable, but it must not imply the broader contract review is complete.",
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
        allowed_actions=("open_question", "state_at_risk"),
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
        severity="medium",
        rationale="An unknown already represented accurately in Current State should stay unknown without creating redundant tracking work.",
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
    ReviewInterpretationScenario(
        id="review_partial_reversal",
        category="partial_reversal",
        evidence="Security paused password-reset automation for privileged-account resets only. Standard password-reset automation remains approved.",
        current_state=(("automation", "Password-reset automation is approved for all reset tickets."),),
        expected_action="update_state",
        required_state_update_phrases=("privileged", "standard"),
        forbidden_state_update_phrases=("all password-reset automation is paused", "password-reset automation is paused for all"),
        should_change_state=True,
        severity="high",
        rationale="A scoped reversal should update only the affected scope rather than overcorrecting the whole maintained fact.",
    ),
    ReviewInterpretationScenario(
        id="review_new_fact_with_downstream_question",
        category="decision_plus_downstream_unknown",
        evidence="The project owner approved a mandatory 30-minute training session before pilot access. The approval is final, but the training date has not been scheduled.",
        current_state=(("training", "Pilot training requirements have not been decided."),),
        expected_action="update_state_and_open_question",
        required_state_update_phrases=("mandatory", "30-minute"),
        should_change_state=True,
        should_open_question=True,
        severity="high",
        rationale="A settled decision should become proposed State while a separate execution unknown can remain a Question.",
    ),
    ReviewInterpretationScenario(
        id="review_new_evidence_over_pending_review",
        category="supersedes_pending_review",
        evidence="Finance corrected the earlier estimate: the approved pilot budget cap is $35,000, not $50,000.",
        current_state=(("budget", "The pilot budget cap has not been established."),),
        pending_reviews=("Pending proposal: set the pilot budget cap to $50,000 based on the earlier Finance estimate.",),
        expected_action="update_state",
        required_state_update_phrases=(("$35,000", "35,000", "35000"),),
        forbidden_state_update_phrases=("$50,000", "50,000", "50000"),
        should_change_state=True,
        severity="high",
        rationale="New authoritative evidence should supersede a stale pending proposal rather than preserve competing pending truth.",
    ),
    ReviewInterpretationScenario(
        id="review_authority_disagreement",
        category="authority_conflict",
        evidence="An engineer recommends removing human review for low-risk password resets. The Security owner explicitly decided that human review remains required for all customer-facing password-reset output.",
        current_state=(("safety", "Human review is required for customer-facing password-reset output."),),
        review_needed=False,
        expected_action="preserve_evidence_only",
        severity="high",
        rationale="A lower-authority opinion should not displace an explicit decision from the responsible authority, especially when Current State already matches that decision.",
    ),
    ReviewInterpretationScenario(
        id="review_partial_question_answer",
        category="partial_question_answer",
        evidence="Security approved Slack as an evidence source for #product and #support. Other project channels are still under review.",
        current_state=(("sources", "Slack is not yet approved as a general evidence source."),),
        open_questions=("Will Slack be approved as an evidence source for all project channels?",),
        expected_action="update_state",
        allowed_actions=("update_state", "update_state_and_open_question"),
        required_state_update_phrases=("#product", "#support"),
        forbidden_state_update_phrases=("all project channels", "slack is approved for all"),
        should_change_state=True,
        must_preserve_uncertainty=True,
        severity="high",
        rationale="Partial approval should be recorded at the approved scope. Keeping or reopening an unresolved broader Question is acceptable as long as the approved scope is not overstated."
    ),
)
