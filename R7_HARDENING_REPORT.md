# State R7 Hardening Report

**Status:** Ready for deployment candidate QA after Render/Neon smoke test  
**Build:** `r7-hardening-2026-09-02`  
**Base:** R6 (`open-items-outline-2026-09-02-r6`)

## What R7 fixes

R7 keeps the proven Evidence -> Review -> human acceptance -> Current State transaction model intact and hardens the product seams around it.

### Product and authority model

- Questions are now first-class persisted backend records rather than frontend-only objects.
- Review recommendations may explicitly link open Questions through `resolves_question_ids`.
- A Question is resolved only when linked reviewed Evidence is **accepted**; merely submitting or analyzing Evidence does not resolve it.
- Invalid or already-closed Question references are rejected by software rather than trusted from model output.
- Blocking Questions require a named concrete dependency (`blocks`). Missing details alone are not enough to create blocker semantics.
- Frontend demo Questions are safely bootstrapped into the backend once connected, with normalized-text idempotency so reloads do not duplicate them.
- When backend Reviews are available, Open Items uses authoritative backend Reviews rather than parallel fixture Reviews.
- When backend Current State is non-empty, it is authoritative; stale fixture State is no longer merged into live State.

### Interpretation semantics

Provider instructions now explicitly preserve epistemic status:

- approved != implemented / enabled / deployed / complete
- planned != committed
- capable != enabled
- a narrow approval must not be widened into universal scope, safety, rollout, or removal of human review
- missing implementation detail must not automatically create speculative follow-up work or a blocker

A deterministic golden case covers the exact regression observed in QA: **"Password reset tickets were approved for automation."** Expected maintained understanding is the narrow approval statement only.

### Project navigation

Project subsection navigation now behaves like a document outline:

- same-view subsection clicks directly scroll the existing Project document
- no Project re-render occurs before the anchor jump
- the old timer-based render -> reposition -> smooth-scroll sequence is removed
- active subsection state updates while scrolling (`aria-current="location"`)
- anchor offset accounts for the persistent header

This addresses the jump/bounce seen in the September 2 screen recording.

### Review UX

Review cards are reduced to the decision-critical material first:

- Current understanding
- Proposed understanding
- meaningful unresolved material only
- decision actions
- source/rationale moved into a secondary disclosure

Generic synthetic "still unresolved" copy is suppressed when it adds no information.

### Evidence retry and frontend consistency

- Provider failure after Evidence persistence now returns the saved `evidence_id`.
- The UI offers **Retry analysis** against the same Evidence record rather than prompting the user to submit the note again.
- This retry behavior is used for project updates, working Notes, and Question responses.
- Review resolution no longer relies on a fixed 300 ms rehydration delay.
- New user-created objects use real current dates rather than the Aug 29 demo date.
- Backend timestamps drive hydrated State metadata.

### Engineering debt addressed

- Provider clients are initialized once at application startup and reused instead of initialized for every request.
- Frontend API access is centralized in `context-api.js`.
- API base URL is runtime configurable via `window.STATE_API_BASE` or the document `data-api-base` attribute, with the current deployed URL only as a fallback.
- SQL `?` placeholder conversion now uses a quote-aware parser that handles SQL doubled quotes instead of the fragile prior string scan.
- Backend pipeline/provider diagnostics use Python logging rather than ad-hoc `print()` calls.
- Request correlation IDs and latency/status logging were added to the API.
- The Note matrix harness no longer relies on an old hardcoded filesystem path and isolates cases so one case cannot contaminate another.
- Question rows use native buttons rather than simulated button semantics.

## Schema changes

- `003_questions.sql` adds persisted Questions.
- `004_link_reviews_questions.sql` adds the many-to-many Review <-> Question link.

Migrations remain additive and are applied by the existing migration-backed initialization path.

## Validation

Final local validation on the R7 snapshot:

- Backend: **157 passed, 3 skipped, 7 subtests passed**
- Frontend behavior suite: **81 passed, 0 failed**
- JavaScript syntax: `context-api.js` and `context-app.js` pass `node --check`
- Python compile: full backend passes `compileall`
- Note matrix: **18/18 passed**, including approval-is-not-implementation

An attempted Chromium browser automation smoke test was blocked by the execution environment's browser administrator policy before page navigation. The Project navigation defect is therefore covered by source/behavior contracts and the supplied real-user screen recording, but should still receive a quick live visual check after deploy.

## Deliberately deferred

These remain real production-readiness items but are intentionally not bundled into R7 because they require product/deployment decisions or add risk without fixing the current prototype behavior:

- authentication / user identity model
- public API abuse protection / rate limiting
- Postgres connection pooling for meaningful concurrent load
- a true browser-driven frontend -> deployed backend E2E suite
- large-scale CSS and `context-app.js` component decomposition
- physical relocation of historical portfolio/prototype HTML files

R7 does establish a clean API module boundary and documents the production source-of-truth so those refactors can be done incrementally rather than as another rewrite.

## Deployment smoke test

After deploying, verify migrations 003/004 apply on Neon, `/health` reports the R7 build, an existing workspace loads without duplicate fixture Questions, Project subsection navigation no longer bounces, and the password-reset approval note yields at most the narrow approval Review without inventing implementation or blocker semantics.
