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
| `state-shell.css`, `state-shell.js`, `final-freeze-polish.css`, `favicon.svg` | State's own shell (copied from the portfolio's `site-shell.*`; still contains portfolio-only selectors that do nothing here) |
| `api/state-config.js` | Vercel function that tells the page which backend to call (production deploy uses the production API; anything else uses staging) |
| `api/state-diagnostic.js` | Diagnostic helper used by tests |
| `state-product-health.html`, `state-product-health.js` | Internal Product Analytics dashboard (aggregate metadata only; not linked from the product) |
| `vercel.json` | Deployment settings for this folder |

The historically named `context-*-pass.js` files are still live runtime code. Do not remove or consolidate them just because their names look temporary. Previous investigation found real layout/race regressions when seemingly redundant behavior was removed.

## Running locally

`index.html` works out the directory it is served from (`window.__STATE_BASE`) and loads every script and stylesheet relative to it. That makes the same files work from `file://`, from a domain root, and from `/implementation-context-prototype` (Vercel's clean URL has no trailing slash, so plain relative URLs would 404). `state-base-path-tests.js` guards this: no source file may hard-code the old `/implementation-context-prototype/` prefix.

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

## Deployment

This folder is deployed as its own Vercel project, `state` (Root Directory `implementation-context-prototype`, production branch `main`). It is self-contained: it must not load files from the repository root. An Ignored Build Step skips builds for pushes that do not change this folder. Since Sept 20 it compares against the **last commit this branch successfully deployed** (`VERCEL_GIT_PREVIOUS_SHA`), so a batched push builds if *any* commit since then touched this folder, even when the tip commit is docs-only. It **fails open**: it builds when there is no previous deployment, when the commit was already deployed, or when the previous commit is not in Vercel's clone. The setting (Project Settings, Git, Ignored Build Step) is:

```
[ -z "$VERCEL_GIT_PREVIOUS_SHA" ] && exit 1; [ "$VERCEL_GIT_PREVIOUS_SHA" = "$(git rev-parse HEAD)" ] && exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .
```

Its logic was tested on five scenarios in a scratch repo, but **it has not yet been observed on a real push**: after the first batched push, confirm that the `state` project built (Vercel deployment `READY`, not `CANCELED`). To roll back, set the command to the previous value, `git diff HEAD^ HEAD --quiet .`, which looks only at the tip commit of a push. That old rule skipped a batched push whose tip commit was docs-only even though earlier commits changed the app (the `Vercel – state` check still showed green, "Canceled by Ignored Build Step"), and it also skipped API redeploys.

Which backend the page calls is decided by `api/state-config.js`: a **production** deployment (the `main` branch) uses the production API, and every **preview** deployment (for example the `staging` branch) uses the staging API. A Vercel project's very first deployment is labelled production whatever branch it came from, so check `window.STATE_API_BASE` on a new project's first preview before testing against it.

During the move to its own subdomain (#228) the portfolio deployment still serves this folder at `/implementation-context-prototype/`; the root `api/state-config.js` stays for that until the portfolio stops serving the app.
