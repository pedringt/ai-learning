State R9.4 — Ask speed: deterministic meeting-prep selection

What changed
- Explicit meeting-prep requests now use deterministic, authority-aware record selection in software.
- The model receives only the selected validated context and only has to synthesize the answer.
- This remains one provider call; it does NOT reintroduce the old two-model-call pipeline.
- General Ask requests continue using the existing one-call model selection+synthesis path.
- Fast meeting-prep synthesis is capped at 1000 output tokens.
- /health build revision is r9.4-ask-fast-meeting-path-2026-09-02.

Measured locally on the seeded security-meeting case
- Previous one-call prompt: about 18.6k characters.
- Fast synthesis prompt: under 65% of the previous prompt in regression coverage.
- Selection still preserves relevant Reviews, true blocking Questions, linked State, and evidence.
- Demo-copy noise remains excluded.

Verification
- Backend/integration: 198 passed, 3 skipped, 7 subtests passed.
- Frontend Ask behavior: 81 passed, 0 failed.
- Targeted API/Ask tests: 25 passed.

Deployment
- Upload files preserving paths.
- Render MUST redeploy because this changes backend Python.
- After deploy, confirm /health reports r9.4-ask-fast-meeting-path-2026-09-02.
- Then run "Prep me for the security meeting" and capture the "Ask timing" log line.
