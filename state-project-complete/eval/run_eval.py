#!/usr/bin/env python3
"""Runnable evaluation mechanism for the State consequentiality eval set
(see eval/scenarios.py). Exercises the REAL AnthropicProvider -- this
measures model judgment quality, not pipeline mechanics -- so it requires a
live ANTHROPIC_API_KEY and skips cleanly (exit 0, clear message) without
one, matching the convention used throughout this test suite.

Usage (from state-project-complete/):
    ANTHROPIC_API_KEY=sk-... python3 -m eval.run_eval
    ANTHROPIC_API_KEY=sk-... python3 -m eval.run_eval --json results.json

Prints a report grouped by category with a precision/recall summary, in
the spirit of the doc's example:

    40 evidence events
    12 should have required review
    State surfaced 11
    2 additional unnecessary Reviews
    1 important miss
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.harness import REQUIRES_KEY_REASON, precision_recall, run_all
from eval.scenarios import SCENARIOS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", metavar="PATH", help="also write a JSON report to this path")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print(f"SKIPPED: {REQUIRES_KEY_REASON}")
        return 0

    print(f"Running {len(SCENARIOS)} scenarios against the real AnthropicProvider...\n")
    start = time.time()
    results = run_all()
    elapsed = time.time() - start

    errored = [r for r in results if r.processing_status == "error"]
    stats = precision_recall(results)

    print(f"{len(results)} evidence events processed in {elapsed:.1f}s")
    print(f"{stats['should_have_reviewed']} should have required review")
    print(f"State surfaced {stats['surfaced_for_review']} for review")
    print(f"{len(stats['false_positives'])} additional unnecessary review(s)")
    print(f"{len(stats['false_negatives'])} important miss(es)")
    if stats["precision"] is not None:
        print(f"Precision: {stats['precision']:.0%}")
    if stats["recall"] is not None:
        print(f"Recall: {stats['recall']:.0%}")
    if errored:
        print(f"\n{len(errored)} scenario(s) errored (pipeline failure, not a judgment result):")
        for r in errored:
            print(f"  - {r.scenario.id}: {r.error}")

    if stats["false_negatives"]:
        print("\n--- MISSES (expected must_review, got no_review) ---")
        for r in stats["false_negatives"]:
            print(f"  [{r.scenario.category}] {r.scenario.id}: {r.scenario.content[:90]}")

    if stats["false_positives"]:
        print("\n--- UNNECESSARY REVIEWS (expected no_review, got must_review) ---")
        for r in stats["false_positives"]:
            print(f"  [{r.scenario.category}] {r.scenario.id}: {r.scenario.content[:90]}")

    ambiguous = [r for r in results if r.scenario.expected == "ambiguous"]
    if ambiguous:
        print("\n--- AMBIGUOUS (no ground truth -- shown for visibility only) ---")
        for r in ambiguous:
            verdict = "reviewed" if r.review_recommended else "not reviewed"
            print(f"  [{r.scenario.category}] {r.scenario.id}: {verdict}")

    print("\n--- BY CATEGORY ---")
    by_category = {}
    for r in results:
        by_category.setdefault(r.scenario.category, []).append(r)
    for category, rs in sorted(by_category.items()):
        wrong = [r for r in rs if not r.matches_expected]
        status = "OK" if not wrong else f"{len(wrong)}/{len(rs)} wrong"
        print(f"  {category}: {len(rs)} scenario(s) -- {status}")

    if args.json:
        payload = {
            "elapsed_seconds": elapsed,
            "summary": {
                "total": len(results),
                "should_have_reviewed": stats["should_have_reviewed"],
                "surfaced_for_review": stats["surfaced_for_review"],
                "precision": stats["precision"],
                "recall": stats["recall"],
            },
            "results": [
                {
                    "id": r.scenario.id,
                    "category": r.scenario.category,
                    "expected": r.scenario.expected,
                    "review_recommended": r.review_recommended,
                    "matches_expected": r.matches_expected,
                    "processing_status": r.processing_status,
                    "error": r.error,
                }
                for r in results
            ],
        }
        Path(args.json).write_text(json.dumps(payload, indent=2))
        print(f"\nWrote JSON report to {args.json}")

    return 1 if (stats["false_negatives"] or errored) else 0


if __name__ == "__main__":
    raise SystemExit(main())
