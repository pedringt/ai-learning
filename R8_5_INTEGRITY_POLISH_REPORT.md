# State R8.5 — integrity + polish

**Build:** `r8.5-integrity-polish-2026-09-02`  
**Base:** R8.4

R8.5 is the final shell/integrity cleanup before the next product phase focuses on making Ask substantially more useful. It addresses issues found in the fresh R8.4 deep-QA pass and adds the small Notes/History polish requested during visual QA.

## User-visible polish

### Notes filter feedback
- Notes now shows a subtle result summary directly below the controls, for example: `Showing 14 of 32 notes · Today · All statuses`.
- Search terms are included in the summary when active.
- A `Clear filters` action appears only when something is filtering the collection.
- The date control now says `All time` rather than `All notes`, making the date/status distinction clearer.

### History search
- History now has a single lightweight search field rather than a new filter system.
- Search covers accepted transitions and their useful provenance context: transition type, before/after State, Review question/rationale, and supporting Evidence text.
- Matching changes remain in chronological order.
- The UI shows `X of Y changes`, highlights literal matches, and provides a clear-search action.
- History remains about accepted project change; Evidence that never changed State still belongs in Notes.

## Integrity fixes

### Draft Note -> immutable Evidence boundary
- Saved Draft Notes are now persisted through a real backend `draft_notes` table and survive reloads.
- Drafts remain editable until sent for analysis.
- Once a Draft becomes Evidence, the UI removes Edit immediately. Backend Evidence remains immutable.
- If provider analysis fails after Evidence was saved, the Note remains immutable Evidence and offers `Retry analysis` against the same Evidence record rather than recreating it.
- Added migration `005_draft_notes.sql` and Draft CRUD endpoints.

### Browser CORS and Project Rules
- CORS now permits the `DELETE` and `PATCH` methods used by Rules and Question lifecycle actions.
- This fixes Project Rule removal from the deployed Vercel frontend.
- Project Settings now explicitly says: `Rules apply to future analysis. Existing Reviews are not reinterpreted automatically.`

### Blocking Question lifecycle
- Open Questions can now be explicitly marked blocking by a human.
- Marking blocking requires a concrete `Blocks what?` dependency; blank dependencies are rejected by software.
- Blocking Questions can be returned to ordinary Open Questions with `No longer blocking`.
- The visible `Blocks: ...` explanation remains the reason the classification is understandable rather than mysterious.

### Safer backend hydration
- Authoritative backend domains now track `loading / loaded / unavailable` instead of silently falling back to plausible fixture truth when one request fails.
- Empty successful backend results count as authoritative empty results.
- Project, Open Items, Notes, History, Questions, and Rules show neutral loading/unavailable states where appropriate.
- Evidence no longer appears `Reviewed` merely because Review hydration failed; unknown status stays unknown.

### Navigation integrity
- Top-level navigation now snaps the destination view to its top immediately.
- Main Project navigation opens Project at the top with no smooth-scroll animation.
- Only Project subsection links perform smooth in-document scrolling.
- The Project parent no longer presents a fake disclosure/chevron affordance; its subsection outline appears only while Project is active.

### Demo timestamps and Project wording
- Newly seeded Review Evidence uses intentional historical dates instead of database `CURRENT_TIMESTAMP`.
- Existing already-seeded immutable demo Evidence gets the same deterministic historical dates at the presentation layer, preventing old demo records from looking like `Today`.
- Project now labels its body count as `Current State items`, not `reviewed items`, because the demo baseline is seeded directly rather than pretending every baseline item has Review provenance.

## API/schema changes

- Added migration: `state-project-complete/migrations/005_draft_notes.sql`
- Added Draft endpoints:
  - `GET /api/drafts`
  - `POST /api/drafts`
  - `PATCH /api/drafts/{draft_id}`
  - `DELETE /api/drafts/{draft_id}`
- Added Question lifecycle endpoint:
  - `PATCH /api/questions/{question_id}/blocking`
- CORS methods now include `GET`, `POST`, `PATCH`, and `DELETE`.

## Regression coverage and verification

Fresh verification on the final R8.5 working tree:

- Backend / integration: **177 passed, 3 skipped, 7 subtests passed**
- Frontend Ask behavior: **81 passed, 0 failed**
- Note interpretation matrix: **18/18 passed**
- JavaScript syntax checks passed for `context-app.js` and `context-api.js`
- Python test/compile path is clean

New R8.5 regression coverage includes:
- CORS preflight for DELETE/PATCH
- Draft Note CRUD persistence
- Blocking Question dependency validation + block/unblock lifecycle
- deterministic historical dates for new demo-seed Evidence
- frontend contracts for Draft/Evidence immutability, hydration states, Notes feedback, History search, and navigation behavior

## Deliberately deferred

The frontend remains larger than ideal, especially `context-app.js` and the accumulated CSS override layers. R8.5 removes some dead paths but does **not** attempt a broad component/CSS rewrite immediately before the Ask phase; that would add destabilization risk without improving the core product experiment.

The next major phase should give Ask its own clearer boundary/module and make answers genuinely useful from Current State, relevant Reviews/Questions, History, Evidence, and Project Rules. Authentication, rate limiting, and production-scale connection pooling remain intentionally deferred for this learning/demo build.

## Visual QA after deploy

1. Save a Draft Note, reload, and confirm it remains editable.
2. Send that Draft for analysis; confirm Edit disappears once it becomes Evidence.
3. In Notes, select Today / 7 days / 30 days and verify the `Showing X of Y...` summary changes immediately; use Clear filters.
4. Search History for terms such as `retention`, `Tier 2`, or `security`; verify count, highlighting, chronology, and clear-search behavior.
5. Delete a Project Rule from the deployed frontend and verify it disappears without a CORS error.
6. Mark an Open Question blocking, supply `Blocks what?`, verify it moves to Blocking Questions and displays the dependency; then unmark it.
7. Navigate from a scrolled-down page to Workspace, Notes, Project, and History; each top-level view should start at its top. Project subsection links should still smooth-scroll inside Project.
8. Temporarily simulate/observe a failed backend domain if available; the UI should show unavailable state rather than mixing fixture and live truth.
