#!/usr/bin/env python3
"""Run the Baseline decomposition eval (#233) against the real model.

Measures how the real model turns a source into a Starting State: failures, expected-fact recall,
number of sections, use of the "General" last-resort area, unresolved items recorded as facts (hedged
mentions are counted apart), years/amounts the source never states, and open items raised. Model output varies, so each source is run several times and the report gives
rates. This is PAID: it makes one real model call per source per repeat (4 sources x --repeats).
It is not part of the release gate; the Deep QA gate only records how a single sample splits.

    python -m eval.run_baseline_decomposition --dry-run                 # shows the plan; makes NO model calls
    python -m eval.run_baseline_decomposition --repeats 3 --json /tmp/baseline-decomposition.json
    python -m eval.run_baseline_decomposition --route upload            # the path Deep QA uses (default: paste)

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

from eval.baseline_decomposition import ROUTES, SCENARIOS, run_scenarios


def _fmt(value):
    return "n/a" if value is None else (f"{value:.0%}" if isinstance(value, float) and value <= 1 else str(value))


def print_report(report: dict) -> None:
    print(f"\nbaseline_decomposition (route: {report.get('route', 'paste')}, {report['repeats']} run(s) per source, {report['elapsed_seconds']}s)")
    for sid, entry in report["scenarios"].items():
        s = entry["summary"]
        print(f"\n  {sid}: {entry['title']}")
        print(f"    failed {_fmt(s['failed_rate'])} | facts {s['facts_mean']} | sections {s['areas_mean']} "
              f"(enough {_fmt(s['enough_areas_rate'])}, 'General' used {_fmt(s['general_used_rate'])})")
        print(f"    expected-fact recall {_fmt(s['recall_mean'])} | unresolved-as-fact {_fmt(s['suspect_rate'])} "
              f"(hedged mention {_fmt(s['hedged_mention_rate'])}) | invented year/amount {_fmt(s['invented_rate'])} "
              f"| open items {s['open_items_mean']} (blocked Confirm {_fmt(s['blocked_confirm_rate'])}, as expected {_fmt(s['open_items_as_expected_rate'])})")
        missed = sorted({m for r in entry["runs"] for m in r["missed"]})
        if missed:
            print(f"    facts missed in at least one run: {', '.join(missed)}")
    o = report["overall"]
    print(f"\n  overall: failed {_fmt(o['failed_rate'])}, recall {_fmt(o['recall_mean'])}, "
          f"enough sections {_fmt(o['enough_areas_rate'])}, 'General' used {_fmt(o['general_used_rate'])}, "
          f"unresolved-as-fact {_fmt(o['suspect_rate'])}, invented year/amount {_fmt(o['invented_rate'])}, Confirm blocked {_fmt(o['blocked_confirm_rate'])}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repeats", type=int, default=3, help="runs per source (default 3)")
    parser.add_argument("--only", nargs="*", help="scenario ids to run (default: all)")
    parser.add_argument("--route", choices=ROUTES, default="paste", help="how the source is submitted (default: paste)")
    parser.add_argument("--json", metavar="PATH", help="write the detailed local report (includes the actual fact text)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and the number of paid model calls, then exit without calling the model")
    args = parser.parse_args()

    scenarios = [s for s in SCENARIOS if not args.only or s.id in args.only]
    if not scenarios:
        print(f"No scenarios match {args.only}; available: {[s.id for s in SCENARIOS]}")
        return 2
    calls = len(scenarios) * args.repeats
    if args.dry_run:
        print(f"DRY RUN (no model calls): would run {len(scenarios)} source(s) x {args.repeats} via the '{args.route}' route "
              f"= {calls} paid model call(s). Sources: {[s.id for s in scenarios]}")
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required because this eval measures real model output.")
        return 0

    from anthropic_provider import AnthropicProvider

    print(f"Running {len(scenarios)} source(s) x {args.repeats} via the '{args.route}' route against the real "
          f"AnthropicProvider ({calls} model call(s))...")
    report = run_scenarios(AnthropicProvider(), scenarios, repeats=args.repeats, route=args.route)
    print_report(report)
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
        print(f"\nWrote detailed report to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
