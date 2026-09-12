#!/usr/bin/env python3
"""Runnable sequence evaluations (Phase 3). Steps through eval/sequences.py's
multi-event project evolutions against a single persistent database
connection, applying each step's Evidence and (per the step's own
human_decision) resolving the Review it produces, then snapshotting Current
State / open Reviews / open Questions / History after every step.

Same real-provider-gated convention as the rest of eval/: requires a live
ANTHROPIC_API_KEY (loaded from state-project-complete/.env if present, via
eval/harness.py), skips cleanly without one.

Usage (from state-project-complete/):
    python3 -m eval.run_sequences
"""
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, "interpretation_runtime")

from eval.harness import REQUIRES_KEY_REASON  # noqa: E402  (triggers dotenv load)
from eval.sequences import SEQUENCES, Sequence, Step  # noqa: E402

from anthropic_provider import AnthropicProvider  # noqa: E402
from database_migration_backed import get_test_db  # noqa: E402
from interpretation_pipeline_integrated import process_evidence  # noqa: E402
from review_service import list_history, list_questions, list_reviews, list_state, resolve_review  # noqa: E402


def _seed(connection, sequence: Sequence):
    for state_id, (topic, statement) in sequence.initial_state.items():
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (state_id, topic, statement, 1),
        )
    for qid, text, blocking in sequence.initial_questions:
        connection.execute(
            "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', ?)",
            (qid, text, 1 if blocking else 0),
        )
    connection.commit()


def _snapshot(connection, label: str):
    state = list_state(connection)
    reviews = list_reviews(connection, "open")
    questions = list_questions(connection, "open")
    print(f"\n  -- after {label} --")
    print("  Current State:")
    for item in state:
        print(f"    [{item['topic']}] {item['statement']}")
    print(f"  Open Reviews: {len(reviews)}")
    for r in reviews:
        print(f"    - {r.get('review_type', '?')}: {r.get('decision_question') or r.get('summary') or r['id']}")
    print(f"  Open Questions: {len(questions)}")
    for q in questions:
        print(f"    - {q['text']}")


def run_sequence(sequence: Sequence, provider=None) -> bool:
    provider = provider or AnthropicProvider()
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    ok = True
    try:
        print(f"\n{'=' * 70}\nSEQUENCE: {sequence.title}\n{'=' * 70}")
        _seed(connection, sequence)
        _snapshot(connection, "seed")
        for step in sequence.steps:
            print(f"\n--- step {step.id} ---")
            print(f"  Evidence: {step.content}")
            if step.narration:
                print(f"  (why this step matters: {step.narration})")
            for qid, text, blocking in step.new_questions:
                connection.execute(
                    "INSERT INTO questions(id, text, status, blocking) VALUES (?, ?, 'open', ?)",
                    (qid, text, 1 if blocking else 0),
                )
                connection.commit()
            evidence_id = f"e-{sequence.id}-{step.id}"
            connection.execute("INSERT INTO evidence(id, content) VALUES (?, ?)", (evidence_id, step.content))
            connection.commit()
            result = process_evidence(connection, evidence_id=evidence_id, provider=provider)
            if result.processing_status != "succeeded":
                print(f"  PIPELINE ERROR: {result.processing_status}")
                ok = False
                continue
            review_recommended = len(result.review_ids) > 0
            print(f"  Review recommended: {review_recommended} ({len(result.review_ids)} review(s))")
            if step.expect_review is not None and review_recommended != step.expect_review:
                print(f"  ** MISMATCH: expected review_recommended={step.expect_review}, got {review_recommended}")
                ok = False
            if step.human_decision and result.review_ids:
                for review_id in result.review_ids:
                    resolve_review(connection, review_id, step.human_decision)
                    print(f"  Human decision applied: {step.human_decision} ({review_id})")
            _snapshot(connection, step.id)
        history = list_history(connection)
        print(f"\n  Final History entries: {len(history)}")
        return ok
    finally:
        db_context.__exit__(None, None, None)


def main():
    if not os.getenv("ANTHROPIC_API_KEY"):
        print(f"SKIPPED: {REQUIRES_KEY_REASON}")
        return 0
    all_ok = True
    for sequence in SEQUENCES:
        all_ok = run_sequence(sequence) and all_ok
    print(f"\n{'=' * 70}")
    print("ALL SEQUENCES OK" if all_ok else "SOME SEQUENCES HAD MISMATCHES -- see ** MISMATCH lines above")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
