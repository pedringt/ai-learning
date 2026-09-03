State R9.8 — consolidated QA pass

Fixes from review
1. All modals
   - Force viewport-top-safe overlay geometry.
   - Reset overlay and dialog scroll position every time a dialog opens.
   - Preserve preventScroll focus behavior.
   - Applies globally to How this demo works, Project Settings, Add Note, and all other dialogs.

2. Ask follow-ups
   - Fix Anthropic 400 caused by unsupported JSON Schema maxItems.
   - Provider-facing Anthropic schema strips maxItems only; State's software contract and normalization still enforce limits.
   - Previous Ask artifact remains visible while a follow-up is working or if it errors.
   - Follow-up composer remains stable instead of disappearing during rerenders.
   - Workspace attention is hidden while actively working in Ask so it is not visibly pushed down as the answer grows.
   - Streaming DOM paints are buffered to roughly 64ms cadence for calmer visual output.

3. Review interactions
   - Review disappears from the active queue optimistically as soon as either decision is chosen.
   - If the backend request fails, the item is restored.
   - This removes the several-second dead period caused by waiting for resolve + full rehydration.
   - Needs your review now has stronger decision/authorization visual weight so it does not read as less important than blockers.

4. Project
   - Current Project header is substantially more compact.
   - Metadata is no longer presented as three oversized equal-height cards.
   - Project Settings is quieter.
   - Current direction arrives sooner.
   - Decorative vertical section lines are removed.

Build
r9.8-qa-consolidation-2026-09-02

Verification
212 passed, 3 skipped, 7 subtests passed.
Ask behavior harness: 81 passed, 0 failed.

Deployment
Frontend/Vercel:
- context-app.js
- context-tool.css

Backend/Render:
- ask_provider.py
- api.py
- test_ask_r9.py is regression coverage and should be committed with the source.

Because the follow-up fix changes ask_provider.py, Render MUST be redeployed for the Anthropic 400 fix.
