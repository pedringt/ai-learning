# AI Customer Success Learning Portfolio — v89.4

v89.4 is a regression-recovery rebuild from the known-good v88.2 visual baseline.

## v89.4 scope
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


## v89.4 live-render regression fix
- Removed the surviving v88 Portfolio runtime wrapper that was collapsing the entire Portfolio page after load.
- Portfolio supporting evidence is visible on the page again; it is no longer hidden behind “More portfolio notes…”.
- Restored Go deeper as an explicitly styled shared footer inside the site wrapper.
- Added a regression check that fails if legacy scripts dynamically create/wrap Home, Meridian, or Portfolio structure.
