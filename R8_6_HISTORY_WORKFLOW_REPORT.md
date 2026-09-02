# State R8.6 — History density + workflow links

**Build:** `r8.6-history-workflow-links-2026-09-02`  
**Base:** R8.5 integrity/polish

## Purpose

R8.6 is the final shell/data-completeness pass before the next phase focuses on Ask. It addresses two issues found during deployed QA: History was technically honest but too sparse to evaluate at scale, and Notes that were already in Review did not provide a direct path to the Review that needed action.

## Changes

### Realistic accepted History for the Northstar demo

- Adds up to 10 deterministic accepted demo transitions across untouched Northstar State items.
- These are not frontend-only timeline fixtures. Every seeded transition is fully linked through:
  - Evidence
  - resolved Review
  - accepted Proposed State Change
  - History Transition
  - versioned Current State
- The backfill only applies when the demo State item is still active, still at version 1, still exactly matches the original seeded statement, and has no existing History. User-modified/reviewed State is never overwritten.
- The chosen History scenarios avoid the State items targeted by the four existing open stress Reviews, preventing the backfill from making those proposals stale.
- Upgrade-path coverage simulates an already-deployed R8.5 database and proves the History backfill adds the accepted transitions without creating pending-proposal version mismatches.

Fresh demo History now exercises scope narrowing, source authority, password-reset approval, human review boundaries, data constraints, sensitive actions, Slack retrieval, evaluation design, rep training, and rollout sequencing.

### Notes → Review navigation

- An Evidence Note with one open Review now shows an actionable `In review →` status.
- Clicking it opens Open Items, expands the Review section, and expands the exact related Review.
- If one Evidence item is linked to multiple open Reviews, Notes shows `In review · N →` and presents the related Reviews for the user to choose from rather than silently choosing one.
- Review relationships are derived from authoritative backend `review_evidence` data; they are not inferred from note text.

### Reviewed Note → History navigation

- When reviewed Evidence produced one or more accepted State transitions, its `Reviewed` status becomes `Reviewed →`.
- Clicking it opens History scoped to transitions whose provenance contains that exact Evidence item.
- History shows a small `From note: …` context strip with a `View all history` escape.
- Reviewed Evidence that did not change Current State remains plain `Reviewed` and does not pretend there is a History transition to visit.

### Presentation polish

- Demo seed/history Evidence is labeled `Project note` in Notes/History instead of exposing internal source-type names such as `demo_history`.
- Added restrained hover/focus styling for the linked status pills and multi-Review chooser.

## Verification

Final R8.6 working tree:

- Backend/integration: **180 passed, 3 skipped, 7 subtests passed**
- Frontend Ask behavior: **81 passed, 0 failed**
- Note interpretation matrix: **18/18 passed**
- JavaScript syntax checks passed for `context-app.js` and `context-api.js`
- Python compile checks passed
- Explicit R8.5 → R8.6 seed-upgrade simulation: **10 History transitions added, 4 open Reviews preserved, 0 pending proposal/version mismatches**

## Remaining scope before Ask

No additional shell feature is required before beginning Ask. The remaining known items are intentionally deferred rather than hidden:

- the frontend JS/CSS remains larger than ideal; Ask should be introduced with a cleaner module boundary instead of adding more unrelated behavior to `context-app.js`;
- browser-driven/mobile E2E automation is still desirable once the UI stops moving rapidly;
- authentication, rate limiting, and production-scale pooling remain outside this learning/demo phase.

## Deploy smoke test

1. Confirm `/health` reports `r8.6-history-workflow-links-2026-09-02`.
2. Open History; an existing R8.5 demo database should gain roughly 10 accepted demo transitions, minus any items that were already genuinely changed.
3. In Notes, click an `In review →` status and confirm the corresponding Review opens in Open Items.
4. Find a `Reviewed →` demo History note and confirm History opens scoped to that exact Evidence provenance.
5. Clear the History context and confirm the full timeline returns.
