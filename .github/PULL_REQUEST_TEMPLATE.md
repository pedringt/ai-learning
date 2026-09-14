## What changed

<!-- Short user/product-facing summary. -->

## Why

<!-- Problem, Issue, decision, risk, or QA finding this addresses. -->

Related Issue: 

## Product impact

- [ ] No material product behavior change
- [ ] Changes State behavior / authority / workflow
- [ ] Changes model prompt, interpretation, grounding, retrieval, or eval behavior
- [ ] Changes deployment / data / migration behavior

If product behavior changed, note any relevant update to `docs/product/DECISIONS.md`, `docs/product/RISKS.md`, or eval coverage.

## Verification

- [ ] `make qa-fast` passed
- [ ] `make qa-release` run if the change is model-sensitive / consequential
- [ ] Regression coverage added for fixed bug where practical
- [ ] Staging/deployed verification completed if required
- [ ] Manual/Cowork trust pass completed if this is a major release/UX change

### Results

<!-- Report what actually ran, including skips/limitations. Do not present skipped checks as passed. -->

## Release notes / risks

<!-- Known limitations, migration/deploy ordering, accepted P2/P3 findings, or follow-up Issues. -->

## Promotion

This PR does **not** imply permission to merge to `staging`, `main`, or deploy to any environment. Promotion requires Paige's explicit authorization for the named destination.
