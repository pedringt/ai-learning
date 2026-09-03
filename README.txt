State R9.4.3 — Ask selection-boundary hardening

What the OpenAI benchmark exposed
- OpenAI returned the correct AskSelection field names, but selected 13 state_ids.
- The State contract allows at most 12, causing a 422.
- The JSON schema did not previously advertise these max-item limits even
  though the Pydantic contract enforced them.

Fix
- Adds maxItems to the provider JSON schema for every bounded selection list.
- Normalizes/deduplicates/trims provider selections before strict Pydantic validation.
- Mandatory Review and linked Question context wins over optional model-selected
  context if a bounded list is already full.
- Applies to all providers, not only OpenAI.
- Build revision: r9.4.3-selection-bounds-2026-09-02.

Verification
- Full backend/integration suite: 203 passed, 3 skipped, 7 subtests passed.
- Targeted Ask/frontend tests: 51 passed.
- Regression coverage includes the exact 13-state-id over-selection failure.

Benchmark conclusion
- GPT-4.1 mini request took 48.9s and failed after two provider calls.
- Claude's latest successful meeting-prep request was ~24.8s total.
- Recommendation: set STATE_PROVIDER back to anthropic for now.
