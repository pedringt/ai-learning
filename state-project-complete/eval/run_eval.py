#!/usr/bin/env python3
"""Run State's consequentiality eval set against the real Anthropic provider.

Optional outputs:
- ``--json PATH`` writes a structured report.
- ``--record-url URL`` posts only aggregate eval metrics to State's product
  analytics store. Test-case content and traces are never posted.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.harness import REQUIRES_KEY_REASON, precision_recall, run_all
from eval.scenarios import SCENARIOS


def _trace_suffix(result) -> str:
    return f" [trace {result.trace_id}]" if result.trace_id else ""


def _aggregate_report(results, stats, elapsed):
    errored = [r for r in results if r.processing_status == "error"]
    return {
        "elapsed_seconds": elapsed,
        "summary": {
            "total": len(results),
            "should_have_reviewed": stats["should_have_reviewed"],
            "surfaced_for_review": stats["surfaced_for_review"],
            "precision": stats["precision"],
            "recall": stats["recall"],
            "false_positives": len(stats["false_positives"]),
            "false_negatives": len(stats["false_negatives"]),
            "errors": len(errored),
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
                "trace_id": r.trace_id,
                "trace_path": r.trace_path,
            }
            for r in results
        ],
    }


def _record_aggregate(url: str, key: str, report: dict) -> None:
    summary = report["summary"]
    payload = {
        "suite": "consequentiality",
        "run_kind": "controlled_eval",
        "build": os.getenv("RENDER_GIT_COMMIT", os.getenv("GITHUB_SHA", "local"))[:120],
        "provider": "anthropic",
        "model_identifier": os.getenv("ANTHROPIC_MODEL", "configured-default")[:160],
        "total": summary["total"],
        "precision": summary["precision"],
        "recall": summary["recall"],
        "false_positives": summary["false_positives"],
        "false_negatives": summary["false_negatives"],
        "errors": summary["errors"],
        "high_severity_failures": summary["false_negatives"],
    }
    request = urllib.request.Request(
        url.rstrip("/") + "/api/admin/eval-runs",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-State-Eval-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status >= 300:
            raise RuntimeError(f"Eval ingestion returned HTTP {response.status}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", metavar="PATH", help="also write a JSON report to this path")
    parser.add_argument("--record-url", metavar="URL", help="State API base URL for aggregate eval ingestion")
    parser.add_argument("--record-key", metavar="KEY", help="ingestion key; defaults to STATE_EVAL_INGEST_KEY")
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
    report = _aggregate_report(results, stats, elapsed)

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
            print(f"  - {r.scenario.id}: {r.error}{_trace_suffix(r)}")

    if stats["false_negatives"]:
        print("\n--- MISSES (expected must_review, got no_review) ---")
        for r in stats["false_negatives"]:
            print(f"  [{r.scenario.category}] {r.scenario.id}: {r.scenario.content[:90]}{_trace_suffix(r)}")

    if stats["false_positives"]:
        print("\n--- UNNECESSARY REVIEWS (expected no_review, got must_review) ---")
        for r in stats["false_positives"]:
            print(f"  [{r.scenario.category}] {r.scenario.id}: {r.scenario.content[:90]}{_trace_suffix(r)}")

    ambiguous = [r for r in results if r.scenario.expected == "ambiguous"]
    if ambiguous:
        print("\n--- AMBIGUOUS (no ground truth -- shown for visibility only) ---")
        for r in ambiguous:
            verdict = "reviewed" if r.review_recommended else "not reviewed"
            print(f"  [{r.scenario.category}] {r.scenario.id}: {verdict}{_trace_suffix(r)}")

    print("\n--- BY CATEGORY ---")
    by_category = {}
    for r in results:
        by_category.setdefault(r.scenario.category, []).append(r)
    for category, rs in sorted(by_category.items()):
        wrong = [r for r in rs if not r.matches_expected]
        status = "OK" if not wrong else f"{len(wrong)}/{len(rs)} wrong"
        print(f"  {category}: {len(rs)} scenario(s) -- {status}")

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote JSON report to {args.json}")

    if args.record_url:
        record_key = args.record_key or os.getenv("STATE_EVAL_INGEST_KEY", "")
        if not record_key:
            print("\nEval result was not recorded: STATE_EVAL_INGEST_KEY is not set.")
        else:
            try:
                _record_aggregate(args.record_url, record_key, report)
                print("\nRecorded aggregate eval metrics in State Product Analytics.")
            except Exception as exc:
                print(f"\nWARNING: eval ran, but aggregate analytics ingestion failed: {exc}")

    return 1 if (stats["false_negatives"] or errored) else 0


if __name__ == "__main__":
    raise SystemExit(main())
