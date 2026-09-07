# Analytics instrumentation + consequentiality eval dataset -- findings (2026-09-07)

Scope for this session, per the "Next Marching Orders" doc: Phase 1
(analytics instrumentation) and Phases 2-6 of the evaluation work
(consequentiality dataset, real results, sequence tests, source-gap audit,
raw-vs-State comparison), once Paige supplied a real API key mid-session.
Every phase surfaced at least one genuine, reproducible finding -- none of
this is "ran clean, nothing to report." See each section below. **Phase 7
(product changes) was deliberately not started** -- per the doc's own
ordering, findings come first; see "What's still open and what Paige
should decide" at the end.

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

## Source-gap experiment (Phase 5) -- a code/schema audit, not live QA

The doc's ask here is specifically to *observe what State currently
communicates* about freshness/incompleteness before building any UI for
it. That doesn't require a live deployed environment -- it requires
reading what actually exists. This machine can't exercise the live
deployed product against real Slack/Docs/meeting sources (no server
access, and the local static frontend can't reach the production API from
`localhost` due to CORS), so this is a direct audit of the schema and
frontend code, not a live-browser QA session -- flagged explicitly so it
isn't mistaken for one.

**What exists:** `current_state_items` has an `updated_at` timestamp
(`migrations/001_initial.sql`), set on every state change. **What does
NOT exist, confirmed by grepping the entire frontend
(`implementation-context-prototype/*.js`) for every freshness-adjacent
term:** `updated_at` is never rendered anywhere. There is no per-item
"last confirmed," no source-age indicator, no confidence score, nothing
resembling Scenario C ("nothing relevant seen from this source in
weeks"). The only "stale" concept in the whole product
(`context-product-polish.js`'s `ui.stale` / `.ask-state-stale`) means
something narrower and purely internal: *"Current State has changed since
this Ask answer was generated"* -- an Ask-answer-vs-Current-State
consistency check, not a Current-State-vs-the-real-world one.

**The honest answer to the doc's research question ("what can State
honestly tell the user about trustworthiness when source coverage is
incomplete?") is: nothing right now.** State has no representation at all
of "we haven't heard from this source in a while" or "this fact might be
stale because the world moved and nothing told us." This is architecturally
inherent, not a bug to patch -- Scenarios A and B in the doc (a Google Doc
says A, Slack later says B, but State only received the Doc; or a meeting
reverses something and State never sees the meeting) can't be detected by
any amount of better interpretation, because the missing Evidence never
arrives for the model to reason about. Scenario D (ambiguous evidence that
puts existing State at risk without establishing a replacement) is not
hypothetical -- it's exactly what happened for real, twice, in this
session's own results above: the `state_at_risk_no_replacement` eval
scenarios, and the Okta sequence's step 4/5 (Security's problem, then the
client's pause) both produced a `state_at_risk` review with no proposed
replacement, which the existing mechanism already handles reasonably
(flags it, doesn't silently resolve it) -- Current State's own headline
text just doesn't reflect the risk until a human looks at the Review, per
the paused-decision finding above.

**Implication, matching the doc's own instruction:** do not build a
generic confidence badge or source-health dashboard from this alone. The
one thing this audit does support concretely: if source-freshness UX gets
built later, `updated_at` already exists in the schema and needs no new
migration -- the gap is entirely on the surfacing side (API response +
frontend), not the data model.

## Raw context vs. State context comparison (Phase 6) -- a scoped-down first pass

Built `eval/raw_vs_state_experiment.py` and ran it against the real model
(`claude-haiku-4-5-20251001`, the same model State's own interpretation
pipeline uses, for a fair comparison). Both conditions were built from
**real output of this session**, not invented for the experiment: the raw
condition is the exact 6 pieces of Evidence from the Okta sequence above,
reformatted as chronological Slack-style chatter; the State condition is
the actual Current State + open Review text that sequence run produced,
formatted the way Copy Context's "working" mode formats it. Asked 5 of the
doc's suggested questions against both.

**Honest result: no clear correctness differentiation showed up in this
run.** Both conditions correctly identified that Okta is paused (not
approved), correctly avoided claiming the decision was final, correctly
surfaced Auth0 as a candidate rather than a decision, and correctly told
the team not to proceed with implementation this week. The raw-context
answers were, if anything, comparably good -- the model reconstructed the
chronological "what's actually current" reasoning from the 6-message dump
without help, for every question asked.

**The one clear, measurable difference is efficiency, not correctness:**
the State condition answered from 2 sentences of maintained context; the
raw condition needed all 6 messages every time. Same answer quality from
roughly a fifth of the input. That's a real result, just a different one
than "State prevents wrong answers" -- worth keeping, but don't oversell it
as the differentiation finding.

**Why this run likely undersells State's real differentiation value, and
what a better version would need:** this corpus was small (6 messages),
single-topic, and already in clean chronological order -- exactly the
easy case for an LLM to reconstruct correctly on its own. The doc's own
design brief asks for something harder: a corpus spanning **multiple**
topics, with genuine cross-source contradictions, superseded information
mixed back in, and irrelevant chatter diluting the signal -- much closer
to what this session's `eval/scenarios.py` BASE_STATE dilution finding
already showed causes real judgment failures. That's the version likely
to actually separate the two conditions (a large raw dump forces the
model to do its own triage under noise; State hands it pre-triaged
context). **This first pass should be read as "the mechanism works and is
measurably more efficient," not as a finished answer to the
differentiation question** -- the real test needs the messier, larger
corpus the doc asked for, which this session didn't have time to build.

**Review-burden measurement (Phase 4) now has a first real number**
(86% recall / 100% precision on this 33-scenario set), but it's one run
against one model, on a dataset skewed toward the categories this session
had time to write. Treat it as a first signal, not a final grade -- and
see the nondeterminism finding immediately below, which is a reason on its
own not to over-read a single run's precision/recall.

## A fifth finding: the model's judgment is not stable run-to-run

Running the full suite a second time (with `pytest`'s default parametrized
per-scenario tests, real key present) surfaced two failures the first
`eval.run_eval` run hadn't: `clear_decision_budget` (already known -- the
no-anchor budget miss above) and, new, `state_at_risk_escalation_path`.
Re-ran that one scenario **three more times in isolation, identical input
every time**: pass, fail, fail. Then re-ran `authority_statement_refunds`
(the VP-billing case) three more times: pass, pass, pass, after having
failed once in the original 33-scenario batch run.

**This means single-run precision/recall numbers have real, unreported
variance.** A borderline scenario can flip between must-review and
no-review on identical input with nothing else changed. The 86% recall
figure above is one sample from a distribution, not a fixed measurement --
a materially different (though probably still imperfect) number is
plausible on a re-run. For Phase 4 to produce a trustworthy number, each
scenario likely needs several trials (e.g. 3-5) with recall computed
against majority vote or reported as a range, not a single pass/fail.
This wasn't attempted this session (cost/time) but is now a known
prerequisite for treating any single precision/recall number as
decision-grade evidence, not just a first signal.

**A genuinely separate, unrelated bug found and fixed while investigating
this:** `test_live_providers.py`'s two live-pipeline tests
(`test_live_anthropic_full_pipeline` / `test_live_openai_full_pipeline`)
referenced `result.proposal_ids`, an attribute that doesn't exist on
`ProcessResult` (only `review_ids` does) -- a pure `AttributeError` in the
test's own print statement, not a pipeline failure (the pipeline itself
succeeded both times; `Status: succeeded`, a real Review was returned).
This test suite apparently had never been run against a working key
before this session, so nothing had caught it. Fixed by removing the two
stale print lines; re-verified green (`test_live_anthropic_full_pipeline`
now passes; the OpenAI-only tests skip cleanly, as expected without an
`OPENAI_API_KEY`).

## Phase 7, later the same session: two evidence-backed fixes shipped

Paige authorized proceeding on item #1 (the context-dilution scaling
experiment) and "whatever is easy" without further check-ins. Two changes
went out; both were re-tested against the full 33-scenario set and
stress-tested with repeated reruns before being called done, not shipped
on a single green run (the nondeterminism finding above made that
non-negotiable).

**Fix 1: `temperature=0` on every interpretation call**
(`anthropic_provider.py`, `openai_provider.py`). Neither provider ever set
a temperature, so every call used the API's own (non-zero) default on a
task that's a decision with real product consequences, not creative
generation. This didn't "fix" any single scenario by itself -- it converted
noisy, unreliable per-scenario results into a stable, reproducible signal.
Concretely: `state_at_risk_escalation_path`, previously pass/fail/fail
across reruns, became a consistent, deterministic fail at temp=0 -- meaning
the earlier occasional pass had been noise in the *lucky* direction, not a
real signal. Applied to both providers for consistency, though only the
Anthropic path could be live-verified here (no `OPENAI_API_KEY`
available).

**Correcting the earlier context-dilution hypothesis.** Once results were
stable, `eval/scaling_experiment.py` was re-run properly: the VP-billing
evidence against 2/4/6/8/10 *generic* filler items, several trials each.
**Every count passed, 100% of the time.** That directly contradicts the
original "more Current State items dilutes attention" theory from earlier
in this doc. What actually reproduces the miss is not item *count* -- it's
the *exact* composition of `eval/scenarios.py`'s `BASE_STATE` (which the
scaling experiment's generic filler pool never exactly matched). The
honest, corrected finding: **something specific about that particular set
of surrounding items causes the miss, not sheer volume.** This session
didn't isolate which item(s) or why -- that's now a real open question, not
a solved one, and the original "gets worse as Current State grows"
framing earlier in this doc should be read as superseded by this more
precise result.

**Fix 2: an explicit `missing_understanding` instruction addition**
(`anthropic_provider.py`'s `_build_prompt()`): "No matching existing item
is a reason to use `missing_understanding`, not a reason to treat the
Evidence as non-consequential" (full wording in the source -- a shorter
version was tried first and measurably fixed fewer cases, so the fuller
one was kept and `test_provider_prompt_contract.py`'s compactness budget
was raised 3500->4000 chars to accommodate it, with a comment explaining
why). This directly fixed both confirmed no-anchor misses
(`clear_decision_budget`, `authority_statement_launch_date`) and, somewhat
unexpectedly, also fixed the VP-billing case and the two remaining
borderline scenarios -- possibly because the clarified instruction reduced
the model's general tendency to under-weight decisions that don't map
cleanly onto an existing item, not only the literal zero-anchor case.

**Result after both fixes, stress-tested:** the full 33-scenario set now
reads **100% precision, 100% recall** -- and, unlike every number earlier
in this doc, this one held up: `authority_statement_refunds`,
`state_at_risk_escalation_path`, and `observation_billing_volume` (the
three scenarios that had shown any instability all session) were each
re-run 3 more times after the fixes, 9/9 consistent passes.

**What this genuinely does and doesn't prove.** It proves both fixes
measurably improved this specific 33-scenario dataset without any
precision cost, and that the improvement is stable, not lucky. It does
**not** prove the underlying judgment is now perfect -- 33 hand-written
scenarios against one model is still a small, self-authored dataset (the
person who wrote the scenarios also wrote the fix), and the unresolved
"why does this specific item composition matter" question means a
differently-composed Current State could still reproduce a miss this
dataset doesn't happen to cover. Both changes are low-risk on their own
merits (temperature=0 is a well-understood, mechanical change; the prompt
addition is narrow and its net effect was measured, not assumed) but
should be treated as "meaningfully better, evidence-backed, not proven
complete."

## What this does and doesn't tell us yet

This session answers both "does the harness for measuring consequentiality
judgment now exist and run cleanly" (yes) and "is State's actual judgment
good" (mostly -- no false positives, but two concrete, reproducible misses,
one of which reopens a case the project believed was already covered by
regression testing). The context-sensitivity finding in particular is worth
treating as a real product risk: a regression test that only ever seeds a
minimal, hand-picked Current State snapshot can pass while the same
judgment fails in a busier, more realistic one.

## Findings, condensed

What State does well:
- Zero false positives across 33 single-event scenarios and both
  sequences -- nothing tested this session made State ask about something
  it shouldn't have.
- Clean decisions, direct/implicit contradictions, reversals stated as
  positive replacement facts, duplicates, and off-topic chatter are all
  handled correctly and consistently.
- The `state_at_risk` mechanism (flag it, don't silently resolve it) works
  as designed for genuinely ambiguous evidence -- this is a real strength
  of the authority model, not just a passed test.
- Copy Context's compact maintained-context format answered every raw-vs-
  State question as well as the full raw chat dump, using roughly a fifth
  of the input.

Where it failed, twice each in a different way:
- Recall drops when Current State gets busier (2-item vs. 7-item context,
  same evidence, different judgment) -- a pure prompt-attention effect,
  not a selection bug (there is no selection step at all -- everything
  active always goes in).
- A genuinely new, decision-shaped fact with no matching existing Current
  State item can be missed entirely (nothing to compare it against).
- An explicit status-change reversal ("paused") can produce a
  `state_at_risk` review with no proposed replacement, leaving Current
  State's headline text stale until a human notices the Review -- distinct
  from a reversal stated as a clean positive fact, which does get proposed
  correctly.
- State has no mechanism at all -- schema or UI -- for representing "we
  might be missing something" when a source goes quiet. This is
  architectural, not a bug, and not something interpretation quality can
  fix on its own.

What should NOT change based on this session alone: the state_at_risk
mechanism itself (it's working as intended), the authority model
(nothing here suggests weakening human-in-the-loop), or building any
source-freshness UI yet (the audit found no evidence to design against
beyond "the timestamp already exists").

## What's still open and what Paige should decide

Two of the five items originally listed here now have shipped,
stress-tested fixes (`temperature=0` and the `missing_understanding`
instruction addition -- see "Phase 7" above); this list is updated to
reflect that, plus one new question the scaling-experiment correction
raised. Nothing else in `anthropic_provider.py`, `openai_provider.py`, or
`review_service.py` was changed beyond those two fixes -- everything else
below is still reporting, not action, per the doc's "findings before
changes" ordering:

1. ~~Context-dilution recall drop~~ -- **superseded.** The original theory
   ("more items dilutes attention") did not survive a proper controlled
   test; see "Correcting the earlier context-dilution hypothesis" above.
   Replaced by a new, narrower open question (#6 below).
2. ~~New-fact-with-no-anchor misses~~ -- **fixed and stress-tested** (Fix
   2 above). Both confirmed instances now pass consistently.
3. **Paused/reversed decisions defaulting to state_at_risk with no
   proposal** -- still open, still Paige's call. Should a clear
   status-change reversal get its own proposed_update path, distinct from
   ambiguous state_at_risk? Unaffected by either fix shipped this session.
4. **Phase 4 at scale, and a proper Phase 6 corpus** -- still open. This
   session's dataset is 33 hand-written scenarios from one author, and the
   raw-vs-State comparison used one small, clean, single-topic corpus.
   Worth expanding before treating either number as final, and especially
   worth adding more scenarios that vary Current State composition (not
   just count -- see #6) given what the scaling-experiment correction
   found.
5. ~~Multi-trial measurement~~ -- **adopted as working practice this
   session**, not fully solved. Every scenario touched by a fix was
   stress-tested 3-9x before being called done, but the full 33-scenario
   set itself has still only been run to convergence once at temp=0 (plus
   the earlier noisy temp-default runs). A fully rigorous Phase 4 number
   would still benefit from multiple full-set runs, not just per-scenario
   spot checks.
6. **New: what specifically about `BASE_STATE`'s composition caused the
   VP-billing miss, if it wasn't item count?** This session found the
   effect and fixed the two scenarios that were failing (via Fix 2), but
   never isolated *why* that particular combination of surrounding items
   mattered when generic filler at the same or higher counts didn't
   reproduce it. Worth understanding before assuming Fix 2 generalizes to
   every future case of this shape, since the mechanism itself is still
   not fully understood -- the fix's effectiveness was measured, but the
   underlying "why" wasn't.

Item 3 remains explicitly Paige's call, not because of a lack of evidence
but because it's a genuine product-behavior tradeoff (how confidently
should State restate a fact it isn't fully sure about?), not a bug with an
obviously-correct answer the way the two shipped fixes were.
