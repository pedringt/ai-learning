# Practical AI Learning Portfolio — Current State

**Current source of truth:** v95.72 merged Lab hardening and repeat-ticket repair.

## Purpose and positioning

- Foundations-first, role-agnostic Practical AI Learning Portfolio.
- Meridian is the primary deep case: simulated B2B SaaS support design and experimentation.
- Harborstone is the transfer case: simulated invoice-operations workflow decomposition and value judgment.
- AI Customer Success is an important application context, not the portfolio’s sole identity.
- Evidence should show Paige’s reasoning, experiments, diagnosis, revisions, and changes of mind. Never present simulated work, prototype activity, or invented metrics as client or production outcomes.

## Current information architecture

Global navigation:

1. Home
2. Capabilities
3. Applied Work
4. Learning Guide

Meridian reading path:

1. Overview (`index.html#meridian`)
2. Case Readout (`case-readout.html`)
3. Discovery & Decisions (`tracker.html`)
4. Measurement Plan (`measurement-plan.html`)
5. System Flow (`system-flow.html`)
6. Eval Work (`eval-work.html`)

Meridian Lab working path:

1. Support Tool
2. Eval Runner
3. Knowledge Base
4. Learning Log
5. Learning Dashboard

The Lab is linked from the Meridian Overview, Case Readout, and Eval Work. It is intentionally not part of global navigation and has no separate reviewer mode.

## Meridian Lab today

- One shared deterministic rules pipeline powers the Support Tool and Eval Runner.
- The fixed suite contains eight classification and four retrieval cases.
- The Lab supports exploratory cases, human scoring, experiment objectives, diagnoses, reflection notes, next questions, saved practice cases, and linked reruns.
- Runs and workspace settings are stored locally in the browser; JSON export/import provides backup and continuity.
- The Support Tool supports repeated analysis, an explicit start-another-ticket reset, and Command/Control + Enter submission. Hidden empty/error states are enforced by the Lab CSS contract.
- The Lab validates imported workspace/run shapes before writing browser storage, and generated reflection fields retain explicit accessible labels.
- The topbar provides direct exits to Home, Meridian Overview, Applied Work, and Learning Guide on desktop and mobile.
- The Learning Dashboard summarizes practice activity only. Operational, adoption, customer, and business metrics require a future realistic pilot data source.
- `eval-runner.html` remains a compatibility redirect into the Lab.

## Current evidence status

- Discovery, measurement design, system flow/guardrails, executive readout, and initial classification/retrieval eval design are documented.
- The Lab is functional and can produce genuine local prototype runs.
- A meaningful execute → diagnose → revise → rerun learning cycle has not yet been completed and should not be implied.
- Draft quality, escalation behavior, and confidence/review-routing eval coverage remain incomplete.
- Later ENABLE, OPERATE, INCIDENT, and PROVE/EXPAND lifecycle work remains intentionally unfinished.

## Immediate learning priority

Use Meridian Lab to complete a small, purposeful evaluation cycle:

1. Set one experiment objective.
2. Run a bounded subset of fixed and exploratory cases.
3. Score and diagnose failures.
4. Make one justified system, source, taxonomy, or test change.
5. Run linked reruns.
6. Record what changed, what improved, and what new question emerged.

After that evidence exists, decide whether the portfolio needs separate **Eval Design**, **MVP & Runs**, and **Results & Changes** presentation. Do not restructure before the evidence demands it.

## Durable decisions

- Use the simplest reliable system. AI, deterministic software, workflow/process repair, and no-build are all valid outcomes.
- Human review remains mandatory for the simulated pilot.
- Financial actions, security concerns, and protected account changes route to a human without a draft.
- Adoption means relevant eligible-workflow use, repeat use, appropriate non-use, and reasons for non-use—not blanket daily activity.
- Retrieval design is an eval-driven choice; the proposed production design is not locked to semantic search. The current Lab uses transparent deterministic matching for learning.
- Confidence should be tied to observable evidence, missing information, source quality/conflict, and guardrail state—not unsupported model self-assurance.
- One authentic Lab experience serves both Paige and outside readers. Orientation and plain labels replace a separate reviewer mode.

## Engineering and maintenance contract

- `site-shell.css` owns the global shell; `site-components.css` owns shared portfolio/Meridian components.
- `meridian-lab/meridian-core.js` is the only owner of Lab domain behavior and run/workspace schemas.
- `meridian-lab/lab.js` owns rendering and local interactions; `lab.css` owns Lab presentation.
- Extend shared components and the shared core instead of copying rules into individual pages.
- Keep compatibility redirects small and explicit.
- Historical embedded CSS remains technical debt. Consolidate it only with screenshot-capable visual regression testing.
- Gate releases with `qa_regression.py`, executable Meridian domain tests, `RELEASE_CHECKLIST.md`, JavaScript syntax checks, ZIP integrity, and manual visual checks when a browser preview is available.
- Preserve one authoritative Library-backed source ZIP and replace that same file identity after verification.

## Voice

- Authored judgments, reflections, and recommendations should sound like Paige: clear, precise, natural, and professionally candid.
- Reference and Learning Guide material should use neutral editorial language unless first person adds real learning evidence.
- Avoid consultant-like abstraction, artificial certainty, and AI-generated filler.

Historical release detail belongs in `CHANGELOG.md`. Future work belongs in `ROADMAP.md`.
