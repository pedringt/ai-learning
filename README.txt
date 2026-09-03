State R14 — demo discovery polish

Changes
- Add Note now has three quiet, clickable examples:
  New plan / Research finding / Decision / constraint.
  Each fills and focuses the note field without submitting.
- How this demo works is shorter and centered on the actual State loop.
- Added three clickable Good places to start actions:
  Ask about Northstar / Add a sample note / Explore the maintained Project.
- The guide points users to Project Settings → Reset Northstar if they want to restore the curated demo.
- No Review tutorial/“Try this” treatment was added.
- Asset cache key bumped to r14-demo-discovery.

Verification
- 245 passed, 3 skipped, 7 subtests passed.
- Ask behavior harness: 81 passed, 0 failed.
- Browser workflow suite: 10 passed, including the new sample-note and demo-guide interactions.

Deployment
Frontend visible files:
- implementation-context-prototype/index.html
- implementation-context-prototype/context-app.js
- implementation-context-prototype/context-data.js
- implementation-context-prototype/context-tool.css

No backend behavior changed; no Render redeploy is required.
