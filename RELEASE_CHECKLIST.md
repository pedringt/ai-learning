# Release / Regression Checklist

Run before treating a package as the new source of truth.

## Automated read-only check
```bash
python3 qa_regression.py
```

The QA script is read-only. It must never parse-and-reserialize site HTML. It also validates CSS brace/comment/string structure in shared stylesheets and inline `<style>` blocks.

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

Also check:
- light mode
- dark mode
- global nav does not jump
- page gutters remain consistent
- capability local nav does not jump
- no horizontal overflow
- sticky-header deep links land visibly
- Learning Guide accordions open/close correctly

## Change discipline
- Shared-shell change: inspect all baseline pages.
- Shared component change: inspect every page using that component.
- Page-local change: inspect that page + mobile + dark mode.
- Legacy-page migration: change one page/component family at a time.
