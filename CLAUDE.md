# ai-learning

## Start here

Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) first. It is the canonical current-state doc for the State project. Then verify the repo and live environments before relying on older conversation memory.

Before materially changing State's product thesis, target user, core workflow, or success definition, read [docs/product/PRODUCT_BRIEF.md](docs/product/PRODUCT_BRIEF.md). State is a portfolio/learning product, not an external pilot. Other people may interact with it as portfolio reviewers or demo visitors. Realistic "if this were a real product" exercises are encouraged, but never invent customers, adoption, pilot results, or production-user evidence.

For State QA, read [QA.md](QA.md). It is the canonical QA contract and should be used instead of inventing a new test plan in each session.

For product decisions, risks, metrics, data/privacy assumptions, and PM workflow, use [docs/product/](docs/product/). Before reopening a settled behavior or proposing a materially different product rule, check `DECISIONS.md` and `RISKS.md`. Actionable work belongs in GitHub Issues/Projects rather than being buried in long-lived prose docs.

For the State GitHub Project workflow, fields, statuses, and board conventions, read [docs/product/GITHUB_PROJECT_SETUP.md](docs/product/GITHUB_PROJECT_SETUP.md). The existing Project is **State Product**; do not create a duplicate Project.

## Product-operating defaults

- Durable settled product choices go in `docs/product/DECISIONS.md`; do not casually reopen them without new evidence or an explicit product question.
- Material trust/authority/isolation/review-burden/privacy/cost/latency risks go in `docs/product/RISKS.md`; implementation work to mitigate a risk belongs in an Issue.
- AI behavior failures should be separated from ordinary software bugs. Use outcome-based expectations and the eval registry in `docs/evals/`.
- Treat provider/model/prompt/retrieval/context/tool-schema changes as product changes when they can affect semantics, cost, latency, or data handling. Use the AI/model section of the PR template and `RELEASE.md` rather than treating them as ordinary dependency/config changes.
- Before adding a source/connector or sending new categories of content to a model, trace, log, or third party, read `docs/product/DATA_PRIVACY.md` and update the privacy/risk assumptions if needed.
- P0/P1 incidents that teach something important about the product or QA system should use `docs/incidents/TEMPLATE.md` and add durable regression/eval protection where practical.
- Use `RELEASE.md` for release-readiness and rollback/recovery gates. Passing tests alone does not imply permission or readiness to promote.

## GitHub Project defaults

- Read the relevant Issue before starting tracked work. Use the Issue for scope and the **State Product** Project for current work state.
- When live GitHub Project access is available, keep Status and custom fields current. If Project access is unavailable, do not guess the board state from conversation memory.
- Use **Backlog** for tracked but not-ready work, **Ready** when scope is clear enough to start, **In progress** while actively working, **QA** only after implementation is complete, **Staging** only when the change is actually on staging, and **Done** when the work is complete and, where relevant, released/promoted.
- When creating or triaging work, set **Work Type**, **Priority**, and **Product Area** when the right value is clear. Use **Release** only when it adds useful planning context.
- Do not infer **QA** or **Staging** from a passing test or open PR. Passing tests never grant staging/main promotion permission.
- If implementation or QA reveals a separate reproducible bug, AI behavior failure, or unresolved product question, create or recommend a separate Issue instead of hiding it in chat or unrelated scope.
- Setting a board item to Done auto-closes its issue, and `gh issue close --comment` then posts no comment: post the explanatory comment with `gh issue comment`.
- The production demo data is writable by anyone, and other sessions may test on the live site. If it drifts from the baseline in `docs/PROJECT_STATUS.md`, reset Northstar (`POST /api/demo/reset` with the header `X-State-Project-Id: northstar`) only with Paige's OK.

## QA defaults

- A request to QA, test, review, inspect, investigate, or smoke-test is read-only unless Paige separately authorizes fixes.
- Use `make qa-fast` for normal verification. It is deterministic and makes no real model calls.
- Use `make qa-release` for consequential/model-sensitive release checks. It runs `qa-fast` first and only adds the paid real-model eval when needed.
- Do not silently skip a required paid/model-sensitive check. Report the missing credential or constraint clearly.
- When an authorized fix closes a reproducible bug, add regression coverage whenever practical so future QA can move left into the cheaper layer.
- For deployed staging browser QA, use the existing **State Deep QA** GitHub Action only after the change is authorized on staging.
- For a human exploratory pass, use `docs/qa/MANUAL_RELEASE.md`. For Cowork, use `docs/qa/COWORK.md`.
- Real-model calls cost money: state the call count and the estimated cost, dry-run first, and get a yes. `make qa-fast` must never call a model: after adding eval code check that the skipped count is unchanged and grep the log for `api.anthropic.com`. Eval scripts load `.env` (#224): put reusable code in a library module, keep the script thin, and import only the library from tests.
- A prompt change needs a before/after measurement on the affected suites (see `docs/evals/`) and the Ask-quality eval (`python -m eval.run_quality_evals --suite ask`) before promotion; never loosen a scorer to make a check pass.

## Workflow rules

- `main` = production, `staging` = test. Feature branches start from `staging` and merge to `staging` first.
- `main` is protected. Do not attempt direct pushes. Changes to `main` must go through a pull request and the required `python` and `javascript` checks must pass.
- Only merge/promote `staging` to `main` with the user's explicit authorization each time. Passing CI is never permission to promote.
- Keep GitHub's **Automatically delete head branches** setting off while `staging` is used as a long-lived promotion branch. A `staging` to `main` PR must not delete `staging` after merge.
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Two separate Render backends exist: `state-api` (production, paid, always-on) and `state-api-staging` (free tier, sleeps after idle). A slow first staging request after idle can be expected.
- Production `state-api` deploys from `main`. `state-api-staging` auto-deploy is scoped to `state-project-complete/` changes, so frontend-only staging pushes do not needlessly bounce it. If a push/merge touches no `state-project-complete/` files, an unchanged staging `/health` build is expected rather than evidence of a stale deploy.
- After any push that changes `state-project-complete/` on a Render-backed branch, verify the actual deployed build before trusting it or smoke-testing further. Run `scripts/verify-render-deploy.sh <service>/health [expected-sha]` and compare the `/health` build field to the expected commit. Do not rely only on the Render dashboard/API reporting a deploy as live.
- Postgres transaction failures behave differently from SQLite. On Postgres, a failed statement leaves the transaction aborted until an explicit rollback. Code that catches a speculative database error and continues must call `connection.rollback()` when `connection.is_postgres` before issuing more SQL. This exact class of bug caused the September 14 production first-boot crash loop and will not be caught by SQLite-only staging behavior.
- Vercel is on the free plan: 100 deployments per day, team-wide (skipped builds appear to count, and Tastemake shares the budget). Batch pushes, and after a promotion confirm the served frontend code and both Vercel projects' statuses, not just green checks. Never "Promote" a staging preview deployment to production: its `api/state-config.js` points at the staging API.
- Production `state-api` on Render has no health-check path, so each deploy causes about a minute of 502s. Avoid deploying while others may be testing the live site.
