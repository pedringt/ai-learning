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

## AI / model change

Complete this section when the PR changes model-dependent behavior. Use `N/A` when it genuinely does not apply.

- Provider/model/config changed: <!-- No, or old -> new -->
- Prompt/system/context/retrieval/tool schema changed: <!-- No, or summarize -->
- Expected behavior change: <!-- What should get better/different? -->
- Eval/guardrail impact: <!-- Which behavior families/tests protect this? -->
- Expected latency/cost impact: <!-- None known, measured result, or what needs checking -->
- Data sent to a model/third party changed: <!-- No, or describe and update DATA_PRIVACY/RISKS if material -->
- Rollback path: <!-- Revert commit/config/model/prompt, or explain why rollback is not simple -->

Do not treat a model/provider change as a dependency upgrade only. If it can change product semantics, cost, latency, or data handling, review those consequences explicitly.

## Verification

- [ ] `make qa-fast` passed
- [ ] `make qa-release` run if the change is model-sensitive / consequential
- [ ] Regression coverage added for fixed bug where practical
- [ ] Staging/deployed verification completed if required
- [ ] Manual/Cowork trust pass completed if this is a major release/UX change
- [ ] Representative latency/cost checked if the change could materially affect either

### Results

<!-- Report what actually ran, including skips/limitations. Do not present skipped checks as passed. -->

## Release notes / risks

<!-- Known limitations, migration/deploy ordering, accepted P2/P3 findings, data/privacy impact, or follow-up Issues. -->

## Promotion

This PR does **not** imply permission to merge to `staging`, `main`, or deploy to any environment. Promotion requires Paige's explicit authorization for the named destination.
