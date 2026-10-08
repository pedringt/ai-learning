# Frontend module map (`implementation-context-prototype/`)

Written for #135 (Sept 2026) from an audit of what `index.html` actually loads, what each module does, and how many tests name it. Use it to find the owning module before changing behavior; re-check with `grep` after big changes.

## Decision (#135)

**Update (Oct 2026, #450): the patch layers are now being folded into the renderers, one slice at a time.** The earlier position here was "do not rename or merge", because the layers are coupled by load order and few tests named them, so a merge would happen exactly where protection was weakest. What changed is the protection: `scripts/state_ui_compare/compare.py` renders the old and new build side by side against a local demo backend (no model calls) and compares every element's computed style, text, attributes and structure on every view and Ask state at desktop and phone widths. A slice ships only when that comparison is identical, or every difference is explained and intended. Progress and findings are recorded on #450. (The original dev-only cleanup still stands: `seedStressNotes` was removed with the guard test `state-no-dev-fixtures-tests.js`.)

## Load order and roles

`index.html` loads the files in this order (order matters):

| Layer | Modules | Role |
|---|---|---|
| Foundation | `context-analytics`, `context-data` (Northstar seed fixture), `context-api` (API client, `X-State-Project-Id` header), `context-evidence-resilience` (Evidence submit/upload/retry with long timeouts and the Baseline async ack) | data + transport |
| Ask | `context-ask`, `context-ask-followup`, `context-ask-controls` | Ask requests, streaming, follow-ups; drawer controls (consolidated in #450) |
| Views + core | `context-notes-view`, `context-open-items-view`, `context-project-view`, `context-backend-sync` (maps API records to view shapes), `context-app` (router, render loop, project switcher; 1,800 lines) | the app proper |
| Baseline Setup (three layers) | `context-baseline-setup` (original banner + review dialog), `context-baseline-polish` (manual entry, copy), `context-baseline-dogfood-fixes` (the banner that owns the states, starting-material dialog, polling) | Baseline UX. **Two banner renderers coexist** (`context-baseline-setup` and `context-baseline-dogfood-fixes`) and redraw over each other on every view refresh; #230, #231 and #232 were all bugs at that seam |
| Features | `context-history` (browser history/navigation), `context-provenance`, `context-ask-question-handoff`, `context-settings`, `context-sources` | feature modules |
| **Patch layers (historical names)** | `context-baseline-polish`, `context-baseline-dogfood-fixes` (Baseline; see the row above) | #450 folded the rest: CSS moved to `state-app.css`; `context-quickwins`, `context-design-pass`, `context-feedback-pass`, `-2`, `-3`, `-4`, `context-attention-alignment`, `context-final-mobile` and `context-sources` are deleted. Their behavior now lives in the renderers, `context-ask-controls` (Ask drawer controls) and `context-layout` (layout behavior CSS cannot do) |

## Where responsibilities overlap (candidates for consolidation, not proven duplicates)

Judged from function names; check the code before assuming two functions do the same thing.

| Concern | Touched by |
|---|---|
| Ask controls / launcher | Consolidated in `context-ask-controls` (#450). The old layers' functions are kept there in their original order; the never-visible second clear button and the dead quick-actions branch were removed |
| Attention / Workspace sync | Resolved (#450): after Evidence is added `context-app` re-hydrates (`refreshAfterEvidence`); `feedback-pass` and `feedback-pass-4` are deleted, and `attention-alignment`'s styles are CSS |
| Navigation styling | Resolved (#450): static markup in `index.html` |
| Help card | Card markup is static in `index.html`; `context-layout` positions it and adds the mobile footer (#450) |

#450 is doing this consolidation slice by slice; each slice is checked with `scripts/state_ui_compare/compare.py` (identical UI before and after, including Ask's answered, editing, cleared, error and mid-answer states).

## What the layering has cost so far

- #230: the Baseline review dialog was a stale snapshot because two banner renderers competed.
- #229: `state-shell.js` added a dark class that `forceLightState()` in `context-feedback-pass-3.js` removed only when its own `run()` happened to execute, a race between two layers.
- #232: the switcher's project id was written from seed data by `context-app.js` and trusted by later modules.

## Rules for future work

1. **Do not add another patch layer.** Fix behavior in the module that owns it (views in `context-*-view.js` / `context-app.js`, transport in `context-api.js` / `context-evidence-resilience.js`, Baseline UI in the Baseline modules).
2. **Test first.** Reproduce the problem in a real browser before changing anything (the harness in `state-project-complete/test_preload_project_header_browser.py` loads the real app against a local API and can hold requests open). Most patch layers have no test that names them.
3. **Consolidate one responsibility at a time**, with a behavior-level test in place first, never a rename-only or merge-only pass.
4. **Don't remove `body.v88-dark` / `body:not(.v88-dark)` rules just because State is light-only** (#229): they still apply or are inert, and removing them is a large diff with no behavior change.
5. Loader changes go in `index.html` and must be reflected in `state-*-tests.js` and `README.md`.
