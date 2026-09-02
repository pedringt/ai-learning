# State prototype and portfolio site

Current repository for the live portfolio site, State interactive prototype, and the State Evidence -> Review backend.

## Deploy
- Frontend: Vercel from repository root.
- Backend: Render from `state-project-complete/` using `render.yaml` / `Procfile`.
- Production provider defaults to Anthropic Claude Haiku and is configurable with `CLAUDE_MODEL`.

## Backend checks
From `state-project-complete/`:

```bash
pytest -q
python note_matrix_harness.py
```

Provider observability logs include prompt-build time, provider round-trip time, token usage, stop reason, and configured timeout.
