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
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does
  not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Two separate Render backends: `state-api` (production, paid, always-on) and
  `state-api-staging` (free tier, sleeps after idle — a slow/failing first
  request after idle is expected, not a bug). `state-api-staging`'s
  auto-deploy is now scoped to `state-project-complete/` changes only (fixed
  2026-09-05), so frontend-only pushes to `staging` no longer bounce it.
