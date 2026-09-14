# Documentation

Start with the [repository README](../README.md) — it covers the authority
model, architecture, running locally, tests and deployment.

| Directory | Contents |
|---|---|
| `product/` | PM-facing decisions, risks, metrics, and GitHub Project setup |
| `qa/` | Reusable QA instructions, manual trust pass, and report format |
| `evals/` | PM-facing eval registry and behavior dimensions |
| `incidents/` | Incident/postmortem process and template |
| `architecture/` | Current behavioral specifications |
| `deployment/` | Deployment procedure and checklist |
| `history/` | Point-in-time records — reviews, refactors, editorial and UX passes |

## product/

- **`README.md`** — product operating-system index.
- **`DECISIONS.md`** — settled product decisions and why they were made.
- **`RISKS.md`** — material AI/product risks and mitigations.
- **`METRICS.md`** — candidate product-health metrics for a future pilot.
- **`GITHUB_PROJECT_SETUP.md`** — one-time State GitHub Project configuration.

## qa/

See root **`QA.md`** first. The `qa/` folder contains the Cowork exploratory
instructions, Paige's short manual release trust pass, a report template, and a
quick command cheat sheet.

## evals/

- **`README.md`** — PM-facing eval registry. Executable eval code remains in
  `state-project-complete/eval/`.

## incidents/

- **`README.md`** — when and how to write an incident review.
- **`TEMPLATE.md`** — short postmortem template focused on impact, root cause,
  why QA missed it, and durable regression/eval protection.

## architecture/

- **`ASK_GOLDEN_BEHAVIOR_SPEC_R9.md`** — the golden behavior contract for Ask.
  Current. Read this before changing Ask.

## deployment/

- **`DEPLOYMENT_CHECKLIST.md`** — deployment procedure and failure playbook.
- Root **`RELEASE.md`** adds product/release-readiness gates around the technical
  deployment procedure.

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
