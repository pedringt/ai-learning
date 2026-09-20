# Frontend module map (`implementation-context-prototype/`)

Written for #135 (Sept 2026) from an audit of what `index.html` actually loads, what each module does, and how many tests name it. Use it to find the owning module before changing behavior; re-check with `grep` after big changes.

## Decision (#135)

**The current organization is accepted technical debt. Do not rename or merge the historically named modules.** All 28 `context-*.js` files are loaded by `index.html` and none is dead, so nothing can be deleted "because the name looks temporary". They are coupled by load order (later modules patch what earlier ones rendered), and the automated tests that name most of the patch layers are few or none, so a rename or merge would be a cascade/DOM-order refactor with the weakest protection exactly where it would happen. The benefit would be cosmetic. What was done instead: the one confirmed piece of dev-only code (`seedStressNotes` in `context-feedback-pass-4.js`, two hard-coded "Stress test" notes) was removed with a guard test (`state-no-dev-fixtures-tests.js`), and this map was written.

## Load order and roles

`index.html` loads the files in this order (order matters):

| Layer | Modules | Role |
|---|---|---|
| Foundation | `context-analytics`, `context-data` (Northstar seed fixture), `context-api` (API client, `X-State-Project-Id` header), `context-evidence-resilience` (Evidence submit/upload/retry with long timeouts and the Baseline async ack) | data + transport |
| Ask | `context-ask`, `context-ask-followup` | Ask requests, streaming, follow-ups |
| Views + core | `context-notes-view`, `context-open-items-view`, `context-project-view`, `context-backend-sync` (maps API records to view shapes), `context-app` (router, render loop, project switcher; 1,800 lines) | the app proper |
| Baseline Setup (three layers) | `context-baseline-setup` (original banner + review dialog), `context-baseline-polish` (manual entry, copy), `context-baseline-dogfood-fixes` (the banner that owns the states, starting-material dialog, polling) | Baseline UX. **Two banner renderers coexist** (`context-baseline-setup` and `context-baseline-dogfood-fixes`) and redraw over each other on every view refresh; #230, #231 and #232 were all bugs at that seam |
| Features | `context-history` (browser history/navigation), `context-provenance`, `context-ask-question-handoff`, `context-settings`, `context-sources` | feature modules |
| **Patch layers (historical names)** | `context-quickwins`, `context-product-polish`, `context-design-pass`, `context-feedback-pass`, `-2`, `-3`, `-4`, `context-attention-alignment`, `context-final-mobile` | inject CSS and rewrite already-rendered DOM (each uses a `MutationObserver` and re-runs on every change). Later ones patch earlier ones |

## Where responsibilities overlap (candidates for consolidation, not proven duplicates)

Judged from function names; check the code before assuming two functions do the same thing.

| Concern | Touched by |
|---|---|
| Ask controls / launcher | `feedback-pass` (`askControlStates`), `feedback-pass-2` (`askIcons`), `feedback-pass-3` (`installAskLifecycle`, `ensureAskStatus`), `feedback-pass-4` (`syncAskControls`, `installAskControls`, `restoreAskDiscovery`), `attention-alignment` (`syncAskBlankGuard`), `final-mobile` (`syncMobileAskLauncher`) |
| Attention / Workspace sync | `feedback-pass` (`syncAttentionFromApi`), `feedback-pass-4` (`syncAttention`), `attention-alignment` (`normalizeAttention`) |
| Evidence sync | `feedback-pass` (`evidenceSync`), `feedback-pass-4` (`installEvidenceSync`) |
| Navigation styling | `design-pass`, `feedback-pass` (`fixNav`), `quickwins` (`decorateNav`) |
| Help card | `design-pass`, `feedback-pass-3` (`syncHelpCard`), `final-mobile` (`ensureMobileHelp`) |

If a consolidation is ever attempted, start with **Ask controls** (six modules touch it).

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
