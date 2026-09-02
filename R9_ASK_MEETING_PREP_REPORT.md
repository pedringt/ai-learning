# State R9.0 — Ask meeting-prep vertical slice

**Build:** `r9.0-ask-meeting-prep-slice-2026-09-02`  
**Base:** R8.6.1 frozen pre-Ask baseline

## What changed

### Adversarial Ask demo data
Added a small deterministic Ask test set rather than more generic volume:
- security meeting agenda Evidence;
- vendor 30-day retention claim;
- relevant engineering activity that is explicitly not a State change;
- recent demo-copy noise for negative-relevance testing;
- a tempting Tier 2 Slack claim;
- two additional security/scope Open Questions;
- a Project Rule: Slack is supporting evidence, not authoritative approval.

The existing retention blocker and retention State-at-Risk Review are reused rather than duplicated. The vendor Evidence is linked to the Review, the Review is linked to the current data-boundary State item, and the retention blocker is linked to the Review.

### New Ask backend boundary
Added:
- `ask_contract.py` — application-owned selector and answer schemas;
- `ask_provider.py` — provider-neutral two-call live adapter using the already configured Anthropic/OpenAI client;
- `ask_service.py` — candidate construction, authority tagging, selection validation, mandatory Review/Question qualification, synthesis validation, and Open Items remainder counts;
- `POST /api/ask`.

The first live path is intentionally two-step:
1. select/classify relevant records;
2. synthesize a structured answer from only validated selected context.

Software, not the model, enforces:
- IDs must exist in the supplied candidate pool;
- blocker IDs must actually be blocking Questions;
- open Reviews linked to selected Current State are mandatory;
- Questions explicitly linked to selected Reviews are retained;
- answer record references and source IDs must come from validated context;
- selected relevant Reviews/blockers are injected into the structured answer if synthesis omits them.

### Dedicated frontend Ask module
Added `context-ask.js` rather than growing all new behavior inside `context-app.js`.

For `Prep/Prepare ... security meeting`, Ask now uses the live `/api/ask` path. Once a live Ask session exists, follow-up turns stay in that grounded session. The result UI supports:
- structured headline + summary + sections;
- `Needs review` and `Blocking` distinctions;
- `Review now →` / `See question →` direct actions;
- suggested refinements;
- quiet `Before you move on` Open Items safety net;
- `New ask` to clear the temporary working session.

All other legacy Ask jobs remain on the existing deterministic path for this slice. They will migrate only after the new architecture proves itself.

## Verification
- Backend/integration: **189 passed, 3 skipped, 7 subtests passed**.
- Existing frontend Ask behavior: **81 passed, 0 failed**.
- Note interpretation matrix: **18/18 passed**.
- New Ask vertical-slice tests cover seed idempotence/provenance, mandatory Review surfacing, blocker integrity, API success, and fail-closed provider behavior.
- JavaScript syntax checks pass for `context-app.js`, `context-api.js`, and `context-ask.js`.

## Known scope
This is not the full Ask replacement yet. The new live architecture is proven first on security meeting prep + refinements. Catch-up, project updates, direct Q&A, provenance, grounded drafting, and the unknown-handling golden cases are specified in `ASK_GOLDEN_BEHAVIOR_SPEC_R9.md` and should migrate next.
