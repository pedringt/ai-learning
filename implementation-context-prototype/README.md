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
| `context-baseline.js` | Baseline Setup: banner, Starting State draft dialog, manual entry, starting material, confirm/retry (one module since #450) |
| `context-layout.js` | Layout behavior CSS cannot do: help-card width tracking, mobile help footer, mobile subnav pinning, first-render reveal (consolidated in #450) |
| `context-ask-controls.js` | Ask drawer controls: status line, reset button, blank-question guard, editing state, mobile launcher and close handling (consolidated from five patch layers in #450; the Ask flow itself is `runAsk()` in `context-product-polish.js`) |
| `context-backend-sync.js` | Backend payload to frontend-shape mapping |
| `context-notes-view.js` | Notes rendering |
| `context-open-items-view.js` | Reviews and Questions rendering |
| `context-project-view.js` | Current State rendering |
| `context-settings.js` | Rules and Slack settings |
| `context-data.js` | Deterministic local/test fixture |
| `context-tool.css` | Product styling |
| `state-app.css` | Layer styles the `context-*.js` scripts used to inject at runtime, kept verbatim in their settled cascade order (#450); do not reorder sections |
| `state-shell.css`, `state-shell.js`, `favicon.svg` | State's own shell (copied from the portfolio's `site-shell.*`; still contains portfolio-only selectors that do nothing here) |
| `api/state-config.js` | Vercel function that tells the page which backend to call (production deploy uses the production API; anything else uses staging) |
| `api/state-diagnostic.js` | Diagnostic helper used by tests |
| `state-product-health.html`, `state-product-health.js` | Internal Product Analytics dashboard (aggregate metadata only; not linked from the product) |
| `vercel.json` | Deployment settings for this folder |

The historically named patch layers (`context-*-pass.js`, `context-quickwins.js` and others) were folded into the renderers and a few owning modules in #450, one verified slice at a time. Each slice had to leave the rendered UI identical (computed styles, text and structure on every view, Ask state and Baseline state at desktop and phone widths, checked with `scripts/state_ui_compare/compare.py`) unless a difference was explained and intended. Do not add new patch layers; change the module that owns the behavior.

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

This folder is deployed as its own Vercel project, `state` (Root Directory `implementation-context-prototype`, production branch `main`). It is self-contained: it must not load files from the repository root. An Ignored Build Step skips builds for pushes that do not change this folder. **Current rule (since Oct 10, in `vercel.json` as `ignoreCommand`):** build unless it can prove nothing in this folder changed since the last successful deployment, and only ever exit 0 (skip) or 1 (build):

```
[ -z "$VERCEL_GIT_PREVIOUS_SHA" ] && exit 1; [ "$VERCEL_GIT_PREVIOUS_SHA" = "$(git rev-parse HEAD)" ] && exit 1; git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null || exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . && exit 0 || exit 1
```

So it builds on a first deploy, on a redeploy of the same commit, when Vercel's shallow clone lacks the previous commit, and when any commit since the last deploy touched this folder (even if the tip commit is docs-only). Vercel fails the deployment on any exit code other than 0 or 1, which is why every path ends in one of them. `state-project-complete/test_vercel_ignore_step.py` runs the real command in scratch repos, including a shallow clone.

History: the Sept 20 version (same comparison, no `cat-file` guard, no final `exit 0 || exit 1`) failed a deploy on Sept 26 when `git diff` exited 128 in a shallow clone; it was replaced by a tip-commit-only rule (`git diff HEAD^ HEAD -- .`), which then left a rate-limited deploy unretried on Oct 10 because the next push's tip commit didn't touch this folder. The dashboard's Ignored Build Step setting may still hold an older value; `vercel.json` is the source of truth for this repo.

Which backend the page calls is decided by `api/state-config.js`: a **production** deployment (the `main` branch) uses the production API, and every **preview** deployment (for example the `staging` branch) uses the staging API. A Vercel project's very first deployment is labelled production whatever branch it came from, so check `window.STATE_API_BASE` on a new project's first preview before testing against it.

During the move to its own subdomain (#228) the portfolio deployment still serves this folder at `/implementation-context-prototype/`; the root `api/state-config.js` stays for that until the portfolio stops serving the app.
