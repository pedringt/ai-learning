# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository before relying on older handoffs or conversation memory.

## Current production state

_Last updated: September 9, 2026 after the latest portfolio/case-study batch was promoted to production._

- `main` and `staging` are in sync at `f975ec0` before this handoff-only update.
- Production Vercel deployment for that release is green.
- The main-branch GitHub Actions test workflow completed successfully.
- Future product/site changes should still go to `staging` first. Do not promote to `main` without explicit user authorization.

## Latest portfolio state

The portfolio is in a review-ready / near-freeze state. Avoid broad redesign or cleanup work outside the planned cleanup pass.

### Applied Work

The stable, intentionally plain layout is restored:

- **Primary work:** State + Legal AI Governance
- **Supporting work:** Testing & Debugging State + State Architecture & Cost + Meridian AI Support Pilot

A more visual State flagship treatment with a Workspace screenshot was explored, but the current CSS layering made the layout fragile. That redesign was intentionally backed out. Revisit only after the planned CSS cleanup.

### State case-study family

- `implementation-context.html` is the main State case study.
- `state-testing-debugging.html` is the supporting validation/failure-investigation case.
- `state-architecture-cost.html` is the supporting before-vs-after architecture/cost case.

The main State case is intentionally shorter now. Its story is:

**Problem -> What I built -> Key product decision -> How it evolved -> What I'd test next -> Where I landed**

Detailed validation/debugging and architecture/cost material lives in the two supporting cases rather than repeating on the flagship page.

### Portfolio positioning and privacy

- Keep the portfolio focused on applied AI product judgment, not on presenting the owner as an engineer or as an "evals person."
- Background framing should stay grounded in **QA and project management**, with most hands-on historical QA being manual.
- AI implementation leverage should be credited clearly where relevant, especially automated testing and implementation work beyond the owner's coding experience.
- **Keep public portfolio branding anonymous for now. Do not add the owner's personal name unless explicitly requested.**
- The non-Meridian case-study eyebrow text that looked like stray oversized purple copy has been removed.
- Legal AI's accidental personal-name brand leak has been removed.

## State product boundaries

State maintains a trustworthy answer to: **What should this project treat as true right now?**

Its authority model remains:

> **AI interprets -> software enforces -> people authorize.**

Core objects:

- **Evidence / Notes:** immutable source material and observations
- **Current State:** maintained, human-approved project understanding
- **Reviews:** human authorization for consequential changes
- **Questions:** explicit unknowns/blockers
- **History:** accepted transitions with provenance
- **Ask:** read-only use of maintained context

Do not weaken the authority boundary for convenience. AI may interpret or propose changes, but only a person authorizes a consequential Current State transition.

For architecture, runtime paths, local setup, and component ownership, use the root `README.md` as the detailed source of truth.

## Recent product/UI fixes worth preserving

- Ask is a persistent read-only drawer, not an inline Workspace card.
- Workspace emphasizes what needs attention, recent changes, and Current State orientation.
- Settings navigation freeze caused by a mutation-observer loop was fixed.
- Notes shows result-summary UI only when search/filters are active, including clear-filter/no-results behavior.
- Current State loading remains deliberately stricter than some Workspace sections so authoritative state does not flash seeded/fake values.
- The authority copy should stay **people authorize**, not **people decide**.

## Known product questions / open validation

These are product questions, not obvious bugs:

- **Review burden:** does the human-control model create too much work?
- **Source completeness:** can State stay trustworthy if important project sources are missing?
- **Generalization:** does the current structure work outside the Northstar demo/project type?
- **Usability + speed:** can an unfamiliar user understand the model, and is Ask fast enough?
- **Paused/reversed decisions:** decide whether a paused/reversed decision needs a distinct `proposed_update` path rather than the current `state_at_risk` behavior.

## Planned cleanup pass

Keep this separate from product/portfolio feature work.

1. **Baseline / hygiene**
   - verify `main` and `staging` are synced
   - run the normal tests
   - remove only clearly obsolete branches/files

2. **CSS cleanup**
   - remove only proven-dead non-media CSS first
   - consolidate inline/version-stamped styles only where cascade equivalence is demonstrated
   - do not use the cleanup as an excuse for another visual redesign

3. **Controller architecture review**
   - inspect current patch/module layering and simplify only where ownership is clear

4. **Runtime naming cleanup**
   - consider renaming `phase2_current/` only after the frontend is stable and the full suite is green
   - remember that it is currently runtime/load-bearing despite the misleading name

Separate from the above: question-resolution Evidence provenance may need a schema/data migration and should be treated as its own design change.

## Do not introduce during cleanup

Unless explicitly requested, leave these alone:

- React/Vue/framework rewrite
- ES-module conversion that breaks direct `file://` support
- vector DB / RAG infrastructure
- agents
- ORM migration
- auth / organizations / multitenancy
- enterprise-architecture expansion

## Deployment notes

- Vercel Hobby/build-rate limits have been hit during high-volume iteration before. A pending or rate-limited preview is not by itself evidence of broken code.
- `main` is production and `staging` is the review branch.
- Batch low-value pushes where possible.

## Current release summary

The production portfolio now presents State as the flagship product, with two smaller supporting State cases for deeper evidence, while preserving Legal AI and Meridian as separate demonstrations of opportunity evaluation and workflow thinking. The main State case is shorter, the public branding is anonymous, and the current Applied Work layout intentionally favors stability over another visual redesign until CSS cleanup is complete.
