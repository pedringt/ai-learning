# Proposal for #136: project-scoped area identifiers

Status: **Decided: option C (no schema change)** by Paige on 2026-09-19. Option A (composite key) is deferred, not rejected; see "Decision" below for when to reopen it. Prepared 2026-09-20 from a read-only audit. Related: R-009, R-014, migration 012/013/014.

## The problem, precisely

`project_areas.id` is a global `PRIMARY KEY` (migration 012). Migration 013 added `project_id` later, but the key stayed global. `current_state_items.area_id` has a foreign key to that global key. So two projects cannot both have an area whose local id is `budget`.

## What the audit found

- **The code is already almost fully scoped.** Every query in `baseline_setup.py`, `baseline_draft.py`, `review_service.py` and `api_core.py` filters `project_areas` by `project_id`, and the joins use `a.project_id = s.project_id`. Proposal area ids are validated against the project's own areas (`review_service.py:344`).
- **What is still global:** (1) the primary key; (2) the foreign key `current_state_items.area_id -> project_areas(id)`; (3) one unscoped existence check in `seed_demo.py:529` (`SELECT id FROM project_areas WHERE id=?`), which today would *silently skip* inserting a second project's area if the ids collided. A comment there already records this.
- **Nothing can collide today.** User-created projects generate `area_<uuid>` ids (`baseline_setup.py`, `baseline_draft.py`). Only hand-seeded areas use human-chosen ids: Northstar's `scope-workflow`, `security-data`, `evaluation-rollout`; Juniper's `facilities`, `vendors`, `budget`, `timeline`. No overlap.
- **Production holds only those two seeded demo projects** (read from the live API): 7 areas, no user-created projects. A schema change would currently touch demo data only. This is the cheapest the migration will ever be; it gets more expensive once real projects accumulate.
- **Only one table references the key.** `proposed_state_changes.proposed_area_id` has no foreign key.
- **Postgres coverage exists in CI.** The `python` job runs a `postgres:16` service (`STATE_TEST_POSTGRES_URL`), and `test_project_areas.py` / `test_project_isolation.py` have Postgres variants. The caveat on #136 that "staging has no Postgres, plan the test environment" is true of staging (R-014) but CI already covers it. Production is SQLite on a persistent disk.
- **Precedent for a Python-driven schema change exists:** migration 009 rebuilds `review_issues` in Python with separate SQLite and Postgres branches, FK checks off, and a `foreign_key_check` afterwards (`database_migration_backed.py`, `review_question_migration.py`). Migrations are plain `.sql` run through a dialect converter, with an exact-list guard (`_EXPECTED_MIGRATIONS`), so a new migration means updating that tuple.

## Options

### A. Composite key: `PRIMARY KEY (project_id, id)` plus a composite foreign key

The fix the issue asks for. Two projects can then use the same local id.

- **SQLite** cannot change a primary key or a foreign key in place, so it needs a rebuild of **both** `project_areas` and `current_state_items` (the child must be rebuilt because its foreign key to `project_areas(id)` becomes invalid when the parent key is composite). `current_state_items` is the core Current State record, and its indexes and triggers must be preserved (009's approach: read them from `sqlite_master`, recreate, never rename the old table).
- **Postgres**: drop the foreign key constraint, drop the primary key, add the composite primary key, add the composite foreign key. Constraint names must be looked up or known.
- Update the one unscoped seed check to be project-scoped.
- **Risk:** medium-high. A failed migration on Render production is a crash loop (the Sept 14 incident class). Mitigations: rehearse on a production-shaped copy (as was done for 016/017), take a copy of the SQLite file (or confirm a Render disk snapshot) before deploying, run the full suite plus the Postgres job, and verify the `/health` build SHA after deploy. The migration is **not reversible in place**; recovery is restore-from-copy or a forward fix.
- **Blast radius today:** demo data only, which is the argument for doing it soon if it is ever going to be done.

### B. Namespaced ids (`northstar:budget`), keeping the global key

Rewrite existing ids with a project prefix and generate prefixed ids for new areas. No table rebuild, but it still needs an FK-ordered update (SQLite: foreign keys off; Postgres: constraint juggling), it changes ids that the API returns and that many tests, seeds and eval scenarios reference, and it does not let a person write a plain local id without a translation layer. More churn than A for a weaker result. **Not recommended.**

### C. No schema change: make the hazard loud and impossible to hit by accident

- Scope the `seed_demo.py` existence check by project **and raise** on a real collision instead of silently skipping.
- Add a test asserting that all hand-seeded area ids are unique across seeded projects, so adding a third seeded project with an overlapping id fails in CI with a clear message.
- Add a test asserting that any code path creating an area uses the generated `area_<uuid>` form (today true; this pins it).
- Keep R-009 open, reworded: the structural limit remains, but it cannot be hit silently.
- **Risk:** near zero, no migration. **Does not** meet the issue's "done when" (identical local ids in separate projects).

## Recommendation

**Do C now; do A only when a real trigger appears or before real user data lands on production.**

- Nothing can collide today, so A's benefit is speculative, and its cost is the riskiest kind of change in this product: a rebuild of the authority record (`current_state_items`) with a crash-loop failure mode.
- C removes the *silent* failure mode (the actually dangerous part) for a small, safe change and gives the future collision a loud, early failure.
- The one argument for A soon is the data window: production has only demo data now. If Paige expects real projects on production, do A **before** that, with the rehearsal and backup steps above. If not, it can wait.

## If A is chosen: plan

1. Add migration `018_project_scoped_areas` (update `_EXPECTED_MIGRATIONS`), implemented as a Python step like 009 with SQLite and Postgres branches.
2. Tests first: (a) migrate a database built from the current schema with the seeded data, on SQLite and on Postgres (CI), and assert the rows, area assignments and Reviews are unchanged; (b) a regression proving two projects can each define area `budget` with no collision or cross-project leakage across `/api/project-areas`, Current State assignment, a Review proposal with `proposed_area_id`, and Baseline area creation by name; (c) the migration is idempotent and refuses to run on a partially migrated schema (as 009 does).
3. Rehearse on a production-shaped copy of the SQLite database; confirm the second boot is clean and `PRAGMA foreign_key_check` is empty.
4. Before deploying: copy the production database file (or confirm a disk snapshot). Deploy, verify `/health`, check the boot logs, run a read-only smoke.
5. Update R-009 and the seed comment; close #136.

## Decision

**Option C, chosen by Paige (2026-09-19).** It is implemented on this branch: the seed check is project-scoped and raises on a real collision, tests pin that hand-seeded area ids are unique across seeded projects and that user projects generate `area_<uuid>` ids, and R-009 is reworded (the structural limit remains, but it can no longer be hit silently).

This does **not** meet #136's original "done when" (two projects using the same local area id). The issue should stay open as a deferred item (Backlog), not be closed.

**Reopen option A (the composite-key migration, plan above) when any of these becomes true:**

- a third hand-seeded project is proposed (the uniqueness test will fail first, which is the intended alarm);
- any path lets a person or a model choose an area id instead of generating `area_<uuid>`;
- real user-created projects are expected on production. Production holds only the two seeded demo projects today (7 areas), which makes the migration cheapest now; it gets more expensive once real data lands. If that is coming, do A **before** it, with the rehearsal and backup steps in the plan above.
