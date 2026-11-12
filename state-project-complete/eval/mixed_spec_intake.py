"""Mixed-spec intake measurement (#649): what ordinary Evidence intake does with an open item.

A planning document can hold settled decisions and an explicit open question at once. Added to an empty
project through ordinary intake (the plain interpretation provider, which uses its bootstrap guidance when
Current State is empty), the model should propose the decisions as facts and raise the open item as a
Question. `test_bootstrap_mixed_spec_eval.py` failed 1 of 7 live runs, but it only saw "no Question", so it
could not tell an open item that was dropped from one that was stated as settled fact.

This module classifies each run instead, with the two failures scored separately (Paige, Nov 11):

- stated_as_fact: a proposed fact mentions the open item without hedging it. The authority-line breach.
- dropped: the open item appears nowhere, neither as a Question or Review nor in any proposed fact.
- raised: a proposed Question, or a Review's decision question, mentions the open item.
- hedged_in_fact: a proposed fact mentions it but reports it as undecided. Neither failure.

stated_as_fact wins over raised when both happen in one run. The matching reuses the Baseline decomposition
eval's keyword matcher and hedge words, so the two measurements read open items the same way.

The mixed spec is the default source. `run` also takes the Baseline eval's other sources that carry an
unresolved item (meeting notes with an open SSO question, a considered but undecided date), so a rate can
be told apart from one document's quirks.

No model calls happen here unless `run` is given a real provider. The paid entry point is
`python -m eval.run_mixed_spec_intake`.
"""
from __future__ import annotations

import sqlite3
import time
from typing import Any, Iterable

from eval.baseline_decomposition import MIXED_SPEC_SOURCE as SOURCE, SCENARIOS, _has_all, _is_hedged


# The open item: any word starting with "group" (grouped, grouping).
OPEN_ITEM: tuple[tuple[str, ...], ...] = (("group*",),)

OUTCOMES = ("stated_as_fact", "dropped", "raised", "hedged_in_fact")

# Baseline eval sources with an unresolved item, by id. Each one's `unresolved` groups name its open item.
INTAKE_SOURCES = {s.id: s for s in SCENARIOS if s.unresolved}


def _mentions(text: str, groups: Iterable[tuple[str, ...]] = OPEN_ITEM) -> bool:
    return any(_has_all(text, group) for group in groups)


def classify(facts: list[str], questions: list[str], review_questions: list[str],
             groups: Iterable[tuple[str, ...]] = OPEN_ITEM) -> dict[str, Any]:
    """Classify one run from the texts it proposed. Pure: no database, no model."""
    groups = tuple(groups)
    unhedged = [f for f in facts if _mentions(f, groups) and not _is_hedged(f)]
    hedged = [f for f in facts if _mentions(f, groups) and _is_hedged(f)]
    raised = [q for q in (*questions, *review_questions) if _mentions(q, groups)]
    if unhedged:
        outcome = "stated_as_fact"
    elif raised:
        outcome = "raised"
    elif hedged:
        outcome = "hedged_in_fact"
    else:
        outcome = "dropped"
    return {
        "outcome": outcome,
        "stated_as_fact_texts": unhedged,
        "raised_texts": raised,
        "hedged_texts": hedged,
        "settled_facts": len(facts),
        # What the existing pass/fail test checks, kept so the two can be compared run by run.
        "legacy_test_pass": bool(facts) and bool(questions),
    }


def read_proposals(connection, review_ids: Iterable[str]) -> tuple[list[str], list[str], list[str]]:
    """(proposed fact statements, proposed Question texts, Review decision questions) for these Reviews."""
    ids = tuple(review_ids)
    if not ids:
        return [], [], []
    marks = ",".join("?" for _ in ids)
    facts = [r[0] for r in connection.execute(
        f"SELECT proposed_statement FROM proposed_state_changes WHERE review_id IN ({marks}) AND status='pending'", ids)]
    questions = [r[0] for r in connection.execute(
        f"SELECT text FROM proposed_questions WHERE review_id IN ({marks}) AND status='pending'", ids)]
    reviews = [r[0] for r in connection.execute(
        f"SELECT decision_question FROM review_issues WHERE id IN ({marks})", ids)]
    return facts, questions, reviews


def run_once(provider, source: str = SOURCE, groups: Iterable[tuple[str, ...]] = OPEN_ITEM) -> dict[str, Any]:
    """One intake of `source` into a fresh empty database, classified."""
    from database_migration_backed import get_test_db
    from interpretation_pipeline_integrated import process_evidence

    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", ("e-mixed-bootstrap-spec", source))
        connection.commit()
        result = process_evidence(connection, evidence_id="e-mixed-bootstrap-spec", provider=provider)
        if result.processing_status != "succeeded":
            return {"failed": True, "processing_status": result.processing_status, "outcome": None}
        facts, questions, reviews = read_proposals(connection, result.review_ids)
        return {"failed": False, "facts": facts, "questions": questions, "review_questions": reviews,
                **classify(facts, questions, reviews, groups)}
    finally:
        db_context.__exit__(None, None, None)


def summarize(runs: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [r for r in runs if not r["failed"]]
    return {
        "runs": len(runs),
        "failed": len(runs) - len(ok),
        "outcomes": {o: sum(1 for r in ok if r["outcome"] == o) for o in OUTCOMES},
        "no_settled_fact": sum(1 for r in ok if r["settled_facts"] == 0),
        "legacy_test_fail": sum(1 for r in ok if not r["legacy_test_pass"]),
    }


def run(provider, repeats: int, source_ids: Iterable[str] = ("mixed_spec",)) -> dict[str, Any]:
    """`repeats` intakes of each source, classified; one summary per source."""
    started = time.time()
    per_source: dict[str, dict[str, Any]] = {}
    for sid in source_ids:
        scenario = INTAKE_SOURCES[sid]
        runs = [run_once(provider, scenario.source, scenario.unresolved) for _ in range(repeats)]
        per_source[sid] = {"title": scenario.title, "summary": summarize(runs), "runs": runs}
    return {"suite": "mixed_spec_intake", "repeats": repeats, "elapsed_seconds": round(time.time() - started, 2),
            "sources": per_source}
