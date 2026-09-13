"""Second half of the #105/#109 long-note stress test: reproduce the exact
Review state qa_long_discovery_note_stress_test.py's live run produced (via
direct SQL, no extra interpretation call) and check Ask against it. Kept as a
separate script so the Ask check doesn't cost a second live interpretation
call on every rerun.
"""
from __future__ import annotations

import json
import sqlite3

from anthropic_provider import AnthropicProvider
from ask_provider import LiveAskProvider
from ask_service import run_ask
from database_migration_backed import get_test_db
from seed_demo import bootstrap_demo_data


def _seed_review(connection, review_id, review_type, decision_question, why_consequential, affected=(), proposals=()):
    connection.execute(
        "INSERT INTO review_issues(id, review_type, decision_question, why_consequential, status) "
        "VALUES (?, ?, ?, ?, 'open')",
        (review_id, review_type, decision_question, why_consequential),
    )
    for state_id in affected:
        connection.execute(
            "INSERT OR IGNORE INTO review_state_items(review_id, state_item_id) VALUES (?, ?)",
            (review_id, state_id),
        )
    for i, (operation, state_item_id, statement) in enumerate(proposals):
        expected_version = 1 if state_item_id else None
        connection.execute(
            "INSERT INTO proposed_state_changes(id, review_id, operation, state_item_id, proposed_statement, "
            "rationale, status, expected_state_version) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
            (f"{review_id}-p{i}", review_id, operation, state_item_id, statement,
             "Reproduced from live stress test.", expected_version),
        )


def main() -> int:
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    try:
        bootstrap_demo_data(connection)

        _seed_review(
            connection, "review_472258a1fdb8", "proposed_update",
            "Pilot launch is committed for November 3rd.",
            "Launch readiness (k-launch) moves from planning-contingent to calendar-committed.",
            affected=["k-launch", "k-stage"],
            proposals=[("update", "k-launch",
                "Pilot launch is committed for November 3rd. Implementation planning must complete agreed "
                "security, access-authority, and evaluation thresholds by that date.")],
        )
        _seed_review(
            connection, "review_9d80a555fdce", "proposed_update",
            "Security approved 30-day retention for pilot prompts and outputs, and limited pilot access to "
            "five named billing-adjacent support agents.",
            "These are concrete security approvals that govern pilot data flow and agent eligibility.",
            affected=["k-data", "k-security"],
            proposals=[
                ("update", "k-data",
                 "The pilot uses the minimum customer and account data needed for troubleshooting, remains "
                 "read-only, avoids account-changing actions, and retains pilot prompts and outputs for 30 "
                 "days before purging (security-approved)."),
                ("update", "k-security",
                 "Human review remains required for the pilot. Security approved 30-day retention and limited "
                 "pilot access to five named billing-adjacent support agents as conditions of sign-off."),
            ],
        )
        _seed_review(
            connection, "review_ded99cb3aa9b", "state_at_risk",
            "Should the vendor's no-training-data claim remain a trusted basis for pilot planning?",
            "Legal flagged that the vendor's stated claim may not survive scrutiny of the signed enterprise contract.",
            affected=["k-data"],
        )
        _seed_review(
            connection, "review_51f25451260f", "open_question",
            "If the AI draft provider experiences an outage during support operations, what process notifies "
            "reps to fall back to fully manual troubleshooting?",
            "Pilot operations lack an assigned owner or fallback communication plan for provider unavailability.",
        )
        _seed_review(
            connection, "review_7a99690ffd4e", "open_question",
            "Should human review be waived for low-risk password-reset responses while retained for other "
            "pilot cases?",
            "Leadership raised a narrower variant of the existing human-review boundary (k-security).",
        )
        connection.commit()

        ask_provider = LiveAskProvider(AnthropicProvider())
        for query in [
            "What is our current retention and access policy for the pilot, and is anything still unresolved?",
            "Has the pilot launch date been decided?",
        ]:
            print(f"\n=== Ask: {query} ===")
            ask_result = run_ask(connection, ask_provider, query)
            print("RAW:", json.dumps(ask_result, indent=2, default=str)[:3000])
            print("headline:", ask_result.get("headline"))
            print("summary:", ask_result.get("summary"))
            for section in ask_result.get("sections", []):
                print(f"[{section.get('title')}]")
                for item in section.get("items", []):
                    print(f"  - {item.get('text')}")
            print("uncertainty_ids:", ask_result.get("uncertainty_ids"))

        return 0
    finally:
        connection.close()
        db_context.__exit__(None, None, None)


if __name__ == "__main__":
    raise SystemExit(main())
