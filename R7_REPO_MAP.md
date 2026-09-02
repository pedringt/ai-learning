# R7 Repository Map

This repository intentionally contains both the live portfolio/prototype surface and the backend. To avoid stale-file deploy mistakes, use these locations as the source of truth:

- **Interactive State frontend:** `implementation-context-prototype/`
  - `index.html`
  - `context-data.js` (offline/demo fallback fixtures)
  - `context-api.js` (backend transport/runtime API configuration)
  - `context-app.js` (UI/application behavior)
  - `context-tool.css`
- **State backend:** `state-project-complete/`
  - `api.py`
  - migration-backed persistence and review services
  - providers and interpretation pipeline
  - migrations and tests
- **Render blueprint:** repository-root `render.yaml`
- **Root historical/portfolio HTML:** reference/portfolio material unless explicitly linked from the live site; do not treat similarly named root prototypes as the State application's implementation source.

R7 deliberately does not move historical files because path changes could break the portfolio/Vercel deployment. Cleanup should happen as a separate path-audited change.
