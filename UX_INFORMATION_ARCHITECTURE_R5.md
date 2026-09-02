# State R5 — Notes → History → Project UX Pass

## Product model

- **Notes:** the complete chronological project memory — what came in. Searchable and date-filterable; Evidence does not become Current State automatically.
- **History:** the bridge — meaningful human-accepted transitions showing how reviewed Notes changed Current State, with source-note provenance when available.
- **Project:** the clean current understanding — a readable document/outline derived from Current State rather than a card dashboard.

## Functional changes

- Added read-only `GET /api/evidence` so Notes can rehydrate the complete persisted Evidence archive, including resolved/no-review evidence.
- Enriched `GET /api/history` with Review and Evidence provenance using existing relationships; no schema migration required.
- Frontend now rehydrates backend Evidence and History after refresh.
- Added Notes date filters: All time, Today, 7 days, 30 days.
- Redesigned Project as a document-style outline.
- Redesigned History as a chronological transition narrative with Before/Now and expandable source Notes.

## Explicitly unchanged

- Evidence interpretation contract.
- Human authorization requirement.
- Review lifecycle and duplicate prevention.
- Atomic State mutation/History transaction.
- Current State authority rules.
- Database schema.

## Verification

- Backend Python suite: **142 passed, 3 skipped, 7 subtests passed**.
- Frontend behavior suite: **81 passed, 0 failed**.
- Python compile and JavaScript syntax checks passed.
- Final package has no outer wrapper directory.
