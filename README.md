# AI Customer Success Learning Portfolio — v89

v89 is a consolidation + scannability release built from v88.2.

## v89 regression fix
- Restored top-nav routing with a dedicated, single-purpose router.
- Made the desktop and mobile primary navigation static and limited to Home / Meridian / Portfolio / Learning Library, preventing legacy AI Customer Success and Workbench items from resurfacing when cleanup scripts are removed.
- Kept content assembly separate from navigation behavior.

## v89 changes
- Flattened the accumulated Meridian/Portfolio hierarchy patches out of `index.html`; legacy runtime injectors and hidden mini-nav code were removed rather than layered again.
- Preserved the settled four-artifact Meridian hierarchy: Discovery & Decisions, Success Measurement Plan, Agent Flow & Guardrails, and Eval Suite.
- Added a compact Meridian **Situation / Approach / What I built** fast-read without implying fictional pilot outcomes.
- Added a new, explicitly labeled **Meridian AI-output proof exercise** showing mock retrieved knowledge, an AI-generated draft, human review, and an approved response.
- Added an explicit transparency note: Meridian and the exercise are fictional/mock; AI was used to generate and iterate on practice material; the portfolio claim is the human reasoning, critique, and workflow decisions.
- Simplified the Learning Library into collapsible Foundations and AI Systems groups while preserving the underlying learning content.
- Added small-screen status/card wrapping polish.
- No framework/SPA/SSR/SSG migration.

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
