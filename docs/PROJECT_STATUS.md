# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository before relying on older handoffs or conversation memory.

## Current production state

_Last updated: September 10, 2026 after the reviewer-orientation / Ask cleanup was promoted to production._

- Production branch: `main`.
- Review branch: `staging`.
- Latest reviewed product/UI cleanup was promoted through PR #99, **Promote State cleanup to main**.
- PR #99 merge commit: `9bed95c134d0ef2766d762c23a6960c3b7b6a226`.
- Vercel production deployment for that merge is green.
- `main` and `staging` contain the same reviewed product/UI changes; this handoff update itself is a documentation-only commit on `main`.
- **Hard rule: all product/site changes go to `staging` first. Never push or merge product/site changes to `main` without the user's explicit confirmation.**

Production site:

- Portfolio: https://ai-learning-rouge.vercel.app/
- State case study: https://ai-learning-rouge.vercel.app/implementation-context
- State product: https://ai-learning-rouge.vercel.app/implementation-context-prototype/

## What changed on September 10

A review/polish batch was explored, then simplified after live review.

### Reviewer orientation

State now has a compact **Exploring State?** reviewer banner that points a first-time reviewer toward:

1. Open Items
2. Current State
3. Ask State

The banner is dismissible and remembers dismissal in local storage.

A **Quick tour** reopen control exists, but it must be hidden while the banner itself is visible. Once the banner is dismissed, the reopen control becomes available. This avoids showing two controls that appear to do the same thing.

Do not expand this into a larger tutorial/menu unless explicitly requested.

### Ask navigation and cleanup

Ask keeps the useful record-level navigation added during the review pass:

- Review items can open the matching Review.
- Question / Blocking Question items can open the matching Question.
- Current State items can use **View current ->** to jump to the matching maintained fact.

The Current State jump uses the real `record_id` / state ID. Do not replace this with text matching.

Ask also deduplicates repeated record-backed items in its answer payload before rendering.

During review, the separate provenance/grounding appendix was judged redundant because the same records were already presented and linked inline in the answer. The UI now hides:

- the **Grounded in State's project record** disclosure
- its project-item count and repeated record list
- the separate **Related open items** summary

Keep the inline Review / Open / View current links. The goal is provenance where it is useful, not a second copy of the answer.

### State case-study screenshots

Four State product screenshots were briefly added to the flagship case study. The first uploaded WebPs were broken/blank, and later replacements rendered but were visibly too blurry at case-study display size.

The reviewed decision was to **remove the screenshots from view rather than ship blurry UI**.

Current implementation:

- screenshot markup/assets may still exist in the repo
- `state-case-visuals.css` hides `.state-product-shot` and `.state-product-evidence-grid`
- the case-study narrative, captions/layout around the rest of the page, and product links remain intact

Do not reintroduce screenshots unless the user explicitly asks and the images can be verified sharp at their actual rendered size. Prefer a true full-resolution solution rather than aggressively downscaled WebPs.

## Latest portfolio state

The portfolio is review-ready / near-freeze. Avoid broad redesign or cleanup work unless explicitly requested.

### Homepage / Applied Work

The homepage already leads with **Applied work · start here** and puts State + Legal AI up front. The case studies are not buried.

Stable Applied Work hierarchy:

- **Primary work:** State + Legal AI Governance
- **Supporting work:** Testing & Debugging State + State Architecture & Cost + Meridian AI Support Pilot

Do not revisit homepage hierarchy just because older reviews said work was buried; that feedback is stale relative to the current page.

### State case-study family

- `implementation-context.html` is the main State case study.
- `state-testing-debugging.html` is the supporting validation/failure-investigation case.
- `state-architecture-cost.html` is the supporting before-vs-after architecture/cost case.

The flagship story is intentionally concise:

**Problem -> What I built -> Key product decision -> How it evolved -> What I'd test next -> Where I landed**

Detailed debugging/eval and architecture/cost material lives in the supporting cases rather than being duplicated on the flagship page.

### Legal AI

Legal AI is already strong enough for the current portfolio. It includes discovery, evidence, the turning point, earlier-vs-corrected framing, and the conclusion that the gap is real but an offering should not yet be proposed.

Do not expand it just to add volume.

### Portfolio positioning and privacy

- Keep the portfolio focused on applied AI product judgment, not engineering identity.
- Background framing should stay grounded in QA and project management.
- AI implementation leverage should be credited clearly where relevant.
- Keep public portfolio branding anonymous unless explicitly asked to add the owner's name.
- Avoid invented metrics.
- Avoid jargon and engineering-heavy framing when simpler product language works.

## State product boundaries

State maintains a trustworthy answer to:

> **What should this project treat as true right now?**

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
- Ask has clearer record-level navigation without a redundant grounding appendix.
- Ask action targets have a mobile readability/tap-size floor.
- Workspace emphasizes what needs attention, recent changes, and Current State orientation.
- The reviewer Quick tour reopen control is hidden while the orientation banner is visible.
- Settings navigation freeze caused by a mutation-observer loop was fixed.
- Notes shows result-summary UI only when search/filters are active, including clear-filter/no-results behavior.
- Current State loading remains deliberately stricter than some Workspace sections so authoritative state does not flash seeded/fake values.
- The authority copy should stay **people authorize**, not **people decide**.

## Known product questions / later validation

These are product questions, not obvious bugs. Do not start them automatically just because they are listed here.

- **Review burden:** does the human-control model create too much work?
- **Source completeness:** can State stay trustworthy if important project sources are missing?
- **Generalization:** does the current structure work outside the Northstar demo/project type?
- **Usability + speed:** can an unfamiliar user understand the model, and is Ask fast enough?
- **Paused/reversed decisions:** decide whether a paused/reversed decision needs a distinct `proposed_update` path rather than the current `state_at_risk` behavior.

A separate unfamiliar-user validation/eval pass was discussed but intentionally left for later. Do not conflate that with ordinary polish work.

## Planned cleanup pass

Keep this separate from product/portfolio feature work.

1. **Baseline / hygiene**
   - verify branch state
   - run the normal tests
   - remove only clearly obsolete branches/files

2. **CSS cleanup**
   - remove only proven-dead non-media CSS first
   - consolidate inline/version-stamped styles only where cascade equivalence is demonstrated
   - do not use cleanup as an excuse for another visual redesign

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

## Deployment / workflow rules

- `main` is production and `staging` is the review branch.
- Product/site work goes to `staging` first.
- **Never promote to `main` without explicit user confirmation in the current conversation.**
- Do not interpret a request such as "fix it" as permission to merge to main.
- Vercel Hobby/build-rate limits have been hit during high-volume iteration before. A pending/rate-limited preview alone is not evidence of broken code.
- Batch low-value pushes where possible.
- When a visual asset is involved, verify the actual rendered pixels/quality rather than treating HTTP 200 as sufficient.

## Recent PR trail

- **PR #95:** reviewer / case-study polish batch, including reviewer orientation, Ask Current State navigation, mobile Ask target adjustments, and initial screenshot treatment.
- **PR #98:** replacement screenshot assets after the first image files rendered blank. Those replacements were later judged too blurry in the live case study.
- **PR #99:** reviewed cleanup promoted to production. Screenshots hidden, redundant Ask grounding/open-items UI removed, Quick tour behavior preserved, inline Ask links retained.

## Current release summary

The production portfolio presents State as the flagship product with two supporting State cases, while preserving Legal AI and Meridian as separate demonstrations of opportunity evaluation and workflow thinking. State's current review path is intentionally simpler than the first September 10 polish attempt: the case study no longer shows blurry screenshots, Ask keeps inline record navigation without repeating the same records in a grounding appendix, and the reviewer orientation controls no longer compete with each other.

The portfolio is suitable for a pause/freeze unless the user identifies a specific issue or explicitly asks for the next validation/cleanup phase.
