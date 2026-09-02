"""Seed the prototype's reviewed Current State into an empty database."""

from __future__ import annotations

import os

from database_migration_backed import initialize_db
from db import connect

ITEMS = [
    ("k-pilot", "Pilot direction", "The first pilot is focused on Tier 1 troubleshooting assistance. AI drafts and assembles context; a support rep reviews before anything customer-facing is sent."),
    ("k-autonomy", "Autonomy target", "Leadership has asked whether 50% autonomous resolution is achievable, but discovery has not established a safe automation percentage and the first implementation is still human-reviewed."),
    ("k-access", "Feature access check", "Standard plan rules are used as one troubleshooting input when checking feature access."),
    ("k-security", "Human review boundary", "Human review remains required for the pilot. Security wants agreed high-risk failure categories and evidence across them before that boundary is reconsidered."),
    ("k-eval", "Evaluation direction", "The pilot will be evaluated with response-time improvement, reviewer edits, escalation behavior, unsupported-claim checks, and failure severity rather than a single automation metric."),
    ("k-data", "Data boundary", "The pilot should use the minimum customer and account data needed for troubleshooting, remain read-only, and avoid account-changing actions in the first implementation."),
    ("k-training", "Rep enablement", "Rep training will be task-based: when to use the assistant, what still requires manual verification, how to inspect support for an answer, and how to flag a bad suggestion."),
    ("k-entry", "Where the assistant fits", "The assistant supports the rep inside the existing troubleshooting workflow rather than replacing the support queue or customer conversation."),
    ("k-grounding", "Grounded answers", "Troubleshooting guidance should be grounded in approved support material and relevant account context when that context is available."),
    ("k-escalation", "Escalation path", "Cases that cannot be supported confidently from available information should stay with the rep and follow the existing escalation path."),
    ("k-sensitive", "Sensitive actions", "Billing adjustments, ownership changes, refunds, and other sensitive account actions remain outside the assistant's first implementation."),
    ("k-claims", "Unsupported claims", "Unsupported claims about customer configuration, outages, or feature availability are treated as high-risk failures during pilot evaluation."),
    ("k-launch", "Launch readiness", "Implementation planning can proceed with the bounded use case, but launch criteria still need agreed thresholds for high-risk failures and escalation behavior."),
    ("k-feedback", "Rep feedback", "Pilot feedback should distinguish harmless edits from corrections that indicate the assistant misunderstood the case or relied on unsupported information."),
]


def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        database_path = os.getenv("DATABASE_PATH", "data/state.db")
        database_url = f"sqlite://{database_path}"

    with connect(database_url) as connection:
        initialize_db(connection)
        if connection.execute("SELECT count(*) AS count FROM current_state_items").fetchone()["count"]:
            raise SystemExit("Refusing to seed: Current State is not empty.")
        connection.execute("BEGIN IMMEDIATE")
        try:
            for item in ITEMS:
                connection.execute(
                    "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, 1)",
                    item,
                )
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise
    print(f"Seeded {len(ITEMS)} Current State items.")


if __name__ == "__main__":
    main()
