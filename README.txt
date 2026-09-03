State R9.5 — grounded Ask progress

Goal
Make Ask feel responsive without weakening the final grounded-answer contract.

Behavior
- Final Claude Ask request starts immediately, exactly as before.
- A separate model-free /api/ask/preview request runs in parallel.
- For explicit meeting prep, preview uses the same deterministic, authority-aware
  selection as the fast Ask path.
- As soon as that preview returns, the loading state changes from generic progress
  to a grounded message such as:
  "Found 2 relevant Reviews, 1 blocker, 3 open questions and 6 Current State facts.
   Drafting the brief..."
- Preview is never awaited before the final Ask request starts, so it does not add
  serial latency.
- Partial/unvalidated model text is never rendered.
- Final answer still uses the existing Claude structured-output + validation path.

Why progressive rather than raw token streaming
The current provider response is structured JSON. Rendering partial JSON would
either expose unvalidated model claims or require a second output contract.
This pass improves perceived latency while preserving State's authority boundary.

Build
r9.5-grounded-ask-progress-2026-09-02

Verification
- Full backend/integration: 206 passed, 3 skipped, 7 subtests passed
- Ask behavior harness: 81 passed, 0 failed
- Targeted Ask/frontend regression suite: 54 passed

Deployment
- Upload all files preserving their paths.
- Render must redeploy because api.py and ask_service.py changed.
- Vercel/front-end must receive the implementation-context-prototype files.
- After deploy, run "Prep me for the security meeting".
- Expected experience:
  1. generic building state appears immediately;
  2. around context-hydration time, it becomes a real grounded-count message;
  3. final validated brief replaces it when Claude finishes.
