# State R8.1 — QA + interaction fixes

## Purpose
R8.1 is a targeted hardening pass after visual QA of the deployed R8 build. It fixes the issues observed in Project, Open Items Reviews, and Notes filters before the next product phase focuses on Ask.

## Fixed in this pass

### Production demo seed actually reaches the deployed database
- `Settings.from_env()` now defaults the Northstar demo bootstrap on for this demo repository.
- `STATE_DEMO_BOOTSTRAP=0` remains an explicit opt-out.
- This avoids relying on an existing Render service to resync a newly-added Blueprint environment variable.
- Added an environment-loaded startup integration test proving the real app lifespan initializes and seeds 25 State items, 18 Questions, and 4 Reviews.
- `/health` exposes the build revision and whether demo bootstrap is enabled, so deployment state can be verified without guessing.

### Project orientation and navigation
- Added authoritative Current State items for Project stage and outcome.
- Project Stage, Outcome, Current direction, and synopsis now derive from Current State rather than separate fixture copy.
- Stage/outcome metadata are kept out of the body outline to avoid duplication.
- Empty Project sections are removed from the sidebar and document.
- Scroll-spy chooses the nearest actually rendered section instead of highlighting an empty/unreachable section.
- The seeded Tier 1 wording was softened to describe the core use case rather than imply Tier 2 participation can never coexist.

### Open Items Review density
- One Review: expanded automatically.
- Two or more Reviews: all collapsed initially.
- Opening a Review uses accordion behavior; opening another closes the previous one.
- Resolving a Review clears the expanded state instead of automatically pushing the user into the next decision.

### Notes filters
- Date + status + search now use one shared filtering pipeline in both full render and live-search refresh paths.
- Fixed a timezone bug where date-only strings (`YYYY-MM-DD`) were parsed as UTC midnight; in Pacific time, a note visually dated today could be treated as yesterday.
- New local notes now generate a local-calendar ISO date rather than `toISOString()` UTC date.
- Added selected-state accessibility metadata and a visible result count so filter effects are easier to verify.

### Question relevance
- Backend Questions without fixture topic metadata now infer presentation topics from their text, so relevance ordering in long Open Questions lists still works with the seeded backend dataset.

## Verification
- Backend / integration: **166 passed, 3 skipped, 7 subtests passed**.
- Frontend behavior: **81 passed, 0 failed**.
- Note interpretation matrix: **18/18 passed**.
- JS syntax checks passed.
- Python compile checks passed.

## Remaining intentional debt before Ask
These are not blockers for moving into the Ask phase after visual verification:
- authentication / rate limiting / connection pooling remain deferred for the learning demo;
- `context-app.js` and accumulated CSS are still larger than ideal and should be modularized if the prototype continues growing;
- Ask is still a mixture of deterministic intent routing, canned synthesis patterns, and live State/Open Items/Notes/History lookup. Making Ask genuinely useful is the next major product phase.

## Visual QA after deploy
1. Confirm `/health` reports build `r8.1-qa-fixes-2026-09-02` and `demo_bootstrap: true`.
2. Open Project: it should contain a populated multi-section outline; empty section links should not appear.
3. Scroll and use Project outline links; active section should remain sensible even near the end of the document.
4. Open Items with 4 Reviews: all Reviews should start collapsed; only one should be expanded at a time.
5. Notes: test All/Today/7 days/30 days against Status=All and then against Reviewed/In review/Draft; result count should change consistently.
6. Try Notes search while a date filter is active; search must not escape the selected date/status range.
