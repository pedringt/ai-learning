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

**Root cause of the context-sensitivity finding:** `capture_context()` in
`interpretation_pipeline_integrated.py` (lines 134-142) selects **every**
`current_state_items` row with `status='active'`, unconditionally -- there
is no relevance filter, ranking, or truncation before it goes into
`anthropic_provider.py`'s `_build_prompt()`. So the miss is not a
selection/retrieval bug; every item is always shown to the model. The
VP-billing case flipping from pass (2 items shown) to miss (7 items shown)
is a pure in-context-distraction effect -- more unrelated Current State
competing for the model's attention lowers the odds it flags the one
boundary-adjacent item. This is a real scalability concern, not a one-off:
Current State is designed to only grow over a project's life, so this
exact failure mode should get *more* likely over time on a real project,
not less. No fix has been attempted yet -- this needs its own evaluation
(does the miss rate scale with item count? does reordering/grouping
related items help? does a two-pass "which items are even relevant"
step help?) before touching the prompt.

**No prompt/product change has been made in response to this yet.** Per
the doc's own ordering (findings first, product changes last, and "do not
solve review misses by simply sending everything to Review"), this is
being surfaced as a finding for Paige to weigh in on before touching
`anthropic_provider.py`'s prompt.

## Sequence evaluations (Phase 3), run the same session

Added `eval/sequences.py` + `eval/run_sequences.py`: two realistic
multi-step project evolutions, run against a single persistent DB
connection so Current State/Reviews/Questions/History can be inspected
after every step (not just at the end). Both ran against the real
provider, with a simulated human accepting each review per the step's
own scripted decision.

**Sequence 1 -- Okta proposal -> approval -> security problem -> pause ->
alternative** (the exact shape the doc asked for). Steps 1-3 behaved
correctly: two non-committal proposal/leaning-toward steps produced no
review, and the formal approval did, correctly updating Current State to
"Okta has been selected." Step 6 (team discussing Auth0 as a fallback)
correctly landed as an open `state_at_risk` review rather than silently
overwriting anything -- exactly the intended "flag it, don't silently
resolve it" behavior.

**Step 5 is a real finding.** The evidence was "The client paused the
Okta decision pending a resolution to the session-timeout issue Security
raised" -- an explicit, unambiguous status change. The model classified
this as `state_at_risk` with **no proposed replacement fact**, which is
correct per the prompt's own instructions ("state_at_risk... normally
emit no proposal") -- so accepting the review left Current State reading
**"Okta has been selected as the SSO provider for client integration"
unchanged**, even after the decision had been explicitly paused. The
Review itself does correctly exist and flag the risk, so a human working
Open Items would see it -- but anyone reading Current State's headline
fact alone at that point would be misled into thinking Okta is still the
active decision. This is a real, narrow judgment-quality gap, not a
pipeline bug: "paused" is a strong enough status change that it plausibly
warranted its own proposed_update (e.g. "Okta selection is paused pending
a session-timeout resolution"), not just a risk flag with nothing to
replace it. Worth deciding deliberately: is "point to the open Review" a
good-enough answer to "what is Current State's word actually worth right
now," or does a paused/reversed decision need its own update path distinct
from state_at_risk?

**Sequence 2 -- open Question -> answered -> reversed** worked well in
both directions: the direct leadership answer resolved the Question and
updated the automation-scope Current State item; the subsequent finance-
driven reversal correctly produced a new review and updated Current State
again to reflect the reversal (not left stale like sequence 1's step 5).
The difference looks like phrasing: sequence 2's reversal stated a clean,
positive replacement fact ("refund tickets will NOT be added... due to
compliance concerns"), which the model was willing to propose, versus
sequence 1's "paused" status which it treated as pure risk with nothing to
assert in its place.

## What's still open

**Source-gap experiment and the raw-vs-State-context comparison were not
started this session at the time of first writing this section** -- see
below for whether they were picked up afterward. These are genuinely
separate pieces of work (the doc's Phases 5 and 6).

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
