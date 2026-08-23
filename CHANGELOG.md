# Practical AI Learning Portfolio — Historical Changelog

This file preserves release history from the former long README. For the current architecture, file map, and QA instructions, use `README.md`.

## v95.81 Meridian consistency and System Flow completion

- Matched Meridian Overview’s route spacing to the canonical standalone artifact shell on desktop and mobile.
- Added a bottom-anchored canonical-source link to the Meridian success-criteria capability card.
- Removed the System Flow page’s duplicated opening title, description, status box, and guardrail explanation.
- Added a concise diagram-reading header, contained decision/source cards, and a finished validation-boundary close before footer navigation.

## v95.80 structured Learning Guide summary

- Implemented the selected compact two-column orientation: learning depth on the left and recurring lenses on the right.
- Kept the block shallow, balanced, and responsive without restoring the redundant progression row.
- Explicitly collapses all eight curriculum disclosures on initial load; a direct link to a specific stage can still open that requested stage.
- Replaced the old next-practice rows with three compact cards and contained the resource-curation note.
- Reworked the oversized Applied Work/Capabilities explanation into two concise, linked evidence views.

## v95.79 condensed Learning Guide context strip

- Removed the redundant eight-stage progression immediately above the eight-stage curriculum.
- Replaced the large roadmap card and lens pills with a quiet two-line focus-and-lenses strip.
- Reduced the block’s height, border weight, typography, and visual competition with the curriculum itself.

## v95.78 Learning Guide orientation refinement

- Replaced the wide three-row orientation table with a compact roadmap card.
- Kept the learning-depth statement prominent without making it look selected.
- Rendered the eight-stage progression as a scannable sequence and the recurring lenses as wrapping pills.
- Reduced excess vertical space and removed the competing divider immediately above Curriculum & Resources.

## v95.77 shared-UI and reasoning-connection maintenance

- Bottom-aligned Meridian artifact actions through the shared card rule and loaded every Learning Guide stage collapsed by default.
- Restyled Learning Review controls and save actions consistently in immediate Lab results and the Learning Log.
- Clarified the Lab as a deterministic practice environment rather than a proposed production application.
- Restored a compact, collapsed Measurement Plan rationale and corrected the Working Tracker cross-reference.
- Added canonical learning metadata to all 12 runnable eval cases and surfaced it beside each case result without creating a parallel specification source.

## v95.76 reasoning-connection roadmap refinement

- Queued a compact, collapsed Measurement Plan reflection and correction of the Tracker’s stale cross-reference.
- Planned canonical eval-case learning metadata in `meridian-core.js` and display of that context beside runnable Lab cases.
- Explicitly rejected a parallel case-spec Markdown source and duplication of the full discovery-question log, preserving the Working Tracker and shared Lab core as the appropriate owners.

## v95.75 commercial-translation roadmap refinement

- Specified a pressure-tested executive update that communicates an unfavorable pilot signal without spin and commits to a time-bound decision plan.
- Added a later assumption-transparent commercial model using eligible volume, adoption, net time saved after review/rework, labor assumptions, operating cost, and maintenance burden.
- Required low/base/high scenarios, preserved Finance-owned unknowns, and distinguished capacity returned from unsupported FTE-savings claims.
- Queued one compact Lab-orientation clarification while retaining the Meridian Lab name and current learning-first architecture.

## v95.74 roadmap synchronization

- Added an explicit human-review/handoff decision to the first run → diagnose → revise → rerun learning cycle.
- Queued an evidence-grounded signal → diagnosis → product action + CS/enablement action translation exercise.
- Captured the next maintenance-pass UI notes: bottom-aligned Meridian card actions, shared Learning Review form styling, and fully collapsed Learning Guide sections by default.
- Preserved executed eval work—not additional interface or generic adoption collateral—as the immediate priority.

## v95.73 Meridian Lab deployment-path repair

- Fixed Lab asset resolution when Vercel serves the clean URL `/meridian-lab` without a trailing slash.
- Deployed HTTP(S) pages now load CSS and JavaScript explicitly from `/meridian-lab/`; direct local-file previews continue using relative paths.
- Added a regression contract for the deployed Lab asset base and ordered core/application script loading.

## v95.72 merged Lab hardening and repeat-ticket repair

- Merged the repeat-ticket workflow, explicit reset, Command/Control + Enter submission, run-status feedback, and wider desktop Lab sidebar from the parallel v95.71 branch.
- Preserved the confidence-threshold correction, malformed workspace-import validation, generated-field accessibility, and executable Meridian domain tests from the QA-hardened branch.
- Preserved the desktop/mobile portfolio exit menu with direct Home, Meridian Overview, Applied Work, and Learning Guide destinations.
- Removed duplicate Home and Harborstone description tags introduced during parallel metadata work.
- Consolidated current-state, roadmap, release, and Meridian handoff documentation around the active run → diagnose → revise → rerun learning priority.

## v95.61 maintenance consolidation

- Normalized substantive standalone pages to one semantic `main` landmark and one document `h1`.
- Standardized Meridian breadcrumbs, equal-height detail heroes, contextual tabs, primary Eval Runner action, and artifact footer navigation.
- Added regression contracts for semantic landmarks, compatibility redirects, Meridian shared components, navigation labels, and recently unstable layout elements.
- Reclassified old Meridian filenames as compatibility redirects rather than current content sources.
- Standardized reader-facing Meridian artifact terminology.
- Split current operating documentation into a concise README while preserving historical notes here.
- Pinned the future Eval Design / MVP & Runs / Results & Changes architecture decision to the roadmap for discussion after genuine MVP evidence exists.

## v95.62 navigation stability and runner flow

- Moved the Eval Runner action out of the Eval Work hero so it no longer pushes the shared Meridian tabs down.
- Kept the action prominent in a dedicated callout immediately below the contextual navigation.
- Reordered the Eval Runner around the real learning workflow: freeform “Try a ticket” first, repeatable designed cases second.
- Removed the unnecessary mode switch so both parts of the runner remain discoverable on one page.

## v95.63 Meridian visual parity

- Made the Meridian overview the canonical visual template for all Meridian detail pages.
- Moved breadcrumbs and page eyebrows above a shared bordered, tinted case hero.
- Added a compact four-item context row to every detail hero, mirroring the overview metrics without presenting new outcome claims.
- Standardized hero padding, border, radius, background, title scale, navigation spacing, and responsive two-column context rows.

## v95.64 canonical Meridian shell

- Replaced the previous look-alike components with one namespaced Meridian page contract used by the overview, five artifacts, and Eval Runner.
- Matched the overview’s actual final rendering: open editorial hero, context cards, then contextual navigation.
- Removed Meridian’s dependency on conflicting generic `.wrap`, `.hero`, `.metric`, and `.artifact-detail` geometry.
- Standardized the overview’s final desktop/mobile offsets (66px/48px), 1180px outer frame, title and lead rows, context-card sizing, and tab geometry.
- Made the longer Eval Runner breadcrumb horizontally contained on narrow screens instead of allowing it to change page height.

## v95.65 full QA and design pass

- Added missing descriptions to all current Meridian pages.
- Made the overview heading wrapper structurally identical to the detail-page template.
- Repaired three heading-hierarchy gaps without changing their visual prominence.
- Replaced the Eval Runner’s browser alert with an accessible inline freeform-result panel.
- Made prototype confidence deterministic so identical eval inputs produce repeatable results.
- Added bottom-of-page orientation to the Eval Runner and expanded regression contracts for metadata and runner behavior.
- Added visible, accessible empty-input feedback and protected the Runner from malformed saved local results.
- Standardized remaining page titles and tightened the homepage search description.

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

## v94.20 — Harborstone economics + learning boundary
- Removed unsupported simulated dollar ROI figures from Harborstone rather than retroactively inventing a cost model.
- Reframed economics honestly: the simulated pilot suggests capacity value, while a real ROI case would require actual invoice volume, loaded labor cost, implementation cost, model/vendor usage cost, maintenance/support cost, and exception rate.
- Added a “What I still don’t know” section acknowledging AP-specific discovery not covered in the exercise: PO/receipt and three-way matching, duplicate-payment detection, vendor verification/fraud controls, and payment-timing/early-payment-discount workflows.
- Preserved those topics as learning boundaries rather than post-hoc claims of AP expertise.
- Future Workbench principle: keep a consistent reasoning method, but do not force completed exercises into the same narrative template. Let the problem determine the artifact and allow outcomes such as do-not-build, conventional automation, data-not-ready, failed pilot, or unfavorable economics when the evidence supports them.

## v94.21 — final status consistency maintenance
- Corrected the Portfolio inventory status for Cross-functional Workbench cases from Planned to 1 completed, reflecting Harborstone.
- No architecture, design, navigation, or substantive content changes.
- Site architecture is frozen after this maintenance fix unless a genuine bug or evidence-status inconsistency is found.

## v95.0 — long-term capability roadmap
- Added a high-level, multi-year learning roadmap inside the Learning Library without changing the site's frozen primary architecture.
- Organized future learning around ten capability areas: AI systems; quality/evals/responsible AI; workflow/process/knowledge systems; implementation/adoption/human-AI interaction; data/measurement/experimentation; business/operations/AI economics; enterprise AI/organizational change; product/strategy/decision-making under uncertainty; communication/leadership/influence; and domain applications.
- Added Legal AI as the first planned domain specialization, using the JD as a domain advantage rather than repositioning the whole portfolio around legal work. Planned legal learning includes legal workflows/technology, professional responsibility and AI, law-firm economics, knowledge systems, and AI adoption.
- Preserved AI Customer Success readiness as a near-term applied path while broadening the long-term destination to applied AI implementation and business judgment.
- Added the principle that the goal is not to find places to use AI, but to diagnose the problem well enough to decide whether AI belongs in the solution.
- Generalized the remaining broad competency phrase “success planning” to “outcome planning”; Meridian's specific Success Measurement Plan and customer/support scenario remain unchanged.
- Updated the site metadata and Learning Library introduction to reflect reliable business outcomes and role-agnostic applied AI judgment.
- No Meridian evidence, Harborstone reasoning, completion status, navigation, design system, or standalone artifact content changed.


## v95.1 — information architecture simplification
- Simplified the primary site model to **Home / Applied Work / Learning Guide**.
- Removed Portfolio as a separate conceptual destination; the site itself is the portfolio.
- Recast the former Portfolio view as **Applied Work**, a simple map to the two kinds of practice:
  - **Meridian = depth** — one end-to-end simulated AI implementation.
  - **Workbench = breadth** — smaller cross-functional transfer exercises.
- Clarified the **Working Tracker** as Meridian's behind-the-work process record, not a peer project or top-level destination.
- Preserved Meridian and Workbench as existing SPA subviews so no substantive applied work was deleted or flattened.
- Renamed visible Learning Library destination language to **Learning Guide** while preserving the detailed library/reference material inside it.
- Added a compact "How the site fits together" explanation on Applied Work.
- No substantive Meridian, Harborstone, eval, measurement, or learning-roadmap content was removed.


## v95.2 — Evidence navigation + cross-project capability pages
- Renamed the shared secondary dropdown from Meridian/More framing to **Evidence**.
- Established the navigation rule: **Applied Work = browse by case; Evidence = browse by capability**.
- Reframed three direct artifact pages as cross-project capability evidence while preserving their detailed Meridian material:
  - Success Measurement Plan → **Measurement & Value**
  - Agent Flow → **Systems & Guardrails**
  - Eval Suite → **Evals & Quality**
- Added concise Harborstone evidence summaries to those capability pages using only work already completed in the Harborstone exercise.
- Kept the detailed Meridian artifacts as the primary deep case underneath each capability page.
- Reframed the detailed Configure flow as a Meridian deep dive supporting Systems & Guardrails.
- Kept the Working Tracker explicitly Meridian-specific as the behind-the-work process record.
- The Evidence menu also links directly to the Meridian readout, Tracker, and Harborstone case for context.
- No future legal-AI or other planned work is presented as completed evidence.


## v95.3 — visual consistency pass
- Polished the **Evidence** dropdown so section labels, spacing, separators, item height, and hover targets read as a designed navigation menu rather than a raw link list.
- Standardized standalone primary navigation to **Home / Applied Work / Learning Guide**.
- Normalized mobile standalone navigation to the same simplified architecture.
- Brought **Harborstone** into the shared standalone visual language: page width, heading scale, typography, cards, tags, spacing, surface treatment, dark mode, and responsive behavior now match the Meridian/evidence pages more closely.
- Preserved Harborstone's substantive content and its simulated-results distinction.
- No learning, case reasoning, evidence status, or metrics changed.


## v95.4 — final QA + design polish
- Completed a site-wide structural, navigation, link, responsive-design, and framing QA pass.
- Strengthened the Evidence dropdown with a one-line mental model: **same work, different lens**.
- Evidence menu links now show short context labels so capability views are clearly distinct from case views.
- Strengthened Applied Work transition copy: Applied Work and Evidence explicitly show the same work organized differently; Evidence is not a separate project.
- Clarified **Workbench** as the collection of smaller Applied Work cases rather than a competing top-level concept.
- Added deep links from Home's **Judgment in practice** cards directly to the relevant Tracker or Harborstone reasoning, improving mobile review.
- Added stable Harborstone anchors for key decisions/diagnostics.
- Reduced redundant simulation wording in Harborstone while retaining clear scenario/result disclosure.
- Fixed a stale Working Tracker footer link in the Agent Flow page.
- Removed two lingering CS/PM-specific framing phrases that no longer matched the broader applied-AI direction.
- QA found no missing local files, broken anchors, duplicate HTML IDs, missing page titles/viewports, or images without alt text.
- No substantive learning conclusions, case metrics, or evidence statuses changed.


## v95.5 — roadmap stewardship checkpoint
- Added a **Site stewardship · later maintenance** item adjacent to (but explicitly separate from) the AI capability roadmap.
- Future maintenance scope: consolidate the established visual language into shared design tokens/components for spacing, typography, content widths, headers, cards, bands/callouts, evidence/case summaries, tags/status, navigation/dropdowns, tables, links/buttons, dark mode, and responsive behavior; then remove legacy/duplicate CSS overrides.
- Explicitly treats design-system consolidation as **site maintenance, not AI learning**.
- Preserves the rule that obvious isolated UI bugs should still be fixed as they appear.
- Fixed the excessive vertical whitespace/min-height behavior in the Applied Work explanatory band identified after v95.4.
- v95.4's information architecture, learning roadmap, applied work, and evidence model remain unchanged.


## v95.6 — Applied Work spacing polish
- Increased vertical breathing room inside the Meridian and Workbench overview cards.
- Added clearer separation between the introductory copy, blue practice callout, and bottom context note.
- Kept both cards visually balanced and preserved tighter mobile spacing.
- No content or architecture changes.


## v95.7 — Evidence first-class navigation
- Promoted **Evidence** to the primary navigation: **Home / Evidence / Applied Work / Learning Guide**.
- Added a dedicated Evidence landing view that acts as the site's proof index.
- Evidence currently surfaces only demonstrated cross-case capabilities:
  - Measurement & Value
  - Systems & Guardrails
  - Evals & Quality
- Each capability card links to the existing cross-project evidence page summarizing Meridian + Harborstone.
- Added the governing rule that roadmap capabilities graduate into Evidence only after completed work provides enough proof; planned work is not represented as demonstrated capability.
- Applied Work remains the case-based view; Evidence is the capability-based proof view.
- Standalone desktop/mobile navigation now exposes Evidence directly.
- The Evidence dropdown remains as a quick capability navigator rather than the only way to discover the section.


## v95.8 — Discovery & Workflow evidence
- Promoted **Discovery & Workflow** into Evidence based on completed cross-case work in Meridian and Harborstone.
- The capability is framed as diagnosing the real problem before choosing a solution: workflow mapping, assumption testing, separating symptoms from causes, and deciding where AI, deterministic rules, conventional automation, or human judgment belong.
- Evidence now has four demonstrated capability areas: Discovery & Workflow, Measurement & Value, Systems & Guardrails, and Evals & Quality.
- Added reciprocal **Capabilities demonstrated** links on the Applied Work overview so projects point back toward the skills they demonstrate.
- Added stable deep-link anchors into Meridian's discovery reasoning and Harborstone's workflow-decomposition reasoning.
- Changed the Evidence landing grid to a balanced two-by-two layout on desktop and one column on mobile.
- No planned capability was promoted without completed evidence.


## v95.9 — Capabilities naming
- Renamed the top-level **Evidence** destination to **Capabilities**.
- Primary navigation is now **Home / Capabilities / Applied Work / Learning Guide**.
- Kept **evidence** as the governing proof standard rather than the navigation label: a capability appears only when completed applied work demonstrates it.
- Capabilities answers **“What can I demonstrate?”**; Applied Work answers **“Where did I apply it?”**; Learning Guide answers **“What am I developing?”**
- Preserved the existing `#evidence` internal route for link/backward compatibility; this is implementation detail only and is no longer user-facing terminology.
- No capability content, case evidence, learning conclusions, or architecture changed beyond naming/framing.


## v95.10 — navigation simplification
- Removed the redundant secondary Capabilities/Evidence dropdown from the shared header.
- Primary navigation is now the single global navigation model: **Home / Capabilities / Applied Work / Learning Guide**, plus the theme toggle.
- Capability detail pages remain reachable from the Capabilities landing page; case context remains reachable from Applied Work.
- This removes the last major navigation element inherited from the earlier Meridian/artifact architecture.
- No content, evidence, learning, or case changes.


## v95.11 — deep-link and sticky-header polish
- Added global `scroll-padding-top` / `scroll-margin-top` handling so deep-linked headings and sections clear the sticky header on desktop and mobile.
- This normalizes behavior for Home judgment links into the Working Tracker and Harborstone, including `#rep-findings`, `#success-measurement`, `#validate`, `#adoption-revision`, `#automation-bias`, and `#workflow-decomposition`.
- Preserved the Tracker behavior that opens a targeted `<details>` section automatically when it is the URL hash.
- Added a compact contextual return path on the long-form Tracker and Harborstone pages: **Capabilities / Applied Work**.
- Confirmed Harborstone still retains the explicit **SIMULATED RESULTS · PRACTICE DATA, NOT A REAL CLIENT OUTCOME** disclosure.
- No substantive case, learning, evidence, or architecture changes.


## v95.12 — Learning Guide progression
- Reorganized only the **Learning Guide**; Home, Capabilities, Applied Work, Meridian, Harborstone, and the capability architecture remain unchanged.
- Reframed the roadmap as a natural progression:
  1. AI Systems & Foundations
  2. Software, Data & UX Foundations
  3. Quality, Evals & Responsible AI
  4. Discovery, Workflows & Knowledge
  5. Implementation, UX & Adoption
  6. Measurement, Business & Operations
  7. Product, Strategy & Leadership
  8. Domain Applications
- Added an **Applied throughout** lens set: UX/accessibility, quality/testing, security/privacy, human factors, data quality, knowledge quality, business value, and responsible AI.
- Added a targeted **Software foundations** callout covering architecture, APIs, data/SQL, modern QA/QE, observability, security/privacy, UI/UX, accessibility, and AI interaction design.
- Deliberately left formal Scrum/process methodology off the learning roadmap; company-specific operating models can be learned in context.
- Clarified that the Learning Guide is a map/reference layer rather than a claim of completed expertise; demonstrated skills belong in Capabilities and completed scenarios in Applied Work.
- Preserved the detailed learning library below the roadmap rather than expanding the roadmap into a textbook.
- Added responsive/scannable progression and lens styling.


## v95.13 — comprehensive Learning Guide checkpoint
- Final enrichment pass on the Learning Guide only; no site architecture or applied-work changes.
- Added/clarified: AI orchestration/state/routing and production tradeoffs; analytics instrumentation and data lineage; enterprise identity/permissions; service design; production monitoring/drift/versioning; AI-specific security; incident recovery; organizational readiness and human factors; experimentation/causal thinking; basic finance/economics; vendor evaluation/POCs/procurement; communication/data storytelling; and Legal AI confidentiality/vendor constraints.
- Added **AI-assisted work as a discipline**: research, synthesis, analysis, prototyping, documentation, critique, automation, verification, source judgment, privacy awareness, and appropriate non-delegation.
- Added proportionate hands-on practice examples without implying every exercise belongs in the public portfolio.
- Added a **depth rule**: go deep on applied judgment and interdisciplinary interfaces; gain enough fluency elsewhere to collaborate and recognize when specialists are needed.
- Kept the eight-stage progression intact rather than adding more major categories.
- Expanded recurring lenses to include communication and responsible AI/governance while consolidating data + knowledge quality for scanability.
- This is intended as the comprehensive roadmap checkpoint; future changes should generally come from new learning/resources/evidence rather than further taxonomy expansion.


## v95.14 — Learning Guide consolidation
- Kept the Learning Guide as one page but rebuilt it around progressive disclosure.
- The eight-stage roadmap is now the actual interface to the learning library rather than a second taxonomy sitting above the older card library.
- Each stage is a deep-linkable accordion with: short outsider-facing summary, topic preview, status, Core learning items, Reference/deeper-dive items where useful, and proportionate Practice prompts.
- Added deep-link behavior so `#ai-foundations`, `#software-data-ux`, `#quality-evals`, `#discovery-workflows`, `#implementation-adoption`, `#measurement-business`, `#product-strategy`, and `#domain-applications` open the correct stage.
- Consolidated the old curriculum topics into the new eight-stage progression rather than leaving the original cards pushed below the roadmap.
- Removed public-facing maintenance/design-system notes from the Learning Guide; those belong in README/maintenance planning rather than the curriculum.
- Reduced standalone explanatory callouts by folding their useful principles into the hero, learning loop, stage structure, and compact footer.
- Preserved the recurring lenses and the Learn → Practice → Reflect → Capture evidence model in a much quieter form.
- Tightened the oversized top/bottom padding on the Capabilities principle callout shown in QA.
- No changes to Home, Capabilities taxonomy, Applied Work cases, Meridian reasoning, Harborstone reasoning, or substantive evidence.


## v95.15 — Learning Guide typography
- Increased Learning Guide typography to better match the reading scale used across the rest of the site.
- Raised accordion summaries, descriptions, topic previews, learning-item body copy, lens chips, learning-loop copy, and footer guidance without changing the consolidated information architecture.
- Preserved the compact/scannable layout; this is a readability and visual-consistency adjustment only.


## v95.16 — Learning Guide visual normalization
- Reworked the Learning Guide type scale against the rest of the site's editorial/body scale rather than making another small incremental font bump.
- Stage titles now read as real card headings; stage summaries and expanded learning content use normal reading-size body text.
- Enlarged the progression navigation, lens chips, learning-method strip, statuses, and curriculum copy while preserving hierarchy.
- Increased card padding/vertical rhythm so the larger type has room to breathe.
- Reduced the compressed “tiny documentation UI” feeling while preserving progressive disclosure and scanability.
- Mobile now uses one-column learning-method blocks and an appropriately scaled accordion.


## v95.17 — quiet editorial Learning Guide
- Removed the dashboard-like visual treatment from the Learning Guide while preserving the v95.14–v95.16 information architecture.
- The eight-stage progression is now a simple linked text sequence rather than eight mini-cards.
- Recurring lenses are now one quiet inline line rather than a field of pills.
- Learn → Practice → Reflect → Capture evidence is now one editorial process line rather than four boxes.
- The eight curriculum stages are flat accordion rows separated by rules; no card background or outer container is used.
- Expanded learning items are flat content rows with subtle separators rather than nested cards.
- **Practice** remains the one deliberately distinct content treatment: a roomy pale-blue strip with a teal left accent.
- Further tightened the oversized Capabilities principle callout padding.
- Preserved stage statuses, deep links, progressive disclosure, curriculum content, and all other site architecture.


## v95.18 — Capabilities spacing + Learning Guide component polish
- Fixed the remaining excessive vertical whitespace in the Capabilities “Demonstrated, not claimed” principle callout by removing inherited min-height/display behavior and tightening internal spacing.
- Restyled only the eight top-level Learning Guide stage disclosures using the established Capabilities visual language: clear bordered surface, stronger title/summary hierarchy, status pill, and consistently aligned expand/collapse control.
- Kept expanded curriculum content flat/editorial with subtle separators to avoid cards-inside-cards.
- Preserved Practice as the one distinct nested treatment, with corrected left padding and a pale-blue/teal callout style.
- Improved mobile disclosure alignment and expand-icon placement.
- No curriculum content, navigation architecture, Capabilities taxonomy, or Applied Work content changed.


## v95.19 — Learning Guide header/progression polish
- Removed Active / Refresh + Deepen / Developing / Later / Planned pills from Learning Guide stages. The ordered roadmap now communicates learning sequence without a second, potentially confusing status system.
- Restyled “Progression at a glance” as a deliberate linked roadmap with compact stage labels and clear arrows rather than raw-looking inline text.
- Normalized spacing around stage names and ampersands and prevented inherited typography rules from visually collapsing words.
- Kept Applied throughout and Learn → Practice → Reflect → Capture evidence visually quieter beneath the roadmap.
- Gave the “two views of the same evidence” explainer a more intentional compact card treatment and removed inherited excess height/whitespace.
- Preserved the v95.18 Learning Library stage cards and flat expanded curriculum.


## v95.20 — bottom-of-page visual polish
- Restyled the Capabilities “Evidence grows with the work” note as a compact left-accent callout so it reads as intentional guidance rather than loose body text.
- Reduced the visual weight of the shared “Go deeper” resource section: it is now a simple footer resource strip with a top rule, compact heading/copy, and small resource pills rather than a large tinted card.
- Preserved resource links and all substantive copy.
- No architecture, learning, case, or capability changes.


## v95.21 — roadmap spacing, status cleanup, agent-flow scale
- Fixed Learning Guide progression labels by removing forced `<br>` breaks before ampersands; labels now preserve normal spaces around `&` and wrap naturally.
- Removed Done / In progress / Designed-style completion pills from the site where they duplicated the actual linked artifacts or page content.
- Kept future/not-started roadmap state where it still communicates genuinely different information.
- Replaced the Workbench “1 complete” count badge with a direct Harborstone link in the status copy.
- Meridian tracker retains direct links to the Success Plan, Agent Flow, and Eval Suite while redundant Done/In progress badges are removed.
- Reduced the Agent Flow diagram to a centered ~560px maximum width on desktop so the full system is easier to take in at once; it remains responsive on smaller screens.


## v95.22 — contextual Capabilities subnavigation
- Added a quiet local Capabilities navigation row to the Capabilities overview and the standalone Systems & Guardrails / Evals & Quality pages.
- Local navigation includes Overview, Discovery & Workflow, Measurement & Value, Systems & Guardrails, and Evals & Quality.
- The current destination receives a subtle highlighted state; this is intentionally subordinate to the global Home / Capabilities / Applied Work / Learning Guide navigation.
- Mobile uses a horizontally scrollable row rather than introducing another dropdown.
- No global dropdown was restored.


## v95.23 — Capabilities navigation QA
- Fixed the contextual Capabilities nav being inserted above the global header on standalone pages; it now lives inside page content below the primary site navigation.
- Corrected broken local-nav routes: Discovery & Workflow no longer points at the Learning Guide stage, and Measurement & Value no longer points at the Measurement/Business learning stage.
- Added a dedicated **Discovery & Workflow** capability page so all four demonstrated capabilities have a consistent capability-level destination.
- Discovery & Workflow now summarizes completed Meridian + Harborstone evidence and deep-links to the underlying reasoning in each case.
- Measurement & Value routes to `plan.html`; Systems & Guardrails routes to `agent-flow.html`; Evals & Quality routes to `evals.html`.
- Added the contextual Capabilities nav to Measurement, Systems, and Evals capability pages only; removed accidental placement on unrelated pages.
- Fixed the main-page mobile selector so Capabilities appears alongside Home, Applied Work, and Learning Guide.
- QA verified local file/anchor targets and global-before-local navigation order.


## v95.24 — capability hierarchy cleanup
- Removed the Meridian Evidence artifact nav from Measurement & Value, Systems & Guardrails, and Evals & Quality. Cross-project capability pages now have one contextual navigation layer only.
- Meridian-specific artifact navigation remains on Meridian case/depth pages, where it represents the correct project hierarchy.
- Normalized Discovery & Workflow to the shared capability-page visual language and shared site shell, including typography, spacing, cards, links, responsive behavior, and theme support.
- Preserved inline/deep links from capability evidence back to the underlying Meridian and Harborstone reasoning.
- QA checked capability-nav count, global-before-local nav order, shared-shell inclusion, and local capability destinations.


## v95.25 — Discovery styling + Learning Guide overview simplification
- Fixed Discovery & Workflow by adding the same base design tokens, typography, page sizing, card treatment, dark-mode variables, and responsive behavior used by the other standalone capability pages.
- Simplified the top of the Learning Guide substantially: removed the long chain of stage chips/arrows and the separate lens/process UI.
- Replaced them with three compact editorial lines: the eight-stage learning path, the recurring lenses, and the Learn → practice → reflect → capture-evidence method.
- The detailed eight-stage accordion immediately below remains the primary navigation/interface for the actual curriculum.
- No learning content or capability evidence was removed.


## v95.26 — standalone Capabilities overview
- Added a standalone `capabilities.html` overview page so the Capabilities local navigation no longer jumps between an in-page SPA view and standalone sibling pages.
- The overview now uses the same shared header, content width, local capability navigation, typography, spacing, dark-mode behavior, and standalone-page interaction model as Discovery, Measurement, Systems, and Evals.
- Capability-page global and mobile Capabilities links now point to `capabilities.html`; the main index can still expose its embedded Capabilities view as part of the Home SPA.
- This eliminates the visible layout/navigation “jump” when moving from a capability detail page back to Overview.


## v95.27 — Learning Guide copy trim
- Removed the “How I use the guide: Learn → practice → reflect → capture evidence…” line from the Learning Guide overview.


## v95.28 — capability header normalization
- Normalized the top section across Overview, Discovery & Workflow, Measurement & Value, Systems & Guardrails, and Evals & Quality so switching within the local Capabilities nav no longer causes a large typography/layout jump.
- All five pages now use the same compact capability label, 26px title scale, 16px lead scale, content width, and bottom spacing.
- Replaced Meridian stage labels such as “CAPSTONE · PLAN / CONFIGURE / VALIDATE” at the top of cross-project capability pages with the more accurate shared label **Cross-project capability**. Meridian-specific stage context remains in the detailed case content below.
- No capability evidence or case content changed.


## v95.29 — full QA / regression hardening
Full regression pass after the Capabilities and Learning Guide restructuring.

### Fixed in this pass
- Canonicalized **Capabilities** to `capabilities.html` across global and mobile navigation so the site no longer exposes two different primary Capabilities destinations.
- The Home/index desktop Capabilities item now links to the same standalone overview used by the capability-page family; mobile navigation handles that external destination correctly.
- Fixed dark-mode regression on the new Capabilities Overview and Discovery & Workflow pages by supporting the shared shell's `v88-dark` state.
- Added a consistent active state for **Capabilities** in the global nav while browsing any capability page.
- Revalidated internal files/anchors, primary/mobile nav parity, capability-nav hierarchy, sticky-header anchor support, Harborstone simulation disclosure, status-pill cleanup, and compact Agent Flow sizing.

### Deliberate future hardening / design-system work
- Add semantic `<main>` landmarks and a skip-to-content link consistently across legacy pages.
- Add deliberate `:focus-visible` keyboard states and reduced-motion handling.
- Prefer native links/buttons over legacy `div role="button"` controls where practical.
- Run formal WCAG contrast/touch-target/automated accessibility checks in light and dark mode.
- Consolidate accumulated historical CSS overrides into shared design tokens/components. `index.html` in particular still contains many layered style blocks; visually it is coherent, but this is the largest maintainability/regression risk.
- The embedded legacy `#evidence` view remains only for backward compatibility; `capabilities.html` is now the canonical visitor-facing Capabilities destination.


## v95.32 — top-navigation-only correction
- Rebased on **v95.29** to discard the v95.30/v95.31 content-frame changes that caused page content to run too close to the browser edge.
- Found the primary cause of the Capabilities header jump: the main index used **AI Learning Portfolio** while standalone capability pages used **Practical AI Learning**, giving the left side of the header a different physical width.
- Standardized the visible brand to **AI Learning Portfolio** across the site.
- Reserved equal desktop-width left and right header anchors so the centered four-item primary navigation remains stationary when moving between index and standalone pages.
- Added stable scrollbar gutter handling as a secondary safeguard.
- This pass changes **header geometry only**. It does not alter page gutters, body layout, capability content frames, Learning Guide layout, or local capability navigation spacing.


## v95.33 — lightweight shared design system
This pass is intentionally an under-the-hood consolidation rather than a redesign.

### Shared component layer
- Added `site-components.css` as the reusable component layer, loaded after page-specific styles.
- Added spacing, radius, reading-width, title-size, and lead-size tokens.
- Added a shared **page-intro** component for sibling top-level destinations. Applied Work and Learning Guide now use it on `index.html`; the five Capabilities pages use the same component while Home intentionally retains its stronger landing-page hero.
- Centralized the **Capabilities local nav** into one shared component and removed recent duplicated local-nav / capability-intro style blocks from capability pages.
- Added reusable `surface-card`, `callout-subtle`, and `callout-practice` variants and applied them selectively without changing the underlying content hierarchy.

### Design-system rule going forward
If the same visible pattern appears on more than one page, prefer a class in `site-components.css` rather than another page-level override. Page-level CSS should be reserved for genuinely page-specific diagrams, tables, or layouts.

### Visual regression checklist for future edits
Check at minimum:
1. desktop + mobile;
2. light + dark mode;
3. global top-nav position and active state;
4. top-level page-intro alignment and gutters;
5. Capabilities local-nav alignment;
6. long-title / long-link wrapping;
7. deep-link landing below sticky header;
8. Learning Guide accordion closed + open states;
9. Harborstone / Meridian standalone-page gutters;
10. no horizontal overflow.

### Remaining larger debt
Legacy pages still contain older historical style layers. This pass removes recent duplicated component CSS but deliberately does not bulk-delete old rules without visual regression tooling. Future cleanup should migrate one stable component family at a time rather than doing a risky wholesale CSS rewrite.


## v95.34 — roadmap / maintenance sync
No visitor-facing redesign in this pass. The current roadmap is synchronized around two priorities:

### Learning / applied-work priority
- Continue the eight-stage Learning Guide in sequence.
- Add new Applied Work scenarios only when they create useful practice/evidence, including adjacent UI/UX, accessibility, QA/QE, software/data/API, security/privacy, human-factors, measurement/value, product/strategy, governance, and domain-workflow skills.
- Keep Legal AI as the first planned domain specialization because domain knowledge can materially change workflow, risk, economics, knowledge quality, governance, and adoption.
- Treat formal process frameworks (for example Scrum) as awareness/reference rather than a major learning investment.

### Site maintenance priority
- v95.33's `site-components.css` is now the preferred shared component layer.
- Do not resume broad visual redesign while the current architecture is working; learning and practice are the priority.
- When maintenance is warranted, migrate repeated patterns incrementally from historical page-level CSS into shared tokens/components.
- Future hardening remains: semantic `<main>` landmarks + skip links, `:focus-visible`, reduced-motion support, native-control cleanup, WCAG contrast/touch-target/automated accessibility checks, and eventual design-library/component documentation.
- Continue the visual regression checklist documented in v95.33 for every meaningful site change.


## v95.35 — Capabilities subnav position fix
- Found the remaining subnav jump: Overview and Discovery used newer `<main class="wrap">` containers with top padding, while Measurement / Systems / Evals still used legacy `.wrap` rules whose historical CSS removed that top padding.
- Normalized the outer capability-page wrapper on the three legacy pages to semantic `<main class="wrap">`.
- Added one narrowly scoped shared rule in `site-components.css` that gives the wrapper containing the Capabilities local nav the same top and side gutters on all five sibling pages.
- This rule does not target nested content wrappers, avoiding the broad gutter regressions from the earlier v95.30 attempt.


## v95.36 — capability hierarchy + Learning Guide orientation
- Moved the Capabilities local navigation **below** the standardized capability page intro on Overview / Discovery / Measurement / Systems / Evals.
- This makes the hierarchy explicit: global navigation → page identity/intro → local Capabilities navigation → evidence.
- Replaced the Learning Guide's loose Depth / Learning path / Applied throughout text with one compact three-row orientation block:
  - Depth
  - Path
  - Lenses
- Removed the redundant standalone “Learning path” heading and kept the same substantive curriculum wording.
- Styling stays editorial and quiet: no nested cards, pills, or dashboard treatment.


## v95.37 — Capabilities intro standardization
- Removed the pill-style “Capabilities overview” / “Cross-project capability” labels from the Capabilities page family.
- All five capability pages now use the same simple **CAPABILITIES** eyebrow treatment as the sibling Applied Work / Learning Guide page-intro system.
- Preserved each page's specific title and lead copy, followed by the shared Capabilities subnav.
- Removed obsolete pill styling from the shared component layer.


## v95.38 — Capabilities intro-height stabilization
- Fixed the remaining perceived jump within the Capabilities subnav family.
- Root cause: after moving the local nav below the page intro, different lead-copy lengths gave Overview / Discovery / Measurement / Systems / Evals different intro heights, so the subnav moved vertically even though its own styling was identical.
- All five capability intros now reserve the same desktop height, keeping the local nav at a consistent vertical position.
- Mobile remains content-driven rather than using a fixed/minimum intro height.


## v95.39 — explicit Capabilities page shell
- Replaced the remaining inferred/legacy Capabilities-page geometry with one explicit shared `capability-shell` class used by Overview, Discovery & Workflow, Measurement & Value, Systems & Guardrails, and Evals & Quality.
- The shared shell now owns the five pages' outer max width, left/right gutters, top spacing, bottom spacing, intro width/height, and local-nav spacing.
- This intentionally overrides legacy `.wrap` layout rules on the three older Meridian-derived capability pages, including old flex/grid/alignment behavior that could subtly shift content even after newer overrides.
- No other site sections or standalone Meridian pages use `capability-shell`.


## v95.40 — top-level page rhythm alignment
- Compared the Capabilities and Applied Work page openings directly.
- The remaining mismatch was primarily vertical: the standalone Capabilities pages started at artifact-page spacing, while Applied Work / Learning Guide use the main site's larger destination-page top spacing.
- Capabilities now starts 66px below the shared header on desktop, matching the main-site destination-page rhythm, with consistent spacing from intro → local nav → content.
- Removed the earlier artificial fixed/minimum capability-intro height so spacing is governed by the shared page-intro component rather than reserved blank space.
- Horizontal content gutters remain owned by the shared `capability-shell`; no broad page-gutter rules were changed.


## v95.41 — Capabilities global-header frame alignment
- Used the side-by-side screenshots to isolate the remaining visual shift.
- The Capabilities **body content** and Applied Work body content were already approximately aligned; the visible mismatch was the global header, whose brand began materially farther left on the standalone Capabilities pages.
- Added a Capabilities-family body hook and narrowed only the desktop global-header inner frame to match the main index header's visual inset.
- Did not move the Capabilities page shell, intro, local nav, cards, or body gutters.


## v95.42 — canonical global shell architecture
This replaces the recent header-width/margin patching with a structural fix.

- The main index header is no longer nested inside the page-content `.shell`. It now uses the same architecture as standalone pages: **full-width `topbar` → centered `topinner` → separate content container**.
- Removed the v95.41 Capabilities-only header-width exception and its temporary `capability-family` hook.
- Standardized global-header markup across the site to the same brand, four navigation links, action area, and element types.
- `site-shell.css` is now the single authority for global header width, centering, padding, and flex geometry.
- Index Home / Applied Work / Learning Guide remain SPA views; their header links use normal hash URLs and are intercepted by the existing router.
- This is the preferred pattern going forward: fix competing shells/components at the shared-structure level rather than adding page-specific width/margin patches.


## v95.43 — canonical shared content frame
- Kept the v95.42 structural global-header fix.
- Fixed the resulting Home / Applied Work / Learning Guide gutter regression at its root: `index.html` had a historical `.shell { max-width:none; padding:0 }` override that became exposed once the header was moved outside that wrapper.
- Added an explicit `site-content-shell` for the main index views. It owns the main site's max width and horizontal gutters and overrides legacy `.shell` behavior.
- Aligned the Capabilities `capability-shell` to the same 1180px / 28px desktop horizontal frame and 18px mobile gutters.
- Header shell and content shell are now separate components with separate responsibilities; future header changes should not alter page-content gutters.


## v95.45 — regression rollback / safe QA hotfix
- v95.44 is superseded because its full-document HTML parser rewrite caused visual regressions on legacy non-Capabilities pages.
- Rebased on **v95.43**, the last intact shared-shell/content-shell build.
- No legacy standalone page is reserialized or structurally rewritten in this pass.
- Reapplied only safe, surgical fixes:
  - Capabilities Overview Discovery & Workflow card routes to `discovery.html`.
  - Top-level current nav/mobile state is added through direct string edits.
  - Shared focus-visible and reduced-motion CSS.
  - Standalone theme behavior honors system dark mode when no explicit saved preference exists.
- Future QA on legacy pages should inspect/read/validate without rewriting entire documents through an HTML parser unless the page is first migrated to clean shared markup.


## v95.46 — regression guardrails / maintenance infrastructure
No visitor-facing redesign in this pass.

### Added
- `SITE_ARCHITECTURE.md` — canonical ownership/contract for the global shell, content shell, page-intro system, Capabilities local nav, and legacy-page editing rules.
- `qa_regression.py` — **read-only** structural regression checks for links, anchors, duplicate IDs, nav parity, shared stylesheet presence, capability-shell/local-nav invariants, Harborstone disclosure, Agent Flow compact sizing, and canonical Discovery routing.
- `visual-regression-baseline.json` — defined desktop/mobile baseline pages and the visual invariants to compare after shell/design changes.
- `RELEASE_CHECKLIST.md` — the required pre-release workflow for automated + manual regression review.

### Process rule
A QA pass may inspect/validate every page, but must not reserialize legacy HTML. Shared/root-cause fixes remain preferred; legacy migration happens deliberately one stable component family at a time.

### Future maintenance roadmap
1. Keep learning/applied practice as the priority.
2. Use the new regression guardrails for every meaningful site change.
3. Gradually migrate legacy Meridian wrappers/components only when there is a real maintenance benefit.
4. Later: Tracker semantic-main cleanup, nested interactive-card cleanup, formal WCAG contrast/touch-target automation, and optional screenshot automation once a stable local/browser test harness is available.


## v95.47 — restore the intact visual baseline
- Restored all visitor-facing HTML/CSS/JS from **v95.41**, the last build before the v95.42 global-shell restructure changed spacing on Home / Applied Work / Learning Guide and legacy standalone pages.
- Kept the v95.46 regression-guardrail documentation and read-only QA tooling.
- Removed v95.41's temporary Capabilities-only 1080px header-width patch so the standalone header returns to the normal shared 1180px frame.
- Reapplied only safe surgical fixes: canonical Discovery routing, current top-level nav/mobile state, focus-visible, reduced-motion, and system-theme preference.
- New architecture rule: preserve the intact main-site visual frame and make new/standalone pages conform to it; do not restructure the main index to solve a standalone-page alignment issue unless that migration is intentionally screenshot-tested.

## v95.48 — quick-win learning connections
- Added a concise Learning Guide topic on how AI changes software delivery: implementation can compress faster than discovery, integration, validation, rollout, and production risk; estimation therefore needs to account for uncertainty, consequence, integration, and verification rather than coding effort alone.
- Added a few direct Learn → Apply links from retrieval/grounding, software quality/evals, and workflow decomposition to completed Meridian or Harborstone evidence.
- Tightened Home’s “Short on time?” path around finished evidence: the Meridian one-page readout, Capabilities by skill, and Harborstone as the transfer case.
- Preserved the v95.47 visual baseline and architecture. No component consolidation or layout correction was attempted.


## v95.49 — bounded CSS maintenance
- Removed the orphaned closing brace in `site-shell.css`.
- Added CSS brace/comment/string structural validation to `qa_regression.py` for both shared `.css` files and inline `<style>` blocks.
- Centralized the canonical shared light-theme design tokens in `site-shell.css`; removed duplicate page-local copies from the standalone/capability pages while leaving page-specific styles and dark-mode overrides intact.
- Consolidated Discovery's accumulated base/normalization/final style layers into one current block without changing rule order, preserving the v95.48 visual cascade.
- No component consolidation, Capabilities expansion, layout redesign, or index-shell migration was performed.

## v95.50 — roadmap + deliberate-next-practice markers
- Added `ROADMAP.md` as the internal home for approved future work, strict next-release scope, later ideas, and parked technical debt.
- Added concise `CURRENT_STATE.md` so a fresh session can orient to the current source, architecture, evidence boundaries, frozen decisions, and roadmap quickly.
- Added a restrained Learning Guide section, **Where I’m deliberately building next**, covering executed eval/failure diagnosis, customer communication under pressure, and proving/challenging value. These are explicitly planned practice areas, not demonstrated-capability claims.
- Updated release discipline to synchronize the packaged source, persistent Library `CURRENT-SOURCE`, and durable source-of-truth state while preventing opportunistic scope creep.
- Clarified the CSS ownership contract: shared light-theme defaults are centralized; legitimate page/state/dark-mode overrides may remain local.
- No new Capabilities, case-study expansion, component consolidation, or visual redesign.

## v95.51 — navigation + visual consistency cleanup
- Simplified detail-page navigation using hierarchy rather than competing “Back to…” links. Harborstone now uses one accessible Applied Work breadcrumb; redundant Harborstone and tracker back-link rows were removed.
- Reframed the Eval Suite footer as related Meridian evidence rather than pseudo previous/next navigation.
- Removed two redundant/unpolished Home positioning lines.
- Moved the resource-heavy “Go deeper” band into the Learning Guide and replaced the Home ending with a quiet Learning Guide landing link.
- Fixed compact pill/tag behavior inside flex cards so labels do not stretch across the full card width.
- Restyled Harborstone’s “Parking lot for deeper exercises” as a deliberate deeper-practice boundary.
- Added editorial list/body rhythm to the standalone Meridian one-page readout without changing its content or architecture.
- No architecture expansion, new capability pages, or broad component consolidation.

## v95.52 — clarity-first voice pass
- Reworked a bounded set of public-facing passages that read more like consultant documentation than an authored learning portfolio.
- Voice rule: clarity first, then precision, natural language, professionalism, and personality. Conversational wording is used only when it makes the reasoning easier to understand.
- Replaced abstract/passive phrasing with concrete first-person reasoning where the judgment is genuinely mine, especially around adoption, automation bias, weak value, uncertainty, and AI-assisted software delivery.
- Preserved technical terms where they add precision; explained or replaced them where plain language makes the same point more clearly.
- Preserved evidence status, simulated-work disclosures, metrics, substantive decisions, and technical boundaries.
- No visual, navigation, architecture, capability, or case-structure changes.

## v95.53 — voice boundary refinement
- Refined the v95.52 voice pass so the site now has two intentional writing modes.
- Authored work—case reasoning, judgments, reflections, recommendations, and “changed my mind” evidence—can use Paige’s natural first-person voice.
- Reference/instructional material—especially the Learning Guide—uses a clear, neutral editorial voice unless first person adds meaningful learning evidence.
- Removed unnecessary first-person phrasing from selected Learning Guide passages while preserving the clarity improvements from v95.52.
- No changes to evidence, metrics, case decisions, visuals, navigation, architecture, or capability structure.

## v95.54 — Discovery closing-reflection cleanup
- Replaced Discovery’s bottom full-card callout with a quieter closing-reflection treatment so the page ends as a conclusion rather than another evidence card.
- Added a reusable `capability-closing-reflection` component: page-background treatment, subtle divider/left rule, compact editorial label, and restrained typography.
- Kept the underlying Discovery conclusion and evidence unchanged.
- Audited the other capability pages; none currently use the same bottom-card pattern, so no artificial matching sections were added.
- No navigation, architecture, capability, case, or substantive content changes.

## v95.55 — mobile SPA header spacing fix
- Fixed the Home / Applied Work / Learning Guide mobile header at phone widths so the brand, theme control, and page selector no longer compete for one cramped row.
- On the single-page app shell only, the page selector now gets its own full-width row below the brand/theme row at <=560px.
- The standalone Capabilities-family header is intentionally unchanged because its mobile treatment is already working well.
- No content, navigation semantics, capability structure, or desktop layout changes.

## v95.56 — canonical mobile header consistency
- Standardized the SPA mobile header (Home / Applied Work / Learning Guide) to the same one-row geometry used by the Capabilities-family pages.
- Removed the v95.55 two-row mobile exception.
- Kept the brand, theme toggle, and page selector on one row with the same compact sizing/spacing behavior as Capabilities.
- This is a mobile-header consistency fix only; desktop layout, content, navigation semantics, and page architecture are unchanged.

## v95.57 — shared-shell repair + current-practice maintenance
- Restored the complete deployable source package with the shared shell/component assets and Vercel clean-URL configuration.
- Made the shared shell the authoritative responsive header treatment across the SPA and standalone pages; removed the Home-only v95.56 exception, corrected full-width desktop geometry, and allowed the mobile brand/select controls to shrink safely without horizontal overflow.
- Corrected stale Meridian stage/status language in the Case Readout, Agent Flow, Configure compatibility page, and Working Tracker.
- Clarified that any post-pilot reduction in review would be selective and evidence-earned for low-risk, well-supported ticket types—not broad removal of human review.
- Reframed retrieval as an eval-driven design choice that may use hybrid semantic + keyword search, metadata, reranking, simpler context injection, or safe fallback.
- Added explicit context-engineering and agent-harness learning language, including repeated trials, multiple graders, trajectory/tool-use review, and outcome verification for future agentic evals.
- Formalized AI, hybrid, conventional software, process/data repair, and no-build as valid discovery outcomes; value decisions may also replace AI with conventional software.
- Preserved the frozen architecture, existing evidence hierarchy, simulated-work disclosures, and current Meridian eval status.

## v95.58 — top-level destination rhythm correction
- Removed the visible vertical jump between Capabilities and the SPA’s Applied Work / Learning Guide destinations.
- Corrected a CSS-precedence conflict where the older high-specificity v95.35 wrapper rule overrode the intended v95.40 Capabilities top spacing.
- Capabilities now uses the same `66px` desktop destination offset and corresponding `42px` compact/mobile offset as the canonical destination rhythm.
- No header geometry, content, navigation semantics, capability structure, or architecture changes.
## v95.59 — case-first Meridian navigation
- Made the Case Readout the Meridian entry point and executive-summary hub.
- Added one consistent five-step reading path: Case Readout → Discovery & Decisions → Measurement Plan → System Flow → Eval Work.
- Separated Meridian artifacts from cross-project capability summaries using distinct URLs.
- Preserved old URLs as compatibility redirects so existing links and bookmarks do not strand visitors.
- Deferred a separate Meridian hub and Workbench hub because each would currently add an unnecessary intermediate click.
- Removed the fully AI-generated output-proof exercise from the source rather than presenting generated work as authored evidence.
- Repaired the Eval Runner's Boolean scoring, classification display, repeat-result cleanup, keyboard access, and financial/security/account-change guardrail distinctions.
- Aligned Evals & Quality language with the system boundary: high-risk cases are tested for recognition, no-draft behavior, and human escalation; they are excluded only from draft-quality scoring.
- Updated regression checks and the visual baseline for the new page roles.

## v95.66 — Meridian Lab foundation

- Added a separate, same-site working environment for the Support Tool, Eval Runner, Knowledge Base, Run History, and Pilot Dashboard.
- Centralized classification, retrieval, guardrails, drafting, eval cases, and local run records in one deterministic domain module shared by both working tools.
- Added explicit prototype/data boundaries and avoided fake production metrics; the dashboard distinguishes available local evidence from metrics that require a real pilot.
- Added a prominent Meridian overview entry, updated Eval Work calls to action, and retained the old Eval Runner URL as a compatibility redirect.
- Expanded regression coverage to nested Lab HTML/CSS and pinned the architecture boundary in the roadmap.

## v95.67 — Lab entry points + communication brief

- Added a focused Meridian Lab callout to the Case Readout; the intentional Lab entry points are now Overview, Case Readout, and Eval Work.
- Replaced the oversized two-column customer-communication boxes on the Meridian overview with a compact three-part brief: pilot promise, boundaries, and expansion gate.
- Reduced visual density, clarified the evidence boundary, and added responsive one/two/three-column behavior.
- Generalized the shared Lab callout component so future contextual entry points do not require page-specific styling.

## v95.68 — Learning workbench + card actions

- Replaced generic upper-right “Open” cues on Meridian cards with bottom-row, destination-specific actions such as “Read the case,” “Trace the workflow,” and “Launch the Lab.”
- Added a session learning objective that is preserved with each new run.
- Added diagnoses, reflection notes, and next-question fields to evaluation results and the Learning Log.
- Added linked reruns so before/change/after experimentation remains traceable.
- Added saved practice cases and JSON workspace export/import for browser-local backup and continuity.
- Reframed the prototype dashboard around learning evidence while preserving the boundary between local practice and future pilot outcomes.

## v95.71 — Lab result-state and exit navigation

- Restored the expected hidden-state behavior so “No analysis yet” disappears after a Support Tool run.
- Added a compact, native portfolio-return menu with Home, Meridian Overview, Applied Work, and Learning Guide destinations.
- Preserved the portfolio exit on narrow screens instead of hiding it.

## v95.70 — QA and Lab boundary hardening

- Corrected floating-point threshold handling in automatic classification expectations.
- Added executable Meridian core regression tests and wired them into `qa_regression.py`.
- Validated imported workspace and run shapes before writing them to browser storage.
- Associated generated reflection labels with their controls and added polite save-status announcements.
- Added missing Home and Harborstone meta descriptions.

## v95.69 — Shared-audience Lab orientation

- Added a compact, non-modal orientation panel at the Lab entrance with one understandable path for both ongoing learning and first-time readers.
- Preserved a single authentic working experience; no reviewer mode, role switch, or duplicated navigation was introduced.
- Renamed the session field to Experiment Objective and “Save as practice case” to “Save case for later.”
- Explained linked reruns in plain language and added a visible “Prototype activity · not pilot outcomes” dashboard boundary.
