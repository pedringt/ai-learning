State R10 — golden Ask QA + queued fixes

NEW AUTOMATED GOLDEN SCENARIOS
- Specific recent fact beats broad topical context:
  "My billing contact is Jane Smith" -> "Who is my billing contact?"
- Pending Evidence remains discoverable and linked Review is preserved.
- Internal IDs never appear in user-facing Question/Review prose.
- Blocking metadata renders structurally from canonical records.
- Exact duplicate Current State create proposals do not create a second active fact.
- Demo reset restores the same rich, interactive Northstar starting scenario.

ASK / RETRIEVAL
- All fresh questions use live grounded Ask when the backend is available.
  The older canned intent layer is now only a no-backend fallback.
- Small who/what/when/where lookups use a deterministic fact-selection fast path.
- Specific matching Evidence gets selected alongside relevant Current State.
- Reviews linked to selected Evidence are automatically preserved so pending facts
  are qualified rather than silently promoted.
- Direct-fact answers are capped to a small number of sections/items.
- User-facing text is sanitized for internal record IDs.
- Question and Review display text is canonicalized from State records.

FOLLOW-UPS
- Previous artifact stays visible while a follow-up works and after it returns.
- Follow-up loading is compact rather than spawning another giant briefing loader.
- Ask input draft is captured before overview rerenders so hydration cannot erase typing.
- Existing Anthropic maxItems compatibility adapter is included.

MODALS
- Shared overlay z-index is raised above the portfolio shell header.
- Overlay/dialog scroll is reset on every open before and after focus.
- Tall dialogs remain internally scrollable and viewport-bounded.
- Applies to Add Note, Project Settings, How this demo works, and all shared dialogs.

REVIEWS
- Existing optimistic Review removal remains.
- Immediate "Saving decision" feedback appears before the ~2s backend resolve finishes.
- Final confirmation replaces it when the authoritative response returns.

CURRENT STATE INTEGRITY
- Accepting an exact duplicate create-proposal resolves the Review without inserting
  a duplicate active Current State fact.

DEMO RESET
- Project Settings now contains "Reset demo data".
- POST /api/demo/reset is available only when demo bootstrap is enabled.
- Reset removes QA/user-created demo activity, then restores canonical Northstar:
  Current State, open Reviews, blockers, open Questions, Evidence, Rules, and History.
- Reset is not used as a substitute for duplicate prevention; both are implemented.

CACHE / DEPLOY
- Frontend cache-bust revision moved from stale r9.3.1b to r10-golden-qa.
- This is important: index.html must be uploaded with the JS/CSS so browsers fetch
  the new assets.

BUILD
r10-golden-qa-hardening-2026-09-02

VERIFICATION
- Full backend/integration: 224 passed, 3 skipped, 7 subtests passed
- Ask behavior harness: 81 passed, 0 failed
- Frontend integration contracts + golden scenarios: 51 passed

DEPLOYMENT
Render/backend:
- api.py
- ask_provider.py
- ask_service.py
- review_service.py
- seed_demo.py
- tests should be committed with source

Vercel/frontend:
- index.html
- context-api.js
- context-ask.js
- context-app.js
- context-tool.css

Both Render and Vercel need updating.
