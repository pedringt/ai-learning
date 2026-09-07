# Analytics instrumentation + consequentiality eval dataset -- findings (2026-09-07)

Scope for this session, per the "Next Marching Orders" doc: Phase 1
(analytics instrumentation) and Phase 2 (evaluation dataset), including a
first real run once Paige supplied an API key mid-session -- see "Real
results" below for the two concrete misses that turned up. Phases 3, 5,
and 6 (sequence tests, source-gap experiment, raw-vs-State-context
comparison) were **not** attempted this session -- see "What's still open"
below.

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

## Real results (2026-09-07, same day, once a key became available)

Paige supplied a real `ANTHROPIC_API_KEY` later the same session (via a
gitignored `.env` file, not pasted into chat -- see `eval/harness.py`'s
`load_dotenv()` wiring). First real run of the 33-scenario set:

```
33 evidence events processed in 166.2s
14 should have required review
State surfaced 12 for review
0 additional unnecessary reviews
2 important misses
Precision: 100%
Recall: 86%
```

Zero false positives is good news for review burden -- nothing in this set
made State ask about something it shouldn't have. The two misses are the
finding that matters:

1. **`authority_statement_refunds`** -- this is the *exact* VP-billing
   regression content from `test_evidence_intake_consequentiality.py`
   ("VP says we can move forward on auto drafting billing quesitons").
   Run head-to-head the same session: the **original hand-written test
   passed** (seeded against only its own 2 Current State items), but the
   **identical content, seeded against the eval set's fuller 7-item
   `BASE_STATE` snapshot, failed** (`review_ids` came back empty). Same
   evidence text, same underlying fact pattern, different amount of
   surrounding Current State context -- and the judgment flipped. That's a
   real, reproducible finding, not a fluke of phrasing: **the model's
   consequentiality judgment is sensitive to how much unrelated Current
   State context is in the prompt alongside the actually-relevant item.**
   The original regression test alone would not have caught this, because
   it never puts the boundary-adjacent item in a realistic, busier Current
   State.
2. **`clear_decision_budget`** ("Leadership approved an additional $50k
   budget...") -- a clean, attributed, concrete decision, but about a topic
   (budget) with **no matching Current State item at all** in the seeded
   snapshot. This suggests a second, related failure mode: evidence that
   introduces a genuinely new fact with nothing existing to compare it
   against may be under-triggered, even when it's clearly consequential on
   its own terms (an authority figure making a concrete commitment). The
   original 7-case suite doesn't test this shape of case at all -- every
   one of its scenarios is anchored to an existing Current State item.

Both misses are real findings about the deployed interpretation prompt
(`anthropic_provider.py`), not eval-harness bugs -- the pipeline itself
succeeded (`processing_status == "succeeded"`) in both cases; the model
simply didn't recommend a review.

**No prompt/product change has been made in response to this yet.** Per
the doc's own ordering (findings first, product changes last, and "do not
solve review misses by simply sending everything to Review"), this is
being surfaced as a finding for Paige to weigh in on before touching
`anthropic_provider.py`'s prompt.

## What's still open

**Sequence tests, source-gap experiment, and the raw-vs-State-context
comparison were not started.** These are genuinely separate pieces of work
(the doc's Phases 3, 5, and 6) and would each deserve their own scoped
session rather than being squeezed in here. The eval dataset built this
session is single-event only, by design -- it's the foundation those build
on, not a substitute for them.

**Review-burden measurement (Phase 4) now has a first real number**
(86% recall / 100% precision on this 33-scenario set), but it's one run
against one model, on a dataset skewed toward the categories this session
had time to write. Treat it as a first signal, not a final grade.

## What this does and doesn't tell us yet

This session answers both "does the harness for measuring consequentiality
judgment now exist and run cleanly" (yes) and "is State's actual judgment
good" (mostly -- no false positives, but two concrete, reproducible misses,
one of which reopens a case the project believed was already covered by
regression testing). The context-sensitivity finding in particular is worth
treating as a real product risk: a regression test that only ever seeds a
minimal, hand-picked Current State snapshot can pass while the same
judgment fails in a busier, more realistic one.
