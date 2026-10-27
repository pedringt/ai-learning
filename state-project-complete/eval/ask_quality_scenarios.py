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
    AskQualityScenario(
        id="ask_superseded_pending_review",
        category="superseded_review",
        question="What is the current pilot size, and what change is actually pending?",
        current_state=(("pilot", "The approved pilot size is 10 users."),),
        pending_reviews=(
            "OLDER SUPERSEDED proposal: increase the pilot to 50 users.",
            "NEWEST pending proposal: increase the pilot to 25 users; this replaces the older 50-user proposal and is still awaiting human review.",
        ),
        required_facts=("10 users", "25 users"),
        forbidden_claims=("50 users is pending", "50-user proposal is current", "pilot size is 25 users"),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="Ask should keep approved Current State authoritative and surface the newest pending proposal without treating a superseded proposal as equally current.",
    ),
    AskQualityScenario(
        id="ask_known_outcome_unknown_reason",
        category="outcome_vs_reason",
        question="Why was the Northstar pilot paused?",
        current_state=(("pilot", "The Northstar pilot was paused on September 28."),),
        required_facts=("paused",),
        forbidden_claims=("security incident", "quality failure", "budget issue", "leadership concern"),
        should_express_uncertainty=True,
        severity="high",
        rationale="Ask may know that an outcome happened without knowing why; it should not invent rationale or motivation.",
    ),
    # Oct 27 (production Ask, Northstar): the other direction from forbidden over-claiming. The source
    # says the budget is approved; Ask rewrote that to "proposed for approval (not yet approved)". What is
    # pending is recording it in Current State, not the approval the source reports.
    AskQualityScenario(
        id="ask_source_words_not_demoted",
        category="source_fidelity",
        question="What did the Q3 planning session say about the pilot budget, and is it in Current State?",
        current_state=(("scope", "The core pilot use case is Tier 1 troubleshooting assistance."),),
        pending_reviews=(
            "The Q3 planning session note says the pilot budget is approved at $40,000 for discovery and the first "
            "implementation phase. Should that budget be recorded in Current State?",
        ),
        required_facts=("$40,000", ("not in current state", "not yet in current state", "not been recorded",
                                    "not recorded", "not been accepted", "not yet accepted", "pending review",
                                    "awaiting review", "has not changed current state")),
        forbidden_claims=("proposed for approval", "not yet approved", "has not been approved"),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="Ask must report what a source said in the source's terms; the pending step is the Current State decision, not the source's approval.",
    ),
    # Oct 27 (production Ask, Northstar): a two-part question selected only the budget records, missed the
    # Current State fact about planning, and turned the pending Review's "why it matters" into a gate.
    AskQualityScenario(
        id="ask_compound_question_keeps_governing_state",
        category="authority_awareness",
        question="What's our pilot budget, and can we start implementation planning?",
        current_state=(
            ("launch", "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed thresholds for high-risk failures."),
            ("scope", "The core pilot use case is Tier 1 troubleshooting assistance."),
            ("data", "The pilot uses the minimum customer and account data needed for troubleshooting."),
        ),
        pending_reviews=(
            "Is the approved pilot budget of $40,000 ready to be recorded? Implementation planning depends on a known budget ceiling.",
        ),
        required_facts=("$40,000", ("can proceed", "may proceed", "can start", "can begin", "can move forward")),
        forbidden_claims=("should wait", "must wait", "cannot start", "can't start", "cannot begin", "cannot proceed"),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="Each part of a compound question needs its governing Current State; a pending Review's rationale is not a gate on what Current State already allows.",
    ),
    # #569 (Oct 27): the same failure on other topics, so a fix is not tuned to the budget wording.
    AskQualityScenario(
        id="ask_compound_retention_and_security_review",
        category="authority_awareness",
        question="What's the retention status, and can the security review of the pilot data flow proceed?",
        current_state=(
            ("security", "The security review of the pilot data flow can proceed on the read-only, minimum-data design; final sign-off still requires agreed retention terms."),
            ("data", "The pilot uses the minimum customer and account data needed for troubleshooting."),
            ("rollout", "Rollout begins with a bounded internal pilot."),
        ),
        pending_reviews=(
            "Is the vendor's stated 30-day retention authoritative enough for pilot planning? The security review depends on confirmed retention terms.",
        ),
        required_facts=(("30-day", "30 days"), ("can proceed", "may proceed", "can continue", "can start", "can begin", "can move forward")),
        forbidden_claims=("should wait", "must wait", "cannot proceed", "cannot start", "cannot begin", "cannot continue"),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="The review's governing Current State allows it to proceed; the pending retention Review limits only final sign-off.",
    ),
    AskQualityScenario(
        id="ask_compound_move_date_and_furniture",
        category="authority_awareness",
        question="When is the office move, and can we start ordering furniture?",
        current_state=(
            ("move", "The office move is scheduled for November 8."),
            ("furniture", "Furniture ordering can begin for the confirmed floor plan; delivery dates are set once the move date is final."),
            ("it", "IT relocation is handled by TechMove Logistics."),
        ),
        pending_reviews=(
            "Should the move date change to November 15? Furniture ordering depends on a fixed move date.",
        ),
        required_facts=("november 8", ("can begin", "can start", "can proceed", "can go ahead", "can move forward")),
        forbidden_claims=("should wait", "must wait", "cannot start", "can't start", "cannot begin", "scheduled for november 15"),
        should_distinguish_proposal_from_truth=True,
        severity="high",
        rationale="Current State allows furniture ordering now; the pending date change affects delivery timing, not whether ordering can begin.",
    ),
)
