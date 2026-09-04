# State

**State is a maintained-project-understanding tool.** It keeps a small, trustworthy view of what a project currently treats as true, instead of reconstructing that view from the project's history every time someone asks.

Its central rule:

> **The LLM interprets. Software enforces. The human authorizes consequential State transitions.**

State is the flagship project in an applied-AI learning portfolio. It is a working product with a live model, a real backend and a real database — but it is a learning prototype with deliberately bounded scope, not enterprise software. The tradeoffs below are intentional.

---

## The authority model

These boundaries are the point of the product. They are enforced in software, not left to the model's judgment.

| Concept | Rule |
|---|---|
| **Current State** | Governs what is true, allowed, or in scope *now*. |
| **Evidence / Notes** | Preserve what was said or observed. They never silently become truth. |
| **Open Reviews** | Qualify Current State. They do not replace it. |
| **Questions** | Known unknowns. Only explicitly blocking questions are blockers. |
| **History** | Records accepted past changes. |

And the transition rules:

- Consequential State changes require a human Review.
- Evidence is immutable; corrections supersede rather than rewrite.
- Review acceptance changes State atomically with History.
- Stale proposals are blocked (optimistic concurrency on the state item's version).
- A Question resolves only through an explicitly linked accepted Review. Source type alone is never sufficient.

If you are changing this codebase, do not weaken these boundaries for convenience.

---

## Where the real code lives

The repository root holds the portfolio site. The two directories below are the deployed application.

| Path | What it is |
|---|---|
| `implementation-context-prototype/` | **The State frontend.** Authoritative. This is what the live site loads. |
| `state-project-complete/` | **The State backend.** Authoritative. This is what Render builds. |
| `render.yaml` (root) | The one Render config. `rootDir: state-project-complete`, `branch: main`. |
| `vercel.json` | Static hosting config for the portfolio site. |
| `index.html`, `site-shell.css`, `site-components.css` | Portfolio homepage and shared shell. |
| `implementation-context*.html` | The State case study (overview, product decisions, deep dive). |
| `docs/` | Historical implementation and review notes. |
| `tools/` | Visual regression harness. Not part of the test suite; see `tools/README.md`. |

### Frontend files

| File | Responsibility |
|---|---|
| `index.html` | Application shell and navigation |
| `context-app.js` | Routing, rendering, state transitions, Review decisions, Questions, Notes, History |
| `context-api.js` | Backend HTTP client |
| `context-ask.js` | Ask UI and result rendering |
| `context-data.js` | Deterministic fixture used when the backend is unavailable |
| `context-tool.css` | Product styling |

### Backend files

| File | Responsibility |
|---|---|
| `api.py` | FastAPI app and all HTTP endpoints |
| `ask_service.py` | Authority-aware candidate selection and synthesis for Ask |
| `ask_contract.py` | Structured contracts for Ask selection and synthesis |
| `ask_provider.py` | Provider-neutral model adapter for Ask |
| `ask_refinement_transforms.py` | Post-processing for Ask refinements (shorten, reformat, etc.) |
| `review_service.py` | Human-authorized review resolution and read models |
| `interpretation_pipeline_integrated.py` | Evidence interpretation pipeline |
| `db.py` | Unified SQLite/Postgres connection abstraction |
| `database_migration_backed.py` | Migration runner and schema initialization |
| `anthropic_provider.py`, `openai_provider.py` | Provider adapters |
| `migrations/` | Numbered SQL migrations (`001`–`005`). The only migrations directory. |
| `seed_demo.py` | Idempotent seed for the "Northstar" demo project |
| `phase2_current/state_spike/` | **Runtime code, despite the name.** `anthropic_provider`, `openai_provider` and `interpretation_pipeline_integrated` all add this to `sys.path` and import schema validation, provider normalization and semantic validation from it. Removing or relocating it breaks the backend at import. It also holds the interpretation schema the runtime validates against. |
| `api_test_harness.py`, `note_matrix_harness.py` | Manual harnesses, run by hand (`python api_test_harness.py`), not part of the pytest suite. See *Known debt*. |

---

## Running it locally

### Backend

```bash
cd state-project-complete
pip install -r requirements.txt

export DATABASE_URL="sqlite:///tmp/state.db"
export STATE_PROVIDER=anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
export STATE_DEMO_BOOTSTRAP=1          # seed the Northstar demo project

python -m uvicorn api:app --reload --port 8000
```

Check it came up:

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","build":"...","demo_bootstrap":true}
```

Migrations run automatically at startup and are recorded in `schema_migrations`.
`DATABASE_URL` is required — set it to a Postgres URL for a Postgres-backed run.

### Frontend

`implementation-context-prototype/index.html` opens directly from the filesystem; it detects `file://` and switches to relative asset paths. By default it talks to the deployed backend. To point it at a local one, set the API base before `context-api.js` loads:

```html
<script>window.STATE_API_BASE = 'http://127.0.0.1:8000';</script>
```

or set `data-api-base` on the `<html>` element.

If the backend is unreachable, the frontend falls back to the deterministic fixture in `context-data.js` rather than failing. That is intentional.

---

## Tests

```bash
# Python — deterministic suite, no flags needed
cd state-project-complete && python -m pytest -q
# 248 passed, 3 skipped, 7 subtests passed

# JavaScript — deterministic Ask behavior
cd implementation-context-prototype && node state-ask-behavior-tests.js
# 81 passed, 0 failed
```

Tests that require real provider API keys skip themselves when the keys are
absent. Nothing needs to be deselected by hand.

`test_ask_cache_authority.py` is the one to watch. It asserts that the Ask
response cache never outlives a human decision — accepting a Review, dismissing
one, or new Evidence arriving all force the next identical question back to the
provider. If those fail, the cache is serving pre-decision answers and the
product's central claim is broken.

Visual changes are checked separately with the harness in `tools/` — it captures
42 screenshots across every view, three widths and both themes, and compares
them byte for byte.

The browser suite (`test_browser_user_flows.py`) drives Chromium through
Playwright. It uses Playwright's managed browser by default:

```bash
python -m playwright install chromium
```

Set `STATE_CHROMIUM_PATH` to use a specific binary instead.

A CI workflow is parked at `.github/workflows/tests.yml.disabled`. GitHub
ignores it until it is renamed to `tests.yml`.

---

## Deployment

| Surface | Host | Source |
|---|---|---|
| Portfolio site + State frontend | Vercel | GitHub `main` |
| State API | Render | root `render.yaml`, `rootDir: state-project-complete`, `branch: main` |

Both deploy from `main` on commit. Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`) are set in the Render dashboard and never committed.

---

## Deliberate constraints

Things that look like omissions but are decisions:

- **Ask streaming is disabled in the browser.** A live token-streaming path produced corrupted split words. `/api/ask/stream` still exists; the UI uses the validated non-streaming `/api/ask` path. Do not re-enable streaming without evidence and testing.
- **Ask refinement behavior is backend-driven.** `followup_mode` is authoritative. Transformative refinements ("shorten it", "make this exactly three points") replace the previous answer; conversational follow-ups ("what source supports that?") append.
- **No auth, organizations, or multi-tenancy.** Out of scope for a prototype.
- **No vector database, RAG, or agents.** Selection is authority-aware and deterministic. Adding retrieval machinery would obscure the thing this project is actually about.
- **No ORM.** `db.py` is a small deliberate abstraction over SQLite and Postgres. It is doing real work — parameter conversion, row factories, transaction control, dialect differences — and is smaller than the ORM it would be replaced by.
- **The frontend falls back to a fixture** rather than showing an error when the backend is down.

## Known debt

Being cleaned up deliberately rather than all at once:

- The stylesheets carry layered version-specific overrides and heavy `!important` use. `context-tool.css` still holds roughly thirty separate `@media(max-width:760px)` blocks, several redefining the same selectors, and `index.html` carries version-stamped inline `<style>` blocks. Consolidating them is the next cleanup pass.
- `context-app.js` is a single 1,600-line module. **Splitting it was investigated and rejected**, for a reason worth recording: the prototype is meant to open from the filesystem (`index.html` has explicit `file://` guards), and ES modules are CORS-blocked over `file://` — verified, not assumed. The only other split is several IIFEs sharing state through `window`, which would take `state` — touched by 64% of the functions — from closure-private to globally mutable. For a product whose thesis is controlled state transitions, that is a downgrade. The file now carries section banners instead, which is what the size problem actually needed.
- `api_test_harness.py` fails 3 of its 8 cases (`create_expected_version_invalid`, `grouping_singleton`, `stale_version`). They are negative-path cases whose expectations no longer match the API; the schema rejects the bad payloads correctly, but the harness's HTTP expectations are stale. Nothing catches this because the harness is manual and outside the pytest suite.
- `phase2_current/` is named as though it were a superseded spike but is load-bearing runtime code. Renaming it would be the honest fix, and would touch every provider's import path.

---

## What this project is not

It is not a validated commercial product, and it does not claim to be. It demonstrates a design pattern — separating evidence from accepted state, calibrating AI authority to consequence, and keeping uncertainty visible — and the investigation that produced it. The case study at `implementation-context.html` covers the experiment, what weakened the original hypothesis, and what changed as a result.
