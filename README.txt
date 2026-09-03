State R9.4.1 — Ask fast-path reliability hotfix

Why
- The R9.4 deterministic meeting-prep fast path could surface
  "Ask could not produce a valid grounded answer" if the provider's structured
  synthesis response was truncated/invalid.

Fix
- Raises fast meeting-prep synthesis budget from 1000 to 1300 tokens.
- Pre-validates the fast structured response.
- If the fast response is invalid/truncated, automatically falls back to the
  proven one-call Ask path instead of returning a user-visible grounding error.
- The fallback only runs on a failed fast response; normal successful meeting
  prep remains one provider call.

Verification
- Backend/integration: 199 passed, 3 skipped, 7 subtests passed.
- Frontend Ask behavior: 81 passed, 0 failed.
- Added regression coverage for malformed fast-path output.

Deployment
- Upload these files preserving paths.
- Render must redeploy.
