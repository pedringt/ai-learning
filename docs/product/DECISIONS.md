# State product decision log

Use this file for durable product decisions that future contributors or agents should not casually reopen. This is not State's in-product History; it records decisions about building State itself.

## Entry format

### DEC-XXX — Short decision title

**Status:** Settled / Revisit if condition changes  
**Date:** YYYY-MM-DD  
**Related:** Issue/PR/docs links

**Decision**  
What we decided.

**Why**  
The product reasoning and tradeoff.

**Rejected / deferred**  
Important alternatives we chose not to take.

**Revisit when**  
Only include if there is a clear trigger.

---

## Current settled decisions

### DEC-001 — Human authorization owns Current State

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
AI may interpret evidence and propose outcomes, but only a human-authorized workflow may change Current State.

**Why**  
State exists to maintain trustworthy project truth. Model confidence is not authority.

**Rejected / deferred**  
Autonomous AI mutation of Current State.

---

### DEC-002 — Answering a Question does not require a Current State change

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
Evidence can answer or close a Question without creating or changing a maintained fact.

**Why**  
Forcing every resolved unknown into Current State would create unnecessary or misleading maintained facts.

**Rejected / deferred**  
Treating accepted/reviewed evidence as automatically state-changing.

---

### DEC-003 — Human review must be selective

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
State should escalate consequential ambiguity or proposed truth changes while avoiding low-value acknowledgment work.

**Why**  
Human review only works if the system is selective about what reaches people and makes each decision clear enough to act on.

---

### DEC-004 — GitHub is the project system of record

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
Use GitHub Issues/Projects/PRs/Actions plus repo Markdown for State product operations. Add external PM tools only when they solve a real gap.

**Why**  
The code, QA, agents, work tracking, and durable product context can stay linked instead of being duplicated across systems.

---

### DEC-005 — State is a portfolio/learning product, not an external pilot

**Status:** Settled  
**Date:** 2026-09-14  
**Related:** `PRODUCT_BRIEF.md`, `METRICS.md`, Issue #121

**Decision**  
State will not be planned or represented as a product being rolled out to a real user group. Other people may interact with it as portfolio reviewers or demo visitors. Product-management exercises may deliberately model what a real deployment would require, but they must be labeled as hypothetical/learning work rather than real customer or pilot activity.

**Why**  
The goal is to demonstrate applied AI product judgment and learn realistic product practices without inventing users, adoption, customer evidence, or production outcomes that do not exist.

**Rejected / deferred**  
Creating fake pilot plans, adoption metrics, stakeholder reports, or customer evidence to make the portfolio project appear more mature than it is.

**Revisit when**  
Only if Paige explicitly decides to turn State into a product intended for real external/team use.

---

### DEC-006 — Bootstrap, normal interpretation, and explicit promotion are distinct paths

**Status:** Settled  
**Date:** 2026-09-15  
**Related:** Issues #129, #144, #146

**Decision**  
State has three distinct ways of deciding what reaches human Review:

1. **Bootstrap/backfill:** when a project has no established Current State, interpretation should bias more toward coverage so an existing project's baseline can be reconstructed without requiring every important fact to already have a State item to compare against.
2. **Normal ongoing interpretation:** once Current State exists, State should remain selective and escalate only consequential new facts, changes, contradictions, qualifications, or important unknowns.
3. **Explicit human promotion:** a person may say that processed Evidence contains something they want proposed for Current State. For that pass, the consequentiality decision is human-supplied. AI still interprets what the Evidence actually establishes and may preserve unresolved material as a Question rather than inventing certainty. Promotion always creates a Review path and never writes Current State directly.

Explicit promotion must remain available after partial prior interpretation. It is not limited to Evidence that received zero Reviews: State may have surfaced only Questions, or may have captured one Current State fact while missing another. An unresolved existing Review should be completed before offering another promotion from the same Evidence to avoid duplicate concurrent proposals.

Mixed planning/spec documents must be interpreted item by item. Words such as “should” do not by themselves make the entire document tentative; settled decisions, tentative ideas, and explicit open questions can coexist in one source.

**Why**  
Human review can reject a bad proposal but cannot correct an important fact the model never surfaced. The problem is especially acute during adoption/backfill, when a mature project may have substantial existing knowledge but little or no Current State yet. Explicit promotion gives the human authority a recovery path without making normal interpretation noisier or allowing direct writes.

**Rejected / deferred**  
Making the normal model globally more aggressive; limiting promotion to `no_review_needed`; hiding promotion after any prior Current State change; allowing promotion to bypass Review; treating omission detection as solved by this feature. Systematic omission detection remains separate work.

---

### DEC-007 — Baseline Setup is an explicit project lifecycle

**Status:** Settled  
**Date:** 2026-09-15  
**Related:** Issue #155; Issues #144, #146

**Decision**  
A new user-created project remains in **Baseline Setup** until a person explicitly finishes establishing its starting understanding. Accepting the first Current State fact does not end bootstrap behavior.

During Baseline Setup, State may internally split a large source into bounded interpretation chunks while preserving the original source as one immutable Evidence item. Interpretation should favor useful baseline coverage, surface explicit important Questions, keep Current State proposals independently maintainable, and use a small set of project-derived organizational areas where helpful. Areas are organizational metadata, not authoritative facts, and are persisted only after associated material is human-authorized.

Before the person finishes Baseline Setup, State should show a coverage summary across the intended starting Evidence. Structural coverage warnings may identify material that deserves another look, but they are not proof that something is missing and do not authorize State changes.

After Baseline Setup is explicitly finished, normal ongoing interpretation becomes the default. Explicit human promotion remains available as a recovery path for later omissions.

**Why**  
Dogfooding AI Notes and State planning material showed opposite failure modes from the old `Current State is empty` trigger: one large source was over-compressed into broad blobs, while later baseline material disappeared after early facts were accepted. A real project may need many notes or documents to establish its starting picture, so baseline construction must span multiple Evidence items and human decisions rather than end after the first acceptance.

**Rejected / deferred**  
Ending bootstrap when Current State first becomes non-empty; requiring people to manually split large source documents; solving large-input failures only by raising the model token ceiling; autonomous baseline acceptance; treating structural coverage as a complete semantic omission detector.

---

### DEC-008 — The Deep QA gate measures the app; model quality is observed, not gated

**Status:** Settled  
**Date:** 2026-09-19  
**Related:** Issue #230; R-016; Issue #231

**Decision**  
The State Deep QA Baseline lifecycle test uses two tiers of checks. **Hard checks** fail the gate because they mean the app or the analysis path is broken: the review dialog does not stay stale during analysis, at least one draft fact appears (zero facts is a real failure), a manually added fact adds exactly one row, and confirming Starting State and later Evidence work. **Soft observations** (the number of facts, the number of areas, use of the "General" area) are recorded as annotations in the report and job summary but never fail the gate. The real model stays in the loop on the deployed stack.

**Why**  
The test used to require exactly 3 facts and more than one area from a real model. The same file yields 2 or 3 facts and 1 or 2 areas, so the gate failed intermittently for reasons that were not regressions, blocking promotion on model variance. App correctness and model quality are different questions and should not share one pass/fail.

**Also**  
If the model raises a Review that blocks Confirm (State's authority rule working as designed), the test verifies the block and reports the run as skipped (inconclusive), not passed or failed, because confirm and follow-up Evidence were not exercised.

**Rejected / deferred**  
A deterministic provider for this flow (it would need a test-only provider switch on a deployed server, and would stop exercising the real model path where the schema-violation failure occurred; deterministic lifecycle coverage already runs in `make qa-fast`); silently retrying schema-violating output in the test (hides a real product reliability problem, tracked in R-016 and #231). Model quality for Baseline decomposition is deferred to an eval (follow-up issue).

---

### DEC-009 — Baseline analysis does not retry automatically for now; measure first

**Status:** Settled  
**Date:** 2026-09-20  
**Related:** R-016; Issues #231, #233, #240; DEC-008

**Decision**  
When Baseline Setup analysis fails (for example the model returns output that fails schema validation), State does **not** retry automatically. The failure stays visible and the person can retry by hand from the Baseline UI (#231). Paige approved a measure-first approach: measure the real failure rate with the corrected Baseline decomposition eval (#233), and add an automatic retry only if that rate is meaningfully above a few percent.

**Why**  
The first valid measurement (Sept 20, Haiku 4.5, the Baseline provider the deployed app uses) was **1 failed analysis in 36 real calls (about 3%)**, and the cause was not identified: it did not reproduce in 12 targeted re-runs, and the call logs rule out a routine truncation (largest output 895 of 2,000 tokens, every call ended normally) and a timeout (7 to 10 s against 30 s). One failure in 36 is too few to say the rate is real, and a retry costs another model call and added latency, and can hide a real reliability signal (DEC-008 already declines to retry silently in the test for that reason).

**Revisit when**  
A real failure is recorded with a `schema_violation` code (the eval now records the failure code and message), or a larger measurement shows a rate meaningfully above a few percent. If revisited, the smallest option is one retry, only for `schema_violation`, in the background, recording both attempts (Ask already retries once on a contract failure).

**Rejected / deferred**  
An automatic retry now (no evidence it is needed); a repair pass that sends the invalid output back to the model (a new prompt, so a product change that needs its own eval); keeping the valid parts of a bad output (edges toward AI deciding what counts as valid); prevention by tuning chunk size or output limits (needs failure data first).

### DEC-010 — A consequential note reaching Review stays a hard Deep QA gate

**Status:** Settled  
**Date:** 2026-10-12  
**Related:** Issue #241; DEC-008; Issue #494

**Decision**  
The Deep QA check "VP billing note reaches Review, not a silent no_review" keeps blocking promotion. It is not downgraded to an observation the way DEC-008 treats the Baseline split. On a single miss, re-run once and read the printed API answer (Review types, outcome, interpretation) before treating it as a regression, the same reading as the review suite in #494.

**Why**  
A consequential note that silently produces no Review is a trust failure: evidence that should change what the project treats as true disappears without a person seeing it. That is an authority-relevant behaviour, unlike the number of facts or areas Baseline happens to produce. The one recorded miss (Sept 20, Haiku 4.5) was model variance with a clean response. On Oct 12 the same note produced a Review in 12 of 12 tries on Haiku 5.5, so the gate is not flaky enough to block on noise.

**Revisit when**  
It misses twice in a row, or misses in more than one run out of ten. That would be a real change in how the model treats terse consequential notes, and needs a look at the prompt or the consequentiality eval, not a softer gate.

### DEC-011 — Project Health's investigator gets a 900-token report cap and failed job-log excerpts

**Status:** Settled  
**Date:** 2026-10-16  
**Related:** `api/project-health-investigate.js`; `scripts/project_health_eval/`; eval runs 38961088400 and 38964340745; DATA_PRIVACY.md (Project Health)

**Decision**  
The investigator's output cap goes from 450 to 900 tokens, and it reads a bounded, redacted excerpt of each of the first two failed GitHub Actions job logs. Paige approved both on Oct 16.

**Why**  
At 450 tokens, 14 of 58 production Haiku reports stopped before the end, usually losing Owner or Confidence; with job logs it was 24 of 39. At 900 none did, at the same cost per report and response time. Without logs the investigator only saw an empty check title and summary, and said the cause was unknown on 24 of 26 real check failures; with logs, reports cite the concrete failing line, though most still hedge.

**Rejected / deferred**  
Switching to Sonnet or Opus (about 20× and 45× the cost per report, slower, and Sonnet was cut off on 38 of 58 at 450). Whether job logs make reports more correct is not settled: that waits on Paige's grades in the investigator grading page. Tastemake's logs carry deliberate test-noise lines the excerpt can pick up.

**Revisit when**  
Paige's grades show the job-log reports are wrong or misleading more often than the reports without logs.

### DEC-012 — Project Health's paid actions stay open to anyone for now

**Status:** Revisit if condition changes  
**Date:** 2026-10-16  
**Related:** RISKS.md R-020; DATA_PRIVACY.md (Project Health)

**Decision**  
Anyone who can open the Project Health dashboard may start an investigation or a State eval run, including on the public production site. Paige accepted this on Oct 16.

**Why**  
Each investigation is one capped Haiku call (a fraction of a cent) and only runs while a project has a current failure; a State eval run is about 23 Haiku calls with a 10-minute cooldown. Locking them would mean building an access path for a cost that is currently negligible.

**Rejected / deferred**  
Locking both to staging and protected previews; an admin key for investigations; a per-failure cache.

**Revisit when**  
Spend from these endpoints shows up unexpectedly, or the dashboard gets traffic beyond portfolio reviewers.

**Update (Nov 8, Paige): small guards, still open to anyone.** The Nov 5 audit found that an investigation made a model call on every request while a failure was current, and that the eval run's 10-minute cooldown could be beaten by parallel requests (GitHub lists a dispatched run only after a delay). Neither counts toward DEC-014's $50 cap. Paige chose to keep both actions open and add cooldowns that hold across parallel requests: one investigation of the same failure (project, environment, commit, signal) per 5 minutes, and one eval run per branch per 10 minutes. Each is an atomic claim in the State backend (`project_health_claims`, migration 023), because Vercel functions share no memory. If the claim store cannot be reached, the action is allowed (fail open), so an outage of the State API never removes the actions. A failed dispatch or model call gives its claim back. Still rejected: an admin key or login.

### DEC-013 — The Ask quality suite is read like the review suite (trial)

**Status:** Revisit if condition changes  
**Date:** 2026-10-19  
**Related:** `state-project-complete/eval/release_gate.py`; RELEASE.md "Reading the review interpretation suite"; DEC-012

**Decision**  
A State AI quality check run's Ask suite passes when at most one scenario misses and no scenario fails in two consecutive recorded runs. Paige chose this on Oct 19 as a trial ("let's try it and see how it goes").

**Why**  
Failing on any single miss made the known variable case `ask_blocker_not_omitted` (77–87% pass on every model, Oct 16) turn `main`'s latest commit red and send failure emails, without a regression behind it. The review suite already uses this reading (#494).

**Rejected / deferred**  
An unsafe-direction check for Ask (its scenarios have no `unsafe_if` tag yet); keeping "any miss fails".

**Revisit when**  
A real Ask regression passes under this reading, or a single scenario keeps missing every other run (the consecutive check would never catch it).

**Update (Nov 7, Paige):** #642 (what should block an Ask release) is explicitly **deferred** for the Nov 7 eval release; this reading stays as it is. Known failure documented with that release: `ask_question_answer_no_state_mutation` fails in production because Ask there cannot see resolved Questions (#640, held on `staging`). The deferral does not make the #640 headline contradiction acceptable to ship. **Narrow exception (Paige, Nov 7):** that one scenario carries `known_unsupported` (`eval/ask_quality_scenarios.py`): it keeps running and is reported as failing (it counts in the headline score, and the pages mark it "known unsupported in this release, not counted by the release gate"), but the Ask gate leaves it out, like an observe-only scenario. Every other gate rule is unchanged. Remove the marker when #640 ships; a run where it passes says so in the log.


### DEC-014 — State's paid model spend has a $50 daily cap; Ask stays open to visitors

**Status:** Active  
**Date:** 2026-10-19  
**Related:** #529; `spend_guard.py`

**Decision**  
Ask and Evidence analysis stay open to anonymous visitors. Once a UTC day's recorded model spend reaches **$50**, State refuses new model work until midnight UTC. Ask, Evidence intake, re-analysis and Baseline setup return 429 with a plain message; background interpretation (Slack, async Baseline) stops at the same cap. Everything that doesn't call a model keeps working. `STATE_DAILY_MODEL_SPEND_CAP_USD` changes the cap (`off` disables it). Paige chose this on Oct 19: there is an account-level Anthropic spend limit, but State shouldn't be able to use it all.

**Why**  
Before this, nothing bounded what a script could spend through the public site (about $270–1,400 a day at full rate). A daily cap is the only option that bounds the worst case, and the per-call token counts were already recorded in `model_call_metrics`.

**Rejected / deferred**  
- A per-IP rate limit (it doesn't bound the total, and shared networks share a limit).
- A third-party bot check (needs a privacy review).
- Shared answer caching (cuts normal cost, not abuse).
- Pre-computed answers for more suggested questions.

**Revisit when**  
The cap is hit by real visitors rather than abuse, or the Project Health paid actions (DEC-012) need to count against it. Those actions are not recorded in `model_call_metrics` today.

### DEC-015 — Ask suggests a Question for a gap it finds, and says it covers only what's on record

**Status:** Active  
**Date:** 2026-10-20  
**Related:** #543, #544, #545

**Decision**  
- **Suggested Question (#543):** when an answer finds a specific gap the record doesn't cover (for example, the reason for a recorded change), Ask suggests one Question. The answer offers **Add this as a Question**, which opens the existing Question form prefilled and editable. Ask never creates it. If an equivalent open Question exists, the answer points to that one instead.
- **Scope footer (#544):** every answer, and its copied text, ends with "Based on what's recorded in State. There may be things it doesn't know about." The line is fixed and deterministic, not written by the model.
- **Scope qualifiers (#545):** when Ask restates a Review or Question, it keeps its scope ("low-risk cases"), with an adversarial case that checks it.

Paige chose the smart suggestion and the fixed footer from her Oct 20 grading notes.

**Rejected / deferred**  
Plain "Add a Question / Add Evidence" buttons on every answer, and an AI-written scope sentence only on readiness questions.

### DEC-016 — Project Health's trust rules: what "Healthy" means, a latency target, a shared decision log, and planted-case accuracy

**Status:** Active  
**Date:** 2026-10-27  
**Related:** `project-health-model.js`, `project-health.js`, `api/project-health-decisions.js`, `state-project-complete/project_health_decisions_api.py`, `scripts/project_health_eval/`; DEC-011; R-020

**Decision**  
Paige made these choices after an Oct 27 PM review of the dashboard:
- **Healthy needs measured product quality.** A project shows plain **Healthy** only if no product-quality area is declared unmeasured. A project lists its gaps in `unmeasuredQuality`; while any remain it reads **Healthy on what's measured** with a "Not measured: …" line. Platform gaps (server-error history on Vercel Hobby, database monitoring, agent telemetry) stay under "What we cannot confirm" and do not block the label. Declared today: Authority Lab, "the full lifecycle walkthrough". Tastemake, State and NARC declare none (NARC's pending playtest already shows Watch).
- **State's AI response time is judged against a 15 s p95.** Above it, the AI response speed signal reads Watch. It does not change the project's status pill.
- **The decision and change log is stored on the State backend.** Anyone can read it. Adding or removing an entry needs `PROJECT_HEALTH_DECISION_KEY`, a separate admin key Paige enters on the dashboard.
- **The investigator's accuracy is labeled and checked on planted cases.** AI reports say "accuracy not yet measured" until the planted-case check has results Paige has looked at. The investigator eval scores whether the Likely cause section names each planted case's known cause (see `docs/evals/README.md`).

**Why**  
The review found the dashboard calling things healthy that it did not measure, showing a 26 s p95 with no way to judge it, keeping decisions in one browser, and running an AI feature whose correctness was unmeasured.

**Rejected / deferred**  
Counting platform gaps toward "Healthy" (no project could ever be Healthy on the Hobby plan). Declaring Tastemake's live recommendations and State's live answers as unmeasured gaps (Paige chose not to). Anyone-can-write and owner-only-read logs. Manual grading only.

**Revisit when**  
A project gains a check for a declared gap, a planted-case run shows misses, or the 15 s target proves wrong for real use.

### DEC-017 — #569: fix the example Review's note, keep the budget case as an observe-only eval, no prompt change

**Status:** Observe-only part ended Oct 27 (#569 fixed); the reworded note and the `observe_only` mechanism remain  
**Date:** 2026-10-27  
**Related:** #569, #567, #566, DEC-013; `seed_demo.py`, `eval/ask_quality_scenarios.py`, `eval/release_gate.py`

**Decision**  
Paige chose these on Oct 27, after the #569 prompt experiment:
- **The seeded budget Review's "why it matters" note no longer claims a dependency.** It said "Implementation planning depends on a known budget ceiling", which the Q3 Evidence never establishes. Ask then treated that unconfirmed claim as a gate over Current State's "Implementation planning can proceed". It now reads "The Q3 planning note reports an approved budget figure that Current State does not record yet."
- **`ask_compound_question_keeps_governing_state` stays in the Ask suite as an observe-only hard case.** It is still run and reported, but the Ask gate (DEC-013) leaves it out of both the one-miss and the two-runs-in-a-row checks. Its Review text keeps the dependency claim on purpose. Remove the flag when #567 or #569 fixes it.
- **No Ask prompt change.** The tested rule ("answer every part from its governing Current State; a Review's why-it-matters text never limits what Current State allows") had no measurable effect: 12/30 before and 10/20 after on the budget case. Two-part questions on other topics already passed 100% without it.

**Why**  
The failure is specific: an unaccepted dependency claim in a Review's note, with no Current State record that speaks to it. A prompt rule did not move it, and gating on a known ~50% case would turn the weekly Ask check red without telling anyone anything new.

**Rejected / deferred**  
Adopting the prompt rule. Whether a Review's note may claim dependencies the Evidence doesn't establish, for live interpretations, is not decided; #567 covers labeling such claims structurally.

**Update (Oct 27, later):** the root cause of #569 was not the model. `ask_provider._filter_candidate_payload` treated the whole two-part question as a budget lookup and removed every Current State record without "budget" in it, so the model never saw "Implementation planning can proceed". The filter now runs only when every part of the question is a lookup (ask ×20: 19/19 scored). The scenario gates again; `observe_only` stays available for future known hard cases.

### DEC-018 — Ask retrieves answered Questions; synthetic eval excerpts may be stored; the grader allows attributed source reports

**Status:** Decided. Implementation: the #643 exception and the #641 rubric shipped in the Nov 7 eval release (the grader stays observe-only and not yet calibrated); #640's Ask retrieval is held on `staging` because its headline contradicts the body ("No, the question is answered")  
**Date:** 2026-11-07  
**Related:** #640, #641, #643, #639 (outside eval review, Nov 7); `ask_service.py`, `docs/product/DATA_PRIVACY.md`, `eval/ask_grader.py`

**Decision**  
Paige adopted these three recommendations from an outside eval review on Nov 7:
- **Ask retrieves relevant resolved Questions (#640).** Scoped to the project and to the request (they must share a term with it), each with its recorded answer (the Evidence the resolving Review accepted), resolved date and the resolving Review. Ask keeps "this Question was answered" apart from "this was authorized as Current State". #640 stays open until the scenario passes end to end on a real run.
- **A narrow DATA_PRIVACY exception for synthetic eval excerpts (#643).** A failed controlled-eval scenario may carry one model-answer excerpt of at most 200 characters, labeled as a synthetic eval excerpt and shown apart from the software-generated explanation, with the eval record's retention. Never production, demo or visitor content.
- **The grader's authority rubric allows attributed source reports (#641).** "Confirmed", "resolved", "approved", "established" describe Current State or closed Questions when the answer asserts a fact as established. Reporting a source's words is correct when attributed and kept apart from Current State; correct paraphrases score the same. Presenting the source's report as governing Current State is still a 1.

**Why**  
People should be able to ask what was answered without the answer having to become Current State. A failure is hard to assess without seeing what the answer said, and these answers come only from constructed fixtures. The old rubric penalized the attributed wording that `ask_source_words_not_demoted` and `ask_evidence_backed_approval_qualified` require.

**Rejected / deferred**  
Excerpts from any run other than a controlled eval. #642 (what should block an Ask release) is a separate open product question.

**Revisit when**  
Answered Questions crowd out governing records in real answers, or the grader's recalibration shows the new wording scores differently from human grades.

### DEC-019 — Model-key tests in `qa-release`: a failure is rerun once and blocks only if it fails again

**Status:** Decided  
**Date:** 2026-11-08  
**Related:** #624, #649, DEC-013; `Makefile` (`qa-real-model`, `REAL_MODEL_TESTS`)

**Decision**  
Paige agreed (Nov 8) that the pytest files needing a real model key, which `qa-release` runs on model-sensitive changes since #624, gate like this: a run's failed tests are rerun once in the same job (`pytest --last-failed`), and the gate fails only if a test fails again.

**Why**  
Each of these about 72 tests is one live sample. In their first seven forced runs (Nov 8, unchanged commit) `qa-release` failed in 3 of 7 from one-off model misses in different tests, which would make a hard gate mostly noise. The authority repro test, by contrast, failed 2 of 2 before its own hedge check was fixed: a consistent failure fails both attempts and still blocks. A rerun needs no history between runs, which `qa-release` does not keep, and costs only the failed tests' calls.

**Rejected / deferred**  
Report-only (a real regression on the fragile pending-vs-confirmed boundary would pass silently); tolerating any single miss (would have passed the consistent authority failure); "fails twice in a row across runs" (needs stored history).

**Revisit when**  
A known regression passes on rerun, or the same test needs its rerun in most runs (then it needs a fix or a rate measurement, as #649 asks for the Baseline case).

### DEC-020 — An item the source explicitly marks as open becomes a Question, even when it is a detail

**Status:** Decided; on `staging` since Nov 11 (13d90b2); released to `main` Nov 12  
**Date:** 2026-11-11  
**Related:** #649, DEC-019; `question_review_prompt.py`, `eval/mixed_spec_intake.py`

**Decision**  
Paige decided (Nov 11) that when a source itself marks something as open or undecided ("Open question:", "we have not decided", "TBD"), State raises it as a Question, even when it is an implementation or UX detail, in all intake (not only on an empty project). The interpretation guidance's routine-detail rule covers details the source does not flag as open.

**Why**  
On a planning spec, ordinary intake dropped the explicit open question ("what exact grouping UX should we use for a large backfill import?") in 10 of 60 runs (Haiku 5.5, Nov 11), while two other mixed sources were raised 40 of 40 and Baseline Setup 12 of 12. In every captured drop the model's own summary and topics named the open question, but it emitted no open_question recommendation; software removed nothing. The prompt held competing rules: preserve unresolved items as Questions, versus leave implementation detail and non-consequential uncertainty unmodeled. Dropping an item the author flagged as open hides that something is undecided.

**How it is measured**  
`eval.run_mixed_spec_intake` classifies each run as stated as fact, raised, hedged in a fact, or dropped (scored apart, Paige's choice). Before/after on the three intake sources, the Baseline mixed-spec source, and the consequentiality eval. Stated as fact must stay at 0. The Ask-quality eval is run with the eval session before promotion.

**Measured (Nov 11, Haiku 5.5)**  
Ordinary intake, open item dropped: mixed spec 10/60 before, 0/20 after; the other two mixed sources 0/40 before and after. Stated as fact: 0 in every run before and after. No Questions about anything other than the sources' own open items appeared. Baseline Setup mixed spec: raised 12/12 before and after. Consequentiality eval: 100% precision and recall after (as before). `qa-release` model-key tests: 72 passed with no rerun. Review-interpretation suite (run by the eval session, Nov 12, 16 cases x 3): 44/48 on main, 46/48 with the rule, and no case changed to raising an extra Question. Spend for #649 about 270 Haiku calls, roughly $1.20–1.60.

**Revisit when**  
The rule produces Questions people routinely dismiss as noise, or a flagged-open item turns out to be settled elsewhere in the same source.
