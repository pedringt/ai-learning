# Documentation

Start with the [repository README](../README.md) and [PROJECT_STATUS.md](PROJECT_STATUS.md).

Current operating docs:

| Path | Purpose |
|---|---|
| `product/` | Product brief, decisions, risks, metrics, privacy assumptions, and GitHub Project conventions |
| `qa/` | Reusable QA instructions, manual trust pass, and report templates |
| `evals/` | PM-facing eval registry and behavior dimensions |
| `incidents/` | Incident/postmortem process and template |
| `architecture/` | Current behavioral specifications |
| `history/` | Point-in-time and superseded implementation records |

## Product

- `product/PRODUCT_BRIEF.md`: canonical product definition and portfolio-vs-real-product boundary
- `product/DECISIONS.md`: settled product decisions
- `product/RISKS.md`: maintained risk register
- `product/METRICS.md`: quality, latency, cost, and review-burden measurement design
- `product/DATA_PRIVACY.md`: current demo-data assumptions and hypothetical real-company requirements
- `product/GITHUB_PROJECT_SETUP.md`: State Product board conventions

## QA

Read root `QA.md` first. The `qa/` folder contains Cowork exploratory instructions, the manual release trust pass, a report template, and a quick-command cheat sheet.

## Evals

`evals/README.md` is the PM-facing registry. Executable eval code remains in `state-project-complete/eval/`.

## Incidents

- `incidents/README.md`: when and how to write an incident review
- `incidents/TEMPLATE.md`: short template focused on impact, root cause, why QA missed it, fix, and durable protection

## Architecture

- `architecture/ASK_GOLDEN_BEHAVIOR_SPEC_R9.md`: current Ask behavior contract
- `architecture/REVIEW_SUGGESTED_QUESTIONS.md`: Review-to-Question behavior and rollout notes
- `architecture/SLACK_INTEGRATION_PLAN.md`: Slack integration design/history

## Release and deployment

Use root `RELEASE.md` for the current release, verification, and rollback process.

The old v7 Postgres migration deployment checklist was moved to `history/DEPLOYMENT_CHECKLIST_V7_POSTGRES.md`. It is preserved for provenance only and is not current operational guidance.

## History

Files under `history/` are point-in-time records. Keep them when they explain how the product evolved, but do not treat them as current operating instructions when they disagree with the repository README, `PROJECT_STATUS.md`, `QA.md`, or `RELEASE.md`.
