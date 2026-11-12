"""#567 retention capture (Nov 11): the full answers behind the live authority repro.

Batch E's candidate run flagged "Confirmed retention terms are" in the model-key repro test
(test_ask_pending_review_authority.py), but the test logs only the matched span, so the rest of the answer was lost.
Nov 11: each answer also saves the raw model output and every unit decision the product's checks made (diagnostics()),
and the scenarios batch B2 withheld from can run the same way (run_scenario). This repeats the repro's setup once (demo data, the Legal retention Evidence, intake creates its Review), then asks
its two questions `repeats` times each and keeps every displayed answer whole, with the same deterministic checks the
test runs. Nothing is changed in the check; it is only applied and saved.

A library module: the run script (eval/run_ask_diagnostic.py) loads .env; tests import only this (#224).
"""
from __future__ import annotations

import contextlib
import re
from typing import Any, Iterator

from eval.authority_wording import (
    MANUAL_REVIEW_NOTE, PREMISE_CORRECTED, SETTLED_WORDS, supported_by, unhedged, units, unsupported_conclusions,
    unsupported_settled_words, visible_words,
)

EVIDENCE_ID = "e-retention-repro"
EVIDENCE = ("Legal confirmed vendor retention is 30 days for pilot prompts and outputs, with deletion available on "
            "request.")
CONFIRMED_QUESTION = "What are the confirmed retention terms?"
PREMISE_QUESTION = "Since retention is resolved, what can move forward?"
QUESTIONS = (("confirmed", CONFIRMED_QUESTION), ("premise", PREMISE_QUESTION))
# Batch B2's scenarios that withheld a claim (fixed candidate b7c2788), for the decision log (Nov 11).
WITHHELD_SCENARIOS = (
    "ask_compound_question_keeps_governing_state", "ask_change_summary", "adv_authoritative_pending_wording",
    "adv_conflicting_pending_proposals", "adv_hedged_pending_item", "adv_hypothetical_draft_from_pending",
    "adv_hypothetical_draft_from_pending_v2",
)
# Nov 12: the scenarios where the fresh comparison's over-withholding showed (fixed in 8152820), re-measured.
REMEASURE_SCENARIOS = (
    "adv_authoritative_pending_wording", "ask_evidence_backed_approval_qualified", "ask_current_over_stale",
    "adv_pending_agrees_with_stale_history", "adv_hypothetical_draft_from_pending_v2", "adv_control_paraphrase_not_demoted",
)


def flagged_units(payload: Any, current_state: dict[str, str]) -> list[dict[str, Any]]:
    """Each unit the settled-word check fails, whole, with the spans it matched (the same rule as
    authority_wording.unsupported_settled_words, one unit at a time)."""
    out = []
    for unit in units(payload, current_state):
        spans = [hit for word in SETTLED_WORDS for hit in unhedged(unit.text, word)]
        if spans and not (unit.current_state and supported_by(unit.text, unit.current_state)):
            out.append({"unit": unit.text, "spans": spans, "rests_on_current_state": unit.current_state})
    return out


def check(kind: str, payload: Any, current_state: dict[str, str]) -> dict[str, Any]:
    from ask_display import displayed_lines

    bad = unsupported_settled_words(payload, current_state)
    concluded = unsupported_conclusions(payload, current_state)
    row: dict[str, Any] = {
        "question_kind": kind,
        "displayed": displayed_lines(payload, include_footer=True),
        "settled_word_hits": bad,
        "flagged_units": flagged_units(payload, current_state),
        "manual_review": MANUAL_REVIEW_NOTE if bad else None,
        "unsupported_conclusions": concluded,
        "payload": payload,
    }
    if kind == "premise":
        row["premise_corrected"] = bool(PREMISE_CORRECTED.search(visible_words(payload, current_state)))
    row["passed"] = not bad and not concluded and row.get("premise_corrected", True)
    return row


@contextlib.contextmanager
def diagnostics() -> Iterator[dict[str, Any]]:
    """Collects, for one Ask, the raw model calls (prompt, raw text before any parsing, usage) and every unit decision
    the product's checks made (raw text, basis, cited records, shown / withheld / fallback, reason). The decision log
    exists only on builds that have it (#567 candidate, Nov 11); on others `decisions` stays None, so both sides of a
    comparison run the same capture. Synthetic fixtures only; saved to the eval artifact, never to the dashboard."""
    import ask_service
    from eval.ask_diagnostic_640 import capture_model_calls

    out: dict[str, Any] = {"model_calls": [], "decisions": None}
    log_var = getattr(ask_service, "UNIT_DECISIONS", None)
    token = None
    if log_var is not None:
        out["decisions"] = []
        token = log_var.set(out["decisions"])
    try:
        with capture_model_calls() as calls:
            out["model_calls"] = calls
            yield out
    finally:
        if token is not None:
            log_var.reset(token)


def run_scenario(scenario: Any, provider: Any) -> dict[str, Any]:
    """One quality scenario (eval/ask_quality_scenarios.py) with its diagnostics and the same scores the matrix uses."""
    from ask_display import displayed_lines
    from eval.quality_harness import run_ask_quality_scenario

    with diagnostics() as diag:
        result = run_ask_quality_scenario(scenario, provider)
    answer = result.answer or {}
    return {
        "scenario_id": scenario.id, "question": scenario.question, "passed": result.passed,
        "failed_checks": [name for name, ok in (("required_facts", result.required_facts_ok),
                          ("forbidden_claims", result.forbidden_claims_ok), ("uncertainty", result.uncertainty_ok),
                          ("open_item", result.open_item_ok), ("authority", result.authority_ok)) if not ok],
        "error": result.error, "displayed": displayed_lines(answer, include_footer=True) if answer else [],
        "payload": answer, **diag,
    }


def setup(conn: Any, provider: Any) -> dict[str, Any]:
    """The repro's setup: demo data, the Evidence, intake (up to 3 tries, as in the test)."""
    from interpretation_pipeline_integrated import process_evidence
    from seed_demo import bootstrap_demo_data

    bootstrap_demo_data(conn)
    conn.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (EVIDENCE_ID, EVIDENCE))
    intake = None
    attempts = 0
    for attempts in range(1, 4):
        intake = process_evidence(conn, evidence_id=EVIDENCE_ID, provider=provider)
        if intake.processing_status == "succeeded" and intake.review_ids:
            break
    return {"processing_status": getattr(intake, "processing_status", None),
            "review_ids": list(getattr(intake, "review_ids", None) or []), "attempts": attempts}


def records(conn: Any) -> dict[str, Any]:
    """What Ask could draw on about retention: active Current State, the Reviews and Questions, the Evidence."""
    def rows(sql: str) -> list[dict[str, Any]]:
        return [dict(r) for r in conn.execute(sql).fetchall()]

    return {
        "current_state": rows("SELECT id, statement, status FROM current_state_items WHERE status='active'"),
        "reviews": rows("SELECT * FROM review_issues"),
        "questions": rows("SELECT * FROM questions"),
        "evidence": rows(f"SELECT id, content FROM evidence WHERE id = '{EVIDENCE_ID}'"),
    }
