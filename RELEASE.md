# State release readiness

Use this for meaningful promotions. Passing tests is necessary but not sufficient.

## Before staging

- Scope is agreed and implementation is authorized.
- `make qa-fast` passes.
- Relevant regression tests were added for fixed defects where practical.
- Product decisions/risks/docs were updated if behavior changed materially.
- No unresolved P0/P1 finding is being carried forward unintentionally.
- The target is explicitly named before deployment/promotion.

## AI / model change check

When a release changes provider, model, prompt/system guidance, retrieval/context construction, tool schemas, or other model-dependent behavior:

- state the expected semantic behavior change;
- identify the evals/tests that protect the affected behavior;
- check representative latency and cost when either could materially change;
- confirm whether the categories of data sent to a model/provider changed;
- update `docs/product/DATA_PRIVACY.md` or `docs/product/RISKS.md` if data handling or risk changed materially;
- record a practical rollback path before promotion when model behavior could regress.

A model/config change is a product change when it can alter quality, authority behavior, cost, latency, or data handling.

## On staging

- Confirm frontend/backend revisions are the intended ones.
- For Render-backed changes, verify the deployed `/health` build SHA as required by `CLAUDE.md`.
- Run **State Deep QA** when real deployed browser/network behavior matters.
- Run targeted live-model checks only when model-sensitive behavior changed or a known model failure needs re-verification.
- For a major UX/release, run the Cowork exploratory pass and Paige's short manual trust pass from `docs/qa/`.

## Product trust check

Before production, confirm:

- nothing became Current State without human authorization;
- uncertainty/open Questions/pending Reviews are not presented as established truth;
- History/provenance is accurate;
- project isolation holds;
- stale writes/proposals fail safely;
- review burden is acceptable for the changed flow;
- Ask does not invent decisions, quotes, provenance, or certainty;
- any accepted risk is explicit in `docs/product/RISKS.md`;
- no new sensitive-data path or third-party data exposure was introduced without an explicit review.

## Before main / production

Promotion to `main` or production requires Paige's explicit, current, destination-specific authorization.

Then:

- check current `staging` vs `main` diff;
- confirm CI for the exact revision;
- confirm any migrations/backend/frontend pieces are promoted together as required;
- avoid overwriting known main-only/staging-only work;
- record the release in the relevant PR/Issue/project view.

## Rollback / recovery

Define the recovery path before a consequential promotion, especially for model/config, data, or migration changes.

- Prefer a small revert or restore to the last known-good application/config revision when that safely returns behavior to normal.
- Keep frontend/backend/model/config versions coordinated when rolling back only one layer would create an incompatible system.
- For database migrations, prefer backward-compatible changes. If a migration is not safely reversible, document the forward-fix/recovery plan instead of pretending a rollback exists.
- After rollback/recovery, verify the actual deployed revision and run a focused smoke check on the failed path plus adjacent authority/integrity behavior.
- Record P0/P1 escapes through the incident process and add regression/eval protection where practical.

Rollback is itself a deployment/promotion action. Do not change staging or production as part of rollback without Paige's explicit authorization for that named environment.

## After release

- Run a focused production smoke check that does not create unsafe test data.
- If a P0/P1 escapes, use `docs/incidents/TEMPLATE.md` and add permanent regression/eval protection where practical.
- Move completed work to Done only after the intended environment is actually verified.
