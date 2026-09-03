# State deferred QA notes — 2026-09-03

These are non-blocking follow-ups found during the manager-readiness QA pass. The manager-facing Ask navigation regression was fixed separately in this build.

## Follow up after manager review

1. **Harden the Review browser-flow test against backend hydration races.**
   A browser test can inject a temporary Review and then lose it when backend hydration reconciles state before the click. Test the real backend-managed path or explicitly control hydration timing instead of treating an injected client-only Review as durable.

2. **Revisit Workspace empty-attention loading timing.**
   The slow-resolved-review browser case can miss the expected `Nothing needs action right now` state at its current early checkpoint. Decide whether the UX should render the empty actionable state sooner or whether the test timing/contract should be updated.

3. **Update stale demo-reset API assertion.**
   One test still expects a `seeded` response field that the current reset endpoint no longer returns. Align the test with the current reset contract (or restore the field only if it is intentionally part of the API contract).

4. **Update the older deterministic Ask provider fixture.**
   One golden-path test uses a pre-refactor provider interface and crashes against the newer Ask provider contract. Modernize the fixture so the suite tests current behavior rather than an obsolete adapter shape.

5. **Update stale reset-help copy assertion.**
   The help UI now provides a direct `Reset demo data` action, while an older test still expects copy directing users to Project Settings. Keep the newer direct-action UX and update the assertion.

6. **Run a final deployed smoke test after upload.**
   Specifically verify: Ask -> navigate to Project/Open Items/History -> return to Workspace retains answer and query; New ask clears both; Reset demo clears both; mobile and dark mode still render the retained session correctly.
