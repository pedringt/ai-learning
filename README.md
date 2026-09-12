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
| **Current State** | The maintained project understanding, presented as a readable view: what the team currently treats as true, allowed, or in scope *now*. |
| **Evidence / Notes** | Preserve what was said or observed. They never silently become truth. |
| **Open Reviews** | Qualify Current State. They do not replace it. |
| **Questions** | Known unknowns. Only explicitly blocking questions are blockers. |
| **History** | Records accepted past changes. |

And the transition rules:

- Consequential State changes require a human Review.
- Evidence is immutable; corrections supersede rather than rewrite.
- Review acceptance changes Current State atomically with History.
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
| `context-app.js` | Routing, state transitions, Review-decision and dialog orchestration, the click/change/input event dispatch, and calling into `context-backend-sync.js`. Delegates Notes/Open Items/Current State rendering to the view modules below. |
| `context-api.js` | Backend HTTP client, including the `/api/ask/stream` SSE reader |
| `context-ask.js` | Ask UI, streaming and non-streaming result rendering |
| `context-ask-followup.js` | Follow-up question handling for Ask (dependent vs. transformative refinements) |
| `context-backend-sync.js` | Backend payload → frontend shape mapping and reconciliation (`mapApiReview`, `syncApiState/History/Evidence/Questions/Drafts`, `upsertBackendReview`). Pure data transforms -- no DOM, no API calls, no dialogs. |
| `context-data.js` | Deterministic fixture for local/no-backend paths and tests; deployed authoritative views do not substitute fixture facts when API-backed data fails |
| `context-history.js` | History view rendering |
| `context-notes-view.js` | Notes view rendering: filtering, the note/draft row markup, the composer |
| `context-open-items-view.js` | Open Items view rendering: review/question cards, section collapsing |
| `context-project-view.js` | Current State view rendering: wiki-topic grouping, maintained-fact list, outline sections |
| `context-provenance.js` | "Why is this current?" provenance disclosures |
| `context-quickwins.js` | Small incremental UI polish and orientation behavior (quick-start Ask prompts, first-run guidance, responsive tweaks) rather than folded into the larger controller/style files |
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
| `interpretation_runtime/validation/` | **Load-bearing runtime code** (renamed 2026-09-12 from the misleading `phase2_current/state_spike/`). `anthropic_provider`, `openai_provider` and `interpretation_pipeline_integrated` all add `interpretation_runtime` to `sys.path` and import schema validation, provider normalization and semantic validation from it. Removing or relocating it breaks the backend at import. It also holds the interpretation schema the runtime validates against. |
| `api_test_harness.py`, `note_matrix_harness.py` | Manual harnesses, run by hand (`python api_test_harness.py`). Not in the pytest suite. `api_test_harness` documents the enforcement model end to end: what software normalizes rather than rejects, and where optimistic concurrency actually bites. |

---

## Running it locally

### Backend

```bash
cd state-project-complete
python3 -m venv .venv && source .venv/bin/activate   # gitignored; do not skip this
pip install -r requirements.txt

export DATABASE_URL="sqlite:///tmp/state.db"
export STATE_PROVIDER=anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
export STATE_DEMO_BOOTSTRAP=1          # seed the Northstar demo project

python -m uvicorn api:app --reload --port 8000
```

Use this `.venv`, not a global `pip install`. A real incident (2026-09-07):
a provider-call parameter that worked fine against a globally-installed
`anthropic` package broke every evidence submission on staging, because
the version actually pinned in `requirements.txt` (and what Render
deploys) didn't support that parameter at all — local testing had
silently been running against a different SDK version the whole time. A
project-local venv installed from this exact `requirements.txt` is what
makes "it works locally" mean the same thing as "it works deployed."

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

The deterministic fixture in `context-data.js` supports local/no-backend paths and automated tests. In the deployed API-backed product, authoritative views such as Current State and Open Items show an unavailable/loading state if their backend data cannot be trusted; they do not silently substitute fixture facts and present them as current truth.

---

## Tests

```bash
# Python — deterministic suite, no flags needed
cd state-project-complete && python -m pytest -q
# 339 passed, 44 skipped, 7 subtests passed

# JavaScript — deterministic Ask, Notes, provenance, Workspace and analytics behavior
cd implementation-context-prototype
node state-ask-behavior-tests.js            # 81 passed, 0 failed
node state-ask-followup-tests.js            # 18 passed, 0 failed
node state-ask-loading-visibility-tests.js  # 5 passed, 0 failed
node state-provenance-behavior-tests.js
# ...and 6 more state-*-tests.js files. The full list CI actually runs lives
# in .github/workflows/tests.yml's `javascript` job — that file is the
# source of truth, not this one, so it can't drift out of date here.
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
- **Fixture data is not authoritative production fallback.** It exists for local/no-backend paths and deterministic tests; API-backed authoritative views surface uncertainty/unavailability instead of quietly presenting fixture facts as live Current State.

## Known debt

Being cleaned up deliberately rather than all at once:

- **Partially addressed 2026-09-06, extended 2026-09-11.** `context-tool.css`'s ~30 scattered `@media` blocks (several breakpoints redefined five-plus times across separate blocks) are now 13: one canonical block per breakpoint, plus four single-rule exceptions pinned at their original position because moving them would have changed which declaration wins the cascade at that breakpoint (each carries a comment explaining why). The consolidation was done mechanically and verified, not by eye: a small script modeled the cascade for every selector/property in the file across every combination of viewport width, dark mode, and `prefers-reduced-motion`, confirmed the merge changes nothing, and separately confirmed 96 whole rules were already fully dead (permanently shadowed by a later declaration) and safe to delete outright — see git history around 2026-09-06 for the verification script if this is reopened. The 2026-09-11 pass applied the same mechanical approach to the non-media rules: the file's several "vN refinement" passes (v3/v4/v5, etc.) repeatedly redeclare earlier selectors, so 207 declarations across 113 selectors were provably dead — shadowed by a later rule with the identical selector text, so guaranteed to never win the cascade regardless of anything declared in between. A script computed the winning value for every (selector, property) pair before and after removal (3,238 entries, zero differences) and confirmed every `@media`/`@keyframes` block was untouched; no whole rule was ever 100% dead, so this was per-property removal within otherwise-live rules, not rule deletion. The version-stamped inline `<style>` blocks in `index.html` were addressed the same day: `state-critical-modal` and `state-final-r62` moved into `context-tool.css` (leaving only `state-prepaint-guard`, which must stay inline to prevent a flash of unstyled content before this file finishes loading, and a new trimmed `state-mobile-nav` block — see below). Verification here couldn't rely on identical-selector-text matching alone, since moving content between files risks changing effective cascade order relative to *everything already in the destination file*, not just other copies of the same selector. The actual proof was structural: `context-tool.css`'s own `<link>` already appeared before both inline blocks in document order with nothing else carrying CSS in between, so appending their content to the end of the file preserves every rule's position relative to the file's existing content exactly. A script then confirmed this by computing the cascade winner for every (selector, property) pair across a virtual concatenation of the old arrangement (file + both inline blocks, in their real document order) against the new one (updated file + the one inline block that remained) — 3,321 entries, zero differences. That pass also caught and removed 3 declarations that became newly-dead once `#overlay` and `body.modal-open .topbar,body.modal-open .prototype-productbar` collided with rules already living in `context-tool.css` under the identical selector text. One selector *couldn't* move: `.mobile-primary-nav`/`.mobile-subnav` and their 760px display toggle stayed inline in `state-mobile-nav`, because `test_r16_mobile_workspace_nav_has_horizontal_overflow_affordance` (`test_frontend_integration_contract.py`) pins that ownership on purpose — a 2026-09-08 decision to keep mobile-nav layout out of this shared file after consolidating four competing implementations into one. A first attempt at this move didn't check for that and briefly broke the test before the mobile-nav rules were split back out; the lesson: cascade-order math proves *visual* equivalence, not *architectural intent* a test may be enforcing separately. **Now fully addressed** — nothing further planned on this file barring a real bug or new authored CSS.
- **`context-app.js`'s size — addressed 2026-09-06 and 2026-09-12.** It was a single ~1,840-line module; a full ES-module split was investigated and rejected (the prototype opens from the filesystem via `index.html`'s `file://` guards, and ES modules are CORS-blocked over `file://`). What actually unblocked the split was noticing this codebase already had the answer: `context-ask.js` and `context-provenance.js` were already plain `<script>` files (no modules needed) that keep their own logic private and expose one small `Object.freeze()` API on `window`, rather than dumping shared state there. The 2026-09-06 pass applied that pattern to Notes, Open Items, and Current State view rendering (`context-notes-view.js`, `context-open-items-view.js`, `context-project-view.js` — each takes plain data/callbacks and returns HTML, never touching `state` directly), bringing the file to 1,580/1,847 lines depending on how much Question Review work had landed by the time it was last measured. The 2026-09-12 pass extracted `context-backend-sync.js`: `mapApiReview`, all `syncApi*` functions, `upsertBackendReview`, `replaceBackendOpenReviews`, and their small format/lookup helpers — down to 1,616 lines. This one didn't fit the existing "given data, return HTML" shape (these functions transform and mutate `state.data.*` in place rather than returning markup), so each was reparameterized to take the specific collection it reads/mutates as an explicit argument instead of closing over `context-app.js`'s private `state` — same-name thin wrappers at every original call site, same pattern as before, just a different function shape. A first mapping pass had flagged this whole cluster as one ~480-line block; on closer inspection about half of it (`hydrateBackend`, `saveInformation`, `sendNoteToReview`, `addQuestion`, the analysis-dialog/clock helpers) is controller orchestration -- API calls, dialogs, re-renders -- not pure mapping, and stayed in `context-app.js`. Extracting only the genuinely pure subset kept the change low-risk; a mid-refactor bug (passing the wrong array into `remapQuestionReferences`) and several hardcoded per-test script-loading lists (`test_browser_user_flows.py`, six `state-*-tests.js` harnesses, plus source-text assertions in `test_frontend_integration_contract.py` checking implementation strings against the wrong file) all surfaced via the full test suite before landing, not after. **Still open:** the remaining ~1,600 lines are Ask routing/submission and scenario-demo heuristics (~700 lines, of uncertain coherence -- mixes real Workspace rendering with canned-fixture Q&A logic and direct DOM/state access, flagged for investigation rather than extraction), the event-dispatch handler (~185 lines, one large `if(act===...)` chain closing over a dozen locals -- structurally splittable but not a clean "given data" boundary), and the backend-orchestration functions named above. None of these currently have an extraction boundary as clean as the ones already pulled out.
- **`phase2_current/state_spike/` renamed to `interpretation_runtime/validation/` — addressed 2026-09-12.** The old name read as though it were a superseded spike from an old project phase; it was actually load-bearing runtime code. 15 files across providers, the interpretation pipeline, eval harnesses, and tests referenced it via `sys.path.insert(0, "phase2_current")` + `from state_spike.X import Y` (plus one file using a fully-dotted `phase2_current.state_spike.X` import with no `sys.path` change, and one hardcoded schema-file path string) — all updated to the new names. No behavior change; verified with the full deterministic Python suite, since `api.py` imports `anthropic_provider`/`openai_provider`/`interpretation_pipeline_integrated` at module load time, so any FastAPI-backed test already exercises this import path.
- **The historical "pass" files (`context-design-pass.js`, `context-feedback-pass.js`/`-2`/`-3`/`-4`, `context-attention-alignment.js`, `context-final-mobile.js`) were investigated 2026-09-12, not consolidated.** Despite the names, all 7 are fully live: each injects its own `<style id="...">` block into `<head>` on first run and keeps re-applying DOM patches (icon injection, class toggling, mobile ask-drawer sync) via its own `MutationObserver` watching the whole document — nothing here is dead code. The working hypothesis going in was that later files' heavy `!important` overrides would make much of the earlier files' CSS payload dead weight; a mechanical cross-file cascade analysis (identical-selector-text matching, same method as `context-tool.css`, extended across all 9 CSS sources — the stylesheet, the inline mobile-nav block, and all 7 files' injected `<style>` blocks, in their real DOMContentLoaded-listener-registration load order) found that hypothesis mostly wrong: only 100 of 5,169 declarations (2%) were actually shadowed, meaning these files are largely additive across different selectors, not layered full overrides. That 2% was still real and safe to remove by the same proof used elsewhere in this codebase, plus 39 more declarations in `context-tool.css` itself that turned out to be shadowed by these later-loading files. Verified two ways: the mechanical winner-map comparison (zero differences across all sources), and the repo's own `tools/screenshot_matrix.py` visual regression harness (42 screenshots × before/after, byte-identical). That harness needed a small fix first — its State-view navigation selectors were scoped to `.sidebar-nav`, which is hidden at the 390px phone width since the 2026-09-08 mobile-nav consolidation, so the harness had been silently broken at that width; changed to target `[data-view=...]:visible` so it resolves whichever nav (sidebar or mobile) is actually shown. **Consolidating the JS DOM-patch behavior itself was considered and dropped, not deferred.** Two attempts (one via static reading, one via live DOM inspection) each found a seemingly clean, provably-dead-looking piece of logic, removed it, and broke the sidebar layout on 20 of 42 `screenshot_matrix.py` screenshots both times — confirmed with real Playwright page loads, and in the second attempt, unreproducible via any interactive debugging technique (the DOM looked identical, correct, whether the fix was applied or not; only a genuine cold Playwright page load exposed the break). That's a real race condition across independent `MutationObserver`s in different files, not a case of insufficient care. But stepping back: the only reason this was ever on the list was that the file names look like dead historical scaffolding, which read as confusing to a maintainer encountering them cold. That confusion is already resolved, more cheaply, by this file's own description above and the investigation record here — there was never a concrete bug or a demonstrated ownership improvement driving the JS-consolidation idea itself, just a hypothesis that turned out wrong twice. Per this project's own stated principle ("the objective is not fewer files, it is fewer confusing ownership layers"), that bar was never cleared, and two real attempts spent effort without finding a reason to keep pushing. Not on the list to revisit unless something concrete surfaces later — an actual bug traced to one of these files, or a maintainer genuinely tripped up despite the documentation.
- **Portfolio-wide CSS (`site-components.css`, `implementation-context-case.css`, `site-shell.css`) had the same accumulated dead-declaration pattern as `context-tool.css` — addressed 2026-09-12.** These three files hadn't been through the earlier CSS cleanup passes, which were scoped to the State prototype. The same identical-selector-text cascade analysis found 158 provably-dead declarations (83 in `site-components.css`, 62 in `implementation-context-case.css`, 13 in `site-shell.css`) — removed with the same method and the same rigor: a winner-map comparison (zero differences) plus the actual visual-regression proof this time, since `site-components.css`/`site-shell.css` load on the portfolio homepage and `implementation-context-case.css` loads on the State case study, both already covered by `tools/screenshot_matrix.py` — 42/42 screenshots byte-identical before/after. The other case-study pages (`legal-ai-governance.html`, `state-architecture-cost.html`, `state-testing-debugging.html`, `state-ai-search-learning.html`), which aren't in that harness's page list, were checked by hand in a live browser instead. Found and noted separately, not fixed as part of this CSS pass: `state-ai-search-learning.html`'s `<title>` tag reads "State architecture and cost: before vs. after" — identical to `state-architecture-cost.html`'s title, evidently copy-pasted when the page was created and never updated. `final-freeze-polish.css` was checked and is clean (0 dead declarations) — it's loaded dynamically by `site-shell.js` rather than a static `<link>`, which made it look orphaned on a first grep pass; it isn't.
- **Question resolution provenance imprecision — fixed 2026-09-13.** `resolve_review()` used to stamp every Question a Review resolves with `latest_evidence_id` — the single most-recently-submitted Evidence linked to the *whole* Review via `review_evidence` — not necessarily the Evidence whose interpretation actually established that Question's own answer. Flagged in a 2026-09-07 logic review as needing a schema migration, not a narrow code change. Migration `010_review_questions_evidence_source.sql` adds a nullable `evidence_id` column to `review_questions`, populated in `interpretation_pipeline_integrated.py`'s `resolves_question_ids` insert loop (which knows the current evidence at insert time); `resolve_review()` now reads that per-row value, falling back to the old review-wide approximation only for rows written before this migration. Turned out the realistic failure mode wasn't quite what the original comment described (two Evidence items each resolving a different Question, both attributed to the later one) — `review_questions` links get fully deleted and replaced on every reinterpretation of an open Review, so at any moment they always originate from one single interpretation pass anyway. The actual gap: `latest_evidence_id` is computed from *every* `review_evidence` row regardless of whether it ever triggered an interpretation that touched `review_questions` — e.g. a manually-linked adversarial/navigation relationship (the exact pattern in `seed_demo.py`'s `demo-review-retention`/`ask-evidence-vendor-retention` link) with a later timestamp than the Evidence that actually resolved the Question. Verified with a new test proving that exact scenario against the real interpretation pipeline (confirmed failing pre-fix, passing post-fix), plus a legacy-row fallback test, the full deterministic suite, and a live backend smoke test against a fresh database confirming the migration applies cleanly outside of tests. Two unrelated test-fragility bugs surfaced and were fixed along the way: a hardcoded migration-count allowlist in `database_migration_backed.py` needed the new file added, and an exact dict-equality snapshot comparison in the upgrade-path test that would fail on *any* future migration adding a nullable column (not specific to this one) — normalized to drop `None`-valued keys before comparing, since a new nullable column correctly appearing as `None` on existing rows isn't data loss.
- **"implementation-context" naming predates the State rename and is still live in three places, deliberately left alone 2026-09-13.** The product has been called State for a while, but `implementation-context.html` (the case-study page — live URL `/implementation-context` under Vercel's `cleanUrls`), `implementation-context-prototype/` (the whole State app directory, live at `/implementation-context-prototype/*`), and `implementation-context-case.css` all still carry the old name. Not fixed because the first two are public URLs with no redirect configured in `vercel.json` yet — renaming either without adding a redirect would break any existing bookmark or shared link, and the directory rename alone touches ~20 files (tests, `tools/`, `qa/deployed/`, other case-study pages' breadcrumbs). If this gets picked up later: add `redirects` to `vercel.json` for the old paths before renaming, and treat the directory rename as its own project of similar shape to the `phase2_current` rename above, just larger.
- **A stale link and a redundant runtime patch around the Architecture & Cost case study — fixed 2026-09-13.** `state-ai-search-learning.html` used to exist as a near-duplicate of `state-architecture-cost.html` (same structure, reworded copy, wrong `<title>`) with two different links pointing to it: the Applied Work card (whose own text was already correct — only the `href` was stale) and a Learning Guide "Practice" callout promising an unrelated, never-written "AI Search exploration: retrieval vs. synthesis vs. maintained state" topic. `site-shell.js` had a runtime patch (`oldCostCard`) that rewrote the Applied Work card's stale href/title/copy at load time rather than fixing the source — a live example of the patch-instead-of-fix pattern already flagged and cleaned up elsewhere in this codebase. Fixed at the source: the Applied Work card's `href` now points directly to `state-architecture-cost.html`, the Learning Guide link was removed (nothing existed to point it at), the runtime patch's title/copy rewriting was deleted (kept only as a now-correctly-targeted DOM insertion anchor), and the now-fully-orphaned `state-ai-search-learning.html` was deleted.
- **Consequential evidence could be hard-rejected before ever reaching a human — fixed 2026-09-13.** Found via a live QA pass against the deployed staging backend: submitting `"VP says we can move forward on auto drafting billing questions"` returned `422 schema_violation`. The provider correctly judged the evidence consequential and chose `review_type: proposed_update`, but emitted an empty `proposed_changes` list — invalid per the canonical schema, which requires at least one entry for that type (a `proposed_update` with nothing proposed isn't a coherent thing for a human to review). Confirmed via 5 live calls against the real model at temperature 0 that this exact boundary (a type requiring a concrete change, paired with the model failing to articulate one) gets exercised routinely, even if this specific invalid combination didn't reproduce in that small sample — `state_at_risk` and `open_question` legitimately use empty `proposed_changes` constantly, so the model sits right at this edge. Fixed two ways: `provider_normalization.py` now mechanically downgrades `proposed_update` with an empty `proposed_changes` list to `missing_understanding` (whose schema allows an empty list) — a safe, deterministic repair that doesn't invent a proposed change, mirroring the existing reverse-direction rule (`missing_understanding` + a real state change → `proposed_update`) already in that file. Both providers' prompts also gained an explicit instruction to use `missing_understanding` or `state_at_risk` instead of emitting an empty `proposed_update`, to reduce how often the fallback is even needed (kept terse to stay under the file's own evidence-backed prompt-length budget). Fixing this exposed a second, more serious latent bug in the process: `_filter_duplicate_current_state_creates()` (meant to silently no-op a `missing_understanding` Review that turns out to be an exact restatement of already-active Current State) didn't distinguish "became empty because deduplication removed every proposal" from "was already empty before this function ever ran" — so the newly-downgraded case above was being *silently swallowed* into `no_review` instead of reaching a human, which is arguably worse than the original loud 422: the evidence still never reached Review, just quietly instead of with an error anyone would notice. Fixed to only treat the empty case as a no-op when there were original proposals that dedup actually removed. Verified with new regression tests for both fixes (each confirmed failing before its fix, passing after) plus the full deterministic suite and a live reproduction against the real Anthropic model.

---

## What this project is not

It is not a validated commercial product, and it does not claim to be. It demonstrates a design pattern — separating evidence from accepted state, calibrating AI authority to consequence, and keeping uncertainty visible — and the investigation that produced it. The case study at `implementation-context.html` covers the experiment, what weakened the original hypothesis, and what changed as a result.