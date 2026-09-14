# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository before relying on older handoffs or conversation memory.

## Resume here: #110-#117 fully promoted to main; production healthy

_Last updated: September 14, 2026 Pacific time, end of session. This section replaces the previous "#110-#117 done and pushed to staging" summary — that work, plus a second full round of live QA fixes, is now on `main` and confirmed live in production._

**Everything is promoted.** `main` is at commit `e49ad49` (merged via PR #123 — see the new branch-protection note in `CLAUDE.md`'s Workflow rules; direct pushes to `main` are now rejected by GitHub). Both the `#110-#117` generalization/release-hardening work (including #114's second seeded project, "Juniper Office Move," with a real project switcher and full cross-project isolation) and a large second round of live-QA-driven fixes are live. Confirmed directly against production: `/health` reports the right commit, `/api/projects` and `/api/bootstrap` return correct per-project data for both projects, and the Vercel frontend deployment shows `githubCommitSha: e49ad49`, `target: production`, `state: READY`.

**Fixed and verified this session, now in production:**
- The P0 cross-project write race (a stale browser tab's write landing in whichever project another tab most recently switched to) — fixed by having every request carry the client's own believed-active project (`X-State-Project-Id` header), not just trusting a shared server-side pointer.
- The P1 Ask fabrication bug (inventing a quoted "AI proposed X, human approved Y" provenance story for a Review that was actually left unchanged) — fixed in the grounding prompt **and re-verified live against the real model** (not just committed as untested prompt text — see the two live QA passes' transcripts if you need the exact repro).
- **A real production incident, found and fixed the same day it was introduced**: promoting the #114 work crash-looped `state-api` on first boot. Root cause: a speculative `SELECT` against `active_project` (used to resolve which project a request belongs to) was wrapped in a bare `try/except` that's safe on SQLite but fatal on Postgres — a failed statement poisons the whole transaction until an explicit `ROLLBACK`. `initialize_db()`'s very next statement died with `psycopg2.errors.InFailedSqlTransaction` on every boot. Fixed by rolling back the poisoned transaction on Postgres before continuing (`db.py`'s `Connection.rollback()`). See the new note in `CLAUDE.md` — this class of bug will never show up against staging's SQLite backend, only Postgres.
- **Northstar's Current State page showing almost no real areas** ("General" only) — migration 012 added the `area_id` column but never backfilled existing rows; Northstar's original items predate that migration (seeded years before #113's area work existed), so they stayed `NULL` forever. Backfilled in `seed_demo.py`'s seeding loop.
- **The Workspace dashboard's "Current State" card leaking Northstar-specific text onto every other project** — went through several iterations (worth reading the session transcript if touching this card again): the original "preview real facts" feature (`context-design-pass.js`'s `factPreview()`) could never work because it scraped `.project-page`, which is never present on the Workspace route it decorates — so it always silently fell back to three hardcoded Northstar sentences, for every project, since the feature was written. Rebuilt against `state.data.knowledge` directly (real, correctly project-scoped data), restored the *exact* original CSS (an approximated rebuild looked visibly different — smaller dividers, different padding, wrong checkmark color), and balanced the paired "What Changed"/"Current State" card heights (both cards are stretched to equal height by an existing rule; the fix was giving both roughly comparable *real* content — truncated fact bullets, 3 recent History items — not fighting the stretch itself).
- Ask's "×" now genuinely cancels an in-flight request (aborts the actual fetch/stream, not just suppresses rendering the eventual answer) — found the same bug independently existed in the project-switch-mid-answer path too.
- Project Rules were being fed into *every* project's live evidence interpretation (both providers), not just the project that owns them — a real cross-project leak in a code path the earlier #114 QA passes never checked (only the correctly-scoped Settings/Ask read path).
- A round of smaller UI fixes: project switcher dropdown clipping/overlap (position:fixed trapped by a stretched-context CSS quirk, needed reparenting to `<body>`), disabled-button styling, the "switching projects" modal timing, History's confusing click-to-filter behavior (removed), a stage-text display bug (a `·`-splitting hack that only worked for one specific old wording), and more — see the `staging` commit history around 2026-09-14 for the full list if you need it.

**Known, deliberately-not-addressed items:**
- Project switching feels slow in production (Postgres) — diagnosed as an N+1 query pattern in `list_reviews()`/`list_history()` (4+ extra round-trip queries per row), invisible against SQLite's near-zero query latency. Real, pre-existing, not from this session. Would need batching those per-row queries into single `IN (...)` queries — a real refactor of heavily-tested core functions, not attempted yet; ask the user before starting it.
- "Subnav click does nothing while Ask is open" — confirmed real by the user via screen recording, but did not reproduce in an isolated local test with real seeded-shape content. Needs the actual deployed environment's exact conditions to diagnose further.
- `project_areas.id` is a bare global primary key, not project-scoped — a documented, deliberately-deferred scaling risk. Fine with today's two projects (their area ids don't collide), needs a real schema fix (composite key) before a third project is added.
- Occasional Ask grammar glitches in generated prose — live-model output text, not something a code fix can reliably address.

### Branch state (historical — #104-#108, already shipped)

- Branch: **`review-quality-104-105`**, created off `staging` at commit `d9a1009`.
- **Not pushed to origin.** `git ls-remote --heads origin review-quality-104-105` returns nothing. Pushing it is the first step before any PR or staging preview.
- 7 commits ahead of the `staging` branch point, all local:

| Commit | What it did |
| --- | --- |
| `36370b0` | #104/#105: consequentiality filtering, decision-sized Review grouping, no-acknowledgment-only Reviews |
| `41b9706` | #104/#105 follow-up: fixed 3 real gaps the long discovery-note stress test found (a dropped grouped policy, a missed Question-resolution link, and an Ask retrieval bug traced to a mechanical filter bug, not a model gap) |
| `255c578` | #106: human-adjusted Review proposals without losing AI provenance |
| `6eb9837` | #107: Review decision UI — Update/Adjust/Leave unchanged, removed "Mark reviewed" |
| `5289f40` | #108: "Something changed?" entry point from Current State to Add Evidence |
| `96e8d36` | Added `qa_holistic_server.py`, a reusable local QA tool (real demo data + real live provider, no staging/prod traffic) |
| `757dc6c` | Fixed the one real gap the holistic pass found: #106's adjustment provenance is now visible in History and available to Ask (was stored correctly on the backend but invisible everywhere downstream) |

- Full deterministic test suite (backend pytest + all 20 frontend JS suites) is green. The only non-green results across this whole session were isolated live-model judgment tests, each individually confirmed to be pre-existing model variance (reproduced on baseline code), not regressions from this work.
- All GitHub issue findings are posted as comments on [#104](https://github.com/pedringt/ai-learning/issues/104), [#105](https://github.com/pedringt/ai-learning/issues/105), [#106](https://github.com/pedringt/ai-learning/issues/106), [#107](https://github.com/pedringt/ai-learning/issues/107), [#108](https://github.com/pedringt/ai-learning/issues/108), and the tracker [#109](https://github.com/pedringt/ai-learning/issues/109) (all checkboxes checked). Read #109's comment thread top to bottom for the full narrative if you need more than this summary.

### What's actually in the branch

- **#104/#105** (`state-project-complete/`): `consequentiality_guidance.py` (shared prompt guidance for both providers), pipeline-level enforcement that a `missing_understanding` Review can't be created with nothing to propose, and a mechanical fix to `ask_provider.py`'s date-lookup candidate filter (was silently dropping records that named a date without containing the literal word "date").
- **#106**: migration `011_review_proposal_adjustments.sql` adds `proposed_state_changes.adjusted_statement` and `history_transitions.accepted_as_adjusted`. `resolve_review()` takes an optional `adjustments` dict; a materially-adjusted accept doesn't auto-resolve a linked Question (conservative by design).
- **#107** (`implementation-context-prototype/`): `context-open-items-view.js`'s `reviewCard()` now branches on review type — ordinary Update/Adjust/Leave-unchanged, bespoke `state_at_risk` wording ("Still uncertain — keep it flagged" / "Not a concern"), `open_question` unchanged. New `adjustDialogHtml()` for the Adjust flow.
- **#108**: one "Something changed?" CTA in Current State's page header (`context-project-view.js`), reusing the exact Add Evidence dialog with only the description copy swapped.
- **Provenance fix**: `list_history()` now returns `ai_proposed_statement`; History shows a distinct decision line and a "State proposed"/"Human approved" block only for adjusted transitions; Ask's candidate context and grounding rules can explain an adjustment without ever treating the AI's original wording as current.
- `index.html`'s frontend cache-bust version token is now `r109-adjustment-provenance` (bumped correctly in both places it needs to match — a test, `test_release_asset_loader.py`, now enforces this after catching a real mismatch mid-session).

### Known, deliberately-not-fixed items

- **Hallucinated Question ID**: one live interpretation call referenced a non-existent Question ID and failed safely (Evidence preserved, no bad Review created, retry succeeded). Documented on #109 as a candidate for a future hardening issue ("validate model-returned Question IDs and reject unknown ones more gracefully"), explicitly not bundled into the provenance fix.
- **Cosmetic copy repetition**: a Review's "Still unresolved" block sometimes just repeats its own `decision_question` verbatim. Noted, not staging-blocking.
- A visual-quality look at the Adjust dialog/buttons by the user themselves (not just Claude's verification) is still open — the user said they'd do that once the branch is on a preview/staging surface.

### Next action when the user returns

The user's stated plan, in order: push the branch → staging/preview review → fix anything found there → update the case study (sprinkled into existing sections, not expanded) → then, with explicit confirmation, consider `staging`/`main`. Do not skip ahead — each step needs the user's go-ahead in the new conversation, same as every phase in this one did. Do not re-run the full holistic QA pass from scratch; if something needs re-checking, do a focused check on just that thing (that's what the user asked for last time this came up).

The strongest new case-study takeaway from this work, per the user: *"Human review only works if the system is selective about what reaches people and makes each decision clear enough to act on"* — backed now by the long discovery-note test, the Ask retrieval bug, and the Adjust/provenance work as concrete evidence. Save that framing for the case-study update step; don't act on it before then.

### Additional user note: reset-data loading feedback (resolved 2026-09-12)

The user noted after the pause: "resetting data modal probably needs a loading state so the user knows it's working."

**Fixed on `staging`, commit `3952c99`.** Root cause: Settings' own `reset-demo` handler (`implementation-context-prototype/context-settings.js`) only disabled the button during the call, with no spinner or loading copy -- `context-app.js` already had a properly-built loading dialog for the same reset action (reachable from the demo-help modal's "Reset example data →" link), just not wired to the Settings button. Settings now shows the same "Restoring Northstar…" loading dialog immediately on confirm, and a styled failure dialog with a clear recovery path (Refresh page for a timeout, otherwise Close + the button re-enabled) instead of a native `window.alert`. Verified live with a mocked `resetDemo()`: loading dialog appears immediately, and on failure the button re-enables and no reload is attempted (so a timed-out request that actually succeeded server-side is never silently repeated).

### Additional user note: wide-screen Ask State launcher alignment (resolved 2026-09-12)

The user reports that on very wide desktop screens the Ask State button moves far to the right while the rest of the app stays within its constrained layout, making the button feel detached from the product.

**Fixed on `staging`, commit `ff0c183` (initial fix), refined in `7ec55f8`.** The base `.ask-state-launcher` rule was `position:fixed; right:24px; bottom:24px`, anchored to the viewport rather than the app. Root cause on investigation: the main content column is left-anchored next to the sidebar at a width that varies per view (readable-measure caps, not a fixed page width) -- there's no single constant "app width" to anchor a CSS rule to. Fixed with a small JS helper (`repositionLauncher()` in `context-product-polish.js`) that measures the active view's actual right edge and repositions the launcher relative to it, re-run on resize and on every view change. Verified live at multiple viewport widths.

### Additional finding: Ask can link to a Review Open Items hasn't hydrated (resolved 2026-09-12)

Found via a QA pass cross-checking live behavior against source: Ask queries the backend fresh on every question, but Open Items only hydrates its local review list once (`hydrateBackend()`), so Ask could surface an inline "Review →" link for a Review Open Items hadn't loaded yet. Clicking it silently no-op'd -- no dialog, no error, indistinguishable from a broken button.

**Fixed on `staging`, commit `e053868`.** A local-lookup miss now triggers one re-fetch of the open-reviews list from the backend (`refreshOpenReviews()` in `context-app.js`) before giving up; if the Review still isn't found (e.g. it was actually accepted/rejected in the meantime), a clear message and an Open Items CTA replace the silent no-op.

## Current production state

- Production branch: `main`.
- Review branch: `staging`.
- The earlier reviewer-orientation / Ask cleanup was promoted through PR #99, **Promote State cleanup to main**. Later Open Items and banner fixes shipped through PR #102.
- PR #99 merge commit: `9bed95c134d0ef2766d762c23a6960c3b7b6a226`.
- Vercel production deployment for that merge was verified green during that release.
- Production includes the Mark reviewed confirmation fix at `3f87909afd6391544d0c267c0bd50d2f2544bc8d`.
- Staging now has the AI-suggested Questions feature described below. Do not treat it as promoted to main.
- **Hard rule: all product/site changes go to `staging` first. Never push or merge product/site changes to `main` without the user's explicit confirmation.**

### Direct-to-main exception — September 12, 2026

The user explicitly confirmed a small, isolated exception to the staging-first rule above: a copy-only edit to `implementation-context.html` (the "Lingering Questions" section, formerly "What I'd test next," and the closing "Where I landed" paragraph) was pushed straight to `main`, bypassing `staging` entirely. Reason: `staging` had unrelated cleanup work actively in progress at the time, and this change was pure case-study text with no product/UI/behavior impact, so routing it through `staging` and cherry-picking back out was judged riskier than a small direct commit.

**Consequence: `staging` does NOT have this change.** `main` and `staging` are no longer identical on `implementation-context.html` as of this note. Before promoting `staging` to `main` again (or otherwise reconciling the branches), check whether `staging`'s copy of `implementation-context.html` still has the old "What I'd test next" wording — if so, merge/rebase carefully so this direct-to-main edit isn't silently overwritten or reverted. Do not treat this note as an ongoing exception to the hard rule; it applies only to this one commit.

Production site:

- Portfolio: https://ai-learning-rouge.vercel.app/
- State case study: https://ai-learning-rouge.vercel.app/implementation-context
- State product: https://ai-learning-rouge.vercel.app/implementation-context-prototype/

Staging environments:

- Frontend: https://ai-learning-git-staging-cairn10.vercel.app/implementation-context-prototype/
- Backend: https://state-api-staging.onrender.com

Do not confuse the protected staging preview with the public production URL. Never use the production backend for feature QA writes.

## Current staging feature: AI-suggested open Questions

- Same Review flow, small consequence-specific text/actions: **Create Question**,
  **Link existing Question**, or **Dismiss suggestion**.
- Suggestions remain proposals until human approval. Approval creates/reuses an
  ordinary Question and closes the Review atomically, without changing Current
  State or History. New Questions are non-blocking.
- Exact case/whitespace duplicate checks happen before display and during the
  transaction. Semantic matching is deferred. Stale proposals fail closed.
- Ask keeps its read-only model. Its pending/unknown grounding and existing-answer
  freshness checks now account for Question-only decisions.
- Migration 009 preserves existing data and adds Question proposal persistence.
- Scope, rollout notes, tests, and the model-eval handoff are in
  `docs/architecture/REVIEW_SUGGESTED_QUESTIONS.md`.
- Pinned-dependency CI passed, including isolated PostgreSQL and browser tests.
- The recorded full verification run had **407 Python tests passed, 44 skipped,
  two pre-existing deselections, seven subtests passed, and all 11 JavaScript
  suites passed**. Do not present skipped/excluded checks as executed tests.
- Deployed live-model/browser walkthrough passed all eight checks at `8ce2c7a`:
  creation, dismissal, exact duplicate linking, no-change integrity, Ask freshness,
  reload persistence, and a small sample of model-routing decisions.
- Full results and two Ask prose eval notes are in
  `docs/history/QUESTION_REVIEW_LIVE_QA_2026-09-10.md`.
- Only test-created Reviews/Questions were closed; **12 immutable test Evidence
  records remain in staging** across the two live runs. The demo was not reset.
  These records can influence Ask. Choose a clean baseline explicitly for formal
  evals, but do not reset the shared staging database without authorization.
- The reusable live walkthrough is manual-only; it is not part of automatic CI.
  It makes real model calls and retains new test Evidence. The temporary source
  transfer/delivery files and workflow were removed after implementation.
- No approval has been given to merge this feature into main.

## What changed on September 10

A review/polish batch was explored, then simplified after live review.

### Reviewer orientation

State now has a compact **Exploring State?** reviewer banner that points a first-time reviewer toward:

1. Open Items
2. Current State
3. Ask State

The banner is dismissible and remembers dismissal in local storage.

A **Quick tour** reopen control exists, but it must be hidden while the banner itself is visible. Once the banner is dismissed, the reopen control becomes available. This avoids showing two controls that appear to do the same thing.

Do not expand this into a larger tutorial/menu unless explicitly requested.

### Ask navigation and cleanup

Ask keeps the useful record-level navigation added during the review pass:

- Review items can open the matching Review.
- Question / Blocking Question items can open the matching Question.
- Current State items can use **View current ->** to jump to the matching maintained fact.

The Current State jump uses the real `record_id` / state ID. Do not replace this with text matching.

Ask also deduplicates repeated record-backed items in its answer payload before rendering.

During review, the separate provenance/grounding appendix was judged redundant because the same records were already presented and linked inline in the answer. The UI now hides:

- the **Grounded in State's project record** disclosure
- its project-item count and repeated record list
- the separate **Related open items** summary

Keep the inline Review / Open / View current links. The goal is provenance where it is useful, not a second copy of the answer.

### Settled Review/UI decisions

- Keep one Review flow; vary the disclosed consequence and action, not the whole interaction.
- Existing State proposals use **Update Current State** / **Keep Current State**.
- No-State-proposal human checks use **Mark reviewed**, not **Accept evidence**: the Evidence already exists. The confirmation is **Reviewed. Current State was not changed.**
- The Open Items explanation belongs once at the top. Do not restore repeated section descriptions or a large no-change explanation in every Review.
- Keep the subtle review/question row separation and the expanded Review's up chevron. The user declined heavier expanded panels, tint/containment redesign, and another polish round.
- The Exploring State banner has a white background and **Start with Open Items** as a blue text-style link, not an outlined/filled button.
- Leave the Learning Guide label, portfolio hierarchy, and case study alone unless specifically requested.

### State case-study screenshots

Four State product screenshots were briefly added to the flagship case study. The first uploaded WebPs were broken/blank, and later replacements rendered but were visibly too blurry at case-study display size.

The reviewed decision was to **remove the screenshots from view rather than ship blurry UI**.

Current implementation:

- screenshot markup/assets may still exist in the repo
- `state-case-visuals.css` hides `.state-product-shot` and `.state-product-evidence-grid`
- the case-study narrative, captions/layout around the rest of the page, and product links remain intact

Do not reintroduce screenshots unless the user explicitly asks and the images can be verified sharp at their actual rendered size. Prefer a true full-resolution solution rather than aggressively downscaled WebPs.

## Latest portfolio state

The portfolio is review-ready / near-freeze. Avoid broad redesign or cleanup work unless explicitly requested.

### Homepage / Applied Work

The homepage already leads with **Applied work · start here** and puts State + Legal AI up front. The case studies are not buried.

Stable Applied Work hierarchy:

- **Primary work:** State + Legal AI Governance
- **Supporting work:** Testing & Debugging State + State Architecture & Cost + Meridian AI Support Pilot

Do not revisit homepage hierarchy just because older reviews said work was buried; that feedback is stale relative to the current page.

### State case-study family

- `implementation-context.html` is the main State case study.
- `state-testing-debugging.html` is the supporting validation/failure-investigation case.
- `state-architecture-cost.html` is the supporting before-vs-after architecture/cost case.

The flagship story is intentionally concise:

**Problem -> What I built -> Key product decisions -> Lingering Questions -> Where I landed**

Detailed debugging/eval and architecture/cost material lives in the supporting cases rather than being duplicated on the flagship page.

### Legal AI

Legal AI is already strong enough for the current portfolio. It includes discovery, evidence, the turning point, earlier-vs-corrected framing, and the conclusion that the gap is real but an offering should not yet be proposed.

Do not expand it just to add volume.

### Portfolio positioning and privacy

- Keep the portfolio focused on applied AI product judgment, not engineering identity.
- Background framing should stay grounded in QA and project management.
- AI implementation leverage should be credited clearly where relevant.
- Keep public portfolio branding anonymous unless explicitly asked to add the owner's name.
- Avoid invented metrics.
- Avoid jargon and engineering-heavy framing when simpler product language works.

## State product boundaries

State maintains a trustworthy answer to:

> **What should this project treat as true right now?**

Its authority model remains:

> **AI interprets -> software enforces -> people authorize.**

Core objects:

- **Evidence / Notes:** immutable source material and observations
- **Current State:** maintained, human-approved project understanding
- **Reviews:** human authorization for consequential outcomes, including Question creation on staging
- **Questions:** explicit unknowns/blockers
- **History:** accepted transitions with provenance
- **Ask:** read-only use of maintained context

Do not weaken the authority boundary for convenience. AI may interpret or propose changes, but only a person authorizes a consequential Current State transition.

For architecture, runtime paths, local setup, and component ownership, use the root `README.md` as the detailed source of truth.

## Recent product/UI fixes worth preserving

- Ask is a persistent read-only drawer, not an inline Workspace card.
- Ask has clearer record-level navigation without a redundant grounding appendix.
- Ask action targets have a mobile readability/tap-size floor.
- Workspace emphasizes what needs attention, recent changes, and Current State orientation.
- The reviewer Quick tour reopen control is hidden while the orientation banner is visible.
- Settings navigation freeze caused by a mutation-observer loop was fixed.
- Notes shows result-summary UI only when search/filters are active, including clear-filter/no-results behavior.
- Current State loading remains deliberately stricter than some Workspace sections so authoritative state does not flash seeded/fake values.
- The authority copy should stay **people authorize**, not **people decide**.

## Known product questions / later validation

These are product questions, not obvious bugs. Do not start them automatically just because they are listed here.

- **Review burden:** does the human-control model create too much work?
- **Source completeness:** can State stay trustworthy if important project sources are missing?
- **Generalization:** does the current structure work outside the Northstar demo/project type?
- **Usability + speed:** can an unfamiliar user understand the model, and is Ask fast enough?
- **Paused/reversed decisions:** decide whether a paused/reversed decision needs a distinct `proposed_update` path rather than the current `state_at_risk` behavior.

A separate unfamiliar-user validation/eval pass was discussed but intentionally left for later. Do not conflate that with ordinary polish work.

### Deferred findings relevant to the current feature

- **Ask internal IDs:** live generated prose exposed `(k-security)` once. Keep IDs in structured records/navigation, not human-facing prose.
- **Ask evidence strength:** some prose upgraded what reps *reported* into what a spot-check *found*. Preserve attribution and uncertainty. Neither observation changed Question/State persistence, but both belong in the model evals.
- **Duplicate scope:** case/whitespace matching is implemented. Differently worded equivalents are not guaranteed to match; semantic deduplication is deferred.
- **Legacy Review analytics:** Mark reviewed is still conflated with `review_accepted` on the old path. The new Question path has its own server-confirmed `review_decision` outcome. Do not use raw legacy accept events as proof that Current State changed.
- **Older Question-resolution provenance:** multi-Evidence Reviews can attribute multiple resolved Questions to the latest linked Evidence rather than each answer's actual Evidence. This is separate from the new Question proposal's source Evidence link and remains a later schema/design cleanup.

## Planned cleanup pass

Keep this separate from product/portfolio feature work.

1. **Baseline / hygiene**
   - verify branch state
   - run the normal tests
   - remove only clearly obsolete branches/files

2. **CSS cleanup**
   - remove only proven-dead non-media CSS first
   - consolidate inline/version-stamped styles only where cascade equivalence is demonstrated
   - do not use cleanup as an excuse for another visual redesign

3. **Controller architecture review**
   - inspect current patch/module layering and simplify only where ownership is clear

4. **Runtime naming cleanup**
   - consider renaming `phase2_current/` only after the frontend is stable and the full suite is green
   - remember that it is currently runtime/load-bearing despite the misleading name

Separate from the above: question-resolution Evidence provenance may need a schema/data migration and should be treated as its own design change.

## Do not introduce during cleanup

Unless explicitly requested, leave these alone:

- React/Vue/framework rewrite
- ES-module conversion that breaks direct `file://` support
- vector DB / RAG infrastructure
- agents
- ORM migration
- auth / organizations / multitenancy
- enterprise-architecture expansion

## Deployment / workflow rules

- `main` is production and `staging` is the review branch.
- Product/site work goes to `staging` first.
- **Never promote to `main` without explicit user confirmation in the current conversation.**
- Do not interpret a request such as "fix it" as permission to merge to main.
- Vercel Hobby/build-rate limits have been hit during high-volume iteration before. A pending/rate-limited preview alone is not evidence of broken code.
- Batch low-value pushes where possible.
- When a visual asset is involved, verify the actual rendered pixels/quality rather than treating HTTP 200 as sufficient.

## Recent PR trail

- **PR #95:** reviewer / case-study polish batch, including reviewer orientation, Ask Current State navigation, mobile Ask target adjustments, and initial screenshot treatment.
- **PR #98:** replacement screenshot assets after the first image files rendered blank. Those replacements were later judged too blurry in the live case study.
- **PR #99:** reviewed cleanup promoted to production. Screenshots hidden, redundant Ask grounding/open-items UI removed, Quick tour behavior preserved, inline Ask links retained.

## Current release summary

The production portfolio presents State as the flagship product with two supporting State cases, while preserving Legal AI and Meridian as separate demonstrations of opportunity evaluation and workflow thinking. State's current review path is intentionally simpler than the first September 10 polish attempt: the case study no longer shows blurry screenshots, Ask keeps inline record navigation without repeating the same records in a grounding appendix, and the reviewer orientation controls no longer compete with each other.

The portfolio is paused unless the user identifies a specific issue or explicitly asks for the next validation/cleanup phase. The completed Question Review feature remains on staging pending the user's hands-on review and explicit promotion decision.