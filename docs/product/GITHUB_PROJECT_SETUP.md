# State GitHub Project

GitHub is the project system of record for State. The **State Product** Project is the visual PM layer on top of Issues and PRs.

## Project

Use the existing GitHub Project named **State Product** connected to `pedringt/ai-learning`.

Issue #119 tracked the one-time setup and was completed on 2026-09-14. Do not create a second State Project unless Paige explicitly asks for one.

## Fields

Keep the field set intentionally small.

### Status

- Backlog
- Ready
- In progress
- QA
- Staging
- Done

### Work Type

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
- Work Type
- Priority
- Product Area
- Release

Sort highest priority first. Use this for triage and planning.

### Roadmap

Roadmap view containing only larger features/product bets with meaningful timing. Do not put every bug on the roadmap.

## How Claude should use the Project

- Read the relevant Issue before starting tracked work. Use the Issue for scope and the Project for current work state.
- When live GitHub Project access is available, treat the Project's Status and custom fields as current. If Project access is unavailable, do not guess a board state from old conversation context.
- Use the statuses consistently:
  - **Backlog**: worth tracking, not ready to start.
  - **Ready**: defined enough for a person or agent to start.
  - **In progress**: actively being worked.
  - **QA**: implementation is complete and is being tested/reviewed.
  - **Staging**: QA passed and the change is actually on staging awaiting final approval.
  - **Done**: work is complete and, where relevant, released/promoted.
- When creating or triaging an item, set **Work Type**, **Priority**, and **Product Area** when the right value is clear. Set **Release** only when it is useful.
- Do not move an item to **QA** just because code exists, or to **Staging** just because tests pass. The status must match reality.
- Passing tests never grants deployment permission. Follow `CLAUDE.md` and `RELEASE.md` for staging/main authorization gates.
- If implementation or QA reveals a separate reproducible bug, AI behavior failure, or unresolved product question, create or recommend a separate Issue rather than hiding it in chat or unrelated scope.
- Keep the Project current when Project access is available, but do not use it as the durable knowledge base for product decisions or risks.

## Intake rules

- New actionable work should be an Issue, not a row of prose in a planning document.
- Use the repository Issue Forms so bugs, AI behavior failures, product questions, and feature requests arrive with useful context.
- PRs should link the Issue they implement when one exists.
- A Product ambiguity found during QA becomes a Product question Issue unless Paige resolves it immediately.
- Reproducible QA bugs should ultimately get regression protection when practical.

## Project automation

Keep automation deliberately simple. The current board uses these built-in workflow rules:

1. When an item is added to the Project, set **Status = Backlog**.
2. When an Issue is closed, set **Status = Done**.
3. When a pull request is merged, set **Status = Done**.

Keep **Ready**, **In progress**, **QA**, and **Staging** as judgment-based states rather than trying to infer them automatically.

If auto-add is enabled later, scope it to new Issues/PRs from `pedringt/ai-learning` rather than broad account activity.

Avoid elaborate automation. The goal is less manual tracking, not a workflow-engine project.

## What does not belong in the Project

Keep durable product knowledge in the repo instead:

- decisions -> `DECISIONS.md`
- risks -> `RISKS.md`
- current implementation/release context -> `docs/PROJECT_STATUS.md`
- eval definitions/results -> `docs/evals/` and `state-project-complete/eval/`
- incidents -> `docs/incidents/`
- QA contract -> `QA.md`

The Project is the work view, not the knowledge base.
