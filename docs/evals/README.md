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