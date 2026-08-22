# Site Architecture Contract

This file defines which shared layer owns each repeated visual/system concern.
Use it before making site-wide design changes.

## Ownership

- `site-shell.css`
  - global topbar/header geometry
  - brand/nav/theme/mobile control styling
  - sticky-header/deep-link offsets
  - global interaction states that apply everywhere

- `site-components.css`
  - shared page-content geometry
  - top-level page intro component
  - Capabilities local nav
  - shared cards/callouts/orientation patterns
  - spacing/radius/type tokens used across multiple pages

- `site-shell.js`
  - standalone-page theme behavior
  - standalone mobile navigation
  - shared shell interactions only

- `index.html`
  - Home / Applied Work / Learning Guide content and SPA routing
  - page-specific content/layout only

- standalone HTML pages
  - page-specific content and unique layouts only
  - substantive pages use one `<main>` landmark and one document `<h1>`
  - legacy inline CSS remains a migration target, not a place for new shared rules

- `meridian-lab/`
  - separate working-product surface inside the same static site
  - `lab.css` owns Lab layout and components
  - `meridian-core.js` is the only owner of support/eval domain behavior and run records
  - `lab.js` owns view rendering and local interactions, not domain rules

## Editing rules

1. If the same visible pattern exists on more than one page, change the shared component before adding a page-specific override.
2. Do not alter global header geometry from a page-local `<style>` block.
3. Do not alter shared page gutters from a page-local `<style>` block.
4. Do not reserialize legacy HTML documents through an HTML parser/formatter as part of QA.
5. Prefer direct text/CSS/JS edits that preserve legacy document structure.
6. Migrate legacy pages incrementally, one stable component family at a time.
7. Any structural shell change must be checked against:
   - Home
   - Applied Work
   - Learning Guide
   - Capabilities Overview
   - one capability detail
   - Meridian Tracker
   - Harborstone
8. A QA pass may validate/read all files, but should not rewrite them unless the rewrite itself is the requested migration.

## Canonical top-level information architecture

Home / Capabilities / Applied Work / Learning Guide

Meridian reading order:
Overview / Case Readout / Discovery & Decisions / Measurement Plan / System Flow / Eval Work

Meridian Lab product navigation:
Support Tool / Eval Runner / Knowledge Base / Learning Log / Learning Dashboard

- `case-readout.html` is both the executive-summary entry point and the Meridian hub.
- Meridian artifact pages explain one case in depth.
- Capability pages reorganize evidence across Meridian and Harborstone; they are not Meridian artifacts.
- Do not add a separate Meridian hub unless the Case Readout can no longer orient the case clearly.
- Applied Work remains the Workbench landing surface until multiple shorter cases require a dedicated hub.
- Meridian Lab is a working surface linked prominently from the overview; its modules do not belong in the portfolio's global navigation.
- Lab runs preserve learning context—objective, diagnosis, notes, next question, and rerun lineage—rather than acting only as portfolio-demo output.

Capabilities local navigation:
Overview / Discovery & Workflow / Measurement & Value / Systems & Guardrails / Evals & Quality

## Compatibility routes

`agent-flow.html`, `configure.html`, `deliverable.html`, `discovery.html`, `evals.html`, `plan.html`, and `eval-runner.html` are redirect-only compatibility documents. They are not current content sources and should remain small, explicit, and free of duplicated page content.

## Current maintenance state

1. Shared global shell — stabilized
2. Shared page-content shell — stabilized
3. Shared page intro — stabilized
4. Capabilities local nav — stabilized
5. Meridian wrappers and landmarks — normalized
6. Meridian breadcrumb, header, tabs, and footer navigation — shared
7. Layout invariants — enforced in `qa_regression.py`
8. Remaining embedded legacy CSS — consolidate only alongside screenshot-capable visual QA

## Shared layout invariants

- Substantive standalone pages have exactly one `<main>` and one `<h1>`.
- Meridian detail pages use `.meridian-page-shell`, `.meridian-case-hero`, `.meridian-breadcrumb`, and `.meridian-section-nav`.
- Meridian artifacts end with `.artifact-footer-nav`.
- Shared page width is `--content-max`; shared reading width is `--reading-max`.
- Do not add a page-local topbar, gutter, Meridian header, breadcrumb, tab, button, or footer-nav rule.
- Primary and mobile navigation labels must remain identical; regression QA enforces them.


## Visual baseline correction (v95.47)

The main index's pre-v95.42 nested `.shell` / `.topbar` layout is the current visual baseline.
Do not move the index global header outside that shell without an intentional, screenshot-validated migration.
Standalone pages should conform to the established index visual frame; do not restructure the index merely to match a standalone page.


## CSS maintenance boundary (v95.49)
- Canonical shared light-theme color/design defaults are owned by `site-shell.css`; do not duplicate those defaults into standalone pages. Legitimate page/state-specific overrides, including dark-mode overrides, may remain local.
- Regression QA now treats CSS structure as part of the release surface.
- Discovery's historical normalization layers were mechanically consolidated, but broad page-by-page style/component consolidation remains deferred.
- Capabilities architecture remains frozen until materially different applied evidence warrants expansion.
