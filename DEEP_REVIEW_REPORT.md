# State Deep Review — 2026-09-02

## Scope

A full repository review was performed after repeated Render deployment failures. The review covered backend startup, database abstraction, migrations, transaction behavior, integrity constraints, concurrency paths, provider integration contracts, API/frontend integration, deployment configuration, dependencies, secret hygiene, stale files, and packaging structure.

## Critical issues found and fixed

1. **Invalid psycopg2 monkey patch** — old code attempted to assign `connection.execute` to a C-extension connection object. The backend now uses the dedicated `db.Connection` wrapper.
2. **Missing-file / nested-upload deployment risk** — prior patch packaging could leave the old `api.py` authoritative or omit `db.py`. The repaired repository keeps the complete backend dependency set together; the final distribution is packaged from repository root without an enclosing wrapper directory.
3. **Import-time configuration crash** — importing `api.py` previously failed immediately when `DATABASE_URL` was absent. Import now succeeds; a missing database configuration still fails explicitly when a connection/startup is actually attempted.
4. **Non-atomic migrations** — schema application and migration bookkeeping could diverge after a partial failure. Migrations now execute transactionally and roll back on failure.
5. **SQLite/Postgres integrity mismatch** — SQLite foreign keys were not consistently enabled, allowing local behavior that PostgreSQL would reject. SQLite connections now enable foreign-key enforcement.
6. **Evidence immutability only at application level** — immutable Evidence core fields are now protected by database triggers for both SQLite and PostgreSQL while processing-status updates remain permitted.
7. **Review resolution race** — concurrency-critical review/state reads now use PostgreSQL row locking where appropriate.
8. **Interpretation persistence TOCTOU race** — an existing Review is revalidated at persistence time so it cannot be resolved or materially changed while the model is running and then receive stale model output.
9. **Seed script database mismatch** — the demo seed path now uses `DATABASE_URL`/the unified DB layer instead of silently targeting a local SQLite database when production uses Postgres.
10. **Outdated Render Blueprint fields** — configuration was replaced with current `runtime`, `rootDir`, `autoDeployTrigger`, `healthCheckPath`, and env-var structure at repository root. Python is explicitly pinned to 3.14.3.
11. **Unbounded dependency drift** — runtime dependencies are pinned to exact versions observed installing successfully in the current Render build environment.
12. **Stale duplicate artifacts** — obsolete `.bak` files and the duplicate DB wrapper were removed; `.gitignore` now excludes local databases, virtual environments, caches, and env files.
13. **Regression coverage gaps** — hardening tests were added for missing-env import behavior, foreign-key parity, Evidence immutability, PostgreSQL SQL conversion, and lifecycle revalidation during persistence.

## Validation completed

- Python suite: **132 passed, 3 skipped, 7 subtests passed**.
- Frontend behavior suite: **78 passed, 0 failed**.
- JavaScript syntax checks: passed for the prototype application/data files.
- FastAPI lifecycle smoke test against SQLite: passed.
- `GET /health`: **200** with `{"status":"ok"}`.
- `GET /api/state`: **200** with an empty initialized state.
- Source secret scan: no real API keys or database credentials found; only placeholder examples such as `sk-ant-...` remain in local-test instructions.

## What is not yet proven

The audit environment has no outbound database access, so it cannot perform a live connection/migration/request test against the actual Neon Postgres instance. PostgreSQL-specific code paths and SQL conversion are covered by review and tests, but the next Render startup is still the first live Neon smoke test.

Likewise, Render's existing service-level GitHub auto-deploy webhook/authorization cannot be repaired from repository code alone. The root `render.yaml` now records the intended `main` branch, `state-project-complete` root directory, and commit-triggered auto deploy for Blueprint-managed use, but an already-created Render service may require its GitHub integration to be reauthorized separately if webhook delivery remains broken.

## Deployment identity

The backend emits this startup marker:

`[STATE] Starting build deep-review-2026-09-02-r3`

Seeing that marker in Render proves the audited `api.py` is the code being executed.
