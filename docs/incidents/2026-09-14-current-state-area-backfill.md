# Incident: Production Current State lost project-area organization

**Date:** 2026-09-14  
**Severity:** P1  
**Status:** Closed  
**Related:** #122, #113, commit `b965d774791df23ecb6f2f80ad7485ee9357c825`

## What happened

After the project-area generalization reached production, Northstar's existing Current State items did not have the new `area_id` values expected by the updated Current State view. Most of the project therefore appeared under the generic `General` area instead of the project-specific areas.

## User/product impact

The production portfolio/demo showed a materially incomplete Current State organization. The underlying facts were not deleted and State's human-authorization boundary was not bypassed, but a reviewer could reasonably conclude that State had lost the useful structure of the project.

## Reproduction

1. Start with a database containing Northstar Current State rows created before migration 012.
2. Apply migration 012, which adds `current_state_items.area_id`.
3. Keep the existing rows rather than recreating the database from the current seed.
4. Load Northstar's Current State page.
5. The pre-existing rows still have `area_id = NULL`, so they fall back to `General`.

## Root cause

Migration 012 added the nullable `area_id` column but did not backfill existing Current State rows. The updated seed data assigned areas when inserting new rows, but the bootstrap path did not revisit rows that already existed.

That made fresh databases look correct while the long-lived production database retained the old rows without areas.

## Why existing QA missed it

Local and staging QA primarily exercised fresh or frequently reset databases. Those databases inserted Current State rows after the area-aware seed logic existed, so the rows received valid `area_id` values from the start.

The release checks proved that the new schema and fresh-seed behavior worked, but they did not reproduce the production upgrade path from a database populated before migration 012. The gap was migration-state coverage, not the Current State rendering logic itself.

## Fix

The project bootstrap now checks seed-owned Current State rows that already exist. When one of those known rows has no area yet, it backfills the expected `area_id` instead of leaving it `NULL`.

The fix is deliberately narrow: it only fills a missing area for a row owned by the known demo seed. It does not overwrite a human-authorized Current State value.

After the change, the full deterministic backend suite passed with 479 tests and all 18 frontend VM suites passed.

## Durable protection

- **Regression test added:** No dedicated long-lived pre-migration production-snapshot regression was identified in the hotfix itself; the existing deterministic suite passed after the fix.
- **Eval case added/updated:** Not applicable. This was a deterministic migration/data-state failure, not a model-judgment failure.
- **QA/release check changed:** Treat migration upgrades against existing data as a distinct release risk from validating a fresh database. For migration-sensitive changes, verification should include the relevant upgrade path rather than only current-schema setup.
- **Risk/decision docs updated:** Current release guidance now calls out coordinated migration promotion, backward-compatible database changes, recovery planning, and focused post-release verification.

## Follow-up

A future migration touching maintained State data should include an upgrade-path regression using representative pre-migration rows when fresh-database tests would not exercise the same state transition.

## PM takeaway

A schema can be correct on a fresh database and still be wrong for production. When a migration changes how existing Current State data is interpreted or organized, the upgrade path is part of the product behavior and needs its own verification.