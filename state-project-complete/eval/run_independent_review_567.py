#!/usr/bin/env python3
"""Grade the 28 #567 packet answers with the Ask grader, then compare with Paige's review (eval/independent_review_567.py).

PAID unless --dry-run: one claude-opus-5-5 call per answer. The grader sees no ratings or versions.
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

from eval.independent_review_567 import compare, grade_all, items
from eval.matrix import CallCounter, call_cost


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-calls", type=int, required=True)
    parser.add_argument("--json", metavar="PATH")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    from eval.ask_grader import GRADER_MODEL, GRADER_VERSION, grade_answer

    planned = len(items())
    print(f"Plan: {planned} grades on {GRADER_MODEL} ({GRADER_VERSION}); cap {args.max_calls}")
    if args.dry_run:
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required.")
        return 0
    with CallCounter(args.max_calls) as counter:
        graded = grade_all(grade_answer)
    try:
        cost = round(sum(call_cost(u.get("model") or GRADER_MODEL, u.get("input_tokens"), u.get("output_tokens"))
                         for u in counter.usage), 4)
    except KeyError:
        cost = None
    report = compare(graded)
    print(f"Model calls: {counter.calls} of cap {args.max_calls}; estimated cost {cost}")
    print(f"Agree on {report['agree']}/{report['answers']}; Paige only: {report['paige_only']}; grader only: {report['grader_only']}")
    if args.json:
        Path(args.json).write_text(json.dumps({"grader": GRADER_VERSION, "spend": {"calls": counter.calls, "cost": cost},
                                               "graded": graded, "comparison": report}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
