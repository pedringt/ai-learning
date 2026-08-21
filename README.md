# Practical AI Learning Portfolio

v90 is the final content + polish pass built from the v89.5 release candidate.

## v90 final changes
- Kept left-aligned editorial typography, but tightened page-intro widths and alignment for a more intentional content grid.
- Strengthened the Home “short on time” path with direct links to Meridian, Discovery & Decisions, and Agent Flow & Guardrails.
- Added status context to Meridian’s existing 5-second read rather than adding a duplicate orientation component.
- Added light “Concepts applied” connections between Meridian / Portfolio and the Learning Library.
- Added explicit planned-learning framing for unfinished Meridian lifecycle stages.
- Added a transparent customer-facing Meridian exercise focused on explaining the pilot, setting expectations, avoiding overclaims, and defining evidence for expansion.
- Preserved the AI-output proof exercise, four flagship Meridian artifacts, visible Portfolio evidence, styled Go deeper footer, dedicated router, theme persistence, and More-menu outside-click dismissal.
- No architecture/framework redesign.

## v89.5 scope
- Restored the v88.2 Home, Portfolio, lower-page, and shared “Go deeper” visual structure instead of patching the broken v89.2 DOM.
- Preserved the four-item primary navigation: Home / Meridian / Portfolio / Learning Library.
- Preserved the Meridian 5-second summary and four flagship applied-work artifacts.
- Added the transparent Meridian AI-output proof exercise.
- Preserved Learning Library collapsible grouping without hiding Portfolio content.
- Added a dedicated router rather than relying on mixed content-injection scripts.
- Added click-outside and Escape dismissal for the upper-right More menu.
- Kept the shared “Go deeper” section inside the scoped site wrapper so it inherits theme/layout styles.
- No framework/SSR/SSG migration.

## v88 focus
Information architecture and progressive disclosure. Substantive v87 work is preserved; content is regrouped so the applied Meridian case is easiest to scan, the Learning Library holds deeper reference material, and Portfolio contains evidence plus Workbench breadth practice.

- `index.html` — main portfolio
- `agent-flow.html` — Meridian flowchart
- `tracker.html` — canonical 17-question working tracker
- `plan.html` — Success Measurement Plan
- `evals.html` — current Eval Suite
- `deliverable.html` — concise Meridian readout
- `configure.html` — legacy compatibility path
- `vercel.json` — Vercel settings

## v88 IA note
Primary navigation is ordered **Home → Meridian → Portfolio → Learning Library**. The Learning Library is intentionally the deeper working-reference layer; applied work and evidence come first.

## v88.1
Emphasis/status polish only: Meridian primary artifacts are visually prioritized; Working Tracker and one-page summary remain supporting evidence; Portfolio features Meridian without duplicating the full case. No substantive content was removed.

## v88.2
Navigation polish only. The desktop header now keeps the four primary destinations in the main nav and uses a small **More** menu for secondary/direct evidence links. The mobile selector is no longer shown on desktop, is reduced to the same four primary destinations, and has additional right-side padding so the native dropdown arrow has room to breathe. No substantive portfolio content or site architecture was changed.


## v89.5 live-render regression fix
- Removed the surviving v88 Portfolio runtime wrapper that was collapsing the entire Portfolio page after load.
- Portfolio supporting evidence is visible on the page again; it is no longer hidden behind “More portfolio notes…”.
- Restored Go deeper as an explicitly styled shared footer inside the site wrapper.
- Added a regression check that fails if legacy scripts dynamically create/wrap Home, Meridian, or Portfolio structure.


## v89.5 deep-QA fixes
- Restored a dedicated, persistent dark/light theme handler on the main portfolio; the toggle had become visually present but inert after legacy-script cleanup.
- Restored Meridian's supporting case notes as static progressive disclosure beneath the primary four artifacts and AI-output exercise.
- Updated Home copy so Portfolio—not Workbench—is the supporting evidence branch, and changed “measurable outcomes” to “measurable success criteria” for the fictional case.
- Tightened the AI-output exercise disclosure so collaboratively AI-assisted draft/critique/revision text is not presented as solely human-authored work.
- Updated standalone artifact fallback navigation to Home / Meridian / Portfolio / Learning Library so no-JS fetchers see the current site hierarchy.
- Removed a dead study-tools observer whose target controls are no longer present.


## v90.1 final small polish
- Added breathing room below the Portfolio Learning Library concepts note.
- Added a lightweight Home capstone progress line.
- Kept the planned-learning framing prominent in Meridian and added it to the standalone one-page deliverable for direct-entry visitors.


## v90.2 maintenance
- Reframed Meridian adoption measurement away from an 8-of-8 daily-use target toward eligible-workflow penetration, repeat use, appropriate non-use, and qualitative friction.
- Added the adoption revision as an explicit “Changed my mind” entry in the Working Tracker.
- Updated the Success Measurement Plan for consistency.
- Combined the loose Home practice-environment and capstone-progress lines into a subtle context/status strip.
- Added a small, explicitly labeled placeholder for later Meridian operating practice (Operate / Incident / Improve / Prove / Expand), without presenting future work as completed evidence.


## v90.3 visual polish
- Aligned the Home Practice environment / Capstone progress strip to the same full content width as the primary Home card below it.
- Added deliberate bottom breathing room after the shared Go deeper footer.
- No content, navigation, hierarchy, or behavior changes.

## v90.4 adoption-note cleanup
- Removed stale Success Measurement Plan working-note language that still implied blanket daily use was required.
- Working notes now explain why eligible-workflow penetration, repeat use, appropriate non-use, and qualitative friction are more diagnostic.
- Below-target adoption now triggers investigation of eligibility, workflow fit, review burden, trust, training, reinforcement, and product friction before assuming the answer is more training.
- No layout, navigation, hierarchy, or other content changes.

## v90.5 final maintenance
- Cleaned up the Tracker adoption section so Target and Reasoning serve distinct purposes.
- Reasoning now explains why blanket daily-use targets are misleading when ticket eligibility and appropriate non-use vary.
- Below-target response now matches the Success Measurement Plan: diagnose eligibility, workflow fit, review burden, trust, training gaps, reinforcement, and product friction before prescribing training.
- No broader content, layout, navigation, hierarchy, or curriculum changes.
- Maintenance stopping point: future portfolio updates should primarily come from completed learning/operating exercises or concrete bugs.


## v91.0 — VALIDATE checkpoint
- Integrated the first substantive VALIDATE expansion without turning the site into a test-case repository.
- Eval Suite now presents the five-area v1 architecture; Ticket Classification and Knowledge Retrieval are designed, with representative reasoning-heavy cases only.
- Working Tracker preserves the changed assumptions and diagnostic reasoning behind classification and retrieval design.
- Added a compact visible roadmap for ENABLE, OPERATE, INCIDENT, and PROVE/EXPAND, including future commercial-judgment work; these remain explicitly planned, not completed.
- Replaced content accordions in the Success Measurement Plan and Learning Library with visible content; removed the large collapsed Meridian case-notes block in favor of the artifact/Tracker hierarchy. Navigation menus remain menus, not content accordions.
- Improved mobile page-selector arrow contrast in light and dark themes.
- Preserved AI Customer Success as the primary positioning; technical depth remains supporting fluency.


## v91.1 preview fix
- Rebuilt `evals.html` so the VALIDATE checkpoint replaces the stale prior suite instead of appearing above it.
- Softened dark-mode purple accents and purple-tinted surfaces for lower visual strain.
- No new Meridian content beyond the v91.0 checkpoint; this is a preview correction pass.

## v91.2 preview cohesion pass
- Restyled the middle Meridian sections to match the visual hierarchy of the rest of the portfolio without adding content.
- Added the same `More` navigation dropdown to standalone Meridian artifact pages.
- Replaced confusing Previous/Next chapter navigation with a persistent Meridian evidence bar.
- Retains v91.1 dark-mode palette and VALIDATE content.

## v91.3 manager-entry polish
- Made the existing “Short on time?” route visually unmistakable as a 3-minute path.
- No new curriculum, Meridian evidence, ROI claims, or homepage section was added.
- Retains the v91.2 cohesion/navigation pass and v91.1 VALIDATE/dark-mode fixes.

## v91.4 manager-ready
- Final scenario-integrity polish before manager review.
- Clarified the Case Readout’s Meridian figures as scenario baselines and proposed pilot targets, not measured outcomes.
- Clarified Tracker references to current/pre-growth CSAT as scenario current-state and scenario pre-growth baseline.
- No new curriculum, claims, artifacts, or substantive Meridian work added.
- This is the manager-review-ready freeze point; resume site changes when new Meridian evidence warrants them.

## v91.5 manager-readability
- Reduced perceived homepage density through stronger hierarchy and optional/supporting-content cues rather than deleting evidence.
- Made the one-page Meridian readout easier to discover as an alternate shortcut.
- Added compact “What this shows / Current status / Worth noticing” orientation to flagship artifacts.
- Added explicit permission to sample—not read end-to-end—the Working Tracker.
- Visually de-emphasized the supporting Portfolio and Learning Library as optional exploration.
- No substantive Meridian evidence, curriculum, or claims removed.

## v91.6 manager-home — fixed regression-safe build
- Rebuilt from the known-good v91.5 source after rejecting the first v91.6 attempt.
- Replaced only the large Home learning-scaffolding block with a compact Learning Library preview.
- Preserved top navigation, More menu, mobile navigation, theme controls, Meridian/Portfolio/Learning Library views, and all standalone artifact files.
- Ran regression checks against v91.5 and local-link validation.

## v91.7 shell consistency
- Tightened the Learning Library CTA card so content starts at the top rather than floating vertically.
- Standardized the standalone Meridian shell across every artifact page.
- `More` now consistently appears before the dark-mode control.
- Standardized the Meridian evidence bar so older artifact pages no longer fall back to the legacy navigation treatment.
- Ran cross-page navigation and local-link regression checks.

## v91.8 header + spacing correction
- Removed inherited section-kicker spacing from the compact Home Learning Library preview.
- Rebuilt standalone Meridian headers to match the actual main-site header architecture instead of the legacy shell.
- Standalone header control order now matches Home: dark mode first, then More.
- Preserved the Meridian evidence bar and v91.5 artifact orientation blocks.

## v91.8 final consistency correction
- Tightened the Home Learning Library preview at the actual inherited section-kicker level.
- Rebuilt standalone artifact headers to visually match the Home header, including dark mode then More ordering.
- Restored the intended manager-readability orientation boxes on Plan, Agent Flow, Eval Suite, and Case Readout.
- Preserved Tracker’s receipts-layer orientation and the Meridian evidence bar.

## v91.9 design consistency
- Normalized standalone Meridian typography, heading hierarchy, body copy, labels, status pills, surfaces, callouts, tables, and vertical rhythm.
- Kept the Working Tracker intentionally slightly denser as the receipts layer while matching the shared visual system.
- No content, navigation, evidence, claims, or information architecture changed.

## v92.0 visual parity
- Replaced approximate standalone header styling with a Home-scale header treatment.
- Unified brand/nav typography, spacing, dark/light icon behavior, More menu, and mobile controls.
- Increased standalone artifact body/heading typography to match the newer site.
- Tracker retains density through spacing only, not smaller type.
- No content or information architecture changed.

## v92.2 readout + header parity
- Standalone artifact pages now use the actual Home header markup pattern rather than a visually similar recreation.
- Moved the one-page readout’s planned-learning note below the orientation block so the top follows the same artifact rhythm as other Meridian pages.
- No substantive content changed.

## v93.0 shared shell refactor
- Added `site-shell.css` as the single source of truth for header/nav/control styling across Home and standalone artifacts.
- Added `site-shell.js` for standalone theme/mobile/dropdown behavior.
- Home keeps its SPA router but now consumes the same header CSS as artifact pages.
- Increased the shared header type scale slightly; because the rules are shared, Home and artifacts cannot drift in nav sizing.
- Removed v92 standalone header CSS/JS duplication.
- No Meridian substantive content changed.

## v93.1 Agent Flow link regression fix
- Corrected the Agent Flow & Guardrails footer/cross-reference links so their destinations match their labels:
  - working tracker → `tracker.html`
  - PLAN deliverable → `plan.html`
  - One-page deliverable → `deliverable.html`
- No content, design, navigation shell, or architecture changes.

## v93.2 Manager-readiness content pass
Deliberately constrained content-only release on top of v93.1:
- Home: compact bridge from prior product/QA/customer/delivery judgment to AI-specific learning.
- Meridian Working Tracker: explicit statement of what the fictional simulation is intended to practice/prove.
- Success Measurement Plan: “Final locked targets” updated to “Current pilot targets.”
- Success Measurement Plan: 20-minute workflow cutoff explicitly labeled a provisional proxy requiring validation against reviewed tickets.
- Agent Flow: confidence wording clarified as an observable-evidence review/routing signal, not model self-reported confidence.
- No navigation, architecture, density, lifecycle-stage, or new-page changes.

## v93.3 Agentic-awareness micro-update
- Agent Flow now explicitly states that Meridian is intentionally a constrained, human-reviewed workflow rather than an autonomous agent.
- Added a clearly labeled future-learning placeholder for a genuinely agentic project covering dynamic tool use, state, tool failure/ambiguous outcomes, permissions, adversarial inputs, trajectory-level evals, and stopping/escalation.
- Reordered the More menu so the one-page Meridian readout appears before the full Working Tracker.
- No new page, no architecture change, no lifecycle-stage completion, and no substantive Meridian claims added.

## v93.4 wording-consistency cleanup
- Tracker wording now matches “Current pilot targets” rather than referring to locked targets.
- Replaced “real (simulated) rep input” with unambiguous simulated-input wording.
- Agent Flow and legacy Configure wording now consistently describe review/routing signals based on observable evidence rather than vague AI/model self-confidence.
- No design, architecture, navigation, measurement logic, or substantive learning changes.


## v94.0 — practical AI foundations reframe
- Broadened the portfolio umbrella from a narrowly AI Customer Success learning project to a practical AI foundations learning portfolio.
- Kept AI Customer Success as the first applied path and Meridian as the primary deep capstone; no completed Meridian evidence was reclassified or overstated.
- Added a compact six-part foundation map: AI systems literacy, evaluation & quality, workflow diagnosis, adoption & change, measurement & value, and product/business judgment.
- Added restrained longer-term direction toward AI value realization while preserving optionality into AI product, enablement, and technical post-sale work.
- Reframed the Learning Library as intentionally transferable across job titles rather than solely AI CS preparation.
- Expanded the existing AI readiness assessment into an upstream readiness + value exercise: current-workflow mapping, baseline, value hypothesis, readiness, blockers, and evidence needed before scaling.
- This is a framing/curriculum-language update, not a redesign or a claim of new completed work.


## v94.1 — role-agnostic applied AI framing
- Removed legacy AI Customer Success branding from the shared site shell and artifact browser titles.
- Kept customer-success language where it describes the actual Meridian support problem, customer outcomes, or genuine CS practice.
- Reframed Meridian from an “AI Customer Success capstone” to the **Meridian AI Support Pilot**, preserving the scenario and substantive work.
- Reframed the main lifecycle as **Applied AI delivery: from “we want AI” to measurable business value**.
- Made the career language exploratory rather than assuming AI Customer Success is the predetermined first role.
- Generalized the Working Tracker from a fictional “AI Customer Success owner” role to a record of the working process through the pilot.
- Renamed the planned 90-day customer-success review to a **90-day value review**.
- No redesign, scenario rewrite, new completed work, or substantive changes to Meridian decisions, metrics, guardrails, evals, or evidence.


## v94.2 — consistency cleanup
- Replaced the remaining **AI CS readiness** label with **Applied AI readiness**.
- Generalized the remaining CS-specific target capability to applying AI foundations to real business problems across user needs, workflow design, system behavior, quality, adoption, and measurable value.
- Replaced **Lead the customer work** with **Apply AI to the workflow** where that label was used as a transferable capability.
- No structural, visual, scenario, evidence, or curriculum changes.


## v94.3 — Home flow cleanup
- Removed the standalone **What I’m bringing forward** card from Home.
- Folded its strongest idea into **The foundation underneath the portfolio** introduction.
- Generalized the wording from AI-powered customer workflows to practical AI skills across systems, evaluation, workflows, adoption, measurement, and human oversight.
- No structural changes beyond consolidating the two adjacent Home messages; no Meridian or curriculum content changed.


## v94.5 — safe Home-card fix
- Restored the intact v94.3 page structure after the v94.4 removal accidentally consumed an extra closing container and broke layout/navigation.
- Removed only the balanced legacy `v932-ai-extension` **What I’m bringing forward** div.
- Preserved the consolidated Foundations wording from v94.3.
- No other structural, visual, curriculum, Meridian, or navigation changes.


## v94.6 — roadmap alignment
- Updated the visible roadmap and Portfolio operating-skill language to match the broader Practical AI Learning direction.
- Generalized the planned Meridian **Customer Success Review & Expansion Recommendation** to a **Value Review & Expansion Recommendation**.
- Reframed PROVE / EXPAND as **Value realization & scale judgment**, including explicit scale / iterate / pivot / stop decisions.
- Generalized AI readiness evidence to **AI readiness & value assessment**.
- Generalized personal-work automation and 90-day role-ramp practice so they apply across AI CS, product/product ops, implementation, enablement, operations, and related AI-adjacent roles.
- Replaced the remaining Portfolio target capability that assumed an AI Customer Success role with a broader AI-adjacent target capability.
- Kept Meridian itself support-flavored and customer-aware; no substantive pilot evidence, scenario facts, or completed-work status changed.


## v94.7 — role-generalization complete
- Updated the final leftover AI-CS-specific sentence in the Success Measurement Plan reflection.
- The reflection now frames uncertainty-handling and evidence-seeking as a capability to bring into real applied AI work, wherever the eventual role lands.
- This completes the role-generalization wording pass. No other content, design, roadmap, evidence, or scenario changes.


## v94.8 — Workbench navigation
- Promoted **Workbench** to the primary navigation because the site is first and foremost an active learning workspace.
- Added Workbench to the desktop navigation and mobile page selector on Home and all six standalone Meridian artifact pages.
- Updated the Home orientation copy so Meridian = depth, Workbench = cross-functional transfer practice, Portfolio = evidence/outputs, and Learning Library = concepts/scaffolding.
- No Workbench exercise content, Meridian evidence, design system, or learning status changed.


## v94.9 — first completed Workbench exercise
- Added **Harborstone Property Management — Invoice Operations** as the first completed Workbench exercise.
- Preserved the reasoning trail: broad automation request → workflow decomposition → narrow pilot choice → human review/eval design → fictional results → iterate + controlled expansion.
- Captured the key changed-mind insight that the goal is not maximum automation; use AI assistance, deterministic automation, human judgment, and source governance where each fits.
- Added the automation-bias concern and service-date failure decomposition rather than presenting the fictional pilot metrics as unqualified success.
- Parked invoice/work-order matching and approval routing/source governance as future Harborstone deep dives.
- Replaced the redundant planned Operations card with the completed Harborstone case; other planned breadth scenarios remain.

## v94.10 — Workbench reading-width polish
- Constrained the completed Harborstone exercise to a comfortable reading width so its cards no longer stretch awkwardly across wide desktop screens.
- Preserved the existing responsive/mobile behavior and all v94.9 content.

## v94.11 — Workbench detail-page structure
- Condensed the completed Harborstone case on the Workbench landing page into a compact summary card.
- Added `harborstone.html` as a dedicated full exercise page preserving discovery, changed thinking, pilot workflow, measurement, fictional results, automation-bias concern, recommendation, and future deep dives.
- This establishes the scalable pattern for future completed Workbench exercises: compact landing-page card + dedicated detail page.

## v94.12 — Working Tracker progressive disclosure
- Kept the full Meridian Working Tracker intact, but reorganized the major sections into collapsible notebook sections so the page no longer reads as one endless scroll.
- Added a top-level jump map, Expand all / Collapse all controls, and three key reasoning highlights.
- The stage checklist opens by default; deeper PM questions, rep discovery, success-measurement reasoning, VALIDATE work, and reflection can be opened as needed.
- Preserved every existing question, simulated answer, resolution, decision change, measurement note, and reflection rather than shortening the working record.
- Added direct navigation to the adoption-measurement revision.

## v94.13 — Harborstone + Tracker polish
- Fixed Harborstone's standalone page styling so it uses the same visual language as the rest of the site.
- Removed the unnecessary collapsible wrapper from the short Capstone stage checklist.
- Flattened the PM-question section so the nested boxes are less visually heavy while preserving all question/resolution content.
- Removed the excessive top gap inside Harborstone's compact Workbench card.

## v94.14 — QA / design / regression fixes
- Corrected the Working Tracker hierarchy: PM questions, rep discovery, findings, recommendation, Success Measurement, VALIDATE, and Reflection are now sibling sections instead of accidentally nesting inside one another.
- Kept the short Capstone stage checklist permanently visible and removed it from the jump controls.
- Preserved the flatter PM-question styling from v94.13.
- Upgraded Harborstone to the exact shared standalone navigation shell, including Workbench access, theme toggle, More menu, mobile selector, and shared `site-shell.js` behavior.
- Preserved the v94.13 Workbench-card spacing fix.
- No Meridian reasoning, Harborstone exercise content, roadmap content, or completed-work status changed.

## v94.15 — Harborstone card-height polish
- Made paired Harborstone detail-page cards equal height on desktop for a cleaner visual rhythm.
- Preserved natural card height on mobile.
- No content, navigation, or structure changes.

## v94.16 — Harborstone heading scale
- Reduced the Harborstone detail-page H1 to match the visual scale of the rest of the portfolio.
- Preserved responsive sizing and all v94.15 card-height polish.

## v94.17 — Harborstone H1 normalization
- Reduced the Harborstone H1 again to a normal standalone-artifact scale (40px desktop maximum) rather than a marketing-hero scale.

## v94.18 — Harborstone simulation + transfer framing
- Made the fictional Harborstone pilot-results block visually unmistakable with a dedicated simulated-results treatment and explicit “practice data, not a real client outcome” banner.
- Added one concise Workbench callout connecting Harborstone to the same discovery → scope → guardrail → measure → iterate framework practiced in Meridian, making the transferability evidence explicit.
- No substantive exercise content or pilot reasoning changed.

## v94.19 — applied-judgment home hierarchy
- Shifted Home toward applied evidence without turning the learning portfolio into a hiring-only landing page.
- Replaced the meta-heavy exploration block with an applied-work fast path to Meridian and Harborstone.
- Made Meridian + Harborstone the two primary applied-work cards on Home.
- Expanded “Judgment in practice” to six decision-change examples, adding the adoption-measurement correction and Harborstone automation-bias insight.
- Quieted the Home Learning Library preview while keeping the full Library readily accessible.
- Reframed prominent Meridian scenario wording from “fictional” to “simulated” while preserving honest simulation disclosure.
