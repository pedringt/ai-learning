# State GitHub Project setup

GitHub is the project system of record for State. This is the one-time setup for the visual PM layer on top of Issues and PRs.

## Project

Create a GitHub Project named **State Product** and connect it to `pedringt/ai-learning`.

Issue #119 tracks this one-time setup.

## Fields

Keep the field set intentionally small.

### Status

- Backlog
- Ready
- In progress
- QA
- Staging
- Done

### Type

- Feature
- Bug
- AI behavior
- Tech debt
- Product question

### Priority

- P0 — integrity/data isolation/authority failure; stop release
- P1 — major wrong or misleading behavior; normally stop release
- P2 — meaningful bounded defect or important follow-up
- P3 — low-risk polish/clarity

### Product Area

- Evidence
- Reviews
- Questions
- Current State
- Ask
- Platform

### Release

Optional text/iteration field. Use only when a work item belongs to a named release or milestone.

## Views

### Current work

Board grouped by **Status**.

Filter out Done by default if the board becomes noisy.

Purpose: the everyday answer to “what is happening with State right now?”

### Product backlog

Table view showing:

- Title
- Status
- Type
- Priority
- Product Area
- Release

Sort highest priority first. Use this for triage and planning.

### Roadmap

Roadmap view containing only larger features/product bets with meaningful timing. Do not put every bug on the roadmap.

## Intake rules

- New actionable work should be an Issue, not a row of prose in a planning document.
- Use the repository Issue Forms so bugs, AI behavior failures, product questions, and feature requests arrive with useful context.
- PRs should link the Issue they implement when one exists.
- A Product ambiguity found during QA becomes a Product question Issue unless Paige resolves it immediately.
- Reproducible QA bugs should ultimately get regression protection when practical.

## Suggested automation after the Project exists

Use GitHub Project built-in workflows to:

1. Auto-add new Issues/PRs from `pedringt/ai-learning`.
2. Set newly added items to **Backlog** unless manually triaged otherwise.
3. Move closed Issues/merged PRs to **Done** where GitHub can do so reliably.

Avoid elaborate automation initially. The goal is less manual tracking, not a workflow-engine project.

## What does not belong in the Project

Keep durable product knowledge in the repo instead:

- decisions -> `DECISIONS.md`
- risks -> `RISKS.md`
- current implementation/release context -> `docs/PROJECT_STATUS.md`
- eval definitions/results -> `docs/evals/` and `state-project-complete/eval/`
- incidents -> `docs/incidents/`
- QA contract -> `QA.md`

The Project is the work view, not the knowledge base.
