# Historical: State Project v7 → Postgres Migration Deployment Checklist

This file is preserved as a point-in-time record of the original Postgres migration. It is **not** the current deployment procedure.

For current release and rollback steps, use the repository-root `RELEASE.md` and `QA.md`.

---

## Pre-Deployment Verification (Complete ✅)

- ✅ Database abstraction layer created (`db.py`)
- ✅ All service files refactored (review_service.py, interpretation_pipeline_integrated.py)
- ✅ Migration initialization fixed (database_migration_backed.py)
- ✅ SQL comment handling implemented
- ✅ Parameter conversion tested (? ↔ %s)
- ✅ Transaction control tested (BEGIN, COMMIT, ROLLBACK)
- ✅ INSERT OR IGNORE conversion working
- ✅ Local SQLite test suite passes: 100%

## Original Deployment Steps

### 1. Prepare Render Environment
- Ensure `DATABASE_URL` environment variable is set to your Neon/Postgres connection string
- Format: `postgresql://user:password@host/database`
- Verify no other code is still trying to use SQLite hardcoded paths

### 2. Deploy Code
```bash
# Historical instructions only. Do not use this as the current release path.
unzip ai-learning-REFACTORED-READY-FOR-RENDER.zip
git add -A
git commit -m "Deploy: Database abstraction layer for Postgres support"
git push origin main
```

### 3. Monitor Initial Startup
At the time this was written, the expected flow was dependency install, app startup, migration application, then readiness.

### 4. First Smoke Test
The original smoke test covered `/health`, Evidence creation, state reads, and persistence across restart.

## Historical troubleshooting notes

This checklist documented early Postgres migration issues such as the psycopg2 connection wrapper, missing driver installs, SQL dialect conversion, and persistence checks. Those notes were useful during the migration but are no longer the source of truth for deployment.

## Historical rollback concept

The original rollback plan contemplated reverting to SQLite after backing up Postgres. That is not the current release procedure. Use `RELEASE.md` for the current rollback/recovery process.

---

**Status:** historical record only.
