# State product operating docs

These files are the human-facing product system for State. Keep them lightweight and current. GitHub remains the system of record for work, while these docs preserve durable product judgment.

State is a portfolio/learning product. Some docs intentionally practice what an AI PM would need for a real product, but hypothetical production planning must stay clearly separated from actual portfolio/demo use.

## Start here

- `PRODUCT_BRIEF.md` — canonical product definition, audience, problem, principles, workflows, and portfolio boundary
- `DECISIONS.md` — settled product decisions and why they were made
- `RISKS.md` — known product/AI risks, mitigations, and current status
- `METRICS.md` — product-quality measurement design and how to practice it honestly without real-user metrics
- `DATA_PRIVACY.md` — current portfolio data boundary plus hypothetical real-product privacy/data requirements
- `GITHUB_PROJECT_SETUP.md` — State Product board workflow, fields, statuses, views, and automation
- `../PROJECT_STATUS.md` — current implementation/release state
- `../../QA.md` — canonical QA process
- `../../RELEASE.md` — release-readiness and rollback checklist
- `../evals/README.md` — eval registry and ownership
- `../incidents/README.md` — incident/postmortem process

## Working rules

- Read `PRODUCT_BRIEF.md` before materially changing the product thesis, audience, core workflow, or success definition.
- Use GitHub Issues for actionable bugs, features, product questions, AI behavior failures, and tech debt.
- Use these docs for durable context that should outlive any single issue or PR.
- Link decisions, risks, incidents, and eval changes back to the relevant Issue/PR when possible.
- Do not turn this folder into a second backlog.
- Prefer short entries with links over long narrative documentation.
- Do not invent customers, adoption, pilot results, or stakeholder evidence. Realistic AI PM exercises are encouraged, but label hypothetical production work honestly.
