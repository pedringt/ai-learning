# Practical AI Learning Portfolio — Roadmap

This roadmap contains active or deliberately parked work only. Completed release history belongs in `CHANGELOG.md`; current facts belong in `CURRENT_STATE.md`.

## NEXT: Run, diagnose, revise, rerun

**Goal:** Use Meridian Lab to create the first meaningful learning cycle rather than adding more interface or narrative pages.

**Status (Aug 25, 2026): first cycle complete.** The guardrail false-positive cycle (see eval-work.html) satisfies the definition of done below — objective, diagnosis, change, and before/after evidence are all documented. A second, smaller cycle (the "log in" classification fix) followed the same pattern. Items below reflect what's confirmed done versus still open; a few depend on Lab session data (local browser storage) not visible from these files.

- [x] Choose one narrow experiment objective.
- [x] Run a representative subset of the 13 fixed cases.
- [ ] Add a small number of purposeful exploratory cases, especially ambiguity, multi-issue routing, source conflict, and high-risk boundaries.
- [x] Score results and record a diagnosis before changing the system.
- [x] Separate taxonomy, retrieval, source-quality, guardrail, draft, confidence/routing, and test-case failures. *(Practiced across two fixes: guardrail-layer and classification/taxonomy-layer.)*
- [ ] For at least one case, document what the human reviewer should approve, correct, override, or escalate—and what evidence supports that handoff.
- [x] Make one justified change.
- [ ] Use linked reruns to compare before and after. *(Confirm: was this done via the Lab's linked-rerun feature specifically, or manual/external testing?)*
- [ ] Export the workspace backup and summarize what changed, what did not, and what question comes next.

**Definition of done:** at least one traceable objective → run → diagnosis → human-review decision → change → linked rerun sequence with Paige’s own reflection. **Met once, via the guardrail cycle.** Remaining unchecked items are either not yet done, or done in the Lab but unconfirmed here.

## RESOLVED: Eval harness correctness

Found via external feedback review (8/25/2026) and confirmed against the actual code before adding here. Both are gaps in what the harness verifies versus what it claims to verify, not new coverage. Both now have a deliberate decision recorded rather than sitting open.

- [x] C-08's automatic pass check compares only `category` and `confidence`; it never inspects `result.guardrail`. **Decision:** keep automatic pass as a coarse signal — category/confidence only — and rely on human review to catch the guardrail dimension, since this area is being paused rather than actively built out further right now. This is a known, chosen limitation, not an oversight: a broken guardrail on C-08 would still show "Matched" on the automatic check alone, and that's accepted as long as human review is the actual safety net for this case.
- [x] Human review is a single "Pass after review" / "Fail after review" per case, which hides which specific dimension failed when a case has more than one. **Decision:** keep the single overall verdict. A per-dimension rubric would be more informative but is more instrumentation than this stage of the work justifies — diagnosis notes already capture which layer failed when it matters.
- [x] C-07 ("There is some stuff that is not working.") was misclassifying at 78% confidence instead of safely abstaining. **Fixed** at the confidence-threshold layer: generic complaint language ("not working," "issue," "problem," "broken," "trouble") no longer counts as sufficient signal on its own — it must corroborate a more specific keyword. Verified against the full 13-case suite; nothing else regressed. This is a general fix, not a patch for this one phrasing.

## NEXT AFTER EVIDENCE: Complete eval coverage — paused

The eval harness's own known gaps are resolved (above). Net-new eval coverage is deliberately paused here, not abandoned. Deeper eval-program ownership may sit with Product, AI quality, Engineering, or technical-success specialists depending on the organization; it is not the next learning priority here. Resume if a role or real problem calls for it.

- [ ] Draft response quality: grounding, factual/policy accuracy, completeness, tone, and whether the actual question is answered.
- [ ] Appropriate escalation: financial actions, security, protected account changes, explicit requests for a human, repeated exchanges, and rising customer frustration.
- [ ] Confidence and review routing: ambiguity, missing information, weak/no source, conflicting sources, and safe fallback.
- [ ] Decide whether graders should remain human/rules-based or whether a model-based grader would answer a specific new learning question.
- [ ] Add failure cases discovered during real Lab use to the regression suite.
- [ ] Full eval suite rerun on the guardrail regex fix — only reverified against the 4 motivating cases so far. Also deprioritized for the same reason as the rest of this section.

## PINNED: Evidence-driven Meridian presentation

When genuine run and rerun evidence exists, decide whether the public Meridian case needs distinct **Eval Design**, **MVP & Runs**, and **Results & Changes** sections or pages.

Do not restructure prematurely. Preserve a clear progression from discovery and design through implementation, diagnosis, revision, and measurement. Prototype output must remain distinct from customer, operational, or business outcomes.

## PINNED: No vocabulary drift into public copy

External review (8/26/2026, refined 8/26/2026) landed on a sharper distinction than "avoid certain words." **The vocabulary itself isn't the problem — most of it (evaluation governance, regression gates, decision rights, adoption telemetry, inference economics, value realization, source governance, etc.) is exactly the language worth learning.** The risk is claiming the *authority* those terms can imply before the operational experience backs it up. Checked the live site against this on 8/26/2026: clean. The one close match ("Optimize for business value and employee capacity—not maximum automation," Harborstone) is an earned reflective takeaway, not an authority claim.

**The actual rule has two parts:**

1. **Sequence: reasoning before vocabulary, never vocabulary instead of reasoning.** Pattern to follow: *problem → your reasoning → evidence → what changed → then the professional term as a label.* Not: *professional term → professional term → professional term → polished framework.* Example of the right order (already how Meridian and Harborstone read): "I originally thought daily use was a good adoption target, but not every ticket is eligible and appropriate non-use can be desirable — so I changed the measurement approach. This is what adoption telemetry actually needs to account for." The term arrives *after* the reasoning has already earned it.

2. **Watch the verb, not just the noun.** Nouns like "risk acceptance," "regression gates," "inference economics" are fine — everyone should understand them. The verb attached is what implies (or doesn't) organizational authority:
   - **Authority-implying, avoid without real ownership:** own, establish, govern, lead, operationalize, enforce, optimize (as a claim about production systems), implement (at production scale), drive
   - **Accurate for current stage, use freely:** analyze, design, model, test, evaluate, investigate, practice, compare, diagnose, recommend
   - **When something was actually done, say so plainly — don't undersell real work:** built, changed, ran, fixed, found.

Before promoting any ROADMAP.md item into public copy, or writing new copy generally: check it against both parts. If a passage can't survive the rewrite without still sounding like a framework pitch, that's a signal the underlying work isn't done yet — go do the thing, then write about it.

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
- [ ] Build an **Adoption Telemetry Spec** at the ENABLE → OPERATE transition. Define events for eligible workflow identified, draft generated/opened, accepted unedited, edited lightly/substantively, rejected, escalated, human-only path chosen, customer reply/reopen, source retrieval or unavailability, latency/error, and fallback.
- [ ] Map each telemetry signal to multiple plausible explanations and the evidence needed to distinguish them. Do not treat accepted-unchanged as an unconditional success metric; a very high rate may also indicate rubber-stamping.
- [ ] Define a practical Day 30 / 60 / 90 review cadence using adoption, quality, intervention, customer outcome, reliability, and cost signals—plus explicit continue, investigate, narrow, pause, or stop thresholds where defensible.
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
- Consider a "run all fixed cases at once" workflow with a before/after comparison view, suggested by external feedback (8/25/2026), only if repeated manual one-at-a-time comparison becomes a real friction point during actual Lab use. Not evidence-justified yet against the Lab complexity boundary above — the current one-case-at-a-time flow already demonstrates the diagnostic reasoning; this would mainly add scale, not a new question answered.

## Governing principle

**Use the simplest reliable system.** AI is one option, not the default. Compare AI with deterministic software, workflow/process changes, source/data repair, and no-build using accuracy, risk, cost, latency, maintenance, and operational burden.
## PINNED: Cross-company AI operating practices

Keep the public Learning Guide concise; use this section to track hands-on work that could turn operating principles into demonstrated evidence.

### Release and reliability

- [ ] Create a compact release-readiness checklist covering component versions, staging evidence, eval gates, gradual rollout, monitoring, fallback, and rollback.
- [ ] Work a failure involving timeout, rate limit, unavailable retrieval/tooling, or stale data and document the user-visible fallback.
- [ ] Preserve enough prompt/model/retrieval/tool/rule version information to reproduce one before-and-after result.

### Context and instruction design

- [ ] Practice instruction hierarchy, clear task boundaries, few-shot examples, ambiguity handling, structured outputs, and safe handling of retrieved/tool context.
- [ ] Compare at least two instruction/context designs against the same representative cases; diagnose whether differences come from context, retrieval, model behavior, or downstream business logic.
- [ ] Document when prompt iteration is the wrong fix because the source data, permissions, workflow, or deterministic rules need correction instead.

### Evaluation governance

- [ ] Write reviewer instructions and calibration examples for one subjective criterion.
- [ ] Compare two human reviews, resolve a disagreement, and document the final rule.
- [ ] Test whether a rules-based or model-based grader agrees with human judgment before trusting it as an automated proxy.
- [ ] Add a meaningful production-style failure to a regression set without overfitting the suite to one phrasing.
- [ ] Run a bounded adversarial exercise covering prompt injection, poisoned or conflicting retrieval content, sensitive-data disclosure, unsafe output handling, excessive agency/permissions, and resource abuse. Prioritize cases by likely consequence rather than trying to enumerate every attack.

### Security, privacy, and governance

- [ ] Create a lightweight threat model for one workflow: assets, actors, attack paths, likely consequences, and layered mitigations.
- [ ] Complete a data-lifecycle review covering classification, minimization, retention/deletion, residency/tenancy, vendor training use, access, and auditability.
- [ ] Assign explicit decision owners for data, source knowledge, eval criteria, risk acceptance, launch, exceptions, incidents, and retirement.

### Vendor and lifecycle judgment

- [ ] Compare two fictional vendors across task fit, evaluation evidence, data terms, security, model-change practice, SLAs, support, capacity, cost predictability, portability, and exit.
- [ ] Write a recommendation that includes conditions to continue, renegotiate, replace, or retire the vendor/workflow.

### Inference and operating economics

- [ ] Extend value analysis beyond token price: cost per successful outcome, latency budget, retries, caching, fallback and escalation costs, review/rework time, and maintenance burden.
- [ ] Compare model-tiering or routing options for cheap/routine versus difficult/high-risk work, including quality and reliability tradeoffs.
- [ ] Keep all simulated cost assumptions explicit and separate prototype economics from measured customer or production outcomes.

### What changes at enterprise scale

- [ ] Add only a compact future note or exercise—not a fictional multinational transformation case—covering tenant isolation, RBAC/least privilege, residency, regional requirements, centralized guardrails versus departmental configuration, exception approval, auditability, and phased rollout governance.
- [ ] Work one governance tension: a department requests custom instructions or model behavior while Security/IT or a central AI group requires shared controls. Identify decision rights, allowable configuration boundaries, evidence required for an exception, and the escalation path.
- [ ] Preserve Meridian's small-company scope and label enterprise-scale reasoning as transfer practice rather than firsthand enterprise deployment evidence.

### Meridian INCIDENT exercise

- [ ] Use a concrete recovery scenario: adoption drops materially after drafts repeatedly miss a local policy nuance, increasing rep corrections and bypass behavior. Treat non-use as a signal to investigate—not sabotage or irrational resistance.
- [ ] Detect the decline and segment it by team, workflow, category, time, and relevant system/version changes; classify severity.
- [ ] Interview affected users and review edits, rejections, retrieval traces, source freshness, and workflow burden before choosing a fix.
- [ ] Contain through restriction, disablement, fallback, or rollback.
- [ ] Preserve prompts, outputs, retrieval evidence, tool calls, and component versions.
- [ ] Identify affected users/data and the notification owners.
- [ ] Diagnose the failed layer, correct the source/workflow/system, run targeted and regression cases, communicate what changed, relaunch gradually, and monitor whether quality and trust recover.
