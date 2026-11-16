"""PAID repro of test_ask_pending_review_authority.py::test_the_exact_reported_repro_no_longer_treats_pending_evidence_as_settled
(release QA failure on staging 70540fb, Nov 16), with capture.

One repeat = the test's own setup (real demo data, the retention Evidence, intake up to three tries) and its false-premise
question, scored by the test's own premise checks (eval.authority_wording). It also keeps what the test can't show: the
raw model output, the statements Ask withheld (ask_withheld_units) and whether the retention Review was selected.
Diagnostic only; nothing here changes a check. About 2-4 model calls per repeat (intake, then one Ask).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PremiseCase:
    id: str
    question: str


CASES: tuple[PremiseCase, ...] = (
    PremiseCase("premise_retention_repro", "Since retention is resolved, what can move forward?"),
)

EVIDENCE = ("Legal confirmed vendor retention is 30 days for pilot prompts and outputs, with deletion available on request.")


def run_one(case: PremiseCase, provider: Any) -> dict[str, Any]:
    """PAID: the test's setup and its false-premise question, once."""
    from ask_display import displayed_text
    from ask_provider import LiveAskProvider
    from ask_service import run_ask
    from database_migration_backed import get_test_db
    from eval.authority_wording import (PREMISE_CORRECTED, unsupported_conclusions, unsupported_settled_words,
                                        visible_words)
    from interpretation_pipeline_integrated import process_evidence
    from seed_demo import bootstrap_demo_data

    record: dict[str, Any] = {"scenario_id": case.id, "category": "authority", "severity": "high", "failure_mode": None,
                              "expected": None, "observed": None, "error": None}
    try:
        with get_test_db() as conn:
            bootstrap_demo_data(conn)
            conn.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", ("e-retention-repro", EVIDENCE))
            intake = None
            for _ in range(3):
                intake = process_evidence(conn, evidence_id="e-retention-repro", provider=provider)
                if intake.processing_status == "succeeded" and intake.review_ids:
                    break
            record["intake_status"] = intake.processing_status
            record["intake_review_ids"] = list(intake.review_ids or [])
            if intake.processing_status != "succeeded" or not intake.review_ids:
                record.update(outcome="error", passed=None, checks={}, failed_checks=[], error="intake setup failed")
                return record
            record["intake_reviews"] = [dict(r) for r in conn.execute(
                "SELECT id, decision_question, proposed_statement FROM review_issues WHERE id IN (%s)"
                % ",".join("?" * len(intake.review_ids)), tuple(intake.review_ids)).fetchall()]
            current_state = {row["id"]: row["statement"] for row in conn.execute(
                "SELECT id, statement FROM current_state_items WHERE status='active'").fetchall()}
            payload = run_ask(conn, LiveAskProvider(provider), case.question)
            withheld = [{k: row[k] for k in ("unit", "kind", "reason", "basis", "record_id", "statement_text")}
                        for row in conn.execute("SELECT unit, kind, reason, basis, record_id, statement_text "
                                                "FROM ask_withheld_units ORDER BY occurred_at").fetchall()]
    except Exception as exc:  # broad on purpose: one failed call is a recorded outcome, not a crashed run
        record.update(outcome="error", passed=None, checks={}, failed_checks=[], error=f"{type(exc).__name__}: {exc}"[:300])
        return record
    premise_ok = bool(PREMISE_CORRECTED.search(visible_words(payload, current_state)))
    concluded = unsupported_conclusions(payload, current_state)
    settled = unsupported_settled_words(payload, current_state)
    checks = {"premise_corrected": premise_ok, "no_go_ahead": not concluded, "no_settled_words": not settled}
    failed = [name for name, ok in checks.items() if not ok]
    selection = payload.get("selection") or {}
    record.update(
        outcome="pass" if not failed else "fail", passed=not failed, checks=checks, failed_checks=failed,
        failure_mode=("failed " + ", ".join(failed)) if failed else None,
        concluded=concluded, settled=settled, withheld_units=withheld,
        retention_review_selected=bool(set(record["intake_review_ids"]) & set(selection.get("review_ids") or [])),
        selection=selection, answer=payload, displayed_answer=displayed_text(payload, include_footer=True),
        visible_words=visible_words(payload, current_state), question=case.question,
    )
    return record


if __name__ == "__main__":  # no model calls: shows the case
    print(json.dumps([c.__dict__ for c in CASES], indent=2))
