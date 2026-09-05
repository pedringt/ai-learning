# ai-learning

## Workflow rules

- `main` = production, `staging` = test. Feature branches off `staging`, merge
  to `staging`, push, smoke-test — only merge/push `staging` → `main` with the
  user's explicit authorization each time.
- Vercel (frontend) is on the Hobby plan and build-rate limited; the user does
  not want to upgrade. Batch pushes and avoid back-to-back staging deploys.
- Render (backend, `state-project-complete/`) free tier sleeps after idle —
  a slow/failing first request after idle is expected, not a bug.
