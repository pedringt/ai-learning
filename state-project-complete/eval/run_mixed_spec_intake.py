#!/usr/bin/env python3
"""Run the mixed-spec intake measurement (#649) against the real model.

Adds a source with an open item to a fresh empty project through ordinary intake, `--repeats` times, and
counts what happened to the open item: stated as fact, dropped, raised as a Question or Review, or hedged in
a fact. The default source is the mixed planning spec; --only picks others from the Baseline eval's sources
that carry an unresolved item. This is PAID: about one model call per source per repeat (more if the
provider retries).

    python -m eval.run_mixed_spec_intake --dry-run                  # shows the plan; makes NO model calls
    python -m eval.run_mixed_spec_intake --repeats 20 --json /tmp/mixed-spec-intake.json
    python -m eval.run_mixed_spec_intake --only mixed_spec hedged_change decisions_and_open_questions

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

from eval.mixed_spec_intake import INTAKE_SOURCES, run


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=20, help="runs (default 20)")
    parser.add_argument("--only", nargs="*", default=["mixed_spec"], help=f"source ids (default: mixed_spec; available: {sorted(INTAKE_SOURCES)})")
    parser.add_argument("--json", metavar="PATH", help="write the detailed report (includes the proposed text)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and the number of paid model calls, then exit without calling the model")
    args = parser.parse_args()

    unknown = [s for s in args.only if s not in INTAKE_SOURCES]
    if unknown or not args.only:
        print(f"Unknown or no source ids {unknown}; available: {sorted(INTAKE_SOURCES)}")
        return 2
    calls = len(args.only) * args.repeats
    if args.dry_run:
        print(f"DRY RUN (no model calls): would run {len(args.only)} source(s) through ordinary intake {args.repeats} "
              f"time(s) each = {calls} paid model call(s). Sources: {args.only}")
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because this eval measures real model output.")
        return 0

    from anthropic_provider import AnthropicProvider

    provider = AnthropicProvider()
    print(f"Running {args.only} through ordinary intake {args.repeats} time(s) each on {provider.model_identifier} ({calls} call(s))...")
    report = run(provider, args.repeats, args.only)
    print(f"\nmixed_spec_intake ({args.repeats} run(s) per source, {report['elapsed_seconds']}s)")
    for sid, entry in report["sources"].items():
        s = entry["summary"]
        ok = s["runs"] - s["failed"]
        print(f"\n  {sid}: {entry['title']} (failed {s['failed']})")
        print("    open item: " + ", ".join(f"{k.replace('_', ' ')} {v}/{ok}" for k, v in s["outcomes"].items()))
        print(f"    no settled fact proposed {s['no_settled_fact']}/{ok} | existing test would fail {s['legacy_test_fail']}/{ok}")
        for i, r in enumerate(entry["runs"], 1):
            if r["failed"]:
                print(f"    run {i}: FAILED ({r['processing_status']})")
            elif r["outcome"] not in ("raised", "hedged_in_fact"):
                print(f"    run {i}: {r['outcome']}: {r['stated_as_fact_texts'] or r['facts']}")
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote detailed report to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
