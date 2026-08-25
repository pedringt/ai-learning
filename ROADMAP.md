# Practical AI Learning Portfolio — Roadmap

This roadmap contains active or deliberately parked work only. Completed release history belongs in `CHANGELOG.md`; current facts belong in `CURRENT_STATE.md`.

## NEXT: Run, diagnose, revise, rerun

**Goal:** Use Meridian Lab to create the first meaningful learning cycle rather than adding more interface or narrative pages.

- [ ] Choose one narrow experiment objective.
- [ ] Run a representative subset of the 13 fixed cases.
- [ ] Add a small number of purposeful exploratory cases, especially ambiguity, multi-issue routing, source conflict, and high-risk boundaries.
- [ ] Score results and record a diagnosis before changing the system.
- [ ] Separate taxonomy, retrieval, source-quality, guardrail, draft, confidence/routing, and test-case failures.
- [ ] For at least one case, document what the human reviewer should approve, correct, override, or escalate—and what evidence supports that handoff.
- [ ] Make one justified change.
- [ ] Use linked reruns to compare before and after.
- [ ] Export the workspace backup and summarize what changed, what did not, and what question comes next.

**Definition of done:** at least one traceable objective → run → diagnosis → human-review decision → change → linked rerun sequence with Paige’s own reflection.

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

## NEXT MAINTENANCE: Mobile interaction and responsive QA

Run this as one bounded QA/fix pass across the current site, with Meridian Lab first. Do not use it as a reason for another visual-system redesign.

### Meridian Lab priority

- [ ] Test at 320, 375/390, and 430 px widths in both portrait and landscape.
- [x] Replace the horizontally scrolling Lab section navigation with a contained two-by-two mobile navigator.
- [x] Remove the sidebar min-content width that could force the Lab wider than the phone viewport.
- [x] Make the sticky mobile header opaque so passing content does not appear sliced through it.
- [x] Increase undersized touch targets to approximately 44 px where practical, especially Lab navigation, compact buttons, and saved-case chips.
- [x] Compact the three-step learning-loop orientation on phones so it does not dominate the first several screens.
- [ ] Check the complete freeform flow on mobile: enter a ticket, run it, inspect the result, complete the Learning Review fields, save the note, and return to another Lab section.
- [x] Add explicit wrapping/stacking safeguards for result-route rows, badges, source information, drafts, long ticket text, and Learning Review controls.
- [x] Add mobile stacking safeguards for fixed-case scoring, history actions, import/export controls, Knowledge Base headings, and dashboard cards.
- [ ] Confirm mobile browser behavior for textarea resizing, select styling, on-screen keyboard focus, scroll position after route changes, and browser-local save feedback.

### Whole-site sweep

- [ ] Check Home, Meridian overview, Case Readout, Discovery, Measurement Plan, System Flow, Eval Work, Capabilities, Harborstone, and Learning Guide at the same phone widths.
- [ ] Look specifically for horizontal overflow, clipped tables/code/diagrams, inconsistent header height, navigation jumps, awkward stacked cards, overly long line lengths, and controls below comfortable touch size.
- [ ] Verify keyboard focus, visible focus states, reduced-motion behavior, disclosure controls, and internal anchor destinations.
- [ ] Re-run regression tests after fixes and perform a final device-width screenshot comparison before release.

**Definition of done:** the full Meridian Lab learning cycle is comfortably usable at 320 px without page-level horizontal scrolling, and every primary public route passes the same responsive smoke test.

## Supporting practice

### Difficult customer and stakeholder communication

- [ ] Frustrated customer response or escalation note.
- [ ] Skeptical support-rep one-pager.
- [ ] Write a concise practice executive update for an underperforming pilot: state the unfavorable signal plainly, separate what is known from what still needs diagnosis, avoid spinning low adoption, and give a time-bound investigate / continue / narrow / pause decision plan.
- [ ] Recommendation to narrow, pause, replace, or stop when value is weak.

### Adoption and enablement

- [ ] Draft an onboarding/enablement plan after evaluated behavior is stable enough to teach honestly.
- [ ] Define how to capture appropriate non-use, friction, overrides, and trust concerns.
- [ ] After real Lab evidence exists, translate observed signals into both product/backlog actions and CS/enablement actions; distinguish system defects from training, trust, workflow, and source-governance problems.
- [ ] Avoid building a fake onboarding product solely to make the portfolio look complete.

### Value realization

- [ ] Create a later readout using actual Lab evidence, clearly labeled as prototype learning.
- [ ] Build an assumption-transparent commercial model only after the needed inputs are defined: eligible ticket volume, actual adoption, minutes saved after review/rework, labor-cost assumptions, operating/inference cost, and implementation/maintenance burden.
- [ ] Use low/base/high scenarios and show the calculation logic. Describe recovered time as **capacity returned** unless there is separate evidence that it avoids hiring or reduces headcount; do not invent an FTE-savings claim.
- [ ] Preserve honest unknowns such as Finance-owned inputs rather than replacing them with simulated precision. A hypothetical break-even exercise must label every assumption and remain distinct from Meridian evidence.
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
