State R9.6 — true Ask streaming

This is real answer streaming, not just a progressive loading message.

How it works
- Explicit meeting-prep requests use POST /api/ask/stream.
- State deterministically selects and validates the grounded context first.
- Anthropic Messages streaming begins using the existing structured-output schema.
- The backend forwards Claude text deltas to the browser over Server-Sent Events.
- The browser incrementally extracts only human-readable fields from the structured
  JSON and renders them as they arrive, including the currently-generating field.
- A blinking draft cursor makes the active field visibly progressive.
- The completed JSON is validated by the existing State authority contract.
- Only after validation does the final normal Ask payload replace the streaming draft.
- If streaming/validation fails, the draft is not treated as a completed State answer.

Important
- This currently applies only to explicit meeting-prep requests on Anthropic.
- General Ask behavior remains unchanged.
- This does not make Claude itself finish faster; it improves time-to-first-useful-text.
- The frontend updates only the answer body during deltas instead of rerendering the
  whole Workspace, to avoid page-jump/jank while streaming.

Build
r9.6-true-ask-streaming-2026-09-02

Verification
- Full backend/integration: 209 passed, 3 skipped, 7 subtests passed
- Ask behavior harness: 81 passed, 0 failed
- New regression coverage proves delta events occur before final validation payload
- JS syntax checks pass

Deployment
1. Upload state-project-complete files and let Render redeploy.
2. Upload implementation-context-prototype files to GitHub/Vercel.
3. Confirm /health reports r9.6-true-ask-streaming-2026-09-02.
4. Ask: "Prep me for the security meeting."
5. Expected behavior: after context setup, the headline/summary/sections should visibly
   build while Claude is still generating; final State links/actions appear after validation.

The Anthropic streaming implementation follows the current Messages SDK streaming
pattern (client.messages.stream / text_stream) while retaining output_config JSON schema.
