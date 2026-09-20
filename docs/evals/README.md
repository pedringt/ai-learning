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

**Retracted: the first run (2026-09-20, `claude-haiku-4-5`, 24 calls) used the wrong provider, so none of its numbers describe production.** The harness injected the plain `AnthropicProvider`. The deployed app uses the Baseline provider from `baseline_setup._provider_from_env`, which adds the area/topic fields to the output schema, the Baseline prompt guidance ("never place most of a structured source into General"), chunking, and the metadata that stores each fact's area. `create_app(provider=...)` uses what it is given as-is, so the run measured a prompt and schema production never uses. That fully explains "every source came back in General" (24 of 24, both routes) and the gap with Deep QA, and it means the other numbers from that run (0 of 24 failures, 97-98% recall, coarse facts, Confirm blocked in 42-50% of runs) are not evidence about production either. The harness now builds the provider with `real_provider()` and refuses a plain one (`run_scenarios` raises).

What survives from that run is about the **scorer**, not the model. The raw "unresolved recorded as a fact" flag fired on all six `hedged_change` runs; reading the fact text showed five correctly hedged the considered October 14 date, and one (paste run 2) wrote it as a contingency plan with no uncertainty ("with contingency to move to October 14 if testing slips"). The scorer now counts a mention as hedged only if it carries an uncertainty marker (a bare "if" does not count), and it flags any year or dollar amount in a fact that the source never states (paste run 2 also wrote "September 30, **2024**"). Re-scoring the saved outputs gives 1 of 6 suspect and 1 invented, the same run. The hedge check is a keyword heuristic on four sources and can be wrong in both directions. Those two model behaviors (contingency wording, an invented year) were seen once under the wrong prompt, so treat them as candidates to re-check, not as findings.

**No valid baseline exists yet.** A re-run with the correct provider is paid (24 calls for both routes) and needs Paige's go-ahead; nothing should be concluded about decomposition quality before it.

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