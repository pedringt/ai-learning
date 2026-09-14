# ai-learning

## Start here

Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) first — it's the
canonical current-state doc for the State project (what shipped, what's
next, working rules, core product constraints). Then verify the repo/live
environments before relying on it or older conversation memory.

Before materially changing State's product thesis, target user, core workflow,
or success definition, read
[docs/product/PRODUCT_BRIEF.md](docs/product/PRODUCT_BRIEF.md). State is a
portfolio/learning product, not an external pilot. Other people may interact
with it as portfolio reviewers or demo visitors. Realistic "if this were a real
product" exercises are encouraged, but never invent customers, adoption,
pilot results, or production-user evidence.

For State QA, read [QA.md](QA.md). It is the canonical QA contract and should
be used instead of inventing a new test plan in each session.

For product decisions, risks, metrics, data/privacy assumptions, and PM workflow,
use [docs/product/](docs/product/). Before reopening a settled behavior or
proposing a materially different product rule, check `DECISIONS.md` and
`RISKS.md`. Actionable work belongs in GitHub Issues/Projects rather than being
buried in long-lived prose docs.

For the State GitHub Project workflow, fields, statuses, and board conventions,
read [docs/product/GITHUB_PROJECT_SETUP.md](docs/product/GITHUB_PROJECT_SETUP.md).
The existing Project is **State Product**; do not create a duplicate Project.

## Product-operating defaults

- Durable settled product choices go in `docs/product/DECISIONS.md`; do not
  casually reopen them without new evidence or an explicit product question.
- Material trust/authority/isolation/review-burden/privacy/cost/latency risks go
  in `docs/product/RISKS.md`; implementation work to mitigate a risk belongs in
  an Issue.
- AI behavior failures should be separated from ordinary software bugs. Use
  outcome-based expectations and the eval registry in `docs/evals/`.
- Treat provider/model/prompt/retrieval/context/tool-schema changes as product
  changes when they can affect semantics, cost, latency, or data handling. Use
  the AI/model section of the PR template and `RELEASE.md` rather than treating
  them as ordinary dependency/config changes.
- Before adding a source/connector or sending new categories of content to a
  model, trace, log, or third party, read `docs/product/DATA_PRIVACY.md` and
  update the privacy/risk assumptions if needed.
- P0/P1 incidents that teach something important about the product or QA system
  should use `docs/incidents/TEMPLATE.md` and add durable regression/eval
  protection where practical.
- Use `RELEASE.md` for release-readiness and rollback/recovery gates. Passing
  tests alone does not imply permission or readiness to promote.

## GitHub Project defaults

- Read the relevant Issue before starting tracked work. Use the Issue for scope
  and the **State Product** Project for current work state.
- When live GitHub Project access is available, keep Status and custom fields
  current. If Project access is unavailable, do not guess the board state from
  conversation memory.
- Use **Backlog** for tracked but not-ready work, **Ready** when scope is clear
  enough to start, **In progress** while actively working, **QA** only after
  implementation is complete, **Staging** only when the change is actually on
  staging, and **Done** when the work is complete and, where relevant,
  released/promoted.
- When creating or triaging work, set **Work Type**, **Priority**, and
  **Product Area** when the right value is clear. Use **Release** only when it
  adds useful planning context.
- Do not infer **QA** or **Staging** from a passing test or open PR. Passing
  tests never grant staging/main promotion permission.
- If implementation or QA reveals a separate reproducible bug, AI behavior
  failure, or unresolved product question, create or recommend a separate
  Issue instead of hiding it in chat or unrelated scope.

## QA defaults

- A request to QA, test, review, inspect, investigate, or smoke-test is
  read-only unless Paige separately authorizes fixes.
- Use `make qa-fast` for normal verification. It is deterministic and makes
  no real model calls.
- Use `make qa-release` for consequential/model-sensitive release checks. It
  runs `qa-fast` first and only adds the paid real-model eval when needed.
- Do not silently skip a required paid/model-sensitive check. Report the
  missing credential or constraint clearly.
- When an authorized fix closes a reproducible bug, add regression coverage
  whenever practical so future QA can move left into the cheaper layer.
- For deployed staging browser QA, use the existing **State Deep QA** GitHub
  Action only after the change is authorized on staging.
- For a human exploratory pass, use `docs/qa/MANUAL_RELEASE.md`. For Cowork,
  use `docs/qa/COWORK.md`.

## Workflow rules

- `main` = production, `staging` = test. Feature branches off `staging`, merge
  to `staging`, push, smoke-test — only merge/push `staging` → `main` with the
  user's explicit authorization each time.
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does
  not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Two separate Render backends: `state-api` (production, paid, always-on) and
  `state-api-staging` (free tier, sleeps after idle — a slow/failing first
  request after idle is expected, not a bug). `state-api-staging`'s
  auto-deploy is now scoped to `state-project-complete/` changes only (fixed
  2026-09-05), so frontend-only pushes to `staging` no longer bounce it.
- **After any push that changes `state-project-complete/` on a Render-backed
  branch, verify the deploy before trusting it or smoke-testing further.**
  Render's own deploy-status API is not sufficient on its own: on 2026-09-14,
  it reported the right commit as `live` while `state-api-staging` was still
  actually serving the previous deploy's code (a missing API field caused
  real request failures). Run
  `scripts/verify-render-deploy.sh <service>/health [expected-sha]` — it
  polls `/health`'s `build` field (the actual deployed `RENDER_GIT_COMMIT`,
  not a hand-maintained string) until it matches, rather than trusting
  Render's dashboard/API status alone. If it doesn't match within the
  timeout, trigger a redeploy with the build cache cleared and re-run it —
  that's what resolved the 2026-09-14 incident.
