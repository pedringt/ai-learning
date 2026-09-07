#!/usr/bin/env python3
"""Raw context vs. State context comparison (Phase 6 of the "Next Marching
Orders" doc). A controlled comparison: give the same model the same
underlying facts two ways -- as a messy raw chronological dump of the
actual project chatter, versus as the maintained context State actually
produced from that same chatter -- and ask identical questions of both.

To keep this grounded rather than invented, both conditions are built from
REAL output of this session's own work, not authored for the experiment:

- RAW_CORPUS is the exact 6 pieces of Evidence fed into eval/sequences.py's
  Okta sequence, in order, formatted as the kind of chronological chatter
  a raw project dump would actually look like (Slack-style, timestamped).
- STATE_CONTEXT is the actual Current State + open Review text that
  sequence run produced (see eval/run_sequences.py's own printed output),
  formatted the same way context-product-polish.js's buildContextText()
  formats "working context" for Copy Context -- Current State plus
  pending Reviews, not Current State alone, since that's what a real user
  would actually copy out of State.

Uses the same model State's own interpretation pipeline uses
(claude-haiku-4-5-20251001 by default) for a fair, apples-to-apples
comparison, and calls the Anthropic API directly (not process_evidence,
which is evidence-intake-specific) since this is a plain question-
answering comparison, not an interpretation judgment.

Same real-provider-gated convention as the rest of eval/: requires
ANTHROPIC_API_KEY, skips cleanly without one.

Usage (from state-project-complete/):
    python3 -m eval.raw_vs_state_experiment [--json results.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.harness import REQUIRES_KEY_REASON  # noqa: E402 (triggers dotenv load)

MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

RAW_CORPUS = """#eng-architecture, Mon 9:14am -- Dana: proposed Okta as the SSO provider in today's architecture review, as one option among a few.

#client-sync, Tue 3:02pm -- Priya (recapping kickoff call): client said they're leaning toward Okta, but haven't formally signed off.

#client-sync, Thu 11:47am -- Priya: client formally approved Okta as the SSO provider on today's call; it's confirmed.

#security, Fri 4:20pm -- Marcus (Security): found that Okta's proposed integration path doesn't meet our SSO session-timeout requirements as configured.

#client-sync, Mon 9:05am -- Priya: client paused the Okta decision pending a resolution to the session-timeout issue Security raised.

#eng-architecture, Mon 2:40pm -- Dana: started discussing Auth0 as a fallback SSO provider in case the Okta timeout issue can't be resolved quickly."""

# The actual Current State + open Review text eval/run_sequences.py's Okta
# sequence produced this session, formatted the way Copy Context's
# "working" mode formats it (see context-product-polish.js buildContextText).
STATE_CONTEXT = """PROJECT CONTEXT FROM STATE
Use this as maintained project context. CURRENT STATE is accepted project understanding. PENDING REVIEWS are not accepted facts.

CURRENT STATE
- authentication: Okta has been selected as the SSO provider for client integration.

PENDING REVIEWS
- [Needs review] Is Okta definitively selected as the SSO provider, or should Auth0 be considered as an alternative? (state_at_risk -- Security found the approved Okta integration path doesn't meet session-timeout requirements, and the client has since paused the decision pending resolution.)"""

QUESTIONS = [
    "What has been decided about the SSO provider?",
    "Is Okta approved right now?",
    "What remains unresolved?",
    "Can the team proceed with implementing Okta integration this week?",
    "What assumptions should I avoid making about the SSO decision?",
]


def _call(client, system: str, user: str) -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in response.content if hasattr(block, "text"))


def run():
    import anthropic

    client = anthropic.Anthropic()
    results = []
    for question in QUESTIONS:
        raw_answer = _call(
            client,
            system=(
                "You are helping a team understand their project. Below is a raw, "
                "chronological dump of project chatter. Answer the question using only "
                "this material."
            ),
            user=f"{RAW_CORPUS}\n\nQuestion: {question}",
        )
        state_answer = _call(
            client,
            system=(
                "You are helping a team understand their project. Below is their "
                "maintained project context. Answer the question using only this "
                "material."
            ),
            user=f"{STATE_CONTEXT}\n\nQuestion: {question}",
        )
        results.append({"question": question, "raw_context_answer": raw_answer, "state_context_answer": state_answer})
        print(f"\n{'=' * 70}\nQ: {question}\n{'=' * 70}")
        print(f"\n--- RAW CONTEXT ---\n{raw_answer}")
        print(f"\n--- STATE CONTEXT ---\n{state_answer}")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", metavar="PATH", help="write the raw transcript to this path")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print(f"SKIPPED: {REQUIRES_KEY_REASON}")
        return 0

    results = run()
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2))
        print(f"\nWrote transcript to {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
