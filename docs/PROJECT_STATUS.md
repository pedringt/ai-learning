# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository before relying on older handoffs or conversation memory.

## Resume here: paused for user review

_Last updated: September 10, 2026 Pacific time, after the user chose to pause and requested a GitHub handoff for Claude._

**The AI-suggested Questions feature is implemented on staging, not waiting to be built. Automated checks and a live staging walkthrough passed. The user has not yet reported the results of their own hands-on review. Work is paused; do not make further product changes or promote to main without a new request.**

For this feature, read these files from **`staging`**, not the older copies on `main`:

1. This file: current status, boundaries, and next action.
2. [Question Review implementation and test guide](architecture/REVIEW_SUGGESTED_QUESTIONS.md): settled product decisions, file map, test commands, and the exact manual walkthrough shared with the user.
3. [Deployed live QA report](history/QUESTION_REVIEW_LIVE_QA_2026-09-10.md): actual live results, runner correction, two Ask quality findings, retained test data, and artifact references.
4. Root `README.md` for general runtime setup and component ownership.

### Verified checkpoints before this documentation-only handoff

| Checkpoint | Commit / result |
| --- | --- |
| Production `main` | `3f87909afd6391544d0c267c0bd50d2f2544bc8d` |
| Staging before the pause handoff | `bfe6d83d7cbef2fa8ea9ad1bfcff303e9fd5f3d3`, 10 commits ahead of main, none behind |
| Question feature implementation | `5c1f2bc51e25db6f75e099123736abd5ac43c7d3` |
| Live walkthrough source | `8ce2c7a0d6da633b7961f58c066ef8eaf21904d7` |
| Latest checked pre-handoff CI | Run `34544899127`, success on `bfe6d83` |
| Successful live-model walkthrough | Run `34544596269`, all eight checks passed |

These are checkpoints, not a promise that branch heads will stay fixed. This handoff adds documentation only. Fetch current refs and compare before making changes; do not restore staging to an older SHA or overwrite work from another session.

```sh
git status --short --branch
git fetch origin
git log -1 --oneline origin/main
git log -1 --oneline origin/staging
git diff --stat origin/main..origin/staging
```

Preserve any local uncommitted work. Read `origin/staging:docs/PROJECT_STATUS.md` with `git show` if switching branches would disturb the working tree.

### Next action when the user returns

Help the user complete the manual staging walkthrough in the feature guide and collect any specific confusion or unexpected outcome. Do not rerun the entire implementation or reopen settled UI decisions. A different model outcome is evidence for the separate eval exercise, not a reason to keep rewriting an input until the desired result appears.

The user is writing State evals in another chat. Keep software regressions separate from model judgment: the central eval choice is **supported State change vs consequential unresolved Question vs neither**. Carry forward the exact-duplicate limit, internal-ID leakage, and evidence-attribution findings described below and in the live report. Do not claim the separate eval dataset has been updated here.

A future main promotion needs the user's explicit confirmation in that conversation, a fresh diff/CI check, and verification of the staging/frontend/backend revisions. Migration 009 is part of the feature; do not deploy only the UI. No database reset, extra live-model run, broad cleanup, or additional feature work is part of this pause request.

### Additional user note: reset-data loading feedback (pending)

The user noted after the pause: "resetting data modal probably needs a loading state so the user knows it's working."

**Recorded for follow-up only; not reproduced or fixed in this documentation update.** Inspect the actual rendered reset flow before assuming loading logic is absent. Start with the `reset-demo` handler, `showDialog`, and `hydrateBackend` in `implementation-context-prototype/context-app.js`, including any later modal/UI overrides.

Keep the treatment small: immediately show an obvious busy indicator and concise copy such as **Resetting example data...** after confirmation. Prevent duplicate reset submissions and keep visible feedback through both the reset request and the following workspace refresh. Show completion only once the refreshed data is ready. A failure or timeout must leave a clear recovery path, not a stuck spinner or a misleading success message; a timed-out request may still have completed on the server, so do not automatically repeat the reset. Do not add invented progress percentages.

When implementation is requested, add delayed-response, duplicate-click, success, and failure/timeout coverage using an isolated or mocked reset endpoint, and check desktop/mobile visibility. This note does not authorize resetting shared staging or production data, implementing the change during the pause, or merging to main.

## Current production state

- Production branch: `main`.
- Review branch: `staging`.
- The earlier reviewer-orientation / Ask cleanup was promoted through PR #99, **Promote State cleanup to main**. Later Open Items and banner fixes shipped through PR #102.
- PR #99 merge commit: `9bed95c134d0ef2766d762c23a6960c3b7b6a226`.
- Vercel production deployment for that merge was verified green during that release.
- Production includes the Mark reviewed confirmation fix at `3f87909afd6391544d0c267c0bd50d2f2544bc8d`.
- Staging now has the AI-suggested Questions feature described below. Do not treat it as promoted to main.
- **Hard rule: all product/site changes go to `staging` first. Never push or merge product/site changes to `main` without the user's explicit confirmation.**

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

**Problem -> What I built -> Key product decision -> How it evolved -> What I'd test next -> Where I landed**

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