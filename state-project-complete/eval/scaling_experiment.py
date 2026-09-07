#!/usr/bin/env python3
"""Context-dilution scaling experiment, following up on the finding that
the VP-billing regression case passes with a 2-item Current State snapshot
but can fail with a 7-item one. Runs the SAME evidence against increasing
Current State item counts (2, 4, 6, 8, 10), several trials each (per the
confirmed nondeterminism finding -- a single trial per count would be too
noisy to read), to see whether recall actually degrades with item count or
whether the earlier result was mostly noise.

Same real-provider-gated convention as the rest of eval/: requires
ANTHROPIC_API_KEY (loaded from .env via eval.harness), skips cleanly
without one.

Usage (from state-project-complete/):
    python3 -m eval.scaling_experiment [--trials N]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.harness import REQUIRES_KEY_REASON, run_scenario  # noqa: E402
from eval.scenarios import Scenario  # noqa: E402

EVIDENCE = "VP says we can move forward on auto drafting billing quesitons"

# The two directly relevant items (the actual regression), plus a pool of
# unrelated filler items to dilute the context by increasing counts. Filler
# content deliberately spans different topics/domains, like a real matured
# project's Current State would.
RELEVANT_ITEMS = {
    "k-sensitive": (
        "scope",
        "Billing adjustments, ownership changes, refunds, and other sensitive "
        "account actions remain outside the assistant's first implementation.",
    ),
    "k-pilot": (
        "product",
        "The first pilot is focused on basic troubleshooting questions. AI writes "
        "suggested answers using available information; a support rep reviews "
        "before anything customer-facing is sent.",
    ),
}

FILLER_POOL = [
    ("k-password", "automation", "Password-reset tickets are approved for automation, but approval does not by itself establish that automation has been implemented or deployed."),
    ("k-autonomy", "automation", "Leadership has asked whether 50% autonomous resolution is achievable, but discovery has not established a safe automation percentage."),
    ("k-vendor", "security", "The vendor has confirmed customer content is not used to train the underlying model under the proposed enterprise terms."),
    ("k-slack", "data", "Slack conversations are excluded as an evidence source for the first implementation until ownership, freshness, and governance are resolved."),
    ("k-escalation", "product", "Tickets the assistant cannot answer confidently are escalated to a human rep rather than answered with a low-confidence guess."),
    ("k-training", "workflow", "Reps receive task-based training on using suggested answers, verifying content, and flagging incorrect suggestions."),
    ("k-metrics", "evaluation", "Success is judged with response time, reviewer edit rate, escalation behavior, and unsupported-claim checks, not a single automation-rate metric."),
    ("k-rollout", "product", "The pilot rolls out to one support team first before any broader rollout is considered."),
]


def scenario_for(item_count: int, trial: int) -> Scenario:
    items = dict(RELEVANT_ITEMS)
    for state_id, topic, statement in FILLER_POOL[: max(0, item_count - len(RELEVANT_ITEMS))]:
        items[state_id] = (topic, statement)
    return Scenario(
        id=f"scaling_{item_count}items_trial{trial}",
        category="scaling_experiment",
        content=EVIDENCE,
        state_items=items,
        expected="must_review",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trials", type=int, default=5, help="trials per item count (default 5)")
    parser.add_argument("--counts", type=int, nargs="+", default=[2, 4, 6, 8, 10])
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print(f"SKIPPED: {REQUIRES_KEY_REASON}")
        return 0

    print(f"Running {EVIDENCE!r} at item counts {args.counts}, {args.trials} trials each...\n")
    rows = []
    for count in args.counts:
        hits = 0
        for trial in range(args.trials):
            scenario = scenario_for(count, trial)
            result = run_scenario(scenario)
            if result.processing_status != "succeeded":
                print(f"  [{count} items, trial {trial}] PIPELINE ERROR: {result.error}")
                continue
            hits += 1 if result.review_recommended else 0
            print(f"  [{count} items, trial {trial}] review_recommended={result.review_recommended}")
        recall = hits / args.trials
        rows.append((count, hits, args.trials, recall))
        print(f"  -> {count} items: {hits}/{args.trials} caught it ({recall:.0%})\n")

    print("=" * 50)
    print("SUMMARY")
    print("=" * 50)
    for count, hits, trials, recall in rows:
        bar = "#" * hits + "." * (trials - hits)
        print(f"  {count:>2} items: {bar}  {hits}/{trials} ({recall:.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
