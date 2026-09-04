# State — frontend

This directory is the **authoritative State frontend**. It is what the live site
loads and what every frontend test reads.

Full documentation — the authority model, architecture, how to run the backend,
deployment, and known debt — lives in the [repository README](../README.md).
This file exists so nobody has to guess whether this directory or some other
copy is the real one. It is.

## Files

| File | Responsibility |
|---|---|
| `index.html` | Application shell and navigation |
| `context-app.js` | Routing, rendering, state transitions, Review decisions, Questions, Notes, History |
| `context-api.js` | Backend HTTP client |
| `context-ask.js` | Ask UI and result rendering |
| `context-data.js` | Deterministic fixture used when the backend is unreachable |
| `context-tool.css` | Product styling |

## Running it

`index.html` opens directly from the filesystem; it detects `file://` and
switches to relative asset paths.

By default it talks to the deployed backend. To point it at a local one, set the
API base before `context-api.js` loads:

```html
<script>window.STATE_API_BASE = 'http://127.0.0.1:8000';</script>
```

or set `data-api-base` on the `<html>` element.

## Tests

```bash
node state-ask-behavior-tests.js
# 81 passed, 0 failed
```

This suite covers deterministic Ask routing and behavior. Browser flow tests and
the frontend integration contract live with the backend suite in
`../state-project-complete/` and read the files in this directory directly.

See `STATE-ASK-EVALUATION-MAP.md` for what the Ask suite covers.
