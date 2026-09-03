State R11 — real-user workflow E2E + stabilization

WHAT IS NEW

1. Real-browser E2E coverage (Chromium)
- Workspace hydration does not replace or blur the Ask field while a person is typing.
- Shared modal geometry stays inside the viewport and above the portfolio header.
- Modal geometry is also checked at 390px phone width.
- Follow-ups preserve the existing Ask artifact and use a compact working state.
- Backend Review decisions disappear and acknowledge immediately before the delayed server round-trip finishes.

2. Real-user API workflow matrix
- Add new fact -> Review -> accept -> Project/Current State + History update.
- Reject proposed change -> Current State stays unchanged.
- Repeat an already-maintained fact -> Evidence is preserved but no no-op Review is created.
- Reset demo -> curated interactive Northstar baseline returns.

3. Ask input / hydration fix
- Backend hydration no longer rerenders the full Workspace.
- Needs your attention updates independently.
- A focused Ask DOM node is therefore not replaced when the bottom section finishes loading.
- This fixes both lost focus and disappearing typed text caused by hydration.

4. Shared modal fix
- Critical modal geometry is now inlined in index.html as well as the stylesheet.
- Overlay uses an extremely high stacking layer and explicitly lowers portfolio shell layers while open.
- Dialogs are top-safe, viewport-bounded, internally scrollable, desktop + mobile tested.
- This applies to Add Note, Project Settings, How this demo works, and every shared modal.

5. No-op / duplicate Review prevention
- After provider validation, create-only missing-understanding Reviews are suppressed when every proposed fact already exactly exists in active Current State.
- Evidence remains preserved.
- The user is not asked to approve a change that would do nothing.
- This is intentionally conservative: case/punctuation/whitespace are ignored; software does not guess that arbitrary paraphrases are equivalent.
- Existing exact duplicate State acceptance protection remains in place.

6. Ask visual cleanup
- Removes the extra session divider directly above the Ask answer card so the card no longer looks like it is touching a stray line.

7. Cache/deploy identity
- Frontend cache-bust is r11-user-e2e.
- Backend /health build is r11-user-workflow-e2e-2026-09-02.

AUTOMATED VERIFICATION
- Full pytest: 235 passed, 3 skipped, 7 subtests passed.
- Existing Ask behavior harness: 81 passed, 0 failed.
- Browser tests use real headless Chromium via Playwright.

IMPORTANT ABOUT EXISTING DUPLICATES
The prevention logic stops new exact duplicate facts / no-op Reviews, but it does not silently delete already-created Current State records because that could damage provenance.
After deploying R11, use Project Settings -> Reset demo data once if you want a pristine curated Northstar baseline. That reset removes QA-created duplicate/demo activity and restores the canonical interactive scenario with open Reviews, blockers, Questions, Notes/Evidence, Rules, and History.

DEPLOYMENT
Vercel/frontend:
- implementation-context-prototype/index.html
- implementation-context-prototype/context-app.js
- implementation-context-prototype/context-tool.css

Render/backend:
- state-project-complete/api.py
- state-project-complete/interpretation_pipeline_integrated.py

Commit the test files too:
- test_ask_golden_scenarios.py
- test_browser_user_flows.py
- test_real_user_workflow_matrix.py
- test_frontend_integration_contract.py

Both Vercel and Render need updating.
