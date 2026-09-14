# ai-learning

## Start here

Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) first — it's the
canonical current-state doc for the State project (what shipped, what's
next, working rules, core product constraints). Then verify the repo/live
environments before relying on it or older conversation memory.

For State QA, read [QA.md](QA.md). It is the canonical QA contract and should
be used instead of inventing a new test plan in each session.

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
