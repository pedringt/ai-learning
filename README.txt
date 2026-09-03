Final Ask + pill patch

1. Ask streaming validation recovery
- If meeting-prep text has already streamed but final grounding/validation fails, the UI no longer immediately replaces it with “Ask is temporarily unavailable.”
- State automatically retries once through the normal grounded Ask endpoint.
- The existing streamed draft stays visible while the retry runs and shows “Checking final grounding…” / “Finalizing.”
- The retry still must return a validated grounded answer before State treats it as final.
- If the retry also fails, the normal error state remains.
- Final answer replacement preserves the user’s scroll position.

2. AI Search pill
- Shortened to: “Pre-build exploration”.
- Applied Work tag uses the same concise wording.

Verification
- context-app.js syntax: pass
- context-ask.js syntax: pass
- frontend integration + Chromium workflow tests: 60 passed

Deployment
Frontend only. No Render/backend redeploy is required for this patch.
Upload preserving paths:
- index.html
- state-ai-search-learning.html
- implementation-context-prototype/context-app.js
- implementation-context-prototype/context-ask.js
- implementation-context-prototype/context-tool.css
