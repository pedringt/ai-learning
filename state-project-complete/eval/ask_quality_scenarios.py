"""Controlled Ask-quality eval cases for State.

Ask is read-only: it should communicate maintained project truth without
collapsing Current State, pending Reviews, Questions, Evidence, or History
into one authority level. These cases define product-owner expectations for
that behavior without requiring exact model wording.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Severity = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class AskQualityScenario:
    id: str
    category: str
    question: str
    current_state: tuple[tuple[str, str], ...]
    pending_reviews: tuple[str, ...] = field(default_factory=tuple)
    open_questions: tuple[str, ...] = field(default_factory=tuple)
    history: tuple[tuple[str, str, str], ...] = field(default_factory=tuple)
    # Each entry is a required fact: either one phrase, or a tuple of acceptable
    # phrasings of the same fact (any one satisfies it).
    required_facts: tuple[str | tuple[str, ...], ...] = field(default_factory=tuple)
    forbidden_claims: tuple[str, ...] = field(default_factory=tuple)
    should_express_uncertainty: bool = False
    should_reference_open_item: bool = False
    should_distinguish_proposal_from_truth: bool = False
    severity: Severity = "medium"
    rationale: str = ""


SCENARIOS = (
    AskQualityScenario(
        id="ask_current_over_stale",
        category="currentness",
        question="Are password resets approved for automation?",
        current_state=(("automation", "Password-reset automation is paused after a security incident."),),
        history=(("Password-reset automation is approved.", "Password-reset automation is paused after a security incident.", "2026-09-10"),),
        required_facts=("paused",),
        forbidden_claims=("currently approved",),
        severity="high",
        rationale="Ask must prefer maintained Current State over stale historical truth.",
    ),
    AskQualityScenario(
        id="ask_pending_review_not_truth",
        category="authority_awareness",
        question="Did leadership approve removing human review?",
        current_state=(("safety", "Customer-facing output remains human-reviewed."),),
        pending_reviews=("Leadership asked whether low-risk cases can skip human review; no decision is recorded.",),
        required_facts=("human-reviewed",),
        forbidden_claims=("leadership approved removing human review",),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="A pending Review must never be presented as established Current State.",
    ),
    AskQualityScenario(
        id="ask_unknown_stays_unknown",
        category="uncertainty",
        question="What percentage of tickets will be fully autonomous?",
        current_state=(("automation", "A safe autonomous-resolution percentage has not been established."),),
        open_questions=("What autonomous-resolution percentage is safe and achievable?",),
        required_facts=(("not established", "not yet established", "not been established"),),
        forbidden_claims=("0%", "50%"),
        should_express_uncertainty=True,
        should_reference_open_item=True,
        severity="high",
        rationale="Unknown must not become zero, false, or an invented target.",
    ),
    AskQualityScenario(
        id="ask_change_summary",
        category="history",
        question="What changed about Slack?",
        current_state=(("sources", "Slack is approved as an evidence source starting next sprint."),),
        history=(("Slack is excluded until governance is resolved.", "Slack is approved as an evidence source starting next sprint.", "2026-09-16"),),
        required_facts=("approved", "starting next sprint"),
        forbidden_claims=("Slack is still excluded",),
        severity="medium",
        rationale="Change summaries should use History and preserve old-versus-new direction.",
    ),
    AskQualityScenario(
        id="ask_false_premise",
        category="false_premise",
        question="Why did we decide to fully automate support?",
        current_state=(("product", "The first implementation remains human-reviewed."),),
        open_questions=("How much automation is safe after the pilot?",),
        required_facts=("human-reviewed",),
        forbidden_claims=("we decided to fully automate",),
        should_express_uncertainty=True,
        should_reference_open_item=True,
        severity="high",
        rationale="Ask should correct a false premise rather than accept it as project truth.",
    ),
    AskQualityScenario(
        id="ask_blocker_not_omitted",
        category="important_omission",
        question="Are we ready to launch?",
        current_state=(("launch", "Pilot launch is targeted for October 1."),),
        open_questions=("BLOCKING: Has Security approved the production data path?",),
        required_facts=("security",),
        should_express_uncertainty=True,
        should_reference_open_item=True,
        severity="high",
        rationale="A broad readiness answer must not omit a consequential blocker.",
    ),
    AskQualityScenario(
        id="ask_conflicting_evidence",
        category="conflict",
        question="Does the vendor train on customer content?",
        current_state=(("security", "The approved enterprise terms state customer content is not used for model training."),),
        pending_reviews=("New legal evidence may contradict the approved enterprise-terms interpretation.",),
        required_facts=("not used",),
        forbidden_claims=("definitely uses customer content",),
        should_express_uncertainty=True,
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="Ask should report maintained truth while surfacing a relevant unresolved conflict.",
    ),
    AskQualityScenario(
        id="ask_question_answer_no_state_mutation",
        category="question_resolution",
        question="Was the vendor-retention question answered?",
        current_state=(("vendor", "The vendor contract remains under review."),),
        history=(),
        required_facts=("question",),
        severity="medium",
        rationale="Ask should be able to distinguish a resolved Question from a Current State mutation.",
    ),
)
