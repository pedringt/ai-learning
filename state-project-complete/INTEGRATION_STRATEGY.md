# State Project — Phase 1 ↔ Phase 2 Integration Strategy

**Goal:** Prove the complete deterministic path Evidence → interpretation → Review + proposal → human accept → atomic History transition, using:
- Phase 2's proven semantic/structural validation and pipeline logic (57 tests passing)
- Phase 1's migration-backed persistence schema
- The 4 golden scenarios as end-to-end proofs

**Status:** Planning → Implementation → Unified test suite (57 Phase 2 + 4 scenario end-to-end)

---

## Schema Mismatch Points (from Handoff section 19)

### 1. Multiple Interpretation Records per Review
**Phase 2:** Each Interpretation creates multiple `review_issues` rows in sequence (one per recommendation)
**Phase 1:** `interpretation_records` has `review_id` FK (one-to-one assumed)
**Resolution:** Interpretation Record should NOT reference individual Review IDs. Instead, persist the complete structured_result JSON (which includes all recommendations). The Review/proposal linkage comes from semantic validation and atomic Insert operations during _persist_success.

### 2. Proposal `operation` Field
**Phase 2:** Explicit `operation IN ('create','update','retire')` on `proposed_state_changes`
**Phase 1:** No operation field; inferred from nullable `state_item_id` + `expected_state_version`
**Resolution:** Add `operation` column to Phase 1's `proposed_state_changes` table in a new migration (002_add_operation_field.sql)

### 3. Proposal `effective_date`
**Phase 2:** Optional `effective_date TEXT` on `proposed_state_changes`
**Phase 1:** Not present
**Resolution:** Add `effective_date` column in same migration (002)

### 4. Create Acceptance
**Phase 2:** Contract supports `operation=create` proposals (for new State items from missing_understanding)
**Phase 1:** `accept_proposal()` raises if State doesn't exist (update-only)
**Resolution:** Do NOT implement create/retire acceptance in this integration. Focus on update-existing acceptance only (covers Scenario 2). Document that create/retire are contract-defined but deferred.

### 5. Retire Acceptance
**Phase 2:** Contract supports `operation=retire` proposals
**Phase 1:** No retire logic
**Resolution:** Deferred (same reasoning as create)

### 6. History Retirement Representation
**Phase 2:** Uses null `new_statement` for retires
**Phase 1:** Requires non-null `new_statement`
**Resolution:** Deferred (tied to retire acceptance deferral)

### 7. Review Update/Evolution
**Phase 2:** Persists `update_existing` recommendations by linking to prior Review and creating new proposals
**Phase 1:** No explicit Review evolution metadata
**Resolution:** Keep Phase 1's simple model: one Review row per decision, linked via `prior_review_id` if needed. Proposals link to Reviews. No additional columns needed.

### 8. Project Rules in Context
**Phase 2's fake provider:** Only captures State + open Reviews
**Handoff contract:** Active Project Rules should also be supplied to provider
**Resolution:** Leave in capture_context() as a documented TODO. Phase 2 tests don't exercise this; live adapters will need it. Do not block integration.

### 9. Context Content vs Reference Snapshot
**Phase 2:** `InterpretationContextSnapshot` holds only IDs/versions for validation
**Live provider context:** Should include actual statements, Rule text, Review decision context
**Resolution:** Keep both: `InterpretationContextSnapshot` for validation (reference), separate context object (with full text) for provider prompt. Build provider context separately when live adapters are added.

### 10. Persistence Atomicity for Interpretation
**Phase 2:** Uses `BEGIN IMMEDIATE` transaction, all-or-nothing for multi-Review interpretation
**Phase 1:** Will use same transaction semantics
**Resolution:** Preserve this exactly. Test that one invalid Review prevents any State/Review/proposal mutations.

---

## Implementation Sequence

### Step 1: New Migration (002_add_operation_and_effective_date.sql)
Add two columns to `proposed_state_changes`:
```sql
ALTER TABLE proposed_state_changes ADD COLUMN operation TEXT;
ALTER TABLE proposed_state_changes ADD COLUMN effective_date TEXT;
-- Backfill existing proposals with 'update' operation (assumed from original design)
UPDATE proposed_state_changes SET operation='update' WHERE operation IS NULL;
-- Add NOT NULL constraint
ALTER TABLE proposed_state_changes ALTER COLUMN operation SET NOT NULL;
```

### Step 2: Phase 2 Pipeline Adapter (interpretation_pipeline_migration_backed.py)
Keep Phase 2's pipeline logic but swap backend:
- `capture_context()` → queries Phase 1 schema
- `application_snapshot()` → queries Phase 1 schema
- `_persist_success()` → inserts into Phase 1 tables
- `_persist_failure()` → inserts into Phase 1 tables
- `process_evidence()` → orchestrates validation + persistence (unchanged logic)

All Phase 2 validation logic stays identical. Only the SQL queries change.

### Step 3: Migration-Backed Database Layer (database_migration_backed.py)
Wrap the Phase 1 migration in a Python class so tests can:
- Create temp SQLite DB
- Apply 001_initial.sql + 002_add_operation.sql
- Expose connection for pipeline

### Step 4: Run Phase 2 Test Suite Against Integrated Schema
- All 57 Phase 2 tests should pass without modification
- Use the migration-backed database layer instead of Phase 2's inline schema
- Confirm all structural/semantic/pipeline tests still pass

### Step 5: Add End-to-End Integration Test for 4 Golden Scenarios
- Scenario 1 (no_review): Evidence → fake provider → no Review created → Interpretation Record only
- Scenario 2 (proposed_update): Evidence → fake provider → Review + Proposal created → human accept → atomic History + State version increment
- Scenario 3 (combined_review): Multiple State items + Proposals, partial acceptance
- Scenario 4 (stale_proposal): Concurrency test — captured State version vs. current State version

Each test:
1. Load initial State + Rules
2. Submit Evidence
3. Call process_evidence() with fake provider
4. Verify Interpretation Record, Review, Proposals created
5. (For update scenarios) Call accept_proposal() manually
6. Verify atomic History transition + State version increment

---

## Code Changes Summary

### New Files
- `002_add_operation_and_effective_date.sql` — migration
- `database_migration_backed.py` — wrapper around Phase 1 schema
- `interpretation_pipeline_migration_backed.py` — Phase 2 logic on Phase 1 tables
- `test_integration_golden_scenarios.py` — end-to-end proof

### Modified Files
- None. Phase 2 validation code stays unchanged.

### Deleted Files
- Phase 2's inline `create_pipeline_schema()` logic is replaced by migrations

---

## Success Criteria

1. All 57 Phase 2 tests pass (no modification to test code)
2. All 4 golden scenario end-to-end tests pass
3. Schema diff is minimal (two columns added, one new migration)
4. No stale-proposal concurrency bugs
5. Atomic History/State transitions provable (one failed Review rejects entire interpretation)
6. Interpretation Record persists structured result as JSON (reviewable/auditable)

---

## Deferred (Not Blocking Integration)

- Create proposal acceptance (deferred per handoff)
- Retire proposal acceptance (deferred)
- Project Rules in provider context (documented TODO)
- Live Anthropic/OpenAI adapters (after deterministic gate)

---

## Next Step

Implement Step 1: Create the migration file.
