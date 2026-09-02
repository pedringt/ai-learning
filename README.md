# State prototype and portfolio site

Current repository for the live portfolio site, State interactive prototype, and the State Evidence -> Review backend.

## Deploy
- Frontend: Vercel from repository root.
- Backend: Render from `state-project-complete/`.
- Render Blueprint configuration: repository-root `render.yaml`.
- Python runtime is pinned in `.python-version` and `PYTHON_VERSION`.
- Production database is provided with `DATABASE_URL` (Neon/Postgres).
- Production provider defaults to Anthropic and is configurable with `STATE_PROVIDER` / `CLAUDE_MODEL`.

## Backend checks
From the repository root:

```bash
DATABASE_URL='sqlite:///:memory:' pytest -q state-project-complete
node implementation-context-prototype/state-ask-behavior-tests.js
```

A local SQLite smoke test can exercise FastAPI startup and `/health`; the first real Neon/Postgres startup must still be validated in an environment that can reach Neon.

See `DEEP_REVIEW_REPORT.md` for the September 2, 2026 deployment audit and validation status.
