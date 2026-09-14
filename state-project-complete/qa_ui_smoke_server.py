"""Local-only dev server for manually verifying state.md #107/#108's Review
and Add Evidence UI in a real browser against a real (local, throwaway)
backend -- no live model calls, no staging/production traffic. Seeds several
concrete Review scenarios directly via SQL so the #107 click-through doesn't
depend on model judgment or cost API credits.

For #108 (the "Something changed?" -> Add Evidence entry point), a small
deterministic provider stands in for the real interpreter so a genuine
correction and a genuine new fact submitted live through the UI still
produce a real Review through the real pipeline -- without a live model
call. Anything else raises loudly rather than guessing, so an unexpected
submission during exploratory testing doesn't silently produce confusing
output.

Usage: uvicorn qa_ui_smoke_server:app --port 8000
"""
from __future__ import annotations

import sqlite3
import tempfile

from api import Settings, create_app
from database_migration_backed import initialize_db
from db import connect


class _DeterministicProvider:
    """Recognizes the exact #108 QA submissions; raises on anything else."""

    name = "qa-deterministic"
    model_identifier = "qa-deterministic-v1"

    def interpret(self, *, context, evidence):
        content = (evidence.get("content") or "").strip()
        if "launch date was never October 1" in content:
            return {
                "summary": "Corrects the recorded launch date.",
                "topics": ["launch"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "proposed_update",
                    "decision_question": "Should the recorded launch date change to November 3?",
                    "why_consequential": "Evidence directly contradicts the currently maintained launch date.",
                    "affected_state_item_ids": ["k-launch"],
                    "proposed_changes": [{
                        "operation": "update",
                        "state_item_id": "k-launch",
                        "expected_version": 1,
                        "proposed_statement": "Pilot launch is planned for November 3.",
                        "rationale": "Evidence states the October 1 date was never correct.",
                    }],
                }],
            }
        if "approved a rollback plan" in content:
            return {
                "summary": "A new rollback plan was approved; not previously tracked.",
                "topics": ["rollout"],
                "outcome": "review_recommended",
                "review_recommendations": [{
                    "review_action": "create",
                    "review_type": "missing_understanding",
                    "decision_question": "Should the approved rollback plan be tracked?",
                    "why_consequential": "This is a new, concrete decision not yet reflected in Current State.",
                    "affected_state_item_ids": [],
                    "proposed_changes": [{
                        "operation": "create",
                        "proposed_statement": "A rollback plan is approved if the pilot underperforms.",
                        "rationale": "Evidence states this directly.",
                    }],
                }],
            }
        raise RuntimeError(
            f"_DeterministicProvider does not recognize this QA submission: {content[:80]!r}"
        )


_db_path = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
connection = connect(f"sqlite://{_db_path}")
initialize_db(connection)
connection.row_factory = sqlite3.Row


def _state(state_id, topic, statement):
    connection.execute(
        "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
        (state_id, topic, statement),
    )


def _evidence(evidence_id, content):
    connection.execute(
        "INSERT INTO evidence(id, content, source_type, processing_status) VALUES (?, ?, 'manual_note', 'processed')",
        (evidence_id, content),
    )


def _review(review_id, review_type, decision_question, why_consequential, evidence_id):
    connection.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
        "VALUES (?, ?, ?, ?, 'open')",
        (review_id, review_type, decision_question, why_consequential),
    )
    connection.execute(
        "INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
        (review_id, evidence_id),
    )


def _proposal(proposal_id, review_id, operation, state_id, proposed_statement, expected_version=None):
    connection.execute(
        "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, proposed_statement, "
        "rationale, expected_state_version, status) VALUES (?, ?, ?, ?, ?, 'Evidence says so', ?, 'pending')",
        (proposal_id, review_id, operation, state_id, proposed_statement, expected_version),
    )


def _affected(review_id, state_id):
    connection.execute(
        "INSERT INTO review_state_items(review_id, state_item_id) VALUES (?, ?)",
        (review_id, state_id),
    )


def _question(question_id, text, blocking=False):
    connection.execute(
        "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', ?)",
        (question_id, text, 1 if blocking else 0),
    )


def _resolves(review_id, question_id):
    connection.execute(
        "INSERT INTO review_questions(review_id, question_id) VALUES (?, ?)",
        (review_id, question_id),
    )


# 1. Normal single-proposal update.
_state("k-launch", "launch", "Pilot launch is planned for October 1.")
_evidence("e-launch", "Leadership moved the launch to October 15.")
_review("r-normal", "proposed_update", "Should the launch date move to October 15?",
        "Leadership changed the committed launch date.", "e-launch")
_proposal("p-normal", "r-normal", "update", "k-launch", "Pilot launch is planned for October 15.", 1)
_affected("r-normal", "k-launch")

# 4. state_at_risk / uncertainty-only.
_state("k-vendor", "security", "The vendor confirms no training on customer content.")
_evidence("e-risk", "Legal flagged the vendor claim may not hold under the signed contract.")
_review("r-risk", "state_at_risk", "Does the vendor no-training-data claim still hold?",
        "Legal flagged a possible contract conflict; Legal has not concluded.", "e-risk")
_affected("r-risk", "k-vendor")

# 5. Existing Question potentially answered (linked via resolves_question_ids).
_question("q-retention", "What retention terms apply to pilot prompts and outputs?")
_state("k-data", "security", "The pilot retains prompts and outputs with no defined limit.")
_evidence("e-retention", "Security approved 30-day retention for pilot prompts and outputs.")
_review("r-answers-question", "proposed_update", "Should retention move to 30 days?",
        "Security approved 30-day retention, which also answers the open retention Question.", "e-retention")
_proposal("p-retention", "r-answers-question", "update", "k-data",
          "The pilot retains prompts and outputs for 30 days, then purges them.", 1)
_affected("r-answers-question", "k-data")
_resolves("r-answers-question", "q-retention")

# 8. Grouped Review, two proposals from the same security approval.
_state("k-escalation", "workflow", "Escalation follows the existing manual path.")
_state("k-readonly", "workflow", "The pilot may retrieve and synthesize information only.")
_evidence("e-grouped", "Security review: dashboard stays read-only; new escalation routes need dual sign-off.")
_review("r-grouped", "proposed_update", "Should the dashboard/escalation policy require dual sign-off?",
        "One security review approved both the read-only dashboard and dual-signoff escalation rule.", "e-grouped")
_proposal("p-escalation", "r-grouped", "update", "k-escalation",
          "Any new escalation route requires sign-off from both the security lead and the product lead.", 1)
_proposal("p-readonly", "r-grouped", "update", "k-readonly",
          "The pilot dashboard used by reps stays read-only; escalation routes need dual sign-off to change.", 1)
_affected("r-grouped", "k-escalation")
_affected("r-grouped", "k-readonly")

# 6. New Question suggestion (open_question review type).
_evidence("e-question", "Ops raised: no owner is assigned if the AI draft provider has a mid-shift outage.")
connection.execute(
    "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
    "VALUES ('r-question', 'open_question', "
    "'Who is assigned to notify reps of a mid-shift provider outage?', "
    "'No owner or fallback process exists for provider unavailability.', 'open')"
)
connection.execute("INSERT INTO review_evidence(review_id, evidence_id) VALUES ('r-question', 'e-question')")
connection.execute(
    "INSERT INTO proposed_questions(id, review_id, evidence_id, text, status) "
    "VALUES ('qp-1', 'r-question', 'e-question', "
    "'Who is assigned to notify reps of a mid-shift provider outage?', 'pending')"
)

connection.commit()

app = create_app(Settings(database_path=_db_path, provider="anthropic", cors_origins=["*"]), provider=_DeterministicProvider())
print(f"Seeded temp DB at {_db_path}")
print("Scenarios: r-normal (update), r-risk (state_at_risk), r-answers-question (resolves a Question),")
print("r-grouped (2 proposals), r-question (open_question suggestion)")
