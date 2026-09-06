# State

**State is a maintained-project-understanding tool.** It keeps a small, trustworthy view of what a project currently treats as true, instead of reconstructing that view from the project's history every time someone asks.

Its central rule:

> **The LLM interprets. Software enforces. The human authorizes consequential State transitions.**

State is the flagship project in an applied-AI learning portfolio. It is a working product with a live model, a real backend and a real database — but it is a learning prototype with deliberately bounded scope, not enterprise software. The tradeoffs below are intentional.

Slack is State's one shipped external integration today, and it's deliberately bidirectional: Slack messages from approved channels become Evidence automatically, and an accepted change can be shared back to the project's Slack channel. Channel approval is intentionally manual right now (see `slack_intake_service.py` in the table below) — inviting the bot to a channel is not the same as approving it for evidence intake.

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
| `render.yaml` (root) | The only *committed* Render config, building the production `state-api` service (`rootDir: state-project-complete`, `branch: main`). A second Render service, `state-api-staging`, tracks the `staging` branch and exists only in the Render dashboard — nothing in the repo declares it. |
| `vercel.json` | Static hosting config for the portfolio site. |
| `index.html`, `site-shell.css`, `site-components.css` | Portfolio homepage and shared shell. |
| `implementation-context*.html` | The State case study (overview, product decisions, deep dive). |
| `docs/` | Historical implementation and review notes. |
| `tools/` | Visual regression harness. Not part of the test suite; see `tools/README.md`. |

### Frontend files

| File | Responsibility |
|---|---|
| `index.html` | Application shell and navigation |
| `context-app.js` | Routing, state transitions, Review decisions, Questions, History, backend hydration -- the pieces that mutate state or talk to the backend. Delegates Notes/Open Items/Project rendering to the view modules below. |
| `context-api.js` | Backend HTTP client, including the `/api/ask/stream` SSE reader |
| `context-ask.js` | Ask UI, streaming and non-streaming result rendering |
| `context-ask-followup.js` | Follow-up question handling for Ask (dependent vs. transformative refinements) |
| `context-data.js` | Deterministic fixture used when the backend is unavailable |
| `context-history.js` | History view rendering |
| `context-notes-view.js` | Notes view rendering: filtering, the note/draft row markup, the composer |
| `context-open-items-view.js` | Open Items view rendering: review/question cards, section collapsing |
| `context-project-view.js` | Project view rendering: wiki-topic grouping, maintained-fact list, outline sections |
| `context-provenance.js` | "Why is this current?" provenance disclosures |
| `context-quickwins.js` | Small incremental UI polish injected at runtime (quick-start Ask prompts, responsive tweaks) rather than folded into `context-tool.css` |
| `context-settings.js` | Settings view: project rules, Slack connection and channel approval |
| `context-sources.js` | Workspace "Sources" banner (Slack connection status) |
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
| `slack_intake_service.py` | Slack event handling and channel approval (`ensure_channel_approved`, called from `api.py`'s `lifespan`). Only reacts to `message` events today — see "Known debt" below. |
| `slack_oauth_service.py` | Self-serve "Connect Slack" OAuth flow |
| `slack_relevance_service.py` | Classifies which Slack messages are worth turning into Evidence |
| `slack_signing.py` | Verifies Slack request signatures |
| `db.py` | Unified SQLite/Postgres connection abstraction |
| `database_migration_backed.py` | Migration runner and schema initialization |
| `anthropic_provider.py`, `openai_provider.py` | Provider adapters |
| `migrations/` | Numbered SQL migrations (`001`–`005`). The only migrations directory. |
| `seed_demo.py` | Idempotent seed for the "Northstar" demo project |
| `phase2_current/state_spike/` | **Runtime code, despite the name.** `anthropic_provider`, `openai_provider` and `interpretation_pipeline_integrated` all add this to `sys.path` and import schema validation, provider normalization and semantic validation from it. Removing or relocating it breaks the backend at import. It also holds the interpretation schema the runtime validates against. |
| `api_test_harness.py`, `note_matrix_harness.py` | Manual harnesses, run by hand (`python api_test_harness.py`). Not in the pytest suite. `api_test_harness` documents the enforcement model end to end: what software normalizes rather than rejects, and where optimistic concurrency actually bites. |

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
# 328 passed, 4 skipped, 7 subtests passed

# JavaScript — deterministic Ask, Notes and provenance behavior
cd implementation-context-prototype
node state-ask-behavior-tests.js            # 81 passed, 0 failed
node state-ask-followup-tests.js            # 18 passed, 0 failed
node state-ask-loading-visibility-tests.js  # 5 passed, 0 failed
node state-provenance-behavior-tests.js
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

CI runs both suites automatically via
[`.github/workflows/tests.yml`](.github/workflows/tests.yml) on every push to
`main`/`staging` and every pull request. It only runs tests — it never builds,
publishes, or deploys anything; Vercel and Render deploy from their configured
branches independently.

---

## Deployment

| Surface | Host | Source |
|---|---|---|
| Portfolio site + State frontend (production) | Vercel | GitHub `main` |
| State API (production, `state-api`) | Render | root `render.yaml`, `rootDir: state-project-complete`, `branch: main` |
| State API (staging, `state-api-staging`) | Render | dashboard-only config (not in `render.yaml`), `branch: staging`, auto-deploy scoped to `state-project-complete/` changes |

`main` is production; `staging` is where changes are pushed and verified first.
Feature work merges to `staging`, and only promotes to `main` with explicit
authorization. Vercel is on a build-rate-limited Hobby plan — batch pushes
rather than deploying `staging` repeatedly. The staging Render service is on
Render's free tier and sleeps after idle, so its first request after a while
is expected to be slow. Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, Slack credentials) are set per-service in the Render
dashboard and never committed.

---

## Deliberate constraints

Things that look like omissions but are decisions:

- **Free-typed Ask questions stream by default; the five suggested-prompt starters don't.** An earlier streaming attempt produced corrupted split words and was reverted to a non-streaming `/api/ask` call; once that rendering bug was fixed, streaming (`/api/ask/stream`, read via SSE in `context-api.js`'s `askStream`) became the primary path again, since context assembly is fast but the model call can take tens of seconds and streaming is the main perceived-latency mitigation. The five starter prompts (`starterKind` in `context-ask.js`) still answer instantly from live API data with no model call at all, so they're intentionally excluded from `canStream`. The stream carries a 45s inactivity timeout. Do not change this balance without evidence and testing — the corrupted-word failure mode is real and already happened once.
- **Ask refinement behavior is backend-driven.** `followup_mode` is authoritative. Transformative refinements ("shorten it", "make this exactly three points") replace the previous answer; conversational follow-ups ("what source supports that?") append.
- **No auth, organizations, or multi-tenancy.** Out of scope for a prototype.
- **No vector database, RAG, or agents.** Selection is authority-aware and deterministic. Adding retrieval machinery would obscure the thing this project is actually about.
- **No ORM.** `db.py` is a small deliberate abstraction over SQLite and Postgres. It is doing real work — parameter conversion, row factories, transaction control, dialect differences — and is smaller than the ORM it would be replaced by.
- **The frontend falls back to a fixture** rather than showing an error when the backend is down.

## Known debt

Being cleaned up deliberately rather than all at once:

- **Partially addressed 2026-09-06.** `context-tool.css`'s ~30 scattered `@media` blocks (several breakpoints redefined five-plus times across separate blocks) are now 13: one canonical block per breakpoint, plus four single-rule exceptions pinned at their original position because moving them would have changed which declaration wins the cascade at that breakpoint (each carries a comment explaining why). The consolidation was done mechanically and verified, not by eye: a small script modeled the cascade for every selector/property in the file across every combination of viewport width, dark mode, and `prefers-reduced-motion`, confirmed the merge changes nothing, and separately confirmed 96 whole rules were already fully dead (permanently shadowed by a later declaration) and safe to delete outright — see git history around 2026-09-06 for the verification script if this is reopened. **Still open:** the same layering pattern in the ~1,100 lines of non-media rules (harder to verify mechanically, since there's no breakpoint to partition on) and the version-stamped inline `<style>` blocks in `index.html` — neither was touched this pass.
- **`context-app.js`'s size — addressed 2026-09-06.** It was a single ~1,840-line module; a full ES-module split was investigated and rejected (the prototype opens from the filesystem via `index.html`'s `file://` guards, and ES modules are CORS-blocked over `file://`). What actually unblocked the split was noticing this codebase already had the answer: `context-ask.js` and `context-provenance.js` were already plain `<script>` files (no modules needed) that keep their own logic private and expose one small `Object.freeze()` API on `window`, rather than dumping shared state there. Applying that same pattern pulled Notes, Open Items, and Project view rendering out into `context-notes-view.js`, `context-open-items-view.js`, and `context-project-view.js` — each takes plain data/callbacks and returns HTML, never touching `state` directly. `context-app.js` is now 1,580 lines (down ~14%) and keeps every original call site working via same-name thin wrapper functions. **Still open:** the remaining ~1,580 lines are Ask routing/submission, backend hydration/mapping, and the event-dispatch handler — all controller logic that mutates `state` or talks to the backend, which doesn't fit the same-shape "given data, return HTML" contract the three extracted modules use. Splitting that further would need a different pattern, not just more of this one.
- `phase2_current/` is named as though it were a superseded spike but is load-bearing runtime code. Renaming it would be the honest fix, and would touch every provider's import path.

---

## What this project is not

It is not a validated commercial product, and it does not claim to be. It demonstrates a design pattern — separating evidence from accepted state, calibrating AI authority to consequence, and keeping uncertainty visible — and the investigation that produced it. The case study at `implementation-context.html` covers the experiment, what weakened the original hypothesis, and what changed as a result.
