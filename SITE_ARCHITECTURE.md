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
  - legacy inline CSS may remain until intentionally migrated

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

Capabilities local navigation:
Overview / Discovery & Workflow / Measurement & Value / Systems & Guardrails / Evals & Quality

## Current migration order

1. Shared global shell — stabilized
2. Shared page-content shell — stabilized
3. Shared page intro — stabilized
4. Capabilities local nav — stabilized
5. Legacy Meridian page wrappers — future, page-by-page
6. Legacy inline typography/card rules — future, component-by-component
7. Tracker semantic structure — future, deliberate migration


## Visual baseline correction (v95.47)

The main index's pre-v95.42 nested `.shell` / `.topbar` layout is the current visual baseline.
Do not move the index global header outside that shell without an intentional, screenshot-validated migration.
Standalone pages should conform to the established index visual frame; do not restructure the index merely to match a standalone page.


## CSS maintenance boundary (v95.49)
- Canonical shared light-theme color/design tokens are owned by `site-shell.css`; do not duplicate them into standalone pages.
- Regression QA now treats CSS structure as part of the release surface.
- Discovery's historical normalization layers were mechanically consolidated, but broad page-by-page style/component consolidation remains deferred.
- Capabilities architecture remains frozen until materially different applied evidence warrants expansion.
