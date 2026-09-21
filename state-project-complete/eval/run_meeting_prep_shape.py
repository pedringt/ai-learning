#!/usr/bin/env python3
"""Measure, against the real model, how often a meeting-prep answer already has its final shape (#246).

For each project x query x repeat it asks the real model (through the same one-call Ask path the app uses, on the
seeded Northstar and Juniper demo data), takes the model's RAW answer before any trimming, and reports what the
backend would change: items dropped, sections merged or lost, reordering, retitling (see `eval/meeting_prep_shape.py`).
`--prompt both` runs the OLD loose guidance and the NEW generated guidance side by side, everything else identical.

This is PAID: one real model call per project x query x repeat x prompt variant. It is not part of any release gate.

    python -m eval.run_meeting_prep_shape --dry-run --prompt both --repeats 3   # shows the plan; makes NO model calls
    python -m eval.run_meeting_prep_shape --prompt both --repeats 3 --json /tmp/meeting-prep-shape.json

Note: like the other eval scripts this loads state-project-complete/.env, so a key in that file makes the script
run for real even if the shell has none. Use --dry-run to check things without spending.
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

from eval.meeting_prep_shape import PROJECTS, QUERIES
from eval.meeting_prep_shape_run import PROMPTS, _real_ask_provider, print_report, run


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=3, help="runs per project x query (default 3)")
    parser.add_argument("--prompt", choices=PROMPTS, default="new", help="which prompt guidance to measure (default new; both = old and new side by side)")
    parser.add_argument("--json", metavar="PATH", help="write the detailed local report (includes the model's raw answers)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and the number of paid model calls, then exit without calling the model")
    args = parser.parse_args()

    variants = ("legacy", "new") if args.prompt == "both" else (args.prompt,)
    calls = len(PROJECTS) * len(QUERIES) * args.repeats * len(variants)
    if args.dry_run:
        print(f"DRY RUN (no model calls): would run {len(PROJECTS)} project(s) x {len(QUERIES)} query(ies) x {args.repeats} repeat(s) "
              f"x {len(variants)} prompt variant(s) {list(variants)} = {calls} paid model call(s).")
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because this eval measures real model output.")
        return 0

    print(f"Running {calls} model call(s) through the real Ask provider on the seeded demo projects...")
    report = run(_real_ask_provider(), prompt_variants=variants, repeats=args.repeats)
    print_report(report)
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote detailed report to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
