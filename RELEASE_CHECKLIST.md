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

## Scope discipline
- `ROADMAP.md` → `NEXT RELEASE` is the approved release scope.
- Newly noticed nonessential work normally goes to the roadmap rather than entering the active release.
- Genuine regressions and required dependencies may be fixed when necessary.
- Treat external review as input: verify the claim against the source before changing code or documentation.

## Source-of-truth synchronization
After automated/manual checks pass:
1. Package the release as `ai-learning-portfolio-vX.zip`.
2. Verify the package contains `CURRENT_STATE.md`, `ROADMAP.md`, and the expected source files.
3. Upload a persistent Library copy as `CURRENT-SOURCE-vX.zip`.
4. Verify the new Library package is present and readable.
5. Remove the superseded `CURRENT-SOURCE-vPrevious.zip` only after verification.
6. Update durable project memory/source-of-truth state to the new version.

The Library folder is an authoritative-current-source location, not a release archive. Release history belongs in `README.md`.

