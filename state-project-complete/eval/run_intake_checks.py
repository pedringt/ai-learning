#!/usr/bin/env python3
"""#671 / #673: the intake-injection cases (observe-only) and the one-time analysis of Northstar's seeded Ask notes.

PAID unless --dry-run. Synthetic fixtures and seed text only; the report goes to --json (a workflow artifact), never
to the dashboard.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.env import load_local_env

load_local_env()

from eval.intake_injection import INJECTION_SCENARIOS, injection_passed
from eval.matrix import CallCounter, call_cost, estimated_call_cost
from seed_demo import ASK_EVIDENCE


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--set", choices=("injection", "seed-notes", "both"), default="both")
    parser.add_argument("--repeats", type=int, default=3, help="runs of each injection case")
    parser.add_argument("--seed-repeats", type=int, default=1, help="analyses of the seeded notes")
    parser.add_argument("--max-calls", type=int, required=True)
    parser.add_argument("--json", metavar="PATH")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fake", action="store_true", help="use the deterministic fake provider (no model calls)")
    args = parser.parse_args()

    model = os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5"
    injection = args.set in ("injection", "both")
    seed = args.set in ("seed-notes", "both")
    planned = (len(INJECTION_SCENARIOS) * args.repeats if injection else 0) + (len(ASK_EVIDENCE) * args.seed_repeats if seed else 0)
    print(f"Plan: {planned} intake calls (cap {args.max_calls}); about ${planned * estimated_call_cost('review', model):.4f}, "
          f"ceiling ${args.max_calls * estimated_call_cost('review', model, 'max_output'):.4f} on {model}")
    if args.dry_run:
        return 0
    if args.fake:
        from fake_provider_integrated import FakeProviderIntegrated

        provider = FakeProviderIntegrated()
    elif not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required.")
        return 0
    else:
        from anthropic_provider import AnthropicProvider

        provider = AnthropicProvider()

    report: dict = {"model": model, "ran_at": datetime.now(timezone.utc).isoformat()}
    with CallCounter(args.max_calls) as counter:
        if injection:
            from eval.quality_harness import run_review_quality_scenario

            rows = []
            for scenario in INJECTION_SCENARIOS:
                for run in range(args.repeats):
                    result = run_review_quality_scenario(scenario, provider)
                    ok = injection_passed(result)
                    rows.append({"id": scenario.id, "run": run + 1, "passed": ok, "action": result.observed_action,
                                 "reviews": result.review_recommended, "problems": result.interpretation_problems,
                                 "proposed_state": result.proposed_state_text, "review_prose": result.review_prose,
                                 "error": result.error})
                    print(f"{'PASS' if ok else 'FAIL'} {scenario.id} run {run + 1}: {result.observed_action}"
                          f"{' ' + '; '.join(result.interpretation_problems) if result.interpretation_problems else ''}"
                          f"{' ' + result.error if result.error else ''}")
            report["injection"] = rows
        if seed:
            from eval.seed_note_analysis import analyze_seed_notes

            report["seed_notes"] = []
            for run in range(args.seed_repeats):
                rows = analyze_seed_notes(provider)
                report["seed_notes"] += [dict(row, run=run + 1) for row in rows]
                for row in rows:
                    print(f"run {run + 1} {row['evidence_id']}: {row['processing_status']}, {row['action']}, "
                          f"{', '.join(r['id'] for r in row['reviews']) or 'no Review'}")
    try:
        cost = round(sum(call_cost(u.get("model") or model, u.get("input_tokens"), u.get("output_tokens")) for u in counter.usage), 4)
    except KeyError:
        cost = None
    report["spend"] = {"calls": counter.calls, "call_cap": args.max_calls, "estimated_cost_usd": cost}
    print(f"\nModel calls: {counter.calls} of cap {args.max_calls}; estimated cost ${cost}")
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
