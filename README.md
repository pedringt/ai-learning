# AI Customer Success Learning Portfolio — v90.2 Maintenance

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
