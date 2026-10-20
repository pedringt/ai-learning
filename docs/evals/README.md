# State eval registry

State's executable eval code lives in `state-project-complete/eval/`. This folder is the PM-facing index for what the evals are supposed to protect and how to add new cases without turning model output into ground truth.

## Eval dimensions

### Integrity

Does State preserve authority, provenance, immutability, uncertainty, version correctness, and project isolation?

### Consequentiality

Does State escalate evidence that materially affects what the project should treat as true, while avoiding low-value Reviews?

The live review interpretation suite is read as a rate, not all-or-nothing: see "Reading the review interpretation suite" in `RELEASE.md` (#494).

### Review burden

Does State require human attention only when judgment/authorization is genuinely needed?

### Ask grounding

Does Ask accurately distinguish Current State, Questions, Reviews, History, and uncertainty without inventing decisions or provenance?

### Baseline decomposition

Does the model turn a starting source into a useful Starting State: several sensible sections instead of one blob, the facts a person would expect, undecided items kept out of the facts, and few failures? Model output varies run to run, so this dimension is measured as **rates over repeated runs**, not as a pass/fail (DEC-008: the Deep QA gate only records how one sample splits).

### Authority Lab evidence (#517)

`run_quality_evals --authority-lab-envelope PATH` writes the review suite's aggregate results as an `authority-lab-evidence/1` envelope, the evidence Authority Lab uses to judge State's interpretation step ("Interpret incoming project evidence"). The weekly **State AI quality check** workflow saves it as the `authority-lab-evidence-<run>-<attempt>` artifact for 90 days. The envelope's id is the GitHub run and attempt, so re-delivering it is a no-op on Authority Lab's side. `prompt` is a fingerprint of the interpretation instructions, the prompt-rendering code (comments and docstrings ignored), the output schema and the call settings; `evalSet` is a fingerprint of every scenario field. A change to either starts a new configuration in Authority Lab, whose earlier results are kept but no longer counted. Only the review suite is exported; the consequentiality suite waits for #521.

Each review scenario carries two tags (Paige, Oct 13):

- **`unsafe_if`** makes RELEASE.md's "a miss in the unsafe direction blocks even once" a number (`unsafe-direction-misses`). `state_change`: the Evidence settles nothing, so any proposed Current State change is unsafe (ambiguity, tentative high-consequence, non-authoritative opinion, authority disagreement, unknown-not-false, same unknown). `overstatement`: a change is warranted, but overstating its scope or status is unsafe, detected by the scenario's forbidden phrases (partial reversal, partial answer, planned-not-done, correction over a pending Review, answer-only). The rest have no unsafe direction: a missed direct reversal is a routing miss (`review-routing-misses`), a re-proposed duplicate is review burden. The count comes from what the model did, never from the tag alone; an errored run is never an unsafe miss.
- **`risk_kinds`** (stale or conflicting evidence, false certainty, authority) are overlapping, descriptive slices for weak-slice analysis. A scenario may carry several or none. They are not gates unless a target is deliberately bound to one. The library is `eval/authority_lab_export.py` (no `.env`, no model); tests are in `test_authority_lab_export.py`.

### Project Health investigator (Oct 16)

Not a State eval: it measures Project Health's failed-deploy/check investigator (`api/project-health-investigate.js`), which sends sanitized evidence to the model for one short report. Code: `scripts/project_health_eval/` (library `investigator_eval_lib.js`, thin `run.js`, free tests in `implementation-context-prototype/state-project-health-investigator-eval-tests.js`). The paid run happens in the **Project Health investigator eval** workflow on a push to `eval/ph-investigator*`; models, repeats and the call cap are in `config.json`.

- **Cases:** `cases.json` holds real failures collected from the four projects' GitHub check runs and Vercel statuses, built the way the production handler builds evidence (frozen so reruns compare like with like). Each carries a `reference` (the failed job's log tail) that the model never sees, for grading. `planted_cases.js` adds log prompt-injection cases with canary strings, clear single causes, a rate limit, a no-diagnostic failure and a flaky-eval failure.
- **What it records:** mechanical facts per report (labels present, word count, owner value, URLs not in the evidence, action claims, canary strings, planted-cause terms, `stop_reason`), on both the raw model text and the sanitized text Project Health shows. A canary in the text is a fact, not a verdict: reading the hit is required, since reports often quote an ignored instruction.
- **Not decided:** whether a report names the right cause, and every pass/fail threshold, are Paige's to set. Nothing here grades correctness yet.
- **Weekly run:** the workflow also runs on a schedule (Mondays) with `config.weekly.json`: Haiku only, with job-log variants, about 42 calls and $0.02. It writes a table to the run summary and fails only on `failOn` facts (API errors, reports cut off at the cap).
- **Grading page:** `scripts/project_health_eval/grading/build.py` builds Paige's grading page from two run artifacts (instructions in its docstring); it is published at https://claude.ai/artifact/LmwtuHrnPgqatoJsTar1kV and keeps grades in that page's database. Grading is on hold (Oct 16).

## Canonical case shape

For each meaningful case, record:

1. source evidence and relevant Current State;
2. open Questions / prior Review context;
3. expected proposed action;
4. required human decision;
5. allowed mutations;
6. expected History/provenance;
7. failure severity and reason;
8. test layer: deterministic, fake-model pipeline, or real-model eval.

Prefer outcome-based assertions over exact model wording.

## Case registry

The executable consequentiality scenarios are currently defined in:

- `state-project-complete/eval/scenarios.py`
- `state-project-complete/eval/sequences.py`
- `state-project-complete/eval/run_eval.py`

The Baseline decomposition eval (#233) is defined in `state-project-complete/eval/baseline_decomposition.py` (five synthetic sources, scoring, aggregation) and run with `python -m eval.run_baseline_decomposition` (`--dry-run` shows the plan and the number of paid calls without making any; `--route paste|upload`; `--repeats N`; `--json PATH` keeps the actual fact text so the automatic "unresolved recorded as a fact" flag can be judged by a person). It is **paid** (one real model call per source per repeat, 15 by default), is not part of any release gate, and gives a fresh database to every run so results are not contaminated by cross-run state (#238). Its deterministic harness tests are `test_baseline_decomposition_eval.py` (no model). The script loads `state-project-complete/.env`, so a key in that file makes it run for real even when the shell has none; use `--dry-run` to check it. On GitHub, run the manual **Baseline decomposition eval** workflow (`.github/workflows/baseline-decomposition-eval.yml`, Oct 11): it dry-runs first and refuses to start above `max_calls` (default 80; the default 6 repeats on both routes is 60 calls), then writes each route's summary to the run page and uploads the JSON reports as an artifact. Watch `invented_in_draft` (must be 0: a non-zero value means an app bug, #240) alongside `invented_rate` and `flagged_rate`.

**Retracted: the first run (2026-09-20, `claude-haiku-4-5`, 24 calls) used the wrong provider, so none of its numbers describe production.** The harness injected the plain `AnthropicProvider`. The deployed app uses the Baseline provider from `baseline_setup._provider_from_env`, which adds the area/topic fields to the output schema, the Baseline prompt guidance ("never place most of a structured source into General"), chunking, and the metadata that stores each fact's area. `create_app(provider=...)` uses what it is given as-is, so the run measured a prompt and schema production never uses. That fully explains "every source came back in General" (24 of 24, both routes) and the gap with Deep QA, and it means the other numbers from that run (0 of 24 failures, 97-98% recall, coarse facts, Confirm blocked in 42-50% of runs) are not evidence about production either. The harness now builds the provider with `real_provider()` and refuses a plain one (`run_scenarios` raises).

What survives from that run is about the **scorer**, not the model. The raw "unresolved recorded as a fact" flag fired on all six `hedged_change` runs; reading the fact text showed five correctly hedged the considered October 14 date, and one (paste run 2) wrote it as a contingency plan with no uncertainty ("with contingency to move to October 14 if testing slips"). The scorer now counts a mention as hedged only if it carries an uncertainty marker (a bare "if" does not count), and it flags any year or dollar amount in a fact that the source never states (paste run 2 also wrote "September 30, **2024**"). Re-scoring the saved outputs gives 1 of 6 suspect and 1 invented, the same run. The hedge check is a keyword heuristic on four sources and can be wrong in both directions. Those two model behaviors (contingency wording, an invented year) were seen once under the wrong prompt, so treat them as candidates to re-check, not as findings.

**First valid results (2026-09-20; `claude-haiku-4-5`; the Baseline provider the deployed app uses; 3 runs per source on each route, 24 calls, about 12 cents; small samples, so treat rates as directional).**

- **The harness fix is confirmed:** "General" was used in 0 of 23 successful runs (it was 24 of 24 with the plain provider). Areas now come from the model, and vary run to run.
- **Failures: 1 of 24 (4%) in the first corrected run**, on the upload route for the longest source (`structured_plan`, run 0: 0 facts, empty draft). **Its cause was not recorded**: the report did not keep the failed interpretation's error code, and the server log lines were filtered from the console. The harness now reads the failure code and message from the failed record for every failed run, so the next failure can be told apart (`schema_violation`, a semantic code, or `provider_error`, which includes hitting max_tokens). One failure in 24 is too few to say whether it is a schema violation or a truncation.
- **Expected-fact recall 99% overall** (100% on three sources; the longest source lost `export api` in one run, and the failed run counts as zero).
- **Areas differ by source and possibly by route:** the five-section plan produced 1 to 5 areas per run (its expectation is at least 4; enough in 67% of paste runs and 50% of upload runs); the two-section Atlas source produced **1 area in all 3 paste runs** but 2 to 3 in the upload runs (Deep QA uses the upload route and has seen 2 to 3). Three runs cannot separate a route effect from chance.
- **Two repeated model behaviors on `hedged_change`, both worth a closer look** (fact text kept in the `--json` report): (1) the considered October 14 date was written as a "contingent" or "contingency" date in 2 of 6 runs (one per route), which presents an undecided date as a plan and drops "not decided"; (2) **the model invented a year the source never states in 1 of 24 runs** (paste run 2: "September 30, 2025" and "October 14, 2025"), and the retracted first run did the same with 2024, so this has now appeared in two independent runs. State's Baseline lets routine starting facts be confirmed together, so a fabricated year is the kind of specific that could be accepted without a person noticing.
- **Confirm was blocked by a Review in 55% of upload runs and 42% of paste runs**; the decisions-and-open-questions source always blocks it, as intended.

**Targeted re-run (2026-09-20, 12 more calls, about 6 cents): `structured_plan` only, 6 runs on each route, with the failure cause now captured.** **0 failures in 12**, so the single failure did not reproduce: 1 failure in 36 real calls overall (1 in 18 for this source), cause still unknown. What the call logs do rule out, for these calls: none hit the output cap (largest output 895 of 2,000 tokens; every call ended normally with `end_turn`) and none came near the 30-second provider timeout (7 to 10 seconds each), so a routine truncation or timeout is unlikely, though a one-off provider error or a schema violation is not excluded. Recall 95% on both routes (`export api` missed in some runs); areas per run again varied (paste 1.83 on average, upload 2.33; the source has five headings). **A second source produced an invented year**: paste run 3 wrote "March 6, 2025 ... June 2, 2025" for dates the source gives without a year. Invented years are now 2 of 36 correct-provider runs (both paste, none of 18 upload runs) plus the retracted run's 2024; tracked as #240.

**#240 fix (2026-10-11): an invented year or amount can no longer be confirmed in the batch.** Software now checks each routine Baseline fact (`baseline_grounding.py`): a year or currency amount in the AI-written statement or topic that its source Evidence does not state (a two-digit "'26"/"FY26" counts as stating 2026; "$180k" and "180,000" count as the same amount) takes the fact's Review out of the routine draft and into the Review queue, with the reason shown before Confirm. Software does not rewrite the wording; a person accepts, corrects or rejects it. The prompt is unchanged, so the model will still write invented years at about the same rate. The eval now separates the two: **invented** is the model behavior and still counts a fact that was sent to its own Review (so the rate cannot improve just because the fact moved), while **invented in routine draft** must always be 0 (a non-zero value is an app bug, not model variance). A fifth source, `undated_schedule` (every date without a year, plus an amount), targets the behavior. Deterministic coverage: `test_baseline_unsupported_specifics.py` and the end-to-end fake-provider tests in `test_baseline_decomposition_eval.py`. Not measured with the real model yet.

Not concluded: whether the roughly 3% failure rate is real (n=36, one event) or what caused it, whether the paste/upload area and invented-year differences exist (small samples), or whether the "contingency" paraphrase matters to a person reading it.



The **meeting-prep shape** eval (#246) is defined in `state-project-complete/eval/meeting_prep_shape.py` (a deterministic checker: it takes the model's raw meeting-prep answer, runs the real backend normalizer on a copy, and reports what would change: items dropped, sections merged or lost, reordering, retitling) and run with `python -m eval.run_meeting_prep_shape` (`--dry-run` shows the plan and the number of paid calls without making any; `--prompt new|legacy|both` runs the new generated guidance, the old loose guidance, or both side by side through the same code; `--repeats N`; `--json PATH` keeps the model's raw answers). It asks the real model through the app's one-call Ask path on the seeded Northstar and Juniper demo data, with the drawer's "What should I know?" starter and a typed prep request. It is **paid** (about 1 cent per call; 2 projects x 2 queries x repeats x variants), is not part of any release gate, and its deterministic tests are `test_ask_meeting_prep_shape.py` (no model). It answers one question: how often does the model already write the answer in the shape the backend keeps, so a live-streamed answer does not grow, reshuffle or shrink. **First results (2026-09-20; `claude-haiku-4-5`; the app's one-call Ask path on the seeded demo data; 3 runs per project x query x prompt, 24 calls, about a quarter of a dollar; small samples, so directional):**

| | old loose guidance | new generated guidance |
|---|---|---|
| chose `meeting_prep` | 100% | 100% |
| already in final shape (nothing for the backend to change) | **0%** | **83%** (10 of 12) |
| would visibly shrink (items dropped or sections lost) | 92% | 17% |
| sections out of order | 92% | 0% |
| titles rewritten by the backend | 100% | 0% |
| items dropped per answer (mean) | 1.17 | 0.17 |

- **Nothing was lost to get there:** answers are the same size (about 254 words, 10.5 vs 11.1 items), latency is unchanged (13.5 s vs 13.9 s per answer, so a whole answer takes about 14 seconds to write), and the answer had a "Decisions needed" section citing open Reviews in **12 of 12** runs, up from 7 of 12.
- **The residual 17%:** both misses were Northstar, where the model wrote 3 items in "Decisions needed" against a cap of 2, so one bullet is trimmed at the end. Order, titles and section count never changed. Not addressed yet: tightening that one instruction (for example "if more than 2 Reviews are relevant, show the 2 most consequential and say in the summary how many others are open") would need its own measurement, because any wording change invalidates these numbers.
- **The Ask-quality eval found a problem with this first wording, and a revision fixed it (2026-09-20).** Running the existing Ask-quality eval (`python -m eval.run_quality_evals --suite ask`, 8 scenarios) with the first generated guidance gave **7 of 8**: `ask_conflicting_evidence`, a plain `current_fact` question, failed the keyword scorer's uncertainty and authority checks. A 12-call A/B on that scenario: **old guidance 6 of 6, first new guidance 3 of 6** (small samples; about a 7% chance of a gap this size by luck across all 7 new-guidance tries). The answers were close in substance (all kept the approved Current State as the truth and flagged the open Review), but the first guidance's fixed titles ("Decisions needed", "Useful context") showed up in the answer to a plain fact question and displaced titles like "Pending review", which carry the words the scorer looks for. **Revision:** the guidance now says it applies ONLY when the job is `meeting_prep`, and that every other job keeps its own titles (a test pins this). With it: that scenario **5 of 6**; the full suite **8 of 8, 0 high-severity failures**; and among the answers where the model chose `meeting_prep` (9 of 12), **100% were already in final shape** with none shrinking; size and latency unchanged (about 251 words, 14 s). The scorer was not changed.
- **Side effect of the revision, not a failure:** the model chose `meeting_prep` in **9 of 12** runs (it was 12 of 12 with both earlier prompts). The other 3 were all the Northstar "What should I know?" briefing, labeled `current_fact`: same four-section structure and caps, its own titles, no reshaping by the normalizer (so nothing shrinks), but without the "Meeting prep" label and the blank "Meeting notes" block that a `meeting_prep` answer gets in the app.
- **End to end:** the 12 new-guidance answers were streamed frame by frame through the real frontend renderer: nothing ever disappeared mid-stream, and in 10 of 12 the last streamed frame is identical to the finished answer after the backend's trimming; the other 2 are the over-cap case above.
- **Separate observation, not caused by this change (#247):** the model sometimes writes an internal record id into its text (for example "k-monitoring" or "Demo-juniper-review-elevator qualifies this risk."): **7 of 12 raw answers with the old guidance, 3 of 12 with the new**. The backend scrubs these before the answer is shown (`_clean_visible_ask_text`), so what a person reads is much cleaner: after running the real scrubber over these answers, an id or a leftover fragment remained in **0 to 1 of 12** answers per prompt (a range, because the exact selected-record ids were not saved). The leftover is a mangled fragment when a slug-style id has a prefix the scrub regex does not recognize ("Demo-juniper- qualifies this risk."), mainly on the seeded Juniper demo. I found no difference between what streams and what finishes (0 of 12). **Fixed in #247:** the scrubber now removes a seeded slug id whole and is given every id the model was shown, selected or not; re-running the same audit on these 24 answers, even in the worst case (only the ids cited on the answer's own items), leaves an id or fragment in 0 of 12 answers for both prompts (it was 1 of 12 for each).

### Ask completion reliability

The Ask completion-reliability eval measures a different product property from Ask quality: whether a fresh live Ask call can finish the structured grounding contract at all. It was added after production testing on 2026-10-01 showed a plausible answer visibly streaming and then disappearing when the completed payload failed final contract validation.

It lives in `state-project-complete/eval/ask_reliability.py` with the runnable entrypoint `python -m eval.run_ask_reliability`. The suite uses representative typed synthesis questions against the seeded Northstar project, including the exact production question that reproduced the failure. For each fresh call it records:

- first-attempt contract-valid completion rate;
- contract-failure rate;
- recovery rate after the one bounded retry used by Ask;
- unrecovered failure rate;
- provider-error rate separately from contract misses.

This is a **paid, targeted measurement**, not part of the normal release gate and not part of the Ask-quality score. It deliberately does not score wording, grounding quality, or authority semantics; those remain the job of the Ask-quality suite. Run `python -m eval.run_ask_reliability --dry-run` first: the dry run reports both the guaranteed initial-call count and the worst-case retry count without calling a model. The reusable harness is safe to import from deterministic tests and never loads `.env` on import.\n\nFor repeatable chat-driven runs, issue #409 is the dedicated control surface. An authorized repository collaborator can comment exactly `/run-ask-reliability`; after this workflow exists on the default branch, GitHub Actions checks out current `staging`, dry-runs the plan, then runs the fixed 5-question x 2-repeat suite. That means 10 guaranteed paid calls and at most one retry per failed first attempt, for an absolute cap of 20 calls. The workflow uploads the metadata-only JSON report and comments aggregate results back on the runner issue. The Anthropic key remains in GitHub Actions secrets.

### Repeated runs: the eval matrix

One run of a suite says little about a model whose output varies. The **State eval matrix** workflow (`.github/workflows/state-eval-matrix.yml`, manual only, Oct 16) runs the `review`, `ask`, `adversarial`, `consequentiality` and `baseline` suites `repeats` times on one model and reports, per scenario, n, passes, pass rate, a 95% Wilson interval and the failure modes (which wrong action, which failed checks). The library is `state-project-complete/eval/matrix.py` (planning, prices, call caps, per-scenario records), the thin script is `python -m eval.run_matrix`, and the summary comes from `python -m eval.aggregate_matrix DIR`. Tests: `test_eval_matrix.py` (no model calls).

- **Inputs:** `suites` (comma list), `model` (must match `^claude-[a-z0-9.-]+$` and have a price on file; the run sets `CLAUDE_MODEL` to it), `repeats`, `max_calls` (hard cap), `dry_run` (ticked by default: plan only).
- **Calls per repeat** (one per scenario): review 16, ask 10, adversarial 21, consequentiality 36, baseline 5 (paste route; Baseline can add chunk or retry calls, which the cap still bounds). The plan refuses when planned calls exceed `max_calls`.
- **Cost estimate** uses the price table in `eval/matrix.py` (USD per million tokens, input/output: Haiku 5.5 $0.10/$0.50 up to a 100K-token prompt, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Haiku 4.5 $1/$5; from the `claude-api` skill's model table, cached 2026-10-06). Token estimates per call: Baseline measured (run 38187113539: 7,311 in / 871 out); the others from prompt sizes measured offline (11.0K / 13.5K / 12.1K characters for review / ask / consequentiality). The summary prices the actual token usage.
- **Sonnet 5.5 and Opus 5.5 run since Oct 16.** Both reject `thinking={"type": "disabled"}`, so `model_request_options.py` sends each model its accepted thinking-off form (Sonnet 5.5: `between_tools`; Opus 5.5: no `thinking`, effort `low`, plus 8,000 tokens of `max_tokens` headroom). Haiku 5.5 requests are unchanged.
- **`adversarial` suite (Oct 16; 21 cases since Oct 20):** 20 cases in `eval/ask_adversarial_scenarios.py` that attack Ask's pending-vs-confirmed boundary (loaded premises, "FINAL DECISION" wording inside a pending item, a reported CEO decision, launch-tomorrow pressure, an embedded instruction, conflicting proposals) plus 3 controls that catch over-hedging a settled fact. Scored like `ask`. Drafted for Paige's review; she kept every suggested default (each case's comment records the behaviour it scores).
- **Failed scenarios keep a short excerpt of what the model said** (`model_output_excerpt`; every matrix scenario is synthetic), a review failure whose action matched names the part that missed, and a `processing failed` error keeps the interpretation record's error code.
- **Oct 16 scorer corrections (approved by Paige), each from reading the failing answers:** the Ask uncertainty check accepts wordings found in correct answers ("not confirmed", "cannot confirm", "has not been established", "still open", "does not have enough"); the forbidden-claim check treats a negated reporting frame ("State does not show that ...") as negating the claim. Tests pin that overconfident answers still fail.
- **Durations on Haiku 5.5, per repeat** (from past workflow runs): review 35-40 s, ask 28 s, consequentiality 67-77 s, baseline about 20 s per route. Work is split into jobs that each plan at most 90 minutes (other models are assumed 2-3x slower), each job times out at 150 minutes and stops starting repeats after 120, so 100 repeats of everything is 5 jobs.
- **Nothing is lost to a timeout:** each repeat's JSON is written as soon as it finishes, and every job uploads its files with `if: always()`. Each job has its own call cap (the caps add up to at most `max_calls`, and each is at most twice its planned calls), counted on the SDK's `Messages.create`/`stream` before a call is sent.
- **Errors and timeouts are not failures.** A provider exception, a harness error, or an interpretation that ended `failed` (the pipeline's status after a provider error or a schema violation) is counted as an error or timeout and left out of pass rates. This differs from the single-run review report, where a `failed` interpretation counts against the scenario. Ambiguous consequentiality scenarios stay unscored. Baseline has no overall pass/fail (it reports rates); the matrix reports each of its existing measures as a check.
- **Results stay in artifacts.** The matrix never posts to Product Analytics.
- **Weekly regression run (Oct 19):** every Monday at 15:00 UTC, `main` runs `ask,adversarial,review` x30 on `claude-haiku-5-5` (1,380 calls, about $1.40, cap 1,500). Read its summary the way you read any matrix run: a scenario whose interval drops clearly below its usual rate is a regression to investigate, especially on Ask's pending-vs-confirmed boundary.

Targeted model-sensitive regressions also live alongside the State test suite when a single failure needs stronger semantic assertions than review/no-review alone. `test_bootstrap_mixed_spec_eval.py` protects the bootstrap case where one realistic planning/spec document contains settled decisions, tentative ideas, and explicit open questions: the expected outcome includes both at least one proposed maintained fact and at least one proposed Question, without pinning exact model wording.

When a real failure reveals a missing behavior case, add it to the cheapest layer that can reliably catch it. Not every AI-facing bug needs a paid real-model eval; deterministic and fake-provider regression tests are preferable when they can express the invariant.

## Minimum behavior families to retain

- clear state-changing evidence;
- reviewed evidence that should not change Current State;
- evidence that answers a Question without a state change;
- evidence that both resolves a Question and supports a state change;
- evidence that should open a new Question;
- ambiguous/incomplete/conflicting evidence;
- mixed planning/spec Evidence that combines settled decisions, tentative ideas, and explicit open questions, especially during bootstrap;
- high-consequence claims requiring review/audit;
- stale proposals/concurrent edits;
- grouped proposals with mixed outcomes;
- schema-valid but semantically wrong output;
- unknown values that must not become zero/false/absent;
- duplicate/noisy/low-value evidence;
- Ask provenance and uncertainty failures;
- cross-project isolation failures.

## Ownership rule

AI can draft cases for speed. Paige/product judgment reviews, corrects, and augments them before they are treated as expected product behavior.