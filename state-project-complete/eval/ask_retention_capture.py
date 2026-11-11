"""#567 retention capture (Nov 11): the full answers behind the live authority repro.

Batch E's candidate run flagged "Confirmed retention terms are" in the model-key repro test
(test_ask_pending_review_authority.py), but the test logs only the matched span, so the rest of the answer was lost.
This repeats the repro's setup once (demo data, the Legal retention Evidence, intake creates its Review), then asks
its two questions `repeats` times each and keeps every displayed answer whole, with the same deterministic checks the
test runs. Nothing is changed in the check; it is only applied and saved.

A library module: the run script (eval/run_ask_diagnostic.py) loads .env; tests import only this (#224).
"""
from __future__ import annotations

import re
from typing import Any

from eval.authority_wording import (
    SETTLED_WORDS, supported_by, unhedged, units, unsupported_settled_words, visible_words,
)

EVIDENCE_ID = "e-retention-repro"
EVIDENCE = ("Legal confirmed vendor retention is 30 days for pilot prompts and outputs, with deletion available on "
            "request.")
CONFIRMED_QUESTION = "What are the confirmed retention terms?"
PREMISE_QUESTION = "Since retention is resolved, what can move forward?"
PREMISE_CORRECTED = re.compile(r"not\s+(yet\s+)?resolved|isn.t resolved|hasn.t been resolved", re.I)
QUESTIONS = (("confirmed", CONFIRMED_QUESTION), ("premise", PREMISE_QUESTION))


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
    row: dict[str, Any] = {
        "question_kind": kind,
        "displayed": displayed_lines(payload, include_footer=True),
        "settled_word_hits": bad,
        "flagged_units": flagged_units(payload, current_state),
        "payload": payload,
    }
    if kind == "premise":
        row["premise_corrected"] = bool(PREMISE_CORRECTED.search(visible_words(payload, current_state)))
    row["passed"] = not bad and row.get("premise_corrected", True)
    return row


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
