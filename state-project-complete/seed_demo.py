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

ITEMS = [
    ("k-stage", "Project stage", "Late discovery is nearly complete; implementation planning is next once the remaining launch-critical security, access-authority, and evaluation questions are resolved."),
    ("k-outcome", "Project outcome", "Reduce repetitive support effort without sacrificing response quality or human control."),
    ("k-pilot", "Pilot direction", "The core pilot use case is Tier 1 troubleshooting assistance. AI drafts and assembles context; a support rep reviews before anything customer-facing is sent."),
    ("k-entry", "Workflow fit", "The assistant supports the rep inside the existing troubleshooting workflow rather than replacing the support queue or customer conversation."),
    ("k-grounding", "Approved knowledge", "Troubleshooting guidance is grounded in approved support material and relevant account context when that context is available."),
    ("k-escalation", "Escalation path", "Cases that cannot be supported confidently from available information stay with the rep and follow the existing escalation path."),
    ("k-access", "Feature access", "Standard plan rules are one troubleshooting input, but effective customer access can require account-level confirmation when exceptions exist."),
    ("k-password", "Password reset automation", "Password-reset tickets are approved for automation, but approval does not by itself establish that automation has been implemented or deployed."),
    ("k-login", "Login troubleshooting", "Login and authentication troubleshooting are in the first-pilot scope when the assistant can ground guidance without changing the customer account."),
    ("k-handoff", "Rep handoff", "The assistant should preserve the relevant evidence and attempted troubleshooting when a case is handed back to a rep or escalated."),
    ("k-autonomy", "Autonomy target", "Leadership has asked whether 50% autonomous resolution is achievable, but discovery has not established a safe automation percentage and the first implementation remains human-reviewed."),
    ("k-security", "Human review boundary", "Human review remains required for the pilot. Security wants agreed high-risk failure categories and evidence across them before that boundary is reconsidered."),
    ("k-data", "Data boundary", "The pilot uses the minimum customer and account data needed for troubleshooting, remains read-only, and avoids account-changing actions in the first implementation."),
    ("k-sensitive", "Sensitive actions", "Billing adjustments, ownership changes, refunds, and other sensitive account actions remain outside the assistant's first implementation."),
    ("k-claims", "Unsupported claims", "Unsupported claims about customer configuration, outages, or feature availability are treated as high-risk failures during pilot evaluation."),
    ("k-vip", "VIP exception", "VIP and other specially handled accounts continue through manual support workflows unless a separately reviewed rule establishes otherwise."),
    ("k-slack", "Support Slack", "Support Slack is not an approved retrieval source for the first pilot while ownership, freshness, and data-governance questions remain unresolved."),
    ("k-readonly", "Read-only boundary", "The first implementation may retrieve and synthesize information but may not execute account changes on the customer's behalf."),
    ("k-eval", "Evaluation direction", "The pilot is evaluated with response-time improvement, reviewer edits, escalation behavior, unsupported-claim checks, and failure severity rather than a single automation metric."),
    ("k-launch", "Launch readiness", "Implementation planning can proceed with the bounded use case, but pilot launch still requires agreed thresholds for high-risk failures and escalation behavior."),
    ("k-feedback", "Rep feedback", "Pilot feedback distinguishes harmless edits from corrections that indicate the assistant misunderstood the case or relied on unsupported information."),
    ("k-training", "Rep enablement", "Rep training covers when to use the assistant, what still requires manual verification, how to inspect support for an answer, and how to flag a bad suggestion."),
    ("k-rollout", "Rollout sequence", "Rollout begins with a bounded internal pilot before any broader support-team availability is considered."),
    ("k-sample", "Evaluation sample", "Evaluation includes representative routine cases plus edge cases from the agreed high-risk categories; ticket volume alone does not define the test set."),
    ("k-monitoring", "Pilot monitoring", "Pilot monitoring tracks severe failures and escalation behavior separately from aggregate speed or edit-rate improvements."),
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
]

REVIEWS = [
    ("demo-review-access", "proposed_update", "Should Current State explicitly require account-level confirmation for access exceptions?", "Ticket evidence shows plan rules can diverge from effective account access.", "k-access", "Feature access requires an authoritative account-level check when plan rules and effective entitlements conflict.", "Representative ticket review found grandfathered packages and temporary entitlements that do not match the standard plan matrix."),
    ("demo-review-launch", "proposed_update", "Should launch readiness explicitly require a severe-failure threshold?", "The evaluation plan needs a deterministic launch gate rather than only aggregate quality metrics.", "k-launch", "Pilot launch requires an agreed threshold for severe unsupported-claim failures as well as acceptable escalation behavior.", "Security asked for explicit launch-blocking thresholds for agreed high-risk failure categories."),
    ("demo-review-escalation", "proposed_update", "Should the escalation path preserve the assistant's evidence and attempted steps?", "Support needs enough context to continue safely without repeating the assistant's work.", "k-escalation", "Cases that cannot be supported confidently stay with the rep, follow the existing escalation path, and carry forward the relevant evidence and attempted troubleshooting.", "Support workflow review asked that escalations preserve what the assistant relied on and already tried."),
    ("demo-review-retention", "state_at_risk", "Are the vendor's stated retention terms authoritative enough for pilot planning?", "The vendor described proposed terms, but Security and Legal have not confirmed the agreement.", None, None, "Vendor follow-up described retention and logging behavior that still requires contractual confirmation."),
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

DEMO_EVIDENCE_DATES = {
    "demo-review-access": "2026-08-27 16:10:00",
    "demo-review-launch": "2026-08-28 09:30:00",
    "demo-review-escalation": "2026-08-28 13:45:00",
    "demo-review-retention": "2026-08-29 10:20:00",
}



def _seed_accepted_history(connection) -> int:
    """Create synthetic but fully linked accepted provenance for untouched demo State."""
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


def bootstrap_demo_data(connection) -> dict[str, int]:
    """Insert missing demo records without overwriting anything already present."""
    counts = {"state": 0, "questions": 0, "reviews": 0, "history": 0}
    connection.execute("BEGIN IMMEDIATE")
    try:
        for item in ITEMS:
            before = connection.execute("SELECT id FROM current_state_items WHERE id=?", (item[0],)).fetchone()
            if not before:
                connection.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)", item)
                counts["state"] += 1
        counts["history"] += _seed_accepted_history(connection)
        for qid, text, blocking, blocks, origin in QUESTIONS:
            before = connection.execute("SELECT id FROM questions WHERE id=?", (qid,)).fetchone()
            if not before:
                connection.execute("INSERT INTO questions(id,text,status,blocking,blocks,origin) VALUES (?,?,'open',?,?,?)", (qid,text,blocking,blocks,origin))
                counts["questions"] += 1
        for rid, rtype, question, why, state_id, proposed, evidence_text in REVIEWS:
            if connection.execute("SELECT id FROM review_issues WHERE id=?", (rid,)).fetchone():
                continue
            eid = f"{rid}-evidence"
            connection.execute("INSERT OR IGNORE INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,'demo_seed','processed',?)", (eid,evidence_text,DEMO_EVIDENCE_DATES[rid]))
            connection.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES (?,?,?,?,'open')", (rid,rtype,question,why))
            connection.execute("INSERT OR IGNORE INTO review_evidence(review_id,evidence_id) VALUES (?,?)", (rid,eid))
            if state_id and proposed:
                row=connection.execute("SELECT version FROM current_state_items WHERE id=?",(state_id,)).fetchone()
                if row:
                    connection.execute("INSERT OR IGNORE INTO review_state_items(review_id,state_item_id) VALUES (?,?)",(rid,state_id))
                    connection.execute("INSERT INTO proposed_state_changes(id,review_id,state_item_id,proposed_statement,rationale,expected_state_version,status,operation) VALUES (?,?,?,?,?,?,'pending','update')", (f"{rid}-proposal",rid,state_id,proposed,why,row["version"]))
            counts["reviews"] += 1
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    return counts


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        database_url = f"sqlite://{os.getenv('DATABASE_PATH', 'data/state.db')}"
    with connect(database_url) as connection:
        initialize_db(connection)
        counts = bootstrap_demo_data(connection)
    print(f"Northstar demo seed complete: {counts}")


if __name__ == "__main__":
    main()
