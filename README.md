# Practical AI Learning Portfolio

Static portfolio site documenting applied AI learning, judgment, evaluation, workflow design, and business-value reasoning.

## Current information architecture

- `index.html` — Home, Applied Work, Meridian overview, and Learning Guide SPA views
- `capabilities.html` — cross-case capabilities overview
- `case-readout.html` — Meridian executive entry point
- `tracker.html` — Meridian Discovery & Decisions reasoning record
- `measurement-plan.html` — Meridian Measurement Plan
- `system-flow.html` — Meridian System Flow and guardrails
- `eval-work.html` — Meridian evaluation design and status
- `meridian-lab/` — working learning environment: Support Tool, Eval Runner, Knowledge Base, Learning Log, and Learning Dashboard
- `eval-runner.html` — compatibility redirect into Meridian Lab
- `harborstone.html` — transfer case in invoice operations

Capability details:

- `discovery-workflow.html`
- `measurement-value.html`
- `systems-guardrails.html`
- `evals-quality.html`

Compatibility redirects only:

- `agent-flow.html`
- `configure.html`
- `deliverable.html`
- `discovery.html`
- `evals.html`
- `plan.html`
- `eval-runner.html`

These old routes are retained for inbound links. They are not current content sources.

## Shared system

- `site-shell.css` — global header, primary navigation, theme controls, and page gutters
- `site-components.css` — shared content frames, intros, cards, Meridian navigation, breadcrumbs, buttons, and artifact footer navigation
- `site-shell.js` — standalone-page theme and mobile navigation behavior
- `SITE_ARCHITECTURE.md` — ownership rules and layout invariants

Do not add page-local rules for the topbar, shared gutters, Meridian header, contextual navigation, breadcrumbs, shared buttons, or footer navigation.

## QA

Run before packaging:

```bash
python3 qa_regression.py
```

The automated check validates links, fragments, navigation labels, CSS structure, semantic landmarks, compatibility redirects, shared Meridian components, repeat-ticket behavior contracts, and the executable Meridian domain contract. Complete the manual desktop/mobile/light/dark checks in `RELEASE_CHECKLIST.md` when a browser preview is available.

Meridian Lab keeps its UI, domain logic, and data separate:

- `meridian-lab/lab.css` — Lab-only visual system built from the portfolio palette and spacing conventions
- `meridian-lab/meridian-core.js` — shared deterministic support/evaluation pipeline, cases, knowledge, and run schema
- `meridian-lab/lab.js` — view rendering and browser-local interactions

The Lab stores session objectives, saved practice cases, diagnoses, reflection notes, next questions, and linked reruns locally in the browser. Use its JSON export/import controls to preserve or move that learning workspace.

Do not copy classification, retrieval, guardrail, or draft logic into individual Lab views. Extend the shared core instead.

## Status and history

- `CURRENT_STATE.md` — current source and positioning
- `MERIDIAN_CONTEXT_SUMMARY.md` — durable Meridian-specific product and learning handoff
- `ROADMAP.md` — active, pinned, and deliberately parked future work
- `CHANGELOG.md` — historical release notes retained from the former long README
- `RELEASE_CHECKLIST.md` — packaging and verification process

Meridian includes simulated design work and a functional deterministic learning prototype. Local Lab runs are genuine prototype activity, but they are not real-world customer, operational, or business outcomes. Keep design, prototype evidence, and real-world outcomes clearly separated.
