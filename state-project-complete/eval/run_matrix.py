#!/usr/bin/env python3
"""Run State's AI eval suites many times on one model, with hard call caps (library: eval/matrix.py).

    python -m eval.run_matrix --suites review,ask --model claude-haiku-5-5 --repeats 10 --max-calls 400 --dry-run
    python -m eval.run_matrix --suite review --model claude-haiku-5-5 --repeat-start 0 --repeat-count 10 \\
        --call-cap 160 --out-dir matrix-results            # PAID: real model calls

--dry-run makes no model calls: it prints the planned calls per suite, the cost estimate and the job
split, and exits 2 when the plan is refused (calls above --max-calls, a model id that is not allowed).
A run writes one JSON file per repeat as soon as that repeat finishes; summarize them with
`python -m eval.aggregate_matrix DIR`. Nothing is posted to Product Analytics.

Like the other eval scripts this loads state-project-complete/.env, so a key in that file makes a
non-dry run real even if the shell has none.
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

from eval.matrix import RUN_DEADLINE_MINUTES, SUITES, PlanError, format_plan, parse_suites, plan, run_shard


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5")
    parser.add_argument("--dry-run", action="store_true", help="plan and budget-check only; no model calls")
    parser.add_argument("--suites", default=",".join(SUITES), help="dry run: comma list of suites")
    parser.add_argument("--repeats", type=int, default=3, help="dry run: repeats per suite")
    parser.add_argument("--max-calls", type=int, default=0, help="dry run: hard cap on planned calls")
    parser.add_argument("--plan-json", metavar="PATH", help="dry run: also write the plan (with the job split) here")
    parser.add_argument("--suite", choices=SUITES, help="run: the suite this job runs")
    parser.add_argument("--repeat-start", type=int, default=0)
    parser.add_argument("--repeat-count", type=int, default=1)
    parser.add_argument("--call-cap", type=int, default=0, help="run: hard cap on model calls in this job")
    parser.add_argument("--out-dir", default="matrix-results")
    parser.add_argument("--deadline-minutes", type=float, default=RUN_DEADLINE_MINUTES)
    parser.add_argument("--baseline-route", choices=("paste", "upload"), default="paste")
    args = parser.parse_args()

    if args.dry_run:
        try:
            result = plan(parse_suites(args.suites), args.model, args.repeats, args.max_calls)
        except PlanError as exc:
            print(f"REFUSED: {exc}")
            return 2
        print(format_plan(result))
        if args.plan_json:
            Path(args.plan_json).write_text(json.dumps(result, indent=2))
        return 2 if result["refusal"] else 0

    if not args.suite or args.call_cap < 1:
        print("A run needs --suite and a positive --call-cap (use --dry-run to plan).")
        return 2
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because these evals measure real model output.")
        return 0
    try:
        summary = run_shard(args.suite, args.model, args.repeat_start, args.repeat_count, args.call_cap,
                            Path(args.out_dir), deadline_minutes=args.deadline_minutes,
                            baseline_route=args.baseline_route)
    except PlanError as exc:
        print(f"REFUSED: {exc}")
        return 2
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
