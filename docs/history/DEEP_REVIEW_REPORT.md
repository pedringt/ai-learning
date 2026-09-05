# State Full QA Review — 2026-09-02 (R4)

## Scope

A full repository QA pass was completed after the live app exposed duplicate Review cards. The pass covered backend startup, database abstraction, migrations, integrity constraints, duplicate handling, transaction/concurrency behavior, review resolution, provider contracts, API behavior, frontend/backend hydration, deployment configuration, dependency pinning, source-secret hygiene, syntax/compile checks, stale artifacts, and packaging structure.

## Critical issues found and fixed across the deep-review work

1. Invalid psycopg2 monkey patch was removed in favor of the dedicated `db.Connection` wrapper.
2. Import-time database configuration crashes were removed; missing production configuration fails at startup/use instead of module import.
3. Database migrations were made transactional and rollback-safe.
4. SQLite foreign-key enforcement was enabled so local tests better match PostgreSQL integrity behavior.
5. Evidence core immutability is enforced at the database layer on both SQLite and PostgreSQL.
6. Review resolution and interpretation persistence use PostgreSQL locking/revalidation to block stale or concurrent mutations.
7. Seed/demo database access was moved onto the same unified connection layer used by production.
8. Render configuration was updated and Python/runtime dependencies were pinned.
9. Stale backup/duplicate database-wrapper artifacts were removed and generated/local files are ignored.
10. Frontend backend-review hydration now upserts by backend Review ID and removes stale backend Review copies instead of repeatedly appending cards.
11. Backend `list_reviews` returns each Review once even when multiple Evidence items are linked.
12. Repeated Evidence that recommends the same open human decision now reuses the existing Review instead of creating another card.
13. Existing duplicate open Reviews are consolidated at database startup. Linked Evidence, affected State items, proposals, interpretation links, and prior-review links are preserved/moved to the keeper Review.
14. Duplicate pending proposals merged into one Review are superseded so accepting the Review cannot apply the same change twice.
15. A partial unique database index provides an additional backstop against exact duplicate open Review identities.
16. Regression tests were added for duplicate creation, legacy duplicate consolidation, frontend backend-review upsert/hydration, missing-env import behavior, foreign-key parity, Evidence immutability, PostgreSQL SQL conversion, and lifecycle revalidation.

## Final validation completed

- Python suite: **137 passed, 3 skipped, 7 subtests passed**.
- Frontend behavior suite: **81 passed, 0 failed**.
- Python `compileall`: passed.
- JavaScript syntax checks: passed for all repository `.js` files.
- FastAPI lifecycle smoke test against a persistent SQLite database containing legacy duplicate open Reviews: passed.
- Legacy duplicate startup smoke test reduced two normalized duplicate open Reviews to exactly one.
- `GET /health`: **200** and reports build `deep-review-2026-09-02-r4`.
- `GET /api/state`: covered by the automated API suite and lifecycle smoke testing.
- Source secret scan: no real API keys or database credentials were found; placeholder examples remain only in test/instruction text.
- Package structure check: final ZIP is created from repository root with no enclosing wrapper directory.

## Important remaining limitations / risks

### Live Neon cannot be exercised from this QA environment
The audit environment cannot reach the user's actual Neon database. PostgreSQL behavior is covered by code review and automated tests, but the next Render startup is the live verification that the legacy duplicate cleanup and uniqueness backstop execute successfully against that specific database and data set.

### Public API has no real authentication layer
The current API is suitable for a prototype/demo but should not be treated as a secured multi-user production system. CORS is not authentication. If the Render API is publicly reachable, an arbitrary client can call Evidence and Review endpoints directly, including endpoints that can incur model cost or resolve Reviews. Before production use with real users/data, add real identity/authorization (not a shared secret embedded in frontend JavaScript) plus abuse/rate controls.

### Provider variants are not live-tested here
The production-configured Anthropic path has contract/unit coverage but cannot make a live provider call from this QA environment. The alternate OpenAI provider is retained but is not the production path and likewise is not live-tested in this pass.

### Existing Render/GitHub webhook authorization is service-level state
Repository configuration records the intended `main` branch, `state-project-complete` root, and commit-triggered auto-deploy. A pre-existing Render service's GitHub webhook/app authorization is external service state and cannot be fully validated from repository files alone. The user's later successful auto-deploy indicates the connection was functioning at that point.

## Deployment identity

The backend emits:

`[STATE] Starting build deep-review-2026-09-02-r4`

A successful R4 startup should also consolidate any legacy exact-normalized duplicate open Reviews before the API begins serving requests.
