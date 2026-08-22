# Practical AI Learning Portfolio — Roadmap

This roadmap contains active or deliberately parked work only. Completed release history belongs in `CHANGELOG.md`; current facts belong in `CURRENT_STATE.md`.

## NEXT: Run, diagnose, revise, rerun

**Goal:** Use Meridian Lab to create the first meaningful learning cycle rather than adding more interface or narrative pages.

- [ ] Choose one narrow experiment objective.
- [ ] Run a representative subset of the 12 fixed cases.
- [ ] Add a small number of purposeful exploratory cases, especially ambiguity, multi-issue routing, source conflict, and high-risk boundaries.
- [ ] Score results and record a diagnosis before changing the system.
- [ ] Separate taxonomy, retrieval, source-quality, guardrail, draft, confidence/routing, and test-case failures.
- [ ] Make one justified change.
- [ ] Use linked reruns to compare before and after.
- [ ] Export the workspace backup and summarize what changed, what did not, and what question comes next.

**Definition of done:** at least one traceable objective → run → diagnosis → change → linked rerun sequence with Paige’s own reflection.

## NEXT AFTER EVIDENCE: Complete eval coverage

Expand only after the first cycle shows what the current suite cannot answer.

- [ ] Draft response quality: grounding, factual/policy accuracy, completeness, tone, and whether the actual question is answered.
- [ ] Appropriate escalation: financial actions, security, protected account changes, explicit requests for a human, repeated exchanges, and rising customer frustration.
- [ ] Confidence and review routing: ambiguity, missing information, weak/no source, conflicting sources, and safe fallback.
- [ ] Decide whether graders should remain human/rules-based or whether a model-based grader would answer a specific new learning question.
- [ ] Add failure cases discovered during real Lab use to the regression suite.

## PINNED: Evidence-driven Meridian presentation

When genuine run and rerun evidence exists, decide whether the public Meridian case needs distinct **Eval Design**, **MVP & Runs**, and **Results & Changes** sections or pages.

Do not restructure prematurely. Preserve a clear progression from discovery and design through implementation, diagnosis, revision, and measurement. Prototype output must remain distinct from customer, operational, or business outcomes.

## PINNED: Lab complexity boundary

The current static, browser-local Lab is sufficient for the present learning objective. Before adding a model API, database, authentication, shared accounts, or production-style telemetry, state:

1. What new question the capability will answer.
2. Why the current deterministic/local design cannot answer it.
3. What evidence will justify the added cost and maintenance burden.

Possible future triggers:

- Model API: needed to study nondeterminism, prompt/model comparison, grounding behavior, or model-based grading.
- Editable/custom knowledge sources: needed for source-governance and retrieval experiments beyond the bundled sample KB.
- Durable backend: needed for cross-device continuity, multiple users, or realistic shared-run analysis.
- Authentication: needed only if real user-specific or sensitive data is introduced.
- Operational dashboard: needed only when a realistic instrumented pilot or synthetic event dataset exists.

## Supporting practice

### Difficult customer and stakeholder communication

- [ ] Frustrated customer response or escalation note.
- [ ] Skeptical support-rep one-pager.
- [ ] Executive update when the pilot is underperforming.
- [ ] Recommendation to narrow, pause, replace, or stop when value is weak.

### Adoption and enablement

- [ ] Draft an onboarding/enablement plan after evaluated behavior is stable enough to teach honestly.
- [ ] Define how to capture appropriate non-use, friction, overrides, and trust concerns.
- [ ] Avoid building a fake onboarding product solely to make the portfolio look complete.

### Value realization

- [ ] Create a later readout using actual Lab evidence, clearly labeled as prototype learning.
- [ ] Practice a scale / revise / narrow / replace with conventional software / stop recommendation.
- [ ] Add operational or business metrics only when a defensible data source exists.

### Transfer beyond support

- [ ] Add a future Workbench exercise where process repair or conventional software is deliberately preferred over AI.
- [ ] Continue Modern Software & SaaS refreshers: APIs, rules engines, database logic, workflow automation, QA/test strategy, product operations, analytics, and AI-assisted delivery.

## Parked maintenance

- Consolidate historical inline CSS only with screenshot-capable visual QA.
- Revisit the large index SPA shell only for a genuine regression or an intentional, tested migration.
- Consider editable Lab knowledge and case definitions when a concrete experiment requires them; do not add generic configuration screens preemptively.
- Consider an outside-click fix for legacy overflow menus only if it remains reproducible in the current build.

## Governing principle

**Use the simplest reliable system.** AI is one option, not the default. Compare AI with deterministic software, workflow/process changes, source/data repair, and no-build using accuracy, risk, cost, latency, maintenance, and operational burden.
