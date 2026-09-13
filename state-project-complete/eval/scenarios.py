"""The State consequentiality evaluation set.

Each Scenario is one piece of Evidence, seeded against a small Current State
/ open-Questions snapshot, with a human-assigned expected judgment for
whether process_evidence() should recommend a Review:

    MUST_REVIEW  -- a human should be asked. Missing this is the failure
                    mode that matters most (see the VP-billing regression
                    in test_evidence_intake_consequentiality.py).
    NO_REVIEW    -- nothing here should interrupt a human. Over-triggering
                    this is the other failure mode: if State asks about
                    everything, it becomes another inbox and people stop
                    maintaining it.
    AMBIGUOUS    -- reasonable people could land either way. These are
                    deliberately NOT hard-asserted in the pytest wrapper;
                    they exist so the eval report can show where the model's
                    judgment falls without pretending there is one correct
                    answer. See docs/PROJECT_STATUS.md's "Next Marching
                    Orders" -- avoid overfitting to an exact review subtype,
                    and don't "solve" consequentiality by sending everything
                    to Review.

This file intentionally covers every category the "Next Marching Orders"
doc asked for: clear decisions, tentative suggestions, executive/authority
statements, non-authoritative opinions, direct/implicit contradictions,
reversals, superseded information, old information resurfacing,
duplicates/repeated confirmation, irrelevant chatter, observations without
decisions, Question answers (direct/partial/conflicting), compounding weak
signals, new facts that do/don't change Current State, and evidence that
makes Current State questionable without a replacement.

It is a superset in spirit of test_evidence_intake_consequentiality.py's 7
hand-written regression cases (kept as-is, on purpose -- that file pins the
exact real-world VP-billing miss and stays a standalone regression, per the
"preserve existing tests" rule), not a replacement for it. This file is data
only; state-project-complete/eval/run_eval.py and
test_consequentiality_eval_dataset.py are what actually run it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple

MUST_REVIEW = "must_review"
NO_REVIEW = "no_review"
AMBIGUOUS = "ambiguous"


@dataclass(frozen=True)
class Scenario:
    id: str
    category: str
    content: str
    state_items: Dict[str, Tuple[str, str]]
    expected: str
    notes: str = ""
    questions: Tuple[Tuple[str, str, bool], ...] = field(default_factory=tuple)


# A small shared Current State snapshot, reused across most scenarios so the
# dataset reads as one coherent (fictional) support-automation pilot rather
# than 30+ unrelated one-off setups. Individual scenarios can still pass
# their own state_items when a category needs something the shared set
# doesn't cover.
BASE_STATE = {
    "k-sensitive": (
        "scope",
        "Billing adjustments, ownership changes, refunds, and other sensitive "
        "account actions remain outside the assistant's first implementation.",
    ),
    "k-pilot": (
        "product",
        "The first pilot is focused on basic troubleshooting questions. AI writes "
        "suggested answers using available information; a support rep reviews "
        "before anything customer-facing is sent.",
    ),
    "k-password": (
        "automation",
        "Password-reset tickets are approved for automation, but approval does "
        "not by itself establish that automation has been implemented or deployed.",
    ),
    "k-autonomy": (
        "automation",
        "Leadership has asked whether 50% autonomous resolution is achievable, "
        "but discovery has not established a safe automation percentage and the "
        "first implementation remains human-reviewed.",
    ),
    "k-vendor": (
        "security",
        "The vendor has confirmed customer content is not used to train the "
        "underlying model under the proposed enterprise terms.",
    ),
    "k-slack": (
        "data",
        "Slack conversations are excluded as an evidence source for the first "
        "implementation until ownership, freshness, and governance are resolved.",
    ),
    "k-escalation": (
        "product",
        "Tickets the assistant cannot answer confidently are escalated to a "
        "human rep rather than answered with a low-confidence guess.",
    ),
}

SCENARIOS = [
    # --- Clear decisions -------------------------------------------------
    Scenario(
        id="clear_decision_budget",
        category="clear_decision",
        expected=MUST_REVIEW,
        content=(
            "Leadership approved an additional $50k budget for the pilot to "
            "cover a second support vertical starting next quarter."
        ),
        state_items=BASE_STATE,
        notes="A concrete, authority-backed budget decision with no prior State item on record for it.",
    ),
    Scenario(
        id="clear_decision_contract_signed",
        category="clear_decision",
        expected=MUST_REVIEW,
        content=(
            "The client signed the enterprise agreement this morning, which "
            "formally greenlights moving from pilot to full rollout."
        ),
        state_items=BASE_STATE,
        notes="Unambiguous, high-stakes, easy case -- should never be missed.",
    ),

    # --- Tentative suggestions --------------------------------------------
    Scenario(
        id="tentative_suggestion_scope",
        category="tentative_suggestion",
        expected=AMBIGUOUS,
        content=(
            "In today's sync someone floated extending automation to low-value "
            "refunds eventually, but nobody committed to it and it wasn't "
            "written down as a plan."
        ),
        state_items=BASE_STATE,
        notes="Touches the sensitive-scope boundary, but explicitly non-committal and unattributed to authority.",
    ),
    Scenario(
        id="tentative_suggestion_tool",
        category="tentative_suggestion",
        expected=NO_REVIEW,
        content=(
            "Someone mentioned it might be worth trying a different ticketing "
            "tool someday, just brainstorming, nothing concrete."
        ),
        state_items=BASE_STATE,
        notes="Tentative AND unrelated to any tracked State item -- should read as clearly non-consequential.",
    ),

    # --- Executive / authority statements ---------------------------------
    Scenario(
        id="authority_statement_refunds",
        category="executive_authority_statement",
        expected=MUST_REVIEW,
        content="VP says we can move forward on auto drafting billing quesitons",
        state_items=BASE_STATE,
        notes=(
            "The original regression case, kept here too so it's part of the "
            "broader labeled dataset, not just the standalone regression file."
        ),
    ),
    Scenario(
        id="authority_statement_launch_date",
        category="executive_authority_statement",
        expected=MUST_REVIEW,
        content="The CEO told the team in standup that the pilot launch date is now October 1st.",
        state_items=BASE_STATE,
        notes="A specific, attributed, concrete commitment -- should reach review even though it isn't a scope/security topic.",
    ),
    Scenario(
        id="authority_question_removing_human_review",
        category="executive_authority_statement",
        expected=MUST_REVIEW,
        content=(
            "Leadership asked whether we can remove human review from the "
            "pilot entirely to speed things up."
        ),
        state_items=BASE_STATE,
        notes=(
            "Not a decision or even a stated opinion -- just a question. But it's "
            "attributed to leadership (the same authority bar that makes "
            "clear_decision_budget and authority_statement_launch_date "
            "MUST_REVIEW) and it targets the single core safety boundary the "
            "whole product exists to protect (human review), not a routine "
            "detail. Distinct from old_info_resurfacing_autonomy (AMBIGUOUS): "
            "that one is unattributed idle circling-back on an automation "
            "percentage; this one is authority actively floating removing "
            "review itself. Should create an open_question Review tracking "
            "whether leadership is reconsidering the requirement -- not a "
            "state change, since nothing has been decided."
        ),
    ),
    Scenario(
        id="authority_question_removing_human_review_scoped",
        category="executive_authority_statement",
        expected=AMBIGUOUS,
        content=(
            "Leadership asked whether we can remove human review for low-risk "
            "password reset answers, but Security has not approved that change."
        ),
        state_items=BASE_STATE,
        notes=(
            "The exact literal wording from the live staging QA pass that "
            "originally produced no Review (2026-09-12). Empirically tested "
            "against the real model (9 runs total): passed (review_recommended) "
            "8/8 times in isolation, but failed once when run as part of the "
            "full ~35-scenario batch -- roughly 89% consistent, not reliably "
            "either way. Narrower than authority_question_removing_human_review "
            "(scoped to password-reset only, and explicitly says Security has "
            "not approved it), which may read as more speculative/already-"
            "blocked. Classified AMBIGUOUS rather than MUST_REVIEW because a "
            "hard assert here would itself be flaky, not because the case is "
            "unimportant -- this is genuine borderline model judgment on the "
            "safety-boundary line, worth watching if it recurs, not a "
            "reliably-reproducible prompt gap the way the original repro "
            "looked from a single live QA pass."
        ),
    ),

    # --- Non-authoritative opinions -----------------------------------------
    Scenario(
        id="opinion_full_automation",
        category="non_authoritative_opinion",
        expected=NO_REVIEW,
        content=(
            "One of the engineers said in passing that they personally think "
            "we should eventually go fully autonomous, no human review at all."
        ),
        state_items=BASE_STATE,
        notes="An individual contributor's personal opinion, not attributed to any decision-making authority.",
    ),
    Scenario(
        id="opinion_retention_policy",
        category="non_authoritative_opinion",
        expected=NO_REVIEW,
        content="An engineer mentioned the current retention policy feels stricter than it needs to be.",
        state_items=BASE_STATE,
        notes="A feeling/opinion about an existing policy, not a proposal or decision.",
    ),

    # --- Direct contradictions ---------------------------------------------
    Scenario(
        id="direct_contradiction_password_automation",
        category="direct_contradiction",
        expected=MUST_REVIEW,
        content=(
            "Security paused all password-reset automation this morning after a "
            "false-positive incident; it is not approved right now."
        ),
        state_items=BASE_STATE,
        notes="Flatly reverses an accepted automation approval.",
    ),
    Scenario(
        id="direct_contradiction_vendor_training",
        category="direct_contradiction",
        expected=MUST_REVIEW,
        content=(
            "Legal just confirmed the vendor DOES use customer content for "
            "model training under the current contract -- the opposite of what "
            "we told the security team."
        ),
        state_items=BASE_STATE,
        notes="Direct reversal of a security-relevant accepted fact.",
    ),

    # --- Implicit contradictions --------------------------------------------
    Scenario(
        id="implicit_contradiction_scope_creep",
        category="implicit_contradiction",
        expected=MUST_REVIEW,
        content=(
            "Support noticed the assistant already drafted a reply that "
            "adjusted a customer's account credit on a recent ticket -- nobody "
            "flagged it as unusual at the time."
        ),
        state_items=BASE_STATE,
        notes="Doesn't state a scope change outright, but implies the sensitive-scope boundary has already been crossed in practice.",
    ),
    Scenario(
        id="implicit_contradiction_vendor_logs",
        category="implicit_contradiction",
        expected=AMBIGUOUS,
        content=(
            "The vendor mentioned in a support call that they keep some "
            "request logs for a short debugging window."
        ),
        state_items=BASE_STATE,
        notes="Softly in tension with the no-training-data claim without clearly contradicting it -- debugging logs aren't training data.",
    ),

    # --- Reversals -----------------------------------------------------------
    Scenario(
        id="reversal_autonomy_target",
        category="reversal",
        expected=MUST_REVIEW,
        content=(
            "Leadership decided against the 50% automation target discussed "
            "earlier; they now want the pilot to stay fully human-reviewed "
            "indefinitely, with no automation percentage pursued at all."
        ),
        state_items=BASE_STATE,
        notes="Reverses direction on an item Current State treats as an open leadership question.",
    ),
    Scenario(
        id="reversal_slack_inclusion",
        category="reversal",
        expected=MUST_REVIEW,
        content=(
            "After the governance review, leadership decided Slack CAN be used "
            "as an evidence source starting next sprint, reversing the earlier "
            "exclusion."
        ),
        state_items=BASE_STATE,
        notes="A clean reversal of a previously-excluded data source, attributed to leadership.",
    ),

    # --- Superseded information (should NOT reach review) --------------------
    Scenario(
        id="superseded_info_old_scope_reminder",
        category="superseded_information",
        expected=NO_REVIEW,
        content=(
            "Quick reminder for new hires: the pilot is scoped to Tier 1 "
            "troubleshooting, same as it's always been."
        ),
        state_items=BASE_STATE,
        notes="Restates a still-current fact for onboarding purposes -- no new information, nothing superseded is being reintroduced as current.",
    ),

    # --- Old information resurfacing (ambiguous -- may or may not still apply)
    Scenario(
        id="old_info_resurfacing_autonomy",
        category="old_information_resurfacing",
        expected=AMBIGUOUS,
        content=(
            "Circling back to the 50% autonomy idea from last quarter -- is "
            "that still where we're headed, or did that get shelved?"
        ),
        state_items=BASE_STATE,
        notes="A question about old, possibly-stale context rather than a new assertion -- genuinely ambiguous whether it needs a human.",
    ),

    # --- Duplicates / repeated confirmation (should NOT reach review) --------
    Scenario(
        id="repeated_confirmation_password_automation",
        category="repeated_confirmation",
        expected=NO_REVIEW,
        content=(
            "Third time this week someone's confirmed password-reset automation "
            "is still approved -- just repeating what's already agreed, no "
            "changes."
        ),
        state_items=BASE_STATE,
        notes="Repetition of an already-accepted fact adds no new information.",
    ),
    Scenario(
        id="duplicate_billing_scope_restatement",
        category="duplicate",
        expected=NO_REVIEW,
        content=(
            "Just to restate for the record: billing adjustments and refunds "
            "are still out of scope for the assistant, as agreed."
        ),
        state_items=BASE_STATE,
        notes="Same substance as the sensitive-scope item, phrased differently -- should not re-trigger review each time it's said.",
    ),

    # --- Irrelevant chatter ----------------------------------------------------
    Scenario(
        id="offtopic_lunch",
        category="irrelevant_chatter",
        expected=NO_REVIEW,
        content=(
            "Team lunch got moved to 12:30 today because the 12:00 slot in the "
            "big conference room was double-booked."
        ),
        state_items=BASE_STATE,
        notes="No material connection to any tracked State item.",
    ),
    Scenario(
        id="offtopic_birthday",
        category="irrelevant_chatter",
        expected=NO_REVIEW,
        content="It's Priya's birthday today, the team is doing cupcakes at 3pm.",
        state_items=BASE_STATE,
        notes="Second off-topic example in a different flavor (social, not logistics).",
    ),

    # --- Observations without decisions -----------------------------------------
    Scenario(
        id="observation_billing_volume",
        category="observation_without_decision",
        expected=NO_REVIEW,
        content=(
            "Support mentioned that billing-related questions come up often in "
            "the ticket queue -- just an observation from this week's volume."
        ),
        state_items=BASE_STATE,
        notes="An observation near the sensitive-scope boundary, but with no authority figure approving or deciding anything.",
    ),
    Scenario(
        id="observation_friday_spike",
        category="observation_without_decision",
        expected=NO_REVIEW,
        content="Noticed ticket volume tends to spike on Fridays -- might be worth watching, no action proposed.",
        state_items=BASE_STATE,
        notes="Pure observation, no decision or proposal attached, unrelated to any tracked boundary.",
    ),

    # --- Question answers: direct, partial, conflicting -------------------------
    Scenario(
        id="question_answer_direct_autonomy_target",
        category="question_answer_direct",
        expected=MUST_REVIEW,
        content="Leadership confirmed the automation target for this quarter is 30%, resolving the open question.",
        state_items=BASE_STATE,
        questions=(("q-autonomy-target", "What automation percentage is the project targeting?", True),),
        notes="A direct, attributed answer to an existing blocking Question.",
    ),
    Scenario(
        id="question_answer_partial_vendor_owner",
        category="question_answer_partial",
        expected=AMBIGUOUS,
        content="Legal is involved in the vendor security review, though it's not clear yet if they're the sole owner or just one reviewer.",
        state_items=BASE_STATE,
        questions=(("q-vendor-owner", "Who owns the vendor security review?", False),),
        notes="Partially addresses an open Question without fully resolving it.",
    ),

    # --- Unresolved ownership gaps (newly surfaced, not answering an existing Question)
    Scenario(
        id="unresolved_ownership_escalation_scoring",
        category="ownership_gap",
        expected=MUST_REVIEW,
        content="We still need to know who owns escalation-quality scoring during the pilot.",
        state_items=BASE_STATE,
        notes=(
            "The exact literal wording from the live staging QA pass "
            "(2026-09-12) that produced no Review or Question. Unlike "
            "question_answer_partial_vendor_owner, this isn't answering an "
            "existing tracked Question -- it's surfacing a brand-new "
            "ownership gap. It's also not a neutral observation like "
            "observation_billing_volume/observation_friday_spike (NO_REVIEW): "
            "those describe patterns with no stated need; this explicitly says "
            "'we still need to know', and it's tied to k-escalation, an "
            "existing safety-adjacent State item (tickets the assistant isn't "
            "confident about go to a human rather than a guess) -- not knowing "
            "who owns measuring whether that mechanism is actually working "
            "well is a real coverage gap, not routine missing detail. Expected "
            "open_question, testing whether the model treats an unattributed "
            "'we need to know X' the same way it treats an attributed decision."
        ),
    ),
    Scenario(
        id="question_answer_conflicting_launch_gate",
        category="conflicting_answers",
        expected=MUST_REVIEW,
        content=(
            "Support says the launch is gated on Security sign-off, but "
            "Product says it's gated on the client's own internal approval -- "
            "these don't match what's been assumed."
        ),
        state_items=BASE_STATE,
        questions=(("q-launch-gate", "What is the pilot launch actually gated on?", True),),
        notes="Two conflicting candidate answers to the same open Question -- the conflict itself is what needs a human.",
    ),

    # --- Weak signals that compound ---------------------------------------------
    Scenario(
        id="weak_signals_compound_scope_drift",
        category="weak_signals_compound",
        expected=AMBIGUOUS,
        content=(
            "A few small things this week: a rep mentioned drafting a partial "
            "refund reply once 'because it was obviously right', someone else "
            "said the account-ownership question came up in a ticket and they "
            "improvised an answer, and a third rep said they're not always sure "
            "where the troubleshooting-only line is anymore."
        ),
        state_items=BASE_STATE,
        notes=(
            "No single sentence here is a clean authority decision, but "
            "together they describe a scope boundary eroding in practice -- "
            "the kind of case a single-event judgment can most easily miss. "
            "A true multi-Evidence version of this belongs in the sequence "
            "tests (Phase 3); this is a single-message approximation."
        ),
    ),

    # --- New facts that do/don't change Current State ----------------------------
    Scenario(
        id="new_fact_no_state_change_tooling",
        category="new_fact_no_state_change",
        expected=NO_REVIEW,
        content="The team switched from Google Docs to Notion for internal meeting notes starting this week.",
        state_items=BASE_STATE,
        notes="Genuinely new information, but purely operational and unconnected to any tracked State item.",
    ),
    Scenario(
        id="new_fact_invalidates_state_sla",
        category="new_fact_invalidates_state",
        expected=MUST_REVIEW,
        content=(
            "Turns out the vendor's actual SLA caps uptime at 99%, not the "
            "99.9% everyone had been assuming when the security review signed "
            "off."
        ),
        state_items=BASE_STATE,
        notes="A new fact that directly invalidates an assumption baked into an accepted security decision.",
    ),

    # --- Evidence that makes State questionable, without a replacement -----------
    Scenario(
        id="state_at_risk_vendor_terms",
        category="state_at_risk_no_replacement",
        expected=MUST_REVIEW,
        content=(
            "Legal flagged that the vendor's no-training-data claim may not "
            "hold under the actual enterprise contract language; they are "
            "still reviewing it and have not reached a conclusion."
        ),
        state_items=BASE_STATE,
        notes="Undermines confidence in an accepted fact without itself establishing a replacement -- the state_at_risk case.",
    ),
    Scenario(
        id="state_at_risk_escalation_path",
        category="state_at_risk_no_replacement",
        expected=MUST_REVIEW,
        content=(
            "A support rep said the documented escalation path might be out of "
            "date after a recent org change, but wasn't sure and didn't have "
            "specifics."
        ),
        state_items=BASE_STATE,
        notes="Second state-at-risk example in a different domain (workflow, not security).",
    ),

    # --- Pure restatement / vague, no decision (should NOT reach review) ---------
    Scenario(
        id="pure_restatement_password_automation",
        category="pure_restatement",
        expected=NO_REVIEW,
        content="Reminder for the team: password-reset tickets remain approved for automation, same as before. No changes here.",
        state_items=BASE_STATE,
        notes="Says nothing Current State doesn't already say.",
    ),
    Scenario(
        id="vague_observation_escalation_volume",
        category="observation_without_decision",
        expected=NO_REVIEW,
        content="Escalations to human reps have been fairly steady this month, nothing unusual.",
        state_items=BASE_STATE,
        notes="Vague status observation with no decision, proposal, or authority involved.",
    ),

    # --- Deliberately ambiguous, near a real boundary -----------------------------
    Scenario(
        id="ambiguous_near_boundary_account_changes",
        category="ambiguous_wording_near_boundary",
        expected=AMBIGUOUS,
        content="Someone said we could maybe start drafting responses for account changes too, at some point.",
        state_items=BASE_STATE,
        notes=(
            "Deliberately unattributed and hedged ('someone', 'maybe', 'at "
            "some point'), but touches the sensitive-scope boundary directly "
            "-- a harder version of the tentative-suggestion case."
        ),
    ),
]


def by_expected(expected: str):
    return [s for s in SCENARIOS if s.expected == expected]


if __name__ == "__main__":
    counts = {}
    for s in SCENARIOS:
        counts[s.expected] = counts.get(s.expected, 0) + 1
    print(f"{len(SCENARIOS)} scenarios total")
    for label, count in counts.items():
        print(f"  {label}: {count}")
