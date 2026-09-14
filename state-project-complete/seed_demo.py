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


def bootstrap_demo_data(connection, *, manage_transaction: bool = True) -> dict[str, int]:
    """Insert missing demo records without overwriting anything already present."""
    counts = {"state": 0, "questions": 0, "reviews": 0, "history": 0, "evidence": 0, "rules": 0}
    if manage_transaction:
        connection.execute("BEGIN IMMEDIATE")
    try:
        # Guard against a pre-#113 schema (migration 012 not yet applied):
        # some tests deliberately seed data at an older schema snapshot to
        # exercise a later initialize_db() migrating it forward (see
        # test_migration_from_existing_sqlite_preserves_history_links_and_reenables_fk).
        # project_areas/area_id don't exist yet in that snapshot, so fall back
        # to the pre-#113 3-column insert rather than failing to seed at all.
        areas_ready = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version='012_project_areas'"
        ).fetchone() is not None
        if areas_ready:
            for area_id, name, description, sort_order in AREAS:
                if not connection.execute("SELECT id FROM project_areas WHERE id=?", (area_id,)).fetchone():
                    connection.execute(
                        "INSERT INTO project_areas(id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                        (area_id, name, description, sort_order),
                    )
        for item_id, topic, statement, area_id in ITEMS:
            before = connection.execute("SELECT id FROM current_state_items WHERE id=?", (item_id,)).fetchone()
            if not before:
                if areas_ready:
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
        counts["history"] += _seed_accepted_history(connection)
        for eid, content, source_type, submitted_at in ASK_EVIDENCE:
            if not connection.execute("SELECT id FROM evidence WHERE id=?", (eid,)).fetchone():
                connection.execute(
                    "INSERT INTO evidence(id,content,source_type,processing_status,submitted_at) VALUES (?,?,?,'processed',?)",
                    (eid, content, source_type, submitted_at),
                )
                counts["evidence"] += 1
        for rule_id, statement, category in ASK_RULES:
            if not connection.execute("SELECT id FROM project_rules WHERE id=?", (rule_id,)).fetchone():
                connection.execute(
                    "INSERT INTO project_rules(id,statement,rationale,status) VALUES (?,?,?,'active')",
                    (rule_id, statement, category),
                )
                counts["rules"] += 1
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


def reset_demo_data(connection) -> dict[str, int]:
    """Atomically remove session changes and restore the curated Northstar baseline."""
    connection.execute("BEGIN IMMEDIATE")
    try:
        # Delete dependents first so this works with both SQLite and PostgreSQL
        # regardless of whether a particular foreign key cascades.
        for table in (
            "history_transitions",
            "proposed_questions",
            "review_questions",
            "review_state_items",
            "review_evidence",
            "interpretation_records",
            "proposed_state_changes",
            "review_issues",
            "questions",
            "draft_notes",
            "evidence",
            "current_state_items",
            "project_rules",
        ):
            connection.execute(f"DELETE FROM {table}")
        counts = bootstrap_demo_data(connection, manage_transaction=False)
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
    print(f"Northstar demo seed complete: {counts}")


if __name__ == "__main__":
    main()
