# State R9.1 — Ask latency + one-call pressure test

**Build:** `r9.1-ask-latency-one-call-2026-09-02`
**Base:** R9.0 Ask meeting-prep vertical slice

## What changed

### One provider round-trip
The live Ask path now sends one authority-tagged candidate context to the model and requests both relevance selection and the structured answer.

Software still validates the returned selection before trusting record references, reconstructs selected context, validates the answer against that context, forces linked open Reviews into the selection, preserves linked Questions, and injects selected Reviews/blockers into the answer if synthesis omitted them.

The former two-call selector/synthesis methods remain only as a compatibility path for deterministic test providers during this transition. `LiveAskProvider` uses the one-call path.

### Latency instrumentation
Every Ask response now includes `pipeline`, `context_ms`, `provider_ms`, `validation_ms`, and `total_ms`.

The API also logs these fields as a single `Ask timing ...` line so deployed Render logs can show where real latency is occurring.

This environment does not have the deployed provider/network path, so no claim is made here about production latency improvement. The architecture removes one sequential provider round-trip; deployed smoke testing should measure the actual effect.

### UI safety polish
`New ask` is now a session-level control in the Ask header. `Copy` remains an answer-level control in the result toolbar. They are no longer adjacent.

## Verification
- Backend/integration: **191 passed, 3 skipped, 7 subtests passed**
- Existing frontend Ask behavior: **81 passed, 0 failed**
- Note interpretation matrix: **18/18 passed**
- New R9.1 tests prove the one-call provider is invoked exactly once and mandatory Review/blocker safeguards still apply.
- JavaScript syntax checks pass for `context-app.js` and `context-ask.js`.

## Deployment smoke test
1. Confirm `/health` reports `r9.1-ask-latency-one-call-2026-09-02`.
2. Ask: `Prep me for the security meeting`.
3. Inspect the Render log line beginning `Ask timing`.
4. Compare `provider_ms` and `total_ms` with the R9.0 two-call experience.
5. Verify the retention Review and blocker still appear.
6. Verify `New ask` is in the Ask header and `Copy` remains with the answer.
