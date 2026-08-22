# Release / Regression Checklist

Run before treating a package as the new source of truth.

## Automated read-only check
```bash
python3 qa_regression.py
```

The QA script is read-only. It must never parse-and-reserialize site HTML. It also validates CSS brace/comment/string structure in shared stylesheets and inline `<style>` blocks.

Automated invariants now include:
- exactly one `<main>` and one document `<h1>` on substantive standalone pages
- canonical desktop/mobile navigation labels
- one Meridian contextual nav and footer nav per artifact
- compatibility redirects remain small and explicit
- breadcrumb/header/tab/footer component selectors remain present
- all five Meridian Lab views and their navigation labels
- shared Support Tool / Eval Runner pipeline contract
- Lab learning-workbench controls: experiment objective, reflection, linked reruns, and import/export
- Lab shared-audience orientation and prototype-evidence boundary
- repeat-ticket reset, keyboard submission, hidden-state behavior, and portfolio exit paths
- Meridian domain behavior for confidence thresholds, high-risk guardrails, run persistence, and workspace-import validation

## Manual visual baseline
Use `visual-regression-baseline.json`.

Check both desktop and mobile where relevant:
- Home
- Applied Work
- Learning Guide
- Capabilities Overview
- one capability detail
- Meridian Tracker
- Harborstone
- Meridian Overview, including card actions and the customer-communication brief
- Meridian Lab: Support Tool, Eval Runner, Knowledge Base, Learning Log, and Learning Dashboard

Also check:
- light mode
- dark mode
- global nav does not jump
- page gutters remain consistent
- capability local nav does not jump
- Meridian breadcrumb, header, tabs, and first content block do not jump between artifact pages
- Meridian Lab actions are visible on Overview, Case Readout, and Eval Work without entering global navigation
- Meridian card actions sit after the descriptions and use destination-specific labels
- Lab orientation is compact and does not obscure the Support Tool’s working surface
- objective, diagnosis, notes, saved cases, reruns, export, and import controls remain usable
- Learning Dashboard clearly says prototype activity is not pilot outcomes
- no horizontal overflow
- sticky-header deep links land visibly
- Learning Guide accordions open/close correctly

## Change discipline
- Shared-shell change: inspect all baseline pages.
- Shared component change: inspect every page using that component.
- Page-local change: inspect that page + mobile + dark mode.
- Legacy-page migration: change one page/component family at a time.

## Scope discipline
- `ROADMAP.md` → `NEXT` is the active learning/build scope.
- Newly noticed nonessential work normally goes to the roadmap rather than entering the active release.
- Genuine regressions and required dependencies may be fixed when necessary.
- Treat external review as input: verify the claim against the source before changing code or documentation.

## Source-of-truth synchronization
After automated/manual checks pass:
1. Package the release as `ai-learning-portfolio-vX.zip`.
2. Verify the package contains `CURRENT_STATE.md`, `ROADMAP.md`, and the expected source files.
3. Replace the existing authoritative Library-backed ZIP so its file identity and version history remain continuous.
4. Verify the replacement succeeded and its new version number is recorded.
5. Update `CURRENT_STATE.md`, `MERIDIAN_CONTEXT_SUMMARY.md`, and `ROADMAP.md` when the release changes current facts or priorities.

The current-source Library file is authoritative, not a release archive. Release history belongs in `CHANGELOG.md`; `README.md` documents only the current system.
