"""Manual, live-model product stress test for state.md #105/#109: run the
real Add Evidence path against one large, messy discovery note and manually
inspect what State actually produces.

This is intentionally NOT wired into pytest/CI -- it makes several live
ANTHROPIC_API_KEY calls (one interpretation call, plus a couple of Ask calls
afterward) and is meant to be run a small, deliberate number of times, not as
a routine regression loop (see state.md #105's API-cost guardrail).

Usage (from state-project-complete/, with ANTHROPIC_API_KEY set):
    python3 qa_long_discovery_note_stress_test.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time

from anthropic_provider import AnthropicProvider
from ask_provider import LiveAskProvider
from ask_service import run_ask
from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence
from seed_demo import bootstrap_demo_data

LONG_NOTE = """Notes compiled from this week's discovery sessions (security review,
Tuesday sync, and Thursday leadership check-in), rough and unedited.

Security approved reducing prompt/output retention to 30 days, down from the
current default, as a condition of sign-off; they also separately approved
limiting pilot access to the five named billing-adjacent support agents
instead of the whole support-Tier-1 roster. Two separate approvals, same
security review.

Leadership set the pilot launch date: November 3rd. This is now committed,
not tentative -- it was on the calendar invite send after the call.

Password-reset automation is still approved, same as before, nothing new
there -- just confirming it hasn't changed.

Someone in the Tuesday sync floated maybe extending automation to account
lockouts too, "eventually," but nobody signed off on it and it's not written
into any plan yet, so don't read too much into that.

New operating policy from the security review: the pilot dashboard used by
reps stays read-only, and any new escalation route requires sign-off from
both the security lead and the product lead before it goes live -- these are
two clauses of the same dashboard-and-escalation policy the security review
landed on, not two separate decisions.

Legal flagged something concerning: the vendor's no-training-data claim may
not actually hold up under the specific enterprise contract language we
signed. They're still reviewing the contract and haven't reached a
conclusion, so we don't have a replacement claim yet, just less confidence in
the current one.

Retention question from security review (this answers the open retention
Question from the vendor security review): pilot prompts and outputs are
retained 30 days then purged, per the same approval mentioned above.

Open concern raised by the ops lead, unresolved: if the AI draft provider has
an outage mid-shift, nobody has been assigned to notify reps to fall back to
the fully manual workflow. No owner, no fallback communication process, no
policy change approved.

Leadership also asked a narrower version of the existing human-review
question: specifically, could human review be waived just for low-risk
password-reset responses (not everything), while Security has not agreed to
that yet.

Team lunch got pushed to 12:30 today, conference room double-booked, not
relevant to anything above.

Reminder: the pilot is still Tier 1 troubleshooting only, same scope as
before -- no scope change from any of the above except where explicitly
stated (billing-adjacent agent access is about who can use the assistant on
the security-limited set of tickets, not a change to overall pilot scope).
"""


def main() -> int:
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    try:
        bootstrap_demo_data(connection)
        connection.execute(
            "INSERT INTO evidence(id, content, source_type, processing_status) "
            "VALUES ('e-long-discovery-note', ?, 'manual_note', 'pending')",
            (LONG_NOTE,),
        )
        connection.commit()

        started = time.perf_counter()
        result = process_evidence(connection, evidence_id="e-long-discovery-note", provider=AnthropicProvider())
        elapsed = time.perf_counter() - started

        print(f"processing_status={result.processing_status} elapsed_s={elapsed:.1f}")
        print(f"review_ids ({len(result.review_ids)}): {result.review_ids}")

        for review_id in result.review_ids:
            row = connection.execute(
                "SELECT review_type, decision_question, why_consequential FROM review_issues WHERE id=?",
                (review_id,),
            ).fetchone()
            proposals = connection.execute(
                "SELECT operation, state_item_id, proposed_statement FROM proposed_state_changes WHERE review_id=?",
                (review_id,),
            ).fetchall()
            affected = connection.execute(
                "SELECT state_item_id FROM review_state_items WHERE review_id=?", (review_id,)
            ).fetchall()
            resolves = connection.execute(
                "SELECT question_id FROM review_questions WHERE review_id=?", (review_id,)
            ).fetchall()
            print(f"\n--- {review_id} [{row['review_type']}] ---")
            print(f"decision_question: {row['decision_question']}")
            print(f"why_consequential: {row['why_consequential']}")
            print(f"affected_state_item_ids: {[r['state_item_id'] for r in affected]}")
            print(f"resolves_question_ids: {[r['question_id'] for r in resolves]}")
            for p in proposals:
                print(f"  proposal: {p['operation']} {p['state_item_id']} -> {p['proposed_statement']}")

        record = connection.execute(
            "SELECT structured_result FROM interpretation_records WHERE evidence_id='e-long-discovery-note' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if record and record["structured_result"]:
            parsed = json.loads(record["structured_result"])
            print("\n--- raw model summary/topics ---")
            print(parsed.get("summary"))
            print(parsed.get("topics"))

        if result.review_ids:
            print("\n=== Ask check: does Ask stay grounded with these pending Reviews open? ===")
            ask_provider = LiveAskProvider(AnthropicProvider())
            ask_result = run_ask(
                connection, ask_provider,
                "What is our current retention and access policy for the pilot, and is anything still unresolved?",
            )
            print(json.dumps(ask_result.get("headline"), indent=2))
            print(json.dumps(ask_result.get("summary"), indent=2))
            for section in ask_result.get("sections", []):
                print(f"[{section.get('title')}]")
                for item in section.get("items", []):
                    print(f"  - {item.get('text')}")

        return 0
    finally:
        connection.close()
        db_context.__exit__(None, None, None)


if __name__ == "__main__":
    sys.exit(main())
