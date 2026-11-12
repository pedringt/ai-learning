#!/usr/bin/env python3
"""Run the mixed-spec intake measurement (#649) against the real model.

Adds the mixed planning document to a fresh empty project through ordinary intake, `--repeats` times, and
counts what happened to its open item: stated as fact, dropped, raised as a Question or Review, or hedged in
a fact. This is PAID: about one model call per repeat (more if the provider retries).

    python -m eval.run_mixed_spec_intake --dry-run                  # shows the plan; makes NO model calls
    python -m eval.run_mixed_spec_intake --repeats 20 --json /tmp/mixed-spec-intake.json

Note: like the other eval scripts this loads state-project-complete/.env, so a key in that file makes
the script run for real even if the shell has none. Use --dry-run to check things without spending.
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

from eval.mixed_spec_intake import run


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=20, help="runs (default 20)")
    parser.add_argument("--json", metavar="PATH", help="write the detailed report (includes the proposed text)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and the number of paid model calls, then exit without calling the model")
    args = parser.parse_args()

    if args.dry_run:
        print(f"DRY RUN (no model calls): would run the mixed spec through ordinary intake {args.repeats} time(s) "
              f"= {args.repeats} paid model call(s).")
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because this eval measures real model output.")
        return 0

    from anthropic_provider import AnthropicProvider

    provider = AnthropicProvider()
    print(f"Running the mixed spec through ordinary intake {args.repeats} time(s) on {provider.model_identifier}...")
    report = run(provider, args.repeats)
    s = report["summary"]
    ok = s["runs"] - s["failed"]
    print(f"\nmixed_spec_intake ({s['runs']} run(s), {report['elapsed_seconds']}s): failed {s['failed']}")
    print("  open item: " + ", ".join(f"{k.replace('_', ' ')} {v}/{ok}" for k, v in s["outcomes"].items()))
    print(f"  no settled fact proposed {s['no_settled_fact']}/{ok} | existing test would fail {s['legacy_test_fail']}/{ok}")
    for i, r in enumerate(report["runs"], 1):
        if r["failed"]:
            print(f"  run {i}: FAILED ({r['processing_status']})")
        elif r["outcome"] != "raised":
            print(f"  run {i}: {r['outcome']}: {r['stated_as_fact_texts'] or r['hedged_texts'] or r['facts']}")
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote detailed report to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
