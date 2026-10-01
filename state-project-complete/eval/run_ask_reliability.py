#!/usr/bin/env python3
"""Run the targeted Ask completion-reliability eval against the real model.

This is PAID and is not part of the normal release gate. Each scenario always
makes one fresh live-model call. Only a first-attempt contract failure triggers
one additional retry call.

Use --dry-run first to see the guaranteed and worst-case paid call counts.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.env import load_local_env
load_local_env()

from eval.ask_reliability import QUERIES, run
from eval.meeting_prep_shape_run import _real_ask_provider


def _fmt(value):
    return "n/a" if value is None else (f"{value:.1%}" if isinstance(value, float) else str(value))


def print_report(report: dict) -> None:
    s = report["summary"]
    print(f"\nask_completion_reliability ({s['runs']} fresh runs, {report['elapsed_seconds']}s)")
    print(
        f"  first-attempt valid {_fmt(s['first_attempt_valid_rate'])} | "
        f"contract failures {_fmt(s['contract_failure_rate'])} | "
        f"retry recovery {_fmt(s['retry_recovery_rate'])}"
    )
    print(
        f"  unrecovered {_fmt(s['unrecovered_failure_rate'])} | "
        f"provider errors {_fmt(s['provider_error_rate'])} | model calls {s['model_calls']}"
    )
    for row in report["runs"]:
        if row.get("first_outcome") != "valid":
            detail = row.get("retry_error") or row.get("first_error") or ""
            print(
                f"  {row['query_id']} run {row['attempt'] + 1}: {row['first_outcome']}"
                f"{' -> recovered' if row.get('recovered_on_retry') else ''}"
                f"{' | ' + detail if detail else ''}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=2, help="fresh runs per question (default 2)")
    parser.add_argument("--only", nargs="*", help="query ids to run (default: all)")
    parser.add_argument("--json", metavar="PATH", help="write the detailed reliability report")
    parser.add_argument("--dry-run", action="store_true", help="show paid call counts without calling the model")
    args = parser.parse_args()

    queries = {k: v for k, v in QUERIES.items() if not args.only or k in args.only}
    if not queries:
        print(f"No queries match {args.only}; available: {list(QUERIES)}")
        return 2

    initial_calls = len(queries) * args.repeats
    max_calls = initial_calls * 2
    if args.dry_run:
        print(
            f"DRY RUN (no model calls): {len(queries)} question(s) x {args.repeats} repeat(s) "
            f"= {initial_calls} guaranteed initial paid call(s), with at most {initial_calls} retry call(s) "
            f"if every first attempt misses the contract ({max_calls} calls worst case)."
        )
        print("Questions:", list(queries))
        return 0

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because this eval measures real model reliability.")
        return 0

    report = run(_real_ask_provider(), repeats=args.repeats, queries=queries)
    print_report(report)
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote detailed report to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
