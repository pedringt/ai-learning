# State frontend

This directory is the authoritative State frontend. It is what the live product loads and what the frontend behavior suites exercise.

For the product model, current project status, QA process, release rules, and known risks, start at the repository root:

- `README.md`
- `docs/PROJECT_STATUS.md`
- `QA.md`
- `RELEASE.md`
- `docs/product/README.md`

## Main files

| File | Responsibility |
|---|---|
| `index.html` | Application shell and navigation |
| `context-app.js` | Routing, controller orchestration, dialogs, state transitions |
| `context-api.js` | Backend HTTP client and Ask streaming |
| `context-ask.js` | Ask UI and answer rendering |
| `context-ask-followup.js` | Ask follow-up/refinement behavior |
| `context-backend-sync.js` | Backend payload to frontend-shape mapping |
| `context-notes-view.js` | Notes rendering |
| `context-open-items-view.js` | Reviews and Questions rendering |
| `context-project-view.js` | Current State rendering |
| `context-settings.js` | Rules and Slack settings |
| `context-data.js` | Deterministic local/test fixture |
| `context-tool.css` | Product styling |

The historically named `context-*-pass.js` files are still live runtime code. Do not remove or consolidate them just because their names look temporary. Previous investigation found real layout/race regressions when seemingly redundant behavior was removed.

## Running locally

`index.html` can open from `file://`; it switches to relative asset paths automatically.

To use a local backend, set the API base before `context-api.js` loads:

```html
<script>window.STATE_API_BASE = 'http://127.0.0.1:8000';</script>
```

or set `data-api-base` on the `<html>` element.

## Tests

From the repository root, the preferred deterministic check is:

```bash
make qa-fast
```

CI runs every `state-*-tests.js` file automatically. To run only the frontend suites by hand:

```bash
cd implementation-context-prototype
for f in state-*-tests.js; do node "$f" || exit 1; done
```

Browser-flow and frontend integration tests live under `../state-project-complete/` and read this directory directly.

See `STATE-ASK-EVALUATION-MAP.md` for the Ask behavior/evaluation map.
