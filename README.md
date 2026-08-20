# AI Customer Success Learning Portfolio — v91.0 Final Maintenance

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
