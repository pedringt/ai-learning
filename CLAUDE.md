# ai-learning

## Start here

Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) first — it's the
canonical current-state doc for the State project (what shipped, what's
next, working rules, core product constraints). Then verify the repo/live
environments before relying on it or older conversation memory.

## Workflow rules

- `main` = production, `staging` = test. Feature branches off `staging`, merge
  to `staging`, push, smoke-test — only merge/push `staging` → `main` with the
  user's explicit authorization each time.
- **`main` is GitHub-protected as of 2026-09-14: a direct `git push origin
  main` is rejected ("Changes must be made through a pull request").** To
  promote, open a PR from `staging` into `main` (`gh pr create --base main
  --head staging ...`), wait for the required status checks (`python`,
  `javascript`) to pass (`gh pr checks <n>`), then `gh pr merge <n> --merge
  --delete-branch=false`. This still only happens with the user's explicit
  per-time authorization, same as before — the PR step is a mechanical
  workflow change, not a change to who approves.
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does
  not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Two separate Render backends: `state-api` (production, paid, always-on,
  deploys on every commit to `main` — no path filter) and `state-api-staging`
  (free tier, sleeps after idle — a slow/failing first request after idle is
  expected, not a bug; auto-deploy scoped to `state-project-complete/`
  changes only, fixed 2026-09-05, so frontend-only pushes to `staging` don't
  bounce it). A push/merge to either branch that touches no
  `state-project-complete/` files legitimately triggers no backend redeploy
  on either service — don't treat an unchanged `/health` build as a stale
  deploy in that case; check `git diff <old>..<new> -- state-project-complete/`
  first.
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
- **Postgres (production) is not a drop-in stand-in for SQLite (staging/
  local) for transaction-error behavior.** A failed statement on Postgres
  poisons the whole transaction until an explicit `ROLLBACK`; SQLite just
  raises and leaves the connection otherwise usable. Any code with a bare
  `try/except: pass` around a speculative query (e.g. "does this table exist
  yet") that's silently relied on to leave the connection usable afterward
  needs `connection.rollback()` in the except branch when
  `connection.is_postgres`, or it will crash-loop production the first time
  it actually runs against Postgres — this exact bug shipped and crash-looped
  `state-api` on 2026-09-14 (see `db.py`'s `Connection.rollback()`), and
  staging's SQLite backend will never catch it in testing.
