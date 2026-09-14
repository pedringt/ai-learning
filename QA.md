# State QA

This is the canonical QA contract for State. Use it instead of inventing a new test plan in each chat or tool.

State exists to maintain a trustworthy answer to: **What should this project treat as true right now?** Its authority model is:

> AI interprets -> software enforces -> people authorize.

## Default rule

A request to **QA, test, review, inspect, investigate, or smoke-test** is read-only unless Paige separately authorizes fixes. Report findings first. Do not edit code, commit fixes, merge, reset shared staging data, or deploy as a side effect of QA.

When a defect is later authorized and fixed, add a regression test whenever practical so the same manual check is less likely to be needed again.

## The two normal commands

### `make qa-fast`

Default for normal work. Free/deterministic. Run this before calling a change verified.

It runs:

- the full Python/pytest suite, including API, integrity, regression, PostgreSQL-backed, and mocked browser coverage already in the repo;
- every `implementation-context-prototype/state-*-tests.js` behavior suite.

It deliberately makes **no real model calls** and does not touch staging or production.

### `make qa-release`

Use for consequential changes or release verification. It always runs `qa-fast` first.

After that it checks the branch diff against `origin/staging`:

- if no model-sensitive State files changed, it skips the paid live-model eval;
- if model-sensitive files changed, it runs `state-project-complete/eval/run_eval.py` against the real Anthropic provider;
- if a real-model eval is required but `ANTHROPIC_API_KEY` is unavailable, release QA stops clearly instead of silently reporting success;
- set `QA_FORCE_REAL_MODEL=1` to force the live eval even when the diff would normally skip it.

This command still does **not** deploy or modify staging.

### One-time local setup

If a fresh machine is missing test dependencies, run:

```sh
make qa-bootstrap
```

Do not run bootstrap on every pass.

## Deployed staging QA

Only after Paige has explicitly authorized the relevant change to reach `staging`:

1. Let the normal GitHub `State QA Fast` checks pass.
2. Verify any Render-backed backend change is actually serving the expected commit, per `CLAUDE.md`.
3. Run GitHub Actions -> **State Deep QA** on `staging` for the real deployed browser/network smoke suite.
4. Run **Question Review live staging check** only when the change needs real-model behavior verified. It makes real model calls and creates test Evidence, so do not treat it as routine CI.
5. Use the short human trust pass in `docs/qa/MANUAL_RELEASE.md` for major releases.

Never use production data for feature QA writes.

## What State QA protects

Treat these as non-negotiable invariants:

1. AI may interpret and propose; it never authorizes Current State changes.
2. Evidence remains immutable after capture.
3. Consequential Current State changes require human authorization.
4. State changes are atomic and recorded in History with provenance.
5. Stale proposals must fail closed or be explicitly superseded.
6. Unknown must not silently become zero, false, absent, or established fact.
7. Ask must distinguish maintained truth from open Questions, pending Reviews, uncertainty, and unsupported claims.
8. A Question can be answered without changing Current State; accepting/reviewing Evidence does not automatically imply a state mutation.
9. Cross-project actions must never leak or write into another project's state.
10. Schema-valid/model-valid output can still be semantically wrong.

## Which layer should catch what

| Layer | Use it for | Cost |
| --- | --- | --- |
| Deterministic Python/JS | invariants, API contracts, regressions, stale writes, history/provenance mechanics, UI behavior | free |
| Fake/mocked model paths inside tests | end-to-end pipeline behavior without provider variability | free |
| Real-model eval | consequentiality, interpretation judgment, schema-valid-but-wrong meaning | paid, targeted |
| State Deep QA | real deployed staging, browser/network/deployment integration | low/no model cost |
| Cowork exploratory pass | confusing, misleading, dead-end, slow, surprising user behavior | human/agent time |
| Paige trust pass | product judgment, review burden, whether a real PM would trust the result | scarce; reserve for meaningful releases |

Always try to move a reproducible bug leftward into a cheaper automated layer.

## When to use each path

**Normal code/UI change:** `make qa-fast`.

**AI interpretation, Ask grounding, consequentiality, Review/Question routing, or other model-sensitive change:** `make qa-release`.

**Change is already authorized on staging and needs real-environment verification:** `State Deep QA`.

**Major UX/release:** automated checks -> Cowork exploratory pass -> Paige's short trust pass.

Do not rerun expensive or destructive layers just because a cheaper layer already proved the relevant behavior.

## Exploratory QA focus

Manual/agent exploration should spend time on things deterministic tests are weakest at:

- Did State technically work but make a bad product decision?
- Did something become authoritative that should not have?
- Did it hide or overstate uncertainty?
- Did it ask for unnecessary human review?
- Did a Question close without enough evidence, or stay open after being answered?
- Did Ask invent provenance, certainty, quotes, or decisions?
- Did project switching leave stale or cross-project information behind?
- Is the workflow understandable to a normal project-team user?

For Cowork, use `docs/qa/COWORK.md`.

## Finding format

Classify each finding as one of:

- **Confirmed bug** - reproduced behavior violates an established expectation.
- **Product ambiguity** - observed behavior exposes an unsettled product decision.
- **Regression risk** - not currently broken, but a nearby behavior lacks adequate protection.
- **Optional improvement** - polish or usability improvement that does not violate a settled expectation.

Severity:

- **P0** integrity/data isolation/authority failure; stop release.
- **P1** major wrong or misleading product behavior; normally stop release.
- **P2** meaningful but bounded defect; fix or explicitly accept before release.
- **P3** low-risk polish/clarity issue.

Use `docs/qa/REPORT_TEMPLATE.md` for a reusable report shape.
