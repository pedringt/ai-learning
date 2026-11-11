#!/usr/bin/env python3
"""Run the #640 Ask diagnostic (eval/ask_diagnostic_640.py): each variant `--repeats` times, one Ask call per run.

PAID unless --dry-run. Every answer is saved in full to --json (synthetic fixtures only; never sent to the dashboard).
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

from eval.ask_diagnostic_640 import run_variant, step1_cases, variants
from eval.matrix import CallCounter, call_cost, estimated_call_cost


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--max-calls", type=int, required=True)
    parser.add_argument("--json", metavar="PATH")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--set", choices=("640", "step1", "one", "retention"), default="640",
                        help="640: the Nov 7 cause diagnostic; step1: the headline rule check; one: the #640 scenario alone, to capture one answer; "
                             "retention: the #567 live authority repro's two questions, every answer saved whole")
    args = parser.parse_args()
    if args.set == "retention":
        return retention(args)
    cases = step1_cases() if args.set == "step1" else step1_cases()[:1] if args.set == "one" else variants()

    model = os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5"
    planned = len(cases) * args.repeats
    print(f"Plan: {len(cases)} variants x {args.repeats} repeats = {planned} Ask calls (cap {args.max_calls}); "
          f"about ${planned * estimated_call_cost('ask', model):.4f}, "
          f"ceiling ${args.max_calls * estimated_call_cost('ask', model, 'max_output'):.4f} on {model}")
    for v in cases:
        print(f"  {v.id} ({v.kind}): {v.tests}. Question: {v.scenario.question}")
    if args.dry_run:
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required.")
        return 0

    from anthropic_provider import AnthropicProvider

    provider = AnthropicProvider()
    rows = []
    with CallCounter(args.max_calls) as counter:
        for v in cases:
            for repeat in range(args.repeats):
                rows.append({**run_variant(v, provider), "repeat": repeat})
                print(f"{v.id} #{repeat}: passed={rows[-1]['passed']} raw==final={rows[-1]['raw_matches_final_headline']} | {rows[-1]['headline']}")
    model_id = getattr(provider, "model_identifier", model)
    try:
        cost = round(sum(call_cost(u.get("model") or model_id, u.get("input_tokens"), u.get("output_tokens")) for u in counter.usage), 4)
    except KeyError:
        cost = None
    print(f"\nModel calls: {counter.calls} of cap {args.max_calls}; estimated cost {cost} (usage x list price)")
    if args.json:
        Path(args.json).write_text(json.dumps({
            "diagnostic": "#640 " + args.set, "synthetic_fixtures_only": True, "model": model_id,
            "build": os.getenv("GITHUB_SHA", "local")[:40], "started_at": datetime.now(timezone.utc).isoformat(),
            "spend": {"calls": counter.calls, "call_cap": args.max_calls, "estimated_cost_usd": cost},
            "runs": rows,
        }, indent=2, default=str))
    return 0


def retention(args: argparse.Namespace) -> int:
    """#567 (Nov 11): the live authority repro's setup once, then each of its two questions `--repeats` times."""
    from eval.ask_retention_capture import QUESTIONS, check, records, setup

    model = os.getenv("CLAUDE_MODEL") or "claude-haiku-5-5"
    planned = len(QUESTIONS) * args.repeats
    print(f"Plan: intake once (up to 3 tries) + {len(QUESTIONS)} questions x {args.repeats} repeats = {planned} Ask "
          f"calls (cap {args.max_calls}, intake included); ceiling "
          f"${args.max_calls * estimated_call_cost('ask', model, 'max_output'):.4f} on {model}")
    for kind, question in QUESTIONS:
        print(f"  {kind}: {question}")
    if args.dry_run:
        return 0
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("SKIPPED: ANTHROPIC_API_KEY is required.")
        return 0

    from anthropic_provider import AnthropicProvider
    from ask_provider import LiveAskProvider
    from ask_service import run_ask
    from database_migration_backed import get_test_db

    provider = AnthropicProvider()
    ask_provider = LiveAskProvider(provider)
    rows: list[dict] = []
    with CallCounter(args.max_calls) as counter, get_test_db() as conn:
        intake = setup(conn, provider)
        print(f"Intake: {intake}")
        current_state = {r["id"]: r["statement"] for r in conn.execute(
            "SELECT id, statement FROM current_state_items WHERE status='active'").fetchall()}
        given = records(conn)
        if intake["processing_status"] == "succeeded" and intake["review_ids"]:
            for kind, question in QUESTIONS:
                for repeat in range(args.repeats):
                    try:
                        row = check(kind, run_ask(conn, ask_provider, question), current_state)
                    except Exception as exc:  # a failed call is recorded, not retried
                        row = {"question_kind": kind, "error": f"{type(exc).__name__}: {exc}"[:300], "passed": False}
                    rows.append({**row, "question": question, "repeat": repeat})
                    print(f"{kind} #{repeat}: passed={row['passed']} flagged={[u['unit'] for u in row.get('flagged_units', [])]}")
    model_id = getattr(provider, "model_identifier", model)
    try:
        cost = round(sum(call_cost(u.get("model") or model_id, u.get("input_tokens"), u.get("output_tokens")) for u in counter.usage), 4)
    except KeyError:
        cost = None
    print(f"\nModel calls: {counter.calls} of cap {args.max_calls}; estimated cost {cost} (usage x list price)")
    if args.json:
        Path(args.json).write_text(json.dumps({
            "diagnostic": "#567 retention", "synthetic_fixtures_only": True, "model": model_id,
            "build": os.getenv("GITHUB_SHA", "local")[:40], "started_at": datetime.now(timezone.utc).isoformat(),
            "spend": {"calls": counter.calls, "call_cap": args.max_calls, "estimated_cost_usd": cost},
            "intake": intake, "records": given, "current_state_used_by_check": current_state, "runs": rows,
        }, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
