# State release readiness

Use this for meaningful promotions. Passing tests is necessary but not sufficient.

## Before staging

- Scope is agreed and implementation is authorized.
- `make qa-fast` passes.
- Relevant regression tests were added for fixed defects where practical.
- Product decisions/risks/docs were updated if behavior changed materially.
- No unresolved P0/P1 finding is being carried forward unintentionally.
- The target is explicitly named before deployment/promotion.

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
- any accepted risk is explicit in `docs/product/RISKS.md`.

## Before main / production

Promotion to `main` or production requires Paige's explicit, current, destination-specific authorization.

Then:

- check current `staging` vs `main` diff;
- confirm CI for the exact revision;
- confirm any migrations/backend/frontend pieces are promoted together as required;
- avoid overwriting known main-only/staging-only work;
- record the release in the relevant PR/Issue/project view.

## After release

- Run a focused production smoke check that does not create unsafe test data.
- If a P0/P1 escapes, use `docs/incidents/TEMPLATE.md` and add permanent regression/eval protection where practical.
- Move completed work to Done only after the intended environment is actually verified.
