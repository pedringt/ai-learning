# State R8.6.1 — pre-Ask housekeeping

**Build:** `r8.6.1-pre-ask-housekeeping-2026-09-02`  
**Base:** R8.6 history/workflow links

## Purpose

This is the intentionally small integrity pass before Ask architecture work. It addresses the actionable findings from the final external QA without adding new shell features.

## Changes

### Question lifecycle: stopped demo Questions stay stopped
- Removed client-side `bootstrapFixtureQuestions()` from ordinary hydration.
- The browser now treats `GET /api/questions?status=open` as authoritative and never interprets a missing Question as permission to recreate it.
- Demo Question seeding remains server-side in `seed_demo.py`, where bootstrap belongs.
- Added a regression contract proving the frontend no longer recreates fixture Questions.

### Backend availability semantics
- Removed the misleading `questionsBackendAvailable`, `reviewsBackendAvailable`, and `reviewsHydrated` booleans.
- Questions and Reviews now use the existing `backendStatus` enum (`loading / loaded / error`) as the single availability signal.
- While authoritative data is loading or unavailable, those collections do not fall back to plausible fixture truth.

### Repository/deploy integrity
- Verified the R8.6 full package already has one deploy backend: `state-project-complete/api.py`.
- `render.yaml` explicitly uses `rootDir: state-project-complete`.
- Added a regression check that a root-level `api.py` is absent, preventing the stale-duplicate-backend failure mode from returning.

### Clean Ask behavior harness
- The deterministic Ask behavior harness now explicitly disables backend hydration instead of loading `context-api.js` in a Node VM with no `fetch`.
- The suite remains a pure Ask-contract test and no longer emits misleading backend `fetch is not defined` errors while passing.

## Verification
- Backend/integration: **183 passed, 3 skipped, 7 subtests passed**.
- Frontend Ask behavior: **81 passed, 0 failed**, with clean output.
- Note interpretation matrix: **18/18 passed**.
- `node --check` passes for `context-app.js`.

## Next phase

R8.6.1 is the frozen pre-Ask baseline. The next work should define and implement the new Ask behavioral contract and module boundary rather than adding unrelated shell behavior.
