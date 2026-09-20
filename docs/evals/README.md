# State eval registry

State's executable eval code lives in `state-project-complete/eval/`. This folder is the PM-facing index for what the evals are supposed to protect and how to add new cases without turning model output into ground truth.

## Eval dimensions

### Integrity

Does State preserve authority, provenance, immutability, uncertainty, version correctness, and project isolation?

### Consequentiality

Does State escalate evidence that materially affects what the project should treat as true, while avoiding low-value Reviews?

### Review burden

Does State require human attention only when judgment/authorization is genuinely needed?

### Ask grounding

Does Ask accurately distinguish Current State, Questions, Reviews, History, and uncertainty without inventing decisions or provenance?

### Baseline decomposition

Does the model turn a starting source into a useful Starting State: several sensible sections instead of one blob, the facts a person would expect, undecided items kept out of the facts, and few failures? Model output varies run to run, so this dimension is measured as **rates over repeated runs**, not as a pass/fail (DEC-008: the Deep QA gate only records how one sample splits).

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

The Baseline decomposition eval (#233) is defined in `state-project-complete/eval/baseline_decomposition.py` (four synthetic sources, scoring, aggregation) and run with `python -m eval.run_baseline_decomposition` (`--dry-run` shows the plan and the number of paid calls without making any; `--route paste|upload`; `--repeats N`; `--json PATH` keeps the actual fact text so the automatic "unresolved recorded as a fact" flag can be judged by a person). It is **paid** (one real model call per source per repeat, 12 by default), is not part of any release gate, and gives a fresh database to every run so results are not contaminated by cross-run state (#238). Its deterministic harness tests are `test_baseline_decomposition_eval.py` (no model). The script loads `state-project-complete/.env`, so a key in that file makes it run for real even when the shell has none; use `--dry-run` to check it.

First observations (2026-09-20; `claude-haiku-4-5`; 3 runs per source on each route, 24 calls; provisional, small samples):

- **Every source came back in the single "General" area on both the paste and the upload route** (24 of 24 runs), including the five-heading plan, so the route is not the cause. Deep QA on staging sees 2-3 non-General areas from the same Atlas source, so something differs between this local harness and the deployed app; unexplained (candidates: deployed provider/prompt configuration, or the harness's `create_app` setup). Worth resolving before treating "General 100%" as a model-quality finding.
- **Facts are coarse:** the five-section, eleven-item plan became 3-4 blob-like facts (recall 88-91%; misses were the export-API dependency and the checklist replacement).
- **Failures: 0 of 24.** Expected-fact recall 97-98% overall. Confirm was blocked by a Review in 42-50% of runs (the decisions-and-open-questions source always did, as intended).
- **The raw "unresolved recorded as a fact" flag was mostly a false alarm, so the scorer now separates hedged mentions from asserted ones.** Reading the fact text (kept with `--json`): 5 of the 6 flagged statements correctly hedged the considered October 14 date ("under consideration", "not yet decided", "no decision has been made"). One paste run (run 2) wrote it as a contingency plan with no uncertainty ("with contingency to move to October 14 if testing slips"), which drops the source's "not decided"; that is the real failure. The scorer counts a mention as hedged only if it carries an uncertainty marker; a bare "if" does not count. Re-scoring the saved outputs of this run with the new scorer gives 1 of 6 suspect, and it is that paste run. The hedge check is a keyword heuristic on four sources: a statement can still hedge in words it does not know, and one that only says "pending decision" is counted as hedged even though a person might rather see it as a Question.
- **Invented specifics are now scored** (a year or dollar amount in a fact that the source never states). The same paste run 2 wrote "September 30, **2024**" although the source gives no year, so both flags fire on one output out of 24.

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