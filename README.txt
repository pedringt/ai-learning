State R13 — final demo-readiness refinements

WHAT CHANGED

1. Ask examples are now useful and clickable
- The large initial empty Ask answer card is removed.
- Initial Workspace stays focused on Ask + a quiet "See what you can ask" link + Needs your attention.
- The examples modal is simplified into three groups:
  Understand / Decide / Prepare.
- Clicking an example fills the Ask field and focuses it.
- Examples do NOT auto-submit, so the user can edit before sending.

2. Built-in sample update is now a clean demo scenario
OLD sample:
- repeated the plan-matrix / temporary-entitlement / grandfathered-package topic
  already present in Northstar, which could create a no-op or duplicate-looking Review.

NEW sample:
- establishes a clearly new first-pilot cohort and duration:
  two weeks, 8 support reps from Billing + Account Access, review before expansion.
- This is intended to create an easy-to-understand rollout Review and a visible
  Project change after approval.
- The workflow is covered by a deterministic end-to-end API regression test.

3. Workspace attention hydrates sooner
- Needs your attention no longer waits for all startup requests.
- It updates as soon as OPEN Reviews + OPEN Questions finish.
- Slow resolved-Review / History / Evidence requests continue hydrating independently.
- A browser regression test deliberately makes resolved Reviews slow and proves
  the Workspace attention section finishes first.

4. Cache identity
- Prototype assets now use r13-demo-readiness.
- context-data.js is cache-busted too, so the new sample update cannot be hidden
  behind a stale browser/CDN copy.

VERIFICATION
- Full pytest: 243 passed, 3 skipped, 7 subtests passed.
- Existing Ask behavior harness: 81 passed, 0 failed.
- Browser coverage: 8 real Chromium tests, including:
  * Ask examples fill + focus without submission
  * Workspace attention does not wait for slow resolved Reviews

DEPLOYMENT
This is a frontend-only user-visible change.
Upload to Vercel/GitHub preserving paths:
- implementation-context-prototype/index.html
- implementation-context-prototype/context-app.js
- implementation-context-prototype/context-data.js

Commit the included test files for regression coverage.

No Render redeploy is required for the user-visible behavior in this patch.
