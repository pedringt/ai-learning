"""Idempotent Northstar demo/stress seed for the behavioral prototype.

This demo bootstrap inserts stable Northstar IDs that are missing; it never
overwrites user-created or review-updated records. Environment-loaded demo
deployments enable it by default; set STATE_DEMO_BOOTSTRAP=0 to disable it.
That makes it safe to use against an existing demo DB that became sparse during
R7 fixture cleanup.
"""
from __future__ import annotations

import os
from database_migration_backed import initialize_db
from db import connect
from question_review_service import persist_question_proposal

# state.md #113: Northstar's own areas -- generalization means Northstar
# fills the Current State organization with its own data instead of the
# product defining it in view JavaScript. id, name, description, sort_order.
AREAS = [
    ("scope-workflow", "Scope & workflow", "What the assistant currently does, where it fits, and how the support workflow is expected to work.", 10),
    ("security-data", "Security & data", "The current boundaries that keep the first implementation controlled and reviewable.", 20),
    ("evaluation-rollout", "Evaluation & rollout", "How the pilot will be judged and what needs to be true before broader use.", 30),
]

# id, topic, statement, area_id. area_id is None for the two universal facts
# (Project stage/outcome) -- excluded from area grouping by topic label, not
# by id, so a different project's own stage/outcome facts work the same way
# without this file's IDs meaning anything special to the view layer.
ITEMS = [
    ("k-stage", "Project stage", "Late discovery is nearly complete; implementation planning is next once the remaining launch-critical security, access-authority, and evaluation questions are resolved.", None),
    ("k-outcome", "Project outcome", "Reduce repetitive support effort without sacrificing response quality or human control.", None),
    ("k-pilot", "Current direction", "The core pilot use case is Tier 1 troubleshooting assistance. AI drafts and assembles context; a support rep reviews before anything customer-facing is sent.", "scope-workflow"),
    ("k-entry", "Workflow fit", "The assistant supports the rep inside the existing troubleshooting workflow rather than replacing the support queue or customer conversation.", "scope-workflow"),
    ("k-grounding", "Approved knowledge", "Troubleshooting guidance is grounded in approved support material and relevant account context when that context is available.", "scope-workflow"),
    ("k-escalation", "Escalation path", "Cases that cannot be supported confidently from available information stay with the rep and follow the existing escalation path.", "scope-workflow"),
    ("k-access", "Feature access", "Standard plan rules are one troubleshooting input, but effective customer access can require account-level confirmation when exceptions exist.", "scope-workflow"),
    ("k-password", "Password reset automation", "Password-reset tickets are approved for automation, but approval does not by itself establish that automation has been implemented or deployed.", "scope-workflow"),
    ("k-login", "Login troubleshooting", "Login and authentication troubleshooting are in the first-pilot scope when the assistant can ground guidance without changing the customer account.", "scope-workflow"),
    ("k-handoff", "Rep handoff", "The assistant should preserve the relevant evidence and attempted troubleshooting when a case is handed back to a rep or escalated.", "scope-workflow"),
    ("k-autonomy", "Autonomy target", "Leadership has asked whether 50% autonomous resolution is achievable, but discovery has not established a safe automation percentage and the first implementation remains human-reviewed.", "security-data"),
    ("k-security", "Human review boundary", "Human review remains required for the pilot. Security wants agreed high-risk failure categories and evidence across them before that boundary is reconsidered.", "security-data"),
    ("k-data", "Data boundary", "The pilot uses the minimum customer and account data needed for troubleshooting, remains read-only, and avoids account-changing actions in the first implementation.", "security-data"),
    ("k-sensitive", "Sensitive actions", "Billing adjustments, ownership changes, refunds, and other sensitive account actions remain outside the assistant's first implementation.", "security-data"),
    ("k-claims", "Unsupported claims", "Unsupported claims about customer configuration, outages, or feature availability are treated as high-risk failures during pilot evaluation.", "evaluation-rollout"),
    ("k-vip", "VIP exception", "VIP and other specially handled accounts continue through manual support workflows unless a separately reviewed rule establishes otherwise.", "security-data"),
    ("k-slack", "Support Slack", "Support Slack is not an approved retrieval source for the first pilot while ownership, freshness, and data-governance questions remain unresolved.", "security-data"),
    ("k-readonly", "Read-only boundary", "The first implementation may retrieve and synthesize information but may not execute account changes on the customer's behalf.", "security-data"),
    ("k-eval", "Evaluation direction", "The pilot is evaluated with response-time improvement, reviewer edits, escalation behavior, unsupported-claim checks, and failure severity rather than a single automation metric.", "evaluation-rollout"),
    ("k-launch", "Launch readiness", "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed thresholds for high-risk failures and escalation behavior.", "evaluation-rollout"),
    ("k-feedback", "Rep feedback", "Pilot feedback distinguishes harmless edits from corrections that indicate the assistant misunderstood the case or relied on unsupported information.", "evaluation-rollout"),
    ("k-training", "Rep enablement", "Rep training covers when to use the assistant, what still requires manual verification, how to inspect support for an answer, and how to flag a bad suggestion.", "evaluation-rollout"),
    ("k-rollout", "Rollout sequence", "Rollout begins with a bounded internal pilot before any broader support-team availability is considered.", "evaluation-rollout"),
    ("k-sample", "Evaluation sample", "Evaluation includes representative routine cases plus edge cases from the agreed high-risk categories; ticket volume alone does not define the test set.", "evaluation-rollout"),
    ("k-monitoring", "Pilot monitoring", "Pilot monitoring tracks severe failures and escalation behavior separately from aggregate speed or edit-rate improvements.", "evaluation-rollout"),
]

QUESTIONS = [
    ("q-authority-seed", "What source authoritatively determines effective customer feature access?", 1, "Implementation backlog", "Access mapping"),
    ("q-thresholds", "What evaluation thresholds should block or allow pilot launch?", 1, "Pilot launch criteria", "Evaluation working session"),
    ("q-retention", "What retention and deletion terms apply to pilot prompts and outputs?", 1, "Security approval for pilot data flow", "Vendor security review"),
    ("q-review", "What evidence would justify reconsidering human review?", 0, None, "Security discovery"),
    ("q-tier2", "Which Tier 2 workflows, if any, should be evaluated after the Tier 1 pilot?", 0, None, "Scope discussion"),
    ("q-password-scope", "Which password-reset variants qualify for the approved automation path?", 0, None, "Automation planning"),
    ("q-password-launch", "When will the approved password-reset automation actually be implemented?", 0, None, "Automation planning"),
    ("q-exceptions", "Which account exceptions need authoritative access checks beyond the plan matrix?", 0, None, "Ticket review"),
    ("q-owner-threshold", "Who owns the final launch-threshold decision?", 0, None, "Evaluation working session"),
    ("q-baseline", "What response-time baseline should the pilot compare against?", 0, None, "Evaluation working session"),
    ("q-edit-rate", "Which reviewer edits count as harmless polish versus substantive correction?", 0, None, "Rep feedback design"),
    ("q-escalation-measure", "How should escalation quality be scored during the pilot?", 0, None, "Evaluation working session"),
    ("q-training-owner", "Who will own rep training and office-hours support during the pilot?", 0, None, "Rollout planning"),
    ("q-sandbox", "Will the vendor sandbox mirror the production features needed for representative testing?", 0, None, "Vendor follow-up"),
    ("q-redaction", "Where does sensitive-data redaction occur relative to provider logging?", 0, None, "Security discovery"),
    ("q-outage", "What source should govern when an outage changes otherwise stable troubleshooting guidance?", 0, None, "Knowledge-source review"),
    ("q-feedback-loop", "How quickly should severe pilot failures feed back into guidance or scope?", 0, None, "Pilot operations"),
    ("q-success-window", "How long should the internal pilot run before the team evaluates broader rollout?", 0, None, "Rollout planning"),
    ("q-ask-named-access", "Does security require named-agent access for the full pilot?", 0, None, "Security meeting prep"),
    ("q-ask-expansion-owner", "Who has final authority to approve expanding the pilot beyond Tier 1?", 0, None, "Scope governance"),
]

# state.md #112: seed data doubles as a manual Review-shape regression
# gallery, not just realistic Northstar content -- each entry below exists to
# demonstrate one distinct human-decision pattern (see the "shape:" note on
# each), across varied domains (scope, target metric, schedule, vendor,
# budget, policy, ownership) rather than repeating the same update-a-fact
# shape or making every example about vendor security/data retention.
# Roughly 6-8 stay visibly pending at once (below); two more shapes that
# don't need to be pending -- "a Question answered with no State change" and
# "Leave unchanged" -- are seeded already resolved, further down. Backend-only
# edge cases (malformed provider output, concurrency races, stale versions)
# belong in automated tests, not here.
REVIEWS = [
    {  # shape: update an existing Current State fact
        "id": "demo-review-access", "review_type": "proposed_update",
        "decision_question": "Does feature access need an account-level confirmation step for exceptions?",
        "why_consequential": "Ticket evidence shows plan rules can diverge from effective account access.",
        "evidence_id": "demo-review-access-evidence",
        "evidence_text": "Representative ticket review found grandfathered packages and temporary entitlements that do not match the standard plan matrix.",
        "evidence_date": "2026-08-27 16:10:00",
        "proposals": [{"state_item_id": "k-access", "operation": "update",
                        "proposed_statement": "Feature access requires an authoritative account-level check when plan rules and effective entitlements conflict.",
                        "rationale": "Ticket evidence shows plan rules can diverge from effective account access."}],
        "resolves_question_ids": [],
    },
    {  # shape: Evidence that answers an existing Question AND supports a State change
        "id": "demo-review-launch", "review_type": "proposed_update",
        "decision_question": "Should launch readiness explicitly require a severe-failure threshold?",
        "why_consequential": "The evaluation plan needs a deterministic launch gate rather than only aggregate quality metrics -- and directly answers the open threshold question.",
        "evidence_id": "demo-review-launch-evidence",
        "evidence_text": "Security asked for explicit launch-blocking thresholds for agreed high-risk failure categories.",
        "evidence_date": "2026-08-28 09:30:00",
        "proposals": [{"state_item_id": "k-launch", "operation": "update",
                        "proposed_statement": "Pilot launch requires an agreed threshold for severe unsupported-claim failures as well as acceptable escalation behavior.",
                        "rationale": "Security asked for explicit launch-blocking thresholds for agreed high-risk failure categories."}],
        "resolves_question_ids": ["q-thresholds"],
    },
    {  # shape: state_at_risk / consequential uncertainty without a replacement fact
        "id": "demo-review-retention", "review_type": "state_at_risk",
        "decision_question": "Are the vendor's stated retention terms authoritative enough for pilot planning?",
        "why_consequential": "The vendor described proposed terms, but Security and Legal have not confirmed the agreement.",
        "evidence_id": "demo-review-retention-evidence",
        "evidence_text": "Vendor follow-up described retention and logging behavior that still requires contractual confirmation.",
        "evidence_date": "2026-08-29 10:20:00",
        "proposals": [], "resolves_question_ids": [],
    },
    {  # shape: retire an existing Current State fact
        "id": "demo-review-retire-vip", "review_type": "proposed_update",
        "decision_question": "Should the VIP exception carve-out be retired now that standard escalation covers it?",
        "why_consequential": "A separate carve-out for VIP accounts creates two competing escalation paths if the standard one already handles the same cases.",
        "evidence_id": "demo-review-retire-vip-evidence",
        "evidence_text": "Workflow review found no VIP case in the last quarter that the standard escalation path could not have handled on its own.",
        "evidence_date": "2026-08-30 11:00:00",
        "proposals": [{"state_item_id": "k-vip", "operation": "retire",
                        "proposed_statement": "VIP accounts now follow the standard escalation path; no separate carve-out remains necessary.",
                        "rationale": "No VIP case in the last quarter needed handling beyond the standard escalation path."}],
        "resolves_question_ids": [],
    },
    {  # shape: create a new Current State fact -- shares evidence with
       # demo-review-eval-redesign below (one Evidence item, two independent
       # Reviews: a planning note that separately surfaces a budget figure
       # and revised evaluation criteria, each its own decidable question).
        "id": "demo-review-create-budget", "review_type": "missing_understanding",
        "decision_question": "Is the approved pilot budget ready to be recorded?",
        "why_consequential": "Implementation planning depends on a known budget ceiling, and none is currently recorded.",
        "evidence_id": "demo-review-q3-planning-evidence",
        "evidence_text": "Q3 planning session: the pilot budget is approved at $40,000 for discovery and first implementation. Separately, the team agreed the evaluation criteria and sample definition need to be revised together before the next test round.",
        "evidence_date": "2026-08-31 13:30:00",
        "proposals": [{"state_item_id": None, "operation": "create",
                        "proposed_statement": "The pilot budget is approved at $40,000, covering discovery and the first implementation phase.",
                        "rationale": "Implementation planning depends on a known budget ceiling.",
                        "area_id": "evaluation-rollout"}],
        "resolves_question_ids": [],
    },
    {  # shape: grouped Review with multiple closely related proposals that
       # belong to one human decision (revising evaluation criteria and the
       # sample definition together, since one without the other leaves the
       # evaluation plan internally inconsistent). Shares evidence with
       # demo-review-create-budget above (item 9: one Evidence, two Reviews).
        "id": "demo-review-eval-redesign", "review_type": "proposed_update",
        "decision_question": "Should the evaluation sample and monitoring split be revised together?",
        "why_consequential": "The sample definition and monitoring split were redesigned as one package; adopting only one would leave the evaluation plan internally inconsistent.",
        "evidence_id": "demo-review-q3-planning-evidence",
        "evidence_text": "Q3 planning session: the pilot budget is approved at $40,000 for discovery and first implementation. Separately, the team agreed the evaluation sample and monitoring split need to be revised together before the next test round.",
        "evidence_date": "2026-08-31 13:30:00",
        "proposals": [
            {"state_item_id": "k-sample", "operation": "update",
             "proposed_statement": "Evaluation includes representative routine cases plus edge cases from the agreed high-risk categories, redrawn from the revised Q3 sample definition rather than the original draft set.",
             "rationale": "The sample definition was revised in the Q3 planning session."},
            {"state_item_id": "k-monitoring", "operation": "update",
             "proposed_statement": "Pilot monitoring tracks severe failures and escalation behavior separately from aggregate speed or edit-rate improvements, reported against the revised Q3 sample split rather than the original draft grouping.",
             "rationale": "The monitoring split was revised alongside the sample definition and the two must move together."},
        ],
        "resolves_question_ids": [],
    },
    {  # shape: proposed new Question that should link to an equivalent
       # existing Question rather than duplicate it -- the proposed text
       # below exactly matches q-owner-threshold's, so State's own dedup
       # (exact normalized-text match) surfaces "Already tracked" instead of
       # creating a second Question for the same unknown.
        "id": "demo-review-owner-question", "review_type": "open_question",
        "decision_question": "Who owns the final launch-threshold decision?",
        "why_consequential": "A second team raised the same ownership gap independently, without knowing it was already an open Question.",
        "evidence_id": "demo-review-owner-question-evidence",
        "evidence_text": "Rollout planning meeting: nobody in the room could say who has final sign-off on the launch thresholds once they are proposed.",
        "evidence_date": "2026-09-01 09:15:00",
        "proposals": [], "resolves_question_ids": [],
        "question_proposal_text": "Who owns the final launch-threshold decision?",
    },
]

# Resolved examples -- demonstrate shapes that don't need to stay in the
# visible pending gallery (state.md #112's demo-volume constraint).
RESOLVED_REVIEWS = [
    {  # shape: Evidence answers an existing Question without requiring a
       # Current State change -- accepted with no proposals, so the linked
       # Question resolves and Current State never moves.
        "id": "demo-review-resolved-review-question", "review_type": "state_at_risk",
        "decision_question": "Does the Security discovery note answer what would justify reconsidering human review?",
        "why_consequential": "Security's own discovery notes describe exactly the evidence category the open Question was waiting on.",
        "evidence_id": "demo-review-resolved-review-question-evidence",
        "evidence_text": "Security discovery follow-up: the categories of evidence that would justify reconsidering the human-review boundary are the same ones already being tracked for launch thresholds -- no new boundary decision is needed yet.",
        "evidence_date": "2026-09-03 14:00:00",
        "proposals": [],
        "resolution": "confirmed_current",
        "resolution_note": "Confirmed the existing human-review boundary already covers this; no Current State change needed.",
        "resolved_at": "2026-09-04 10:00:00",
        "resolved_question_id": "q-review",
    },
    {  # shape: Leave unchanged / rejected interpretation -- a real proposal
       # existed, but the human decided current wording already covers it;
       # Evidence is preserved, Current State does not move.
        "id": "demo-review-resolved-leave-unchanged", "review_type": "proposed_update",
        "decision_question": "Should the escalation path explicitly restate that it preserves the assistant's evidence and attempted steps?",
        "why_consequential": "Support asked whether the escalation path needed to spell this out, since it already carries the relevant context forward implicitly.",
        "evidence_id": "demo-review-resolved-leave-unchanged-evidence",
        "evidence_text": "Support workflow review asked whether escalations preserve what the assistant relied on and already tried.",
        "evidence_date": "2026-08-28 13:45:00",
        "proposals": [{"state_item_id": "k-escalation", "operation": "update",
                        "proposed_statement": "Cases that cannot be supported confidently stay with the rep, follow the existing escalation path, and carry forward the relevant evidence and attempted troubleshooting -- restated for clarity.",
                        "rationale": "Support asked whether this needed to be spelled out explicitly."}],
        "resolution": "not_applied",
        "resolution_note": "Current wording already covers this; no change needed.",
        "resolved_at": "2026-08-29 09:00:00",
        "resolved_question_id": None,
    },
]


# Accepted demo transitions make History realistic without pretending the entire
# baseline was individually reviewed. They are only applied to untouched demo
# State items whose statement/version still match the original seed, so real
# user changes are never overwritten.
HISTORY_SCENARIOS = [
    ("pilot-scope", "k-pilot", "The pilot may include a mix of Tier 1 and Tier 2 support workflows.", "The core pilot use case is Tier 1 troubleshooting assistance. AI drafts and assembles context; a support rep reviews before anything customer-facing is sent.", "Discovery narrowed the first pilot to the workflow with the clearest support value and safest review boundary.", "Scope review narrowed the first implementation to Tier 1 troubleshooting with rep review.", "2026-08-18 10:00:00"),
    ("approved-knowledge", "k-grounding", "The assistant may use internal support material and whatever account context is available.", "Troubleshooting guidance is grounded in approved support material and relevant account context when that context is available.", "The team separated approved sources from merely available context so unsupported guidance cannot quietly regain authority.", "Knowledge-source review established that only approved support material should ground troubleshooting guidance.", "2026-08-19 14:30:00"),
    ("password-approval", "k-password", "Password-reset tickets are being evaluated as a possible automation candidate.", "Password-reset tickets are approved for automation, but approval does not by itself establish that automation has been implemented or deployed.", "Security approved the automation direction while implementation status remained separate.", "Security approved password-reset tickets for automation; rollout and implementation were not yet established.", "2026-08-21 11:15:00"),
    ("human-review", "k-security", "The pilot is expected to use human review while the team learns where automation is safe.", "Human review remains required for the pilot. Security wants agreed high-risk failure categories and evidence across them before that boundary is reconsidered.", "Security turned a working expectation into an explicit pilot boundary and defined what evidence would be needed to revisit it.", "Security review confirmed human review for the pilot and asked for evidence across high-risk failure categories before reconsideration.", "2026-08-22 15:20:00"),
    ("data-boundary", "k-data", "The pilot may use customer and account data needed to answer support questions.", "The pilot uses the minimum customer and account data needed for troubleshooting, remains read-only, and avoids account-changing actions in the first implementation.", "The implementation boundary was narrowed to minimum necessary data and read-only behavior.", "Security discovery limited the first implementation to minimum necessary troubleshooting data and read-only access.", "2026-08-23 09:40:00"),
    ("sensitive-actions", "k-sensitive", "Sensitive account actions will be evaluated separately during implementation planning.", "Billing adjustments, ownership changes, refunds, and other sensitive account actions remain outside the assistant's first implementation.", "The team explicitly removed account-changing actions from first-pilot scope instead of leaving them ambiguous.", "Workflow review moved billing adjustments, ownership changes, refunds, and similar actions out of the first implementation.", "2026-08-24 13:05:00"),
    ("slack-source", "k-slack", "Support Slack may be useful as an additional troubleshooting source.", "Support Slack is not an approved retrieval source for the first pilot while ownership, freshness, and data-governance questions remain unresolved.", "A potentially useful source was held out until authority, freshness, and governance could be established.", "Knowledge-source review decided not to use Support Slack in the first pilot until governance questions are resolved.", "2026-08-25 16:45:00"),
    ("evaluation-shape", "k-eval", "Pilot success will primarily be measured by automation rate and response-time improvement.", "The pilot is evaluated with response-time improvement, reviewer edits, escalation behavior, unsupported-claim checks, and failure severity rather than a single automation metric.", "Evaluation expanded from a single efficiency metric to a set that can expose unsafe or low-quality behavior.", "Evaluation planning added reviewer edits, escalation quality, unsupported-claim checks, and failure severity alongside response time.", "2026-08-26 10:25:00"),
    ("training-boundary", "k-training", "Rep enablement will focus on how to access and use the assistant.", "Rep training covers when to use the assistant, what still requires manual verification, how to inspect support for an answer, and how to flag a bad suggestion.", "Training was expanded to teach the human-control boundary, not just feature operation.", "Rollout planning added verification, source inspection, and bad-suggestion reporting to rep training.", "2026-08-27 11:50:00"),
    ("rollout-sequence", "k-rollout", "The assistant may be made available to the broader support team after implementation is ready.", "Rollout begins with a bounded internal pilot before any broader support-team availability is considered.", "The rollout sequence was constrained so evidence from a bounded pilot must precede broader availability.", "Leadership and Support agreed to a bounded internal pilot before considering wider support-team rollout.", "2026-08-28 15:10:00"),
]

ASK_EVIDENCE = [
    ("ask-evidence-security-meeting", "Security review is scheduled for September 3. Agenda: vendor retention terms, pilot access boundaries, and what remains before security approval.", "project_note", "2026-09-02 09:00:00"),
    ("ask-evidence-vendor-retention", "For the pilot environment, retained conversation data is deleted after 30 days.", "vendor_email", "2026-09-01 14:00:00"),
    ("ask-evidence-retrieval-test", "The retrieval prototype completed another internal test with no new safety findings. No pilot-scope decision was made.", "engineering_note", "2026-09-01 16:30:00"),
    ("ask-evidence-demo-noise", "Updated demo copy and spacing on the internal prototype before the portfolio walkthrough.", "project_note", "2026-09-02 08:30:00"),
    ("ask-evidence-tier2-slack", "Tier 2 should be fine to include too - I do not see a problem.", "slack", "2026-09-02 10:15:00"),
]

ASK_RULES = [
    ("rule-ask-slack-authority", "Slack is supporting evidence, not authoritative approval.", "Sources"),
]


# ---------------------------------------------------------------------------
# state.md #114: a second, deliberately non-software seeded project (Juniper
# Office Move), so State's genericity can be tested in the real product
# rather than argued about. Same shapes as Northstar's data above --
# AREAS/ITEMS/QUESTIONS/REVIEWS/RESOLVED_REVIEWS -- with project_id='juniper'
# stamped at insert time by _bootstrap_project(). No AI/pilot/support-rep/
# Tier-1/vendor-retention language anywhere below: if any of that leaks into
# a rendered Juniper page, it came from product code, not this fixture.
# ---------------------------------------------------------------------------
JUNIPER_AREAS = [
    ("facilities", "Location & facilities", "Where the new office is and what it needs to be ready.", 10),
    ("vendors", "Vendors & logistics", "Who is doing the move and what they're responsible for.", 20),
    ("budget", "Budget", "What the move costs and what has been approved.", 30),
    ("timeline", "Timeline & dependencies", "When things happen and what has to be true first.", 40),
]

# id, topic, statement, area_id. area_id is None for the two universal facts.
JUNIPER_ITEMS = [
    ("j-stage", "Project stage", "The lease is signed; vendor selection and furniture ordering are next.", None),
    ("j-outcome", "Project outcome", "Relocate the team to the new office with minimal downtime and no lost equipment.", None),
    ("j-location", "Destination", "The new office is at 400 Harbor Way, Suite 200, a 12,000 sq ft floor.", "facilities"),
    ("j-lease-end", "Current lease end date", "The current lease at the old office ends October 31.", "facilities"),
    ("j-capacity", "Desk capacity", "The new space holds 40 desks, up from 28 at the current office.", "facilities"),
    ("j-constraint", "Facilities constraint", "The building does not allow deliveries or moves outside 7am-7pm on weekdays, or before 9am on weekends.", "facilities"),
    ("j-move-date", "Move date", "The move is scheduled for the weekend of November 8-9.", "timeline"),
    ("j-vendor", "Moving vendor", "Acme Movers is the contracted moving vendor for the relocation weekend.", "vendors"),
    ("j-it-vendor", "IT relocation", "TechMove Logistics handles server rack and network equipment relocation, separate from the general moving vendor.", "vendors"),
    ("j-storage", "Temporary storage", "A temporary storage unit was reserved in case the move date slipped; it is on hold pending final confirmation.", "vendors"),
    ("j-budget-amount", "Approved budget", "The move budget is approved at $85,000, covering moving services, furniture, and IT relocation.", "budget"),
]

JUNIPER_QUESTIONS = [
    ("jq-permit", "When will the occupancy permit for the new office be issued?", 1, "Move-in date confirmation", "Facilities coordination"),
    ("jq-elevator", "Is the freight elevator reserved for the move weekend?", 1, "Moving vendor schedule", "Building management"),
    ("jq-internet", "When will the internet circuit be activated at the new office?", 0, None, "IT planning"),
    ("jq-furniture", "When will the new furniture be delivered relative to the move date?", 0, None, "Vendor coordination"),
    ("jq-badge", "Who is issuing building access badges for the new office?", 0, None, "Facilities coordination"),
    ("jq-parking", "How many parking spots are included in the new lease?", 0, None, "Lease review"),
]

JUNIPER_REVIEWS = [
    {  # shape: update an existing Current State fact
        "id": "demo-juniper-review-vendor-schedule", "review_type": "proposed_update",
        "decision_question": "Should the moving vendor's revised schedule be recorded?",
        "why_consequential": "Acme Movers pushed the load-in window later in the day, which affects the facilities access window.",
        "evidence_id": "demo-juniper-review-vendor-schedule-evidence",
        "evidence_text": "Vendor coordination call: Acme Movers can no longer start load-in before 9am on November 8 due to another job that morning.",
        "evidence_date": "2026-09-05 10:00:00",
        "proposals": [{"state_item_id": "j-vendor", "operation": "update",
                        "proposed_statement": "Acme Movers is the contracted moving vendor for the relocation weekend, with load-in starting no earlier than 9am on November 8.",
                        "rationale": "Acme Movers moved their earliest start time later due to a scheduling conflict."}],
        "resolves_question_ids": [],
    },
    {  # shape: create a new Current State fact, and it also answers an open
       # Question (jq-internet) without that being the review's only point.
        "id": "demo-juniper-review-internet-date", "review_type": "missing_understanding",
        "decision_question": "Is the internet activation date confirmed and ready to be recorded?",
        "why_consequential": "Facilities planning depends on knowing whether connectivity is ready before or after the move.",
        "evidence_id": "demo-juniper-review-internet-date-evidence",
        "evidence_text": "ISP confirmation email: the internet circuit at 400 Harbor Way will be activated November 5.",
        "evidence_date": "2026-09-06 09:30:00",
        "proposals": [{"state_item_id": None, "operation": "create",
                        "proposed_statement": "Internet circuit activation is confirmed for November 5, three days before the move.",
                        "rationale": "The ISP confirmed a specific activation date.",
                        "area_id": "timeline"}],
        "resolves_question_ids": ["jq-internet"],
    },
    {  # shape: state_at_risk / consequential uncertainty without a
       # replacement fact -- pre-linked to the equivalent existing Question
       # (jq-elevator) the same way Northstar's retention example is, so
       # "Keep tracking" preserves it rather than creating a duplicate.
        "id": "demo-juniper-review-elevator", "review_type": "state_at_risk",
        "decision_question": "Is the freight elevator reservation confirmed for the move weekend?",
        "why_consequential": "Building management has not confirmed the elevator reservation; without it the move date may need to shift.",
        "evidence_id": "demo-juniper-review-elevator-evidence",
        "evidence_text": "Building management follow-up: the freight elevator request is logged but not yet confirmed for November 8-9.",
        "evidence_date": "2026-09-06 15:00:00",
        # QA follow-up (2026-09-14): this comment always claimed the pre-link
        # below existed "the same way Northstar's retention example is," but
        # resolves_question_ids was actually left empty -- resolve_review's
        # state_at_risk/keep path only checks for an existing link via
        # review_questions (populated from this list at seed time below), so
        # with no link here it fell through to create_or_find_question(),
        # which only dedupes on exact normalized text -- and this Review's
        # decision_question ("reservation confirmed") doesn't textually match
        # jq-elevator's wording ("reserved"), so a real second Question was
        # created for the same real-world unknown. Listing it here actually
        # links it, closing the gap the comment described but never did.
        "proposals": [], "resolves_question_ids": ["jq-elevator"],
    },
    {  # shape: update an existing fact (budget), a different domain than
       # the other update example above.
        "id": "demo-juniper-review-budget", "review_type": "proposed_update",
        "decision_question": "Should the updated moving budget be recorded?",
        "why_consequential": "Adding IT relocation scope raised the total above the originally approved figure.",
        "evidence_id": "demo-juniper-review-budget-evidence",
        "evidence_text": "Finance approval note: the move budget is increased to $95,000 to cover the added IT relocation scope with TechMove Logistics.",
        "evidence_date": "2026-09-07 11:00:00",
        "proposals": [{"state_item_id": "j-budget-amount", "operation": "update",
                        "proposed_statement": "The move budget is approved at $95,000, covering moving services, furniture, and IT relocation.",
                        "rationale": "Finance approved a budget increase to cover added IT relocation scope."}],
        "resolves_question_ids": [],
    },
    {  # shape: retire an existing Current State fact
        "id": "demo-juniper-review-retire-storage", "review_type": "proposed_update",
        "decision_question": "Should the temporary storage fact be retired now that the move date is confirmed?",
        "why_consequential": "The storage unit was a contingency for a slipped move date; the date is now firm and the contingency no longer applies.",
        "evidence_id": "demo-juniper-review-retire-storage-evidence",
        "evidence_text": "Vendor coordination note: with the November 8-9 date locked, the standby storage unit hold can be released.",
        "evidence_date": "2026-09-07 16:00:00",
        "proposals": [{"state_item_id": "j-storage", "operation": "retire",
                        "proposed_statement": "The temporary storage contingency is no longer needed; the move date is confirmed.",
                        "rationale": "The standby storage unit was only needed if the move date slipped."}],
        "resolves_question_ids": [],
    },
    {  # QA follow-up (2026-09-14): the only seeded open_question Review
       # (Northstar's demo-review-owner-question) was deliberately a dedup
       # case -- it always shows "Link existing Question," so the Create
       # Question path (a genuinely new unknown, no existing match) had no
       # seeded example anywhere to click through. This question's text
       # doesn't match any of JUNIPER_QUESTIONS above, so it exercises that
       # path instead.
        "id": "demo-juniper-review-shredding-question", "review_type": "open_question",
        "decision_question": "Who is responsible for confidential document shredding before the move?",
        "why_consequential": "Old lease files and HR paperwork can't just be boxed and moved; someone needs to own getting them destroyed first.",
        "evidence_id": "demo-juniper-review-shredding-question-evidence",
        "evidence_text": "Office coordinator note: nobody has said who's arranging shredding for the old file cabinets before the move.",
        "evidence_date": "2026-09-08 10:00:00",
        "proposals": [], "resolves_question_ids": [],
        "question_proposal_text": "Who is responsible for confidential document shredding before the move?",
    },
]

JUNIPER_RESOLVED_REVIEWS = [
    {  # shape: Evidence answers an existing Question without requiring a
       # Current State change.
        "id": "demo-juniper-review-resolved-parking", "review_type": "state_at_risk",
        "decision_question": "Does the lease documentation answer how many parking spots are included?",
        "why_consequential": "Legal's lease review already covered this exact question.",
        "evidence_id": "demo-juniper-review-resolved-parking-evidence",
        "evidence_text": "Legal lease review summary: the lease includes 15 reserved parking spots at no additional cost, confirmed in section 4.2.",
        "evidence_date": "2026-09-04 13:00:00",
        "proposals": [],
        "resolution": "confirmed_current",
        "resolution_note": "Lease documentation already answers this; no Current State change needed.",
        "resolved_at": "2026-09-04 14:00:00",
        "resolved_question_id": "jq-parking",
    },
]


def _seed_accepted_history(connection) -> int:
    """Create synthetic but fully linked accepted provenance for untouched demo State."""
    # Same pre-#114 schema guard as _bootstrap_project (this always seeds
    # Northstar, so a fixed 'northstar' literal is correct whenever the
    # column exists at all).
    projects_ready = connection.execute(
        "SELECT 1 FROM schema_migrations WHERE version='013_projects'"
    ).fetchone() is not None
    seeded = 0
    for slug, state_id, before_statement, after_statement, rationale, evidence_text, changed_at in HISTORY_SCENARIOS:
        history_id = f"demo-history-{slug}"
        if connection.execute("SELECT id FROM history_transitions WHERE id=?", (history_id,)).fetchone():
            continue
        state_row = connection.execute(
            "SELECT statement, version, status FROM current_state_items WHERE id=?", (state_id,)
        ).fetchone()
        if not state_row or state_row["status"] != "active" or state_row["version"] != 1 or state_row["statement"] != after_statement:
            continue
        # Do not retrofit provenance onto a State item that already has any real history.
        if connection.execute("SELECT id FROM history_transitions WHERE state_item_id=? LIMIT 1", (state_id,)).fetchone():
            continue
        rid = f"demo-history-review-{slug}"
        pid = f"demo-history-proposal-{slug}"
        eid = f"demo-history-evidence-{slug}"
        connection.execute(
            "INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,'demo_history','processed',?)",
            (eid, evidence_text, changed_at),
        )
        if projects_ready:
            connection.execute(
                "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolution_note,created_at,resolved_at,project_id) "
                "VALUES (?, 'proposed_update', ?, ?, 'resolved', 'updated', 'Accepted in the Northstar demo baseline.', ?, ?, 'northstar')",
                (rid, f"Should Current State update {state_id} based on this reviewed evidence?", rationale, changed_at, changed_at),
            )
        else:
            connection.execute(
                "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolution_note,created_at,resolved_at) "
                "VALUES (?, 'proposed_update', ?, ?, 'resolved', 'updated', 'Accepted in the Northstar demo baseline.', ?, ?)",
                (rid, f"Should Current State update {state_id} based on this reviewed evidence?", rationale, changed_at, changed_at),
            )
        connection.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (rid, eid))
        connection.execute("INSERT INTO review_state_items(review_id,state_item_id) VALUES (?,?)", (rid, state_id))
        connection.execute(
            "INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,created_at,decided_at,operation) "
            "VALUES (?,?,?,?,?,1,'accepted',?,?,'update')",
            (pid, rid, state_id, after_statement, rationale, changed_at, changed_at),
        )
        connection.execute(
            "INSERT INTO history_transitions(id,state_item_id,proposed_change_id,transition_type,old_statement,new_statement,from_version,to_version,changed_at) "
            "VALUES (?,?,?,'updated',?,?,1,2,?)",
            (history_id, state_id, pid, before_statement, after_statement, changed_at),
        )
        connection.execute(
            "UPDATE current_state_items SET version=2, updated_at=? WHERE id=? AND version=1 AND statement=?",
            (changed_at, state_id, after_statement),
        )
        seeded += 1
    return seeded


def _bootstrap_project(connection, *, project_id: str, project_name: str, areas, items, questions, reviews, resolved_reviews,
                        manage_transaction: bool = True, seed_history=None, ask_evidence=(), ask_rules=()) -> dict[str, int]:
    """state.md #114: the shared engine behind bootstrap_demo_data() (Northstar)
    and bootstrap_juniper_demo_data() (Juniper Office Move) -- same insertion
    logic, parameterized by project_id and that project's own AREAS/ITEMS/
    QUESTIONS/REVIEWS/RESOLVED_REVIEWS data, so the two seeded projects can
    never drift into inconsistent seeding behavior. Every insert below is
    stamped with project_id; every idempotency/lookup query filters by it, so
    running this for one project never touches another project's rows.
    """
    counts = {"state": 0, "questions": 0, "reviews": 0, "history": 0, "evidence": 0, "rules": 0}
    if manage_transaction:
        connection.execute("BEGIN IMMEDIATE")
    try:
        # Guard against a pre-#113/#114 schema (migrations 012/013 not yet
        # applied): some tests deliberately seed data at an older schema
        # snapshot to exercise a later initialize_db() migrating it forward
        # (see test_migration_from_existing_sqlite_preserves_history_links_and_reenables_fk).
        # project_areas/area_id/project_id don't exist yet in that snapshot,
        # so fall back to the pre-#113/#114 column set rather than failing to
        # seed at all.
        areas_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='012_project_areas'"
        ).fetchone() is not None
        projects_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='013_projects'"
        ).fetchone() is not None
        if projects_ready:
            connection.execute("INSERT OR IGNORE INTO projects(id, name) VALUES (?, ?)", (project_id, project_name))
        # Same guard, for #112's richer Review gallery: open_question Reviews
        # and proposed_questions need migration 009; review_questions.evidence_id
        # needs migration 010. Both are no-ops (rather than failures) on an
        # older snapshot -- the affected entries simply aren't seeded there,
        # which is fine since nothing has been lost that ever existed.
        open_question_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='009_question_review_proposals'"
        ).fetchone() is not None
        review_question_evidence_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='010_review_questions_evidence_source'"
        ).fetchone() is not None
        proposed_area_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='014_proposed_area'"
        ).fetchone() is not None
        if areas_ready:
            for area_id, name, description, sort_order in areas:
                # QA follow-up (2026-09-14): project_areas.id is a bare
                # global PRIMARY KEY (migration 012), not composite with
                # project_id -- a real scaling risk flagged for whenever a
                # third project is added, since two projects sharing an area
                # id (plausible: "budget", "timeline") would collide. Not
                # fixed here: scoping *this* check by project_id without
                # first making the PK composite would turn today's silent
                # skip into a hard IntegrityError on the INSERT below the
                # moment two projects actually share an id -- worse, not
                # better. The real fix is a schema migration giving
                # project_areas a composite (id, project_id) key before a
                # third project is seeded; deliberately left as a known,
                # documented limitation rather than a half-fix under this
                # pass's time budget. Northstar's and Juniper's own area ids
                # don't collide today, so this doesn't affect either.
                if not connection.execute("SELECT id FROM project_areas WHERE id=?", (area_id,)).fetchone():
                    if projects_ready:
                        connection.execute(
                            "INSERT INTO project_areas(id, name, description, sort_order, project_id) VALUES (?, ?, ?, ?, ?)",
                            (area_id, name, description, sort_order, project_id),
                        )
                    else:
                        connection.execute(
                            "INSERT INTO project_areas(id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                            (area_id, name, description, sort_order),
                        )
        for item_id, topic, statement, area_id in items:
            if areas_ready:
                before = connection.execute("SELECT id, area_id FROM current_state_items WHERE id=?", (item_id,)).fetchone()
            else:
                before = connection.execute("SELECT id FROM current_state_items WHERE id=?", (item_id,)).fetchone()
            if not before:
                if areas_ready and projects_ready:
                    connection.execute(
                        "INSERT INTO current_state_items(id, topic, statement, version, area_id, project_id) VALUES (?, ?, ?, 1, ?, ?)",
                        (item_id, topic, statement, area_id, project_id),
                    )
                elif areas_ready:
                    connection.execute(
                        "INSERT INTO current_state_items(id, topic, statement, version, area_id) VALUES (?, ?, ?, 1, ?)",
                        (item_id, topic, statement, area_id),
                    )
                else:
                    connection.execute(
                        "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
                        (item_id, topic, statement),
                    )
                counts["state"] += 1
            elif areas_ready and area_id and not before["area_id"]:
                # Production incident (2026-09-14): migration 012 added the
                # area_id column, but ALTER TABLE never backfills existing
                # rows -- it only affects inserts from that point forward.
                # A long-lived database (production, seeded well before
                # #113's area work existed) keeps every pre-existing item
                # NULL forever, since this loop only INSERTs a row that
                # doesn't exist yet and never revisits one that does.
                # Ephemeral/frequently-reset databases (every staging QA
                # pass, a fresh local DB) never exposed this -- their rows
                # are always inserted fresh under the current seed_demo.py.
                # This backfills only a row this exact seed already owns
                # and whose area was never set -- never a human edit, since
                # a real Review-driven state change always sets area_id (or
                # leaves it at the deliberate 'general' fallback the human
                # accepted), not NULL.
                connection.execute("UPDATE current_state_items SET area_id=? WHERE id=?", (area_id, item_id))
        if seed_history is not None:
            counts["history"] += seed_history(connection)
        for eid, content, source_type, submitted_at in ask_evidence:
            if not connection.execute("SELECT id FROM evidence WHERE id=?", (eid,)).fetchone():
                if projects_ready:
                    connection.execute(
                        "INSERT INTO evidence(id,content,source_type,processing_status,submitted_at,project_id) VALUES (?,?,?,'processed',?,?)",
                        (eid, content, source_type, submitted_at, project_id),
                    )
                else:
                    connection.execute(
                        "INSERT INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,?,'processed',?)",
                        (eid, content, source_type, submitted_at),
                    )
                counts["evidence"] += 1
        for rule_id, statement, category in ask_rules:
            if not connection.execute("SELECT id FROM project_rules WHERE id=?", (rule_id,)).fetchone():
                if projects_ready:
                    connection.execute(
                        "INSERT INTO project_rules(id,statement,rationale,status,project_id) VALUES (?,?,?,'active',?)",
                        (rule_id, statement, category, project_id),
                    )
                else:
                    connection.execute(
                        "INSERT INTO project_rules(id,statement,rationale,status) VALUES (?,?,?,'active')",
                        (rule_id, statement, category),
                    )
                counts["rules"] += 1
        for qid, text, blocking, blocks, origin in questions:
            before = connection.execute("SELECT id FROM questions WHERE id=?", (qid,)).fetchone()
            if not before:
                if projects_ready:
                    connection.execute(
                        "INSERT INTO questions(id,text,status,blocking,blocks,origin,project_id) VALUES (?,?,'open',?,?,?,?)",
                        (qid, text, blocking, blocks, origin, project_id),
                    )
                else:
                    connection.execute(
                        "INSERT INTO questions(id,text,status,blocking,blocks,origin) VALUES (?,?,'open',?,?,?)",
                        (qid, text, blocking, blocks, origin),
                    )
                counts["questions"] += 1
        for review in reviews:
            rid = review["id"]
            if review["review_type"] == "open_question" and not open_question_ready:
                continue
            if connection.execute("SELECT id FROM review_issues WHERE id=?", (rid,)).fetchone():
                continue
            eid = review["evidence_id"]
            if projects_ready:
                connection.execute(
                    "INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at,project_id) VALUES (?,?,'demo_seed','processed',?,?)",
                    (eid, review["evidence_text"], review["evidence_date"], project_id),
                )
                connection.execute(
                    "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,project_id) VALUES (?,?,?,?,'open',?)",
                    (rid, review["review_type"], review["decision_question"], review["why_consequential"], project_id),
                )
            else:
                connection.execute(
                    "INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,'demo_seed','processed',?)",
                    (eid, review["evidence_text"], review["evidence_date"]),
                )
                connection.execute(
                    "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES (?,?,?,?,'open')",
                    (rid, review["review_type"], review["decision_question"], review["why_consequential"]),
                )
            connection.execute("INSERT OR IGNORE INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (rid, eid))
            for proposal in review["proposals"]:
                state_id = proposal["state_item_id"]
                if state_id:
                    row = connection.execute("SELECT version FROM current_state_items WHERE id=?", (state_id,)).fetchone()
                    if not row:
                        continue
                    connection.execute("INSERT OR IGNORE INTO review_state_items(review_id,state_item_id) VALUES (?,?)", (rid, state_id))
                    expected_version = row["version"]
                else:
                    expected_version = None
                if proposed_area_ready:
                    connection.execute(
                        "INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation,proposed_area_id) VALUES (?,?,?,?,?,?,'pending',?,?)",
                        (f"{rid}-proposal-{state_id or 'new'}", rid, state_id, proposal["proposed_statement"], proposal["rationale"], expected_version, proposal["operation"], proposal.get("area_id")),
                    )
                else:
                    connection.execute(
                        "INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation) VALUES (?,?,?,?,?,?,'pending',?)",
                        (f"{rid}-proposal-{state_id or 'new'}", rid, state_id, proposal["proposed_statement"], proposal["rationale"], expected_version, proposal["operation"]),
                    )
            for qid in review.get("resolves_question_ids", []):
                if connection.execute("SELECT id FROM questions WHERE id=?", (qid,)).fetchone():
                    if review_question_evidence_ready:
                        connection.execute("INSERT OR IGNORE INTO review_questions(review_id,question_id,evidence_id) VALUES (?,?,?)", (rid, qid, eid))
                    else:
                        connection.execute("INSERT OR IGNORE INTO review_questions(review_id,question_id) VALUES (?,?)", (rid, qid))
            if review["review_type"] == "open_question":
                persist_question_proposal(connection, rid, eid, review["question_proposal_text"])
            counts["reviews"] += 1

        for review in resolved_reviews:
            rid = review["id"]
            if connection.execute("SELECT id FROM review_issues WHERE id=?", (rid,)).fetchone():
                continue
            eid = review["evidence_id"]
            if projects_ready:
                connection.execute(
                    "INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at,project_id) VALUES (?,?,'demo_seed','processed',?,?)",
                    (eid, review["evidence_text"], review["evidence_date"], project_id),
                )
                connection.execute(
                    "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolution_note,resolved_at,project_id) "
                    "VALUES (?,?,?,?,'resolved',?,?,?,?)",
                    (rid, review["review_type"], review["decision_question"], review["why_consequential"],
                     review["resolution"], review["resolution_note"], review["resolved_at"], project_id),
                )
            else:
                connection.execute(
                    "INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,'demo_seed','processed',?)",
                    (eid, review["evidence_text"], review["evidence_date"]),
                )
                connection.execute(
                    "INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status,resolution,resolution_note,resolved_at) "
                    "VALUES (?,?,?,?,'resolved',?,?,?)",
                    (rid, review["review_type"], review["decision_question"], review["why_consequential"],
                     review["resolution"], review["resolution_note"], review["resolved_at"]),
                )
            connection.execute("INSERT OR IGNORE INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (rid, eid))
            for proposal in review["proposals"]:
                state_id = proposal["state_item_id"]
                row = connection.execute("SELECT version FROM current_state_items WHERE id=?", (state_id,)).fetchone() if state_id else None
                if state_id and row:
                    connection.execute("INSERT OR IGNORE INTO review_state_items(review_id,state_item_id) VALUES (?,?)", (rid, state_id))
                connection.execute(
                    "INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation,decided_at) "
                    "VALUES (?,?,?,?,?,?,'not_applied',?,?)",
                    (f"{rid}-proposal-{state_id or 'new'}", rid, state_id, proposal["proposed_statement"], proposal["rationale"],
                     row["version"] if row else None, proposal["operation"], review["resolved_at"]),
                )
            resolved_qid = review.get("resolved_question_id")
            if resolved_qid and connection.execute("SELECT id FROM questions WHERE id=? AND status='open'", (resolved_qid,)).fetchone():
                if review_question_evidence_ready:
                    connection.execute("INSERT OR IGNORE INTO review_questions(review_id,question_id,evidence_id) VALUES (?,?,?)", (rid, resolved_qid, eid))
                else:
                    connection.execute("INSERT OR IGNORE INTO review_questions(review_id,question_id) VALUES (?,?)", (rid, resolved_qid))
                connection.execute(
                    "UPDATE questions SET status='resolved', resolved_at=?, resolution='Resolved by reviewed evidence', source_evidence_id=? WHERE id=?",
                    (review["resolved_at"], eid, resolved_qid),
                )
            counts["reviews"] += 1

        if project_id == "northstar":
            # Ask adversarial relationships: the vendor claim is relevant to the open
            # retention Review, which also affects the current data boundary. Linking
            # the blocker makes provenance/action navigation deterministic. (#111:
            # this k-data link is a real cross-reference for Ask's related-item
            # selection, not "the Current State fact this Review challenges" --
            # frontend Review-card display must not conflate the two; see
            # context-backend-sync.js's mapApiReview.)
            if connection.execute("SELECT id FROM review_issues WHERE id='demo-review-retention'").fetchone():
                connection.execute("INSERT OR IGNORE INTO review_evidence(review_id,evidence_id) VALUES ('demo-review-retention','ask-evidence-vendor-retention')")
                connection.execute("INSERT OR IGNORE INTO review_state_items(review_id,state_item_id) VALUES ('demo-review-retention','k-data')")
                connection.execute("INSERT OR IGNORE INTO review_questions(review_id,question_id) VALUES ('demo-review-retention','q-retention')")
        if manage_transaction:
            connection.execute("COMMIT")
    except Exception:
        if manage_transaction:
            connection.execute("ROLLBACK")
        raise
    return counts


def bootstrap_demo_data(connection, *, manage_transaction: bool = True) -> dict[str, int]:
    """Insert missing Northstar demo records without overwriting anything present."""
    return _bootstrap_project(
        connection, project_id="northstar", project_name="Northstar", areas=AREAS, items=ITEMS, questions=QUESTIONS,
        reviews=REVIEWS, resolved_reviews=RESOLVED_REVIEWS, manage_transaction=manage_transaction,
        seed_history=_seed_accepted_history, ask_evidence=ASK_EVIDENCE, ask_rules=ASK_RULES,
    )


def bootstrap_juniper_demo_data(connection, *, manage_transaction: bool = True) -> dict[str, int]:
    """Insert missing Juniper Office Move demo records (state.md #114) without
    overwriting anything present. No accepted-history backfill or Ask
    evidence/rules -- Juniper is a smaller, deliberately non-software fixture
    proving genericity, not a second full Northstar-sized gallery."""
    return _bootstrap_project(
        connection, project_id="juniper", project_name="Juniper Office Move", areas=JUNIPER_AREAS, items=JUNIPER_ITEMS,
        questions=JUNIPER_QUESTIONS, reviews=JUNIPER_REVIEWS, resolved_reviews=JUNIPER_RESOLVED_REVIEWS,
        manage_transaction=manage_transaction,
    )


_PROJECT_DEPENDENT_TABLES = (
    # (table, column-that-scopes-it-to-a-project -- either its own project_id
    # or a subquery through the parent row that has one)
    ("history_transitions", "state_item_id IN (SELECT id FROM current_state_items WHERE project_id=?)"),
    ("proposed_questions", "review_id IN (SELECT id FROM review_issues WHERE project_id=?)"),
    ("review_questions", "review_id IN (SELECT id FROM review_issues WHERE project_id=?)"),
    ("review_state_items", "review_id IN (SELECT id FROM review_issues WHERE project_id=?)"),
    ("review_evidence", "review_id IN (SELECT id FROM review_issues WHERE project_id=?)"),
    ("interpretation_records", "evidence_id IN (SELECT id FROM evidence WHERE project_id=?)"),
    ("proposed_state_changes", "review_id IN (SELECT id FROM review_issues WHERE project_id=?)"),
    ("review_issues", "project_id=?"),
    ("questions", "project_id=?"),
    ("draft_notes", "project_id=?"),
    ("evidence", "project_id=?"),
    ("current_state_items", "project_id=?"),
    ("project_rules", "project_id=?"),
)


def reset_demo_data(connection, project_id: str = "northstar") -> dict[str, int]:
    """Atomically remove session changes and restore one project's curated
    baseline (state.md #114: project_id defaults to 'northstar' so every
    pre-#114 caller keeps resetting exactly what it always reset).

    Deletes only that project's rows -- dependent tables (history_transitions,
    review_questions, etc., which have no project_id column of their own) are
    scoped via a subquery through their project-scoped parent -- so resetting
    Juniper can never touch Northstar's data or vice versa. Delete order still
    matters (dependents first) exactly as before; this only narrows each
    DELETE's WHERE clause, not the order.
    """
    connection.execute("BEGIN IMMEDIATE")
    try:
        # Delete dependents first so this works with both SQLite and PostgreSQL
        # regardless of whether a particular foreign key cascades.
        for table, scope_clause in _PROJECT_DEPENDENT_TABLES:
            connection.execute(f"DELETE FROM {table} WHERE {scope_clause}", (project_id,))
        seeder = bootstrap_demo_data if project_id == "northstar" else bootstrap_juniper_demo_data
        counts = seeder(connection, manage_transaction=False)
        connection.execute("COMMIT")
        return counts
    except Exception:
        connection.execute("ROLLBACK")
        raise


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        database_url = f"sqlite://{os.getenv('DATABASE_PATH', 'data/state.db')}"
    with connect(database_url) as connection:
        initialize_db(connection)
        counts = bootstrap_demo_data(connection)
        juniper_counts = bootstrap_juniper_demo_data(connection)
    print(f"Northstar demo seed complete: {counts}")
    print(f"Juniper Office Move demo seed complete: {juniper_counts}")


if __name__ == "__main__":
    main()
