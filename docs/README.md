# Documentation

Start with the [repository README](../README.md) — it covers the authority
model, architecture, running locally, tests and deployment.

| Directory | Contents |
|---|---|
| `architecture/` | Current behavioral specifications |
| `deployment/` | Deployment procedure and checklist |
| `history/` | Point-in-time records — reviews, refactors, editorial and UX passes |

## architecture/

- **`ASK_GOLDEN_BEHAVIOR_SPEC_R9.md`** — the golden behavior contract for Ask.
  Current. Read this before changing Ask.

## deployment/

- **`DEPLOYMENT_CHECKLIST.md`** — deployment procedure and failure playbook.

## history/

These are dated snapshots of work already completed. They are kept for
provenance and are **not** a description of the current system — where they
disagree with the repository README, the README is correct.

- `DEEP_REVIEW_REPORT.md` — full repository QA pass (September 2, 2026)
- `REFACTORING_SUMMARY.md` — the SQLite/Postgres database abstraction refactor
- `BACKEND_REFACTORING_STATUS.md` — backend validation status at the time of that refactor
- `IMPLEMENTATION_SUMMARY.md` — implementation notes with line references that have since moved
- `CHANGES_APPLIED.md` — a change log from an earlier pass
- `MANAGER_READY_SUMMARY.md` — the review package prepared September 3, 2026
- `EDITORIAL_PASS_NOTES.md` — copy and editorial decisions
- `UX_INFORMATION_ARCHITECTURE_R5.md`, `UX_INFORMATION_ARCHITECTURE_R6.md` — successive IA revisions
- `STATE_DEFERRED_QA_NOTES_2026-09-03.md` — QA items deliberately deferred
