State R12 — definitive Project wiki + stabilization

PROJECT: DEFINITIVE WIKI
- Project is now a human-readable projection of authoritative Current State.
- The underlying atomic State records are NOT merged or deleted.
- Major sections remain Product & Workflow, Safety & Constraints, Evaluation & Rollout.
- Within them, maintained understanding is organized into readable wiki topics:
  * Pilot scope & workflow
  * Knowledge & access
  * Escalation & handoff
  * Human control
  * Action boundaries
  * Data & sources
  * How success is judged
  * Launch readiness
  * Rollout & enablement
- Current State statements are composed into readable prose paragraphs.
- Near-identical prose is suppressed only in presentation; provenance records remain intact.
- Every wiki topic has a collapsed "Maintained from N Current State facts" disclosure.
- Individual atomic facts, pending Review links, and History links remain available there.
- Project metadata proportions are rebalanced so Stage/Outcome are readable and the fact count is not squeezed.

AFTER REVIEW: CHANGE RECEIPT
- Accepting a substantive Review now ends with a concrete "Here's what changed" receipt.
- The receipt shows the resulting maintained statement(s).
- It provides View in Project and View in History actions.
- View in Project jumps to and briefly highlights the relevant wiki section.
- Leaving understanding unchanged keeps the existing clear confirmation.

ADD NOTE RELIABILITY
- Evidence is still saved exactly once before analysis.
- If the provider has a transient provider_error, State automatically retries analysis once against the SAME Evidence.
- Contract/semantic failures are not blindly retried.
- If the second provider attempt still fails, the existing Saved-but-not-analyzed / Retry analysis flow remains.
- This is intended to reduce the flaky built-in sample-note experience without creating duplicate Evidence.

OPEN ITEMS / REVIEW
- Open Question and Review title typography is more deliberate and less oversized.
- Review uses a strong purple decision/authorization treatment rather than visually reading as lower priority than red blockers.
- User-facing Review copy strips leaked internal IDs such as state_..., question_..., k-..., q-..., etc.

LIGHT-MODE PORTFOLIO
- The main portfolio purple is less saturated in light mode:
  --purple #51438f
  --purple2 #6858a6
- Dark-mode palette is unchanged.

CLASSIFICATION
- Read-only, account-changing, autonomy, refund/ownership, VIP, and similar control-boundary facts are deterministically classified into Safety rather than accidentally falling into Workflow.

CACHE / BUILD
- Frontend cache revision: r12-project-wiki
- Backend build: r12-definitive-project-wiki-2026-09-02

AUTOMATED VERIFICATION
- Full pytest: 238 passed, 3 skipped, 7 subtests passed.
- Existing Ask behavior suite: 81 passed, 0 failed.
- Real Chromium coverage includes the new Project wiki projection with atomic facts collapsed by default.
- API regression coverage proves the automatic transient analysis retry reuses one Evidence record.

DEPLOYMENT
Vercel / frontend:
- index.html (root portfolio light-mode purple)
- implementation-context-prototype/index.html
- implementation-context-prototype/context-app.js
- implementation-context-prototype/context-tool.css

Render / backend:
- state-project-complete/api.py

Commit test files too:
- state-project-complete/test_api.py
- state-project-complete/test_browser_user_flows.py
- state-project-complete/test_frontend_integration_contract.py

Both Vercel and Render need updating.
