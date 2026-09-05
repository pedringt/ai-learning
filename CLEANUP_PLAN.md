# State / AI Learning — Post-Manager Cleanup Plan

**Phase 0 (inspect only) complete — September 3, 2026**
**Branch:** `post-manager-cleanup`, created from `main` at `8f8557a3ab8082be29f5773542e2933855ad564d`
**Nothing has been changed. No merge, no push, no deploy.**

---

## 1. Baseline verified

| Check | Result |
|---|---|
| Clone matches authoritative commit | ✅ `8f8557a3` (merge of PR #10, *Make refinement loading visible above prior answer*) |
| Python suite (live-provider tests deselected) | **235 passed, 3 failed, 6 deselected, 7 subtests passed** |
| JS Ask behavior suite | **81 passed, 0 failed** |

The 3 Python failures are exactly the known-stale set from the handoff — no new regressions:

- `test_browser_user_flows.py::test_backend_review_choice_acknowledges_and_disappears_before_server_round_trip`
- `test_browser_user_flows.py::test_workspace_attention_does_not_wait_for_slow_resolved_reviews`
  → both are the synthetic mock missing the newer `getAttention()` path.
- `test_frontend_integration_contract.py::test_r861_grounded_ask_module_and_release_assets_are_self_contained`
  → asserts `context-ask.js?v=r20-refinement-project`; live asset version is `?v=r22-ui-source-fix`.

### New finding: the browser suite is machine-locked

`test_browser_user_flows.py:57` hardcodes `executable_path="/usr/bin/chromium"`. On any machine without Chromium at that exact path — a fresh laptop, a CI runner, this container before I symlinked it — **all 12 browser tests fail at launch**, and the error Playwright surfaces is a misleading "Sync API inside the asyncio loop" message rather than "file not found."

This matters more than the two stale assertions: it's the difference between "two known-stale tests" and "the whole browser suite appears broken" to anyone who clones the repo. It also blocks Batch CI. Cheap fix — resolve the browser via Playwright's own download, with the hardcoded path as a fallback.

---

## 2. What a developer would actually flinch at

Ranked by how quickly it would produce the "oh no" reaction, not by effort.

### 2.1 Two copies of the frontend, and the dead one looks alive

Seven files exist at the repo root **and** in `implementation-context-prototype/`. The root copies are dead — nothing in any `.html` or `.json` references them:

| File | Root commits | Prototype commits | Referenced by |
|---|---|---|---|
| `context-app.js` (160 KB) | 10 | 60 | prototype only |
| `context-ask.js` | 1 | 11 | prototype only |
| `context-api.js`, `context-data.js`, `context-tool.css` | few | many | prototype only |
| `state-ask-behavior-tests.js`, `STATE-ASK-EVALUATION-MAP.md` | — | — | prototype only |

The root copies aren't just stale — **they have drifted into different behavior**. Root `context-app.js` contains an entire question-resolution loop and a different `followup_mode` fallback that the live file doesn't have. A developer opening `context-app.js` at the repo root reads ~160 KB of plausible-looking Ask logic that has never run in production. This is the single highest-value cleanup item and it carries zero behavior risk.

Same pattern elsewhere:

- **`migrations/`** at root holds `001`–`002`. The backend loads `state-project-complete/migrations/`, which holds `001`–`005`. The root copy reads like the schema and isn't.
- **`REFACTORING_SUMMARY.md`** exists twice with different content.
- **`state-project-complete/render.yaml`** is stale and *contradicts* the authoritative root `render.yaml`: Python 3.12 vs 3.14.3, `DATABASE_PATH=/tmp/state.db` vs `DATABASE_URL`, and no `rootDir` or `branch`. Two deployment configs disagreeing about the database is the kind of thing that reads as "nobody is in control here."

### 2.2 The README describes a product that no longer exists

Root `README.md` (and the prototype's) still describe *Project Context Workspace* and state plainly:

> There is no live model, production retrieval, embeddings, vector store, database, authentication, or backend.

There is now a live Anthropic-backed model, a FastAPI backend, a Postgres/SQLite layer, and five migrations. The README actively misinforms the first file a reviewer opens.

### 2.3 Homepage copy that only exists in CSS

`site-shell.css:410–445`. Three substantive paragraphs — the hero lead, the State positioning paragraph, and the Legal AI recommendation — are rendered as `::before { content: "…" }`, while the real DOM paragraphs are blanked with `font-size:0!important; line-height:0!important`.

Consequence: sighted users see the current wording; screen readers, search engines, link previews, and anyone doing View Source get the *old* wording. It's the most visible correctness/accessibility defect on the site and one of the cheapest to fix — move three strings into `index.html`, delete a 35-line CSS block.

### 2.4 `final-polish.js` — five unrelated jobs on one MutationObserver

155 lines re-running on **every** DOM mutation under `#viewRoot`:

1. injects a `<style>` block at runtime;
2. rewrites button labels back to `Copy` / `New ask`;
3. sets inline `border:0 !important` on every `.ask-answer-item`;
4. drives the rotating Ask wait-state copy;
5. moves `.ask-followup-working` above `.ask-previous-answer` after each render.

Items 1, 2, 3 and 5 exist to defeat CSS specificity and render order. Item 4 is **real product behavior** that simply lives in the wrong file — it should survive the refactor, not be treated as debt.

### 2.5 CSS layered on CSS

| File | Lines | `!important` |
|---|---|---|
| `site-components.css` | 1628 | 452 |
| `context-tool.css` (prototype) | 731 | 208 |
| `site-shell.css` | 445 | 216 |

`context-tool.css` contains roughly **30 separate `@media(max-width:760px)` blocks**; `.project-document-meta` is redefined inside six of them. `index.html` carries eight inline `<style>` blocks with version-stamped ids (`v893-style`, `v932-manager-readiness`, `v9515-learning-type`). The history of every fix is still in the stylesheet.

### 2.6 Mobile State navigation

On mobile, `.sidebar-nav` becomes `display:flex; overflow:auto`. `.project-subnav` is a block element nested *inside* that flex row, so when Project is expanded it breaks the row's rhythm and pushes `Open Items` / `Notes` / `History` past the viewport edge with no scroll affordance. The reference screenshot shows exactly this: *Overview* dropped onto a second line, *Notes* clipped mid-word.

This is an information-architecture problem (a nested disclosure inside a horizontal scroller), not a media-query problem. Another `@media` patch would hide it, not fix it.

### 2.7 Orphaned pages

Nothing in the repo links to these:

- `harborstone.html` (44 KB) — a full page, fully orphaned.
- `implementation-context-experiment.html`, `implementation-context-findings.html` — small stubs.
- Six `legal-ai-*` stubs (`changed-view`, `evidence-audit`, `market-fit`, `next-test`, `operational-hypothesis`, `opportunity-decision`) — ~1 KB each, all redirecting to `legal-ai-governance.html`.

The `legal-ai-*` stubs are almost certainly deliberate redirects preserving URLs shared externally. **Do not archive them without checking where those URLs were sent.**

### 2.8 Six dead cleanup branches

`repo-cleanup-2026-09-03`, `-v2`, `-final`, `-pr`, `-safe`, `-working` all sit **0 commits ahead** of `main` and 33–36 behind. They contain no unique work. Six branches named "cleanup" that never landed is its own bad signal.

### 2.9 Stale build identity

`api.py:27` — `STATE_BUILD_REV = "r9.5-fast-attention-2026-09-03"`, hand-edited and served from `/health`. Render exposes `RENDER_GIT_COMMIT`; using it means `/health` can never lie about what's deployed.

---

## 3. Proposed batches

Each batch is independently revertible and ends with the full suite green (or green-modulo-documented-stale). Nothing merges or deploys.

### Batch 1 — One source of truth *(no behavior change, highest value)*
- Delete the seven dead root-level frontend files. Git history is the archive; a duplicate that reads as live is worse than a deleted one.
- Delete root `migrations/` (subset of the authoritative backend copy).
- Delete `state-project-complete/render.yaml`; add a comment in root `render.yaml` naming it authoritative.
- Collapse the duplicate `REFACTORING_SUMMARY.md`.
- **Verify:** both suites unchanged; grep the repo for any surviving reference to the deleted paths; confirm `vercel.json` and `render.yaml` still resolve.

### Batch 2 — README and docs
- Rewrite root `README.md` around what State actually is now: architecture, the authority model, deployment (Vercel from `main`, Render from `state-project-complete`), how to run tests, and where the authoritative source lives.
- Rewrite `implementation-context-prototype/README.md` as a short pointer, not a second competing description.
- Move the historical `.md` files out of the repo root into `docs/history/` so the root listing reads as a product, not a changelog.
- **Verify:** every path and command in the new README executed.

### Batch 3 — Test reliability
- Resolve Chromium through Playwright's own resolution with the hardcoded path as fallback, so the browser suite runs anywhere.
- Teach the browser mock the `getAttention()` path (2 failures).
- Make the asset-version assertion check *consistency* between `index.html` and the shipped files rather than pinning a literal version string — that assertion has now gone stale twice.
- Add a `pytest.ini` / `conftest.py` marker separating deterministic tests from paid live-provider tests.
- Write the CI workflow **but leave it uncommitted to `main` and unactivated** until you say otherwise.
- **Verify:** target is 238 passed, 0 failed, live-provider tests excluded by marker rather than by hand.

### Batch 4 — Semantic homepage copy
- Move the three CSS-embedded paragraphs into `index.html`.
- Delete the `font-size:0` / `::before` block at `site-shell.css:410–445`.
- **Verify:** visual diff at desktop and 390×844; confirm DOM text, accessibility tree and rendered text now agree; dark mode unchanged.

### Batch 5 — Mobile / responsive pass
- Rework the mobile nav IA: the Project sub-nav should not be a block nested in a horizontal scroller. Options to decide together — collapse Project's children into the scroller as peers, or move the sub-nav to a second row below.
- Then sweep Workspace, Project, Open Items, Notes, History, Ask + refinements, dialogs, dark mode and long content at 390×844 and 430 px.
- **Verify:** screenshots before/after at both widths, plus the existing modal-geometry tests.

### Batch 6 — Retire `final-polish.js`
Ordered so each step is independently revertible:
1. Move the rotating wait-state copy (the real behavior) into `context-ask.js`.
2. Fix the render order so `.ask-followup-working` is emitted above `.ask-previous-answer` — deleting the repositioning step.
3. Fix the renderer to emit correct button labels — deleting the relabeling step.
4. Fold the injected stylesheet into `context-tool.css` and drop the inline `!important` border overrides once specificity is resolved.
5. Delete the MutationObserver and the file.
- **Verify:** the 81 JS tests plus a manual pass over initial Ask, `shorten it` (replace), `what source supports that?` (append), and New ask. **Streaming stays disabled.**

### Batch 7 — Consolidate CSS
- Merge the ~30 scattered `@media(max-width:760px)` blocks in `context-tool.css` into one ordered responsive section; drop rules superseded later in the file.
- Fold `index.html`'s eight version-stamped inline `<style>` blocks into the stylesheet.
- Reduce `!important` only where specificity is genuinely resolved — never by guessing.
- **Verify:** screenshot diff on every view, light and dark, at three widths. This is the batch most likely to cause a silent visual regression, so it goes late and in small commits.

### Batch 8 — Separate backend runtime from spike code
- Relocate `phase2_current/`, the fake providers, and duplicate schemas under an explicitly named archive path so `api.py`'s real dependency graph is legible.
- **Verify:** full Python suite; confirm nothing imported across the boundary.

### Batch 9 — Optional
- Split `context-app.js` (160 KB) along product boundaries only if it materially helps comprehension.
- Replace `STATE_BUILD_REV` with `RENDER_GIT_COMMIT`. *(Changes `/health` output — deploy-time behavior change, needs your sign-off.)*
- Review the SQLite/Postgres compatibility layer. Current read: it is doing real work and should stay. **No ORM.**

---

## 4. Explicitly not doing

Per the handoff, and worth restating so it survives into later sessions: no auth, no organizations, no vector DB, no RAG, no agents, no framework rewrite, no ORM. Evidence stays immutable and separate from Current State; model recommendation stays separate from authority; consequential transitions keep human authorization; optimistic concurrency and stale-proposal blocking stay; History stays atomic with State. Streaming stays disabled in the browser.

---

## 5. Decisions I need from you

1. **Is the freeze still on?** Has your manager finished reviewing? Nothing merges or deploys either way, but it changes how aggressively Batches 4–7 should move.
2. **Root duplicates — delete or archive?** My recommendation is delete: git history already preserves them, and an `archive/` folder full of dead frontend code recreates the same "which one is real?" confusion one directory down.
3. **`harborstone.html` and the six `legal-ai-*` stubs** — were any of those URLs shared externally (resume, LinkedIn, an application, a portfolio link)? If yes they stay. If no, they get archived.
4. **The six dead `repo-cleanup-*` remote branches** — want them deleted? Cosmetic, but it makes the repo read as maintained.
5. **`STATE_BUILD_REV` → `RENDER_GIT_COMMIT`** — this changes `/health` output on the next deploy. In scope or out?

---

## 6. Note on this branch

The `post-manager-cleanup` branch currently exists only in my working environment, which is temporary. Nothing is lost — it's just `main` plus this file — but before real work accumulates, tell me whether to push the branch to GitHub (a branch push, not a merge, and it does not trigger Vercel or Render for `main`) or to hand each batch back as a patch you apply locally.
