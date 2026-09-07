# Analytics instrumentation + consequentiality eval dataset -- findings (2026-09-07)

Scope for this session, per the "Next Marching Orders" doc: Phase 1
(analytics instrumentation) and the start of Phase 2 (evaluation dataset).
Phases 3-6 (sequence tests, review-burden measurement against real results,
source-gap experiment, raw-vs-State-context comparison) were **not**
attempted this session -- see "What's still open" below.

## What shipped

**Analytics** (`implementation-context-prototype/context-analytics.js`):
State's product surface had zero event tracking before this session --
only the portfolio pages had Vercel Web Analytics. Reused that same
lightweight infrastructure (no new dependency) rather than building
anything custom. Tracks `?ref=` attribution, `state_demo_opened`, view
changes, Review accept/reject/open, provenance-opened, orientation-opened,
copy-context-used, and Ask submitted/completed/failed/refinement-used. Ask
query text is real product-research signal per the doc, so it's tracked --
but the Ask State drawer's help text now discloses that up front, and
owner-mode browsing (the same flag already used on the portfolio pages) is
excluded so QA/dev usage doesn't pollute reviewer data. Verified live in a
browser: `?ref=` capture, event firing on real interaction, and the
disclosure text rendering.

**Evaluation dataset** (`state-project-complete/eval/`): grew the existing
7-case consequentiality regression suite into 33 labeled scenarios,
explicitly covering every category the doc named (clear decisions,
tentative suggestions, authority statements, non-authoritative opinions,
direct/implicit contradictions, reversals, superseded/resurfacing
information, duplicates, irrelevant chatter, observations without
decisions, direct/partial/conflicting Question answers, compounding weak
signals, new-fact-changes-state vs. doesn't, and state-at-risk-without-
replacement). 14 must-review, 13 no-review, 6 deliberately ambiguous (not
hard-asserted -- there's no single correct answer for those). Two runnable
mechanisms sit on the same data: `python3 -m eval.run_eval` (a
precision/recall report script) and `test_consequentiality_eval_dataset.py`
(the same scenarios as individual pytest cases, so one failure names one
scenario instead of a lump failure).

## What's still open

**No real judgment results exist yet.** This machine has no
`ANTHROPIC_API_KEY` configured, and the suite is deliberately real-provider-
gated (per the existing convention -- a fake/scripted provider can't tell
you anything about judgment quality). Both `run_eval.py` and the pytest
wrapper confirmed they skip cleanly (exit 0 / pytest skip, not a failure)
without one. **Next concrete step:** run `ANTHROPIC_API_KEY=... python3 -m
eval.run_eval` from `state-project-complete/` locally to get the first real
precision/recall numbers, then decide from those whether prompt/instruction
changes are actually warranted -- per the doc, product changes should follow
evidence, not precede it.

**Sequence tests, source-gap experiment, and the raw-vs-State-context
comparison were not started.** These are genuinely separate pieces of work
(the doc's Phases 3, 5, and 6) and would each deserve their own scoped
session rather than being squeezed in here. The eval dataset built this
session is single-event only, by design -- it's the foundation those build
on, not a substitute for them.

## What this does and doesn't tell us yet

This session answers "does the harness for measuring consequentiality
judgment now exist and run cleanly" -- yes. It does not yet answer "is
State's actual judgment good" -- that needs the eval run against a real
model, which needs a key this environment doesn't have. Treat the 33
scenarios as the instrument, not the result.
