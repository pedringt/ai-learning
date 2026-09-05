# ai-learning

## Active handoff

A Claude Code session ended mid-task on 2026-09-05. Before starting new work, read
[docs/SESSION_HANDOFF_2026-09-05.md](docs/SESSION_HANDOFF_2026-09-05.md) for
current staging/main state and the exact next step (finishing a 5-item smoke
test on staging before promoting to `main`). Remove this section once that
handoff has been read and acted on.

## Workflow rules

- `main` = production, `staging` = test. Feature branches off `staging`, merge
  to `staging`, push, smoke-test — only merge/push `staging` → `main` with the
  user's explicit authorization each time.
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does
  not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Render (backend, `state-project-complete/`) free tier sleeps after idle —
  a slow/failing first request after idle is expected, not a bug.
