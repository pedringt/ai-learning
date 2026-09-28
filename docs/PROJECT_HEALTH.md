# Project Health

Project Health is a portfolio-operations dashboard for Paige's active product work. It is intentionally product-facing rather than a replacement for Vercel, Render, Neon, GitHub, or dedicated eval tooling.

## V1 projects

- State
- Tastemake
- NARC

## Common health layers

- Delivery: GitHub branch/commit status plus Vercel commit status.
- Infrastructure: Render service health where a project has a Render backend, plus optional Neon project/branch metadata.
- Site analytics: production Vercel Web Analytics aggregate visitor/page-view counts.
- Product quality: project-specific checks. State currently reuses its content-free Review/Ask quality aggregates.
- Attention: plain-language interpretation of concrete signals; no combined health score.
- Run controls: guarded project-specific health workflows where one is explicitly configured.

## Server-side configuration

The dashboard works without these variables, but unavailable integrations stay labeled as not connected.

### Vercel Web Analytics

- `VERCEL_TOKEN`

The token stays server-side. Project Health only returns aggregate visitor/page-view counts for the three allowlisted Vercel project IDs.

### Neon health

- `NEON_API_KEY`
- `PROJECT_HEALTH_NEON_PROJECT_STATE`
- `PROJECT_HEALTH_NEON_PROJECT_TASTEMAKE`
- `PROJECT_HEALTH_NEON_PROJECT_NARC`

Only configure a project-id variable when that project actually uses the corresponding Neon project. Project Health returns only project/branch health metadata, not connection strings, roles, query results, or credentials.

### Dashboard-run controls

State's existing staging-only controlled eval workflow can be dispatched from Project Health only when all of these are configured:

- `GITHUB_TOKEN` with the minimum repository Actions permission required to dispatch the allowlisted workflow
- `PROJECT_HEALTH_RUN_KEY`, a separate admin secret entered by Paige when starting a run
- `PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE`, a human-maintained cost estimate shown before confirmation

The run endpoint allowlists the repository, workflow file, and `staging` ref in code. It does not accept arbitrary workflow names or refs from the browser.

State's current run describes at least 16 controlled cases (8 Review interpretation + 8 Ask quality) plus the existing live walkthrough. The dashboard must show the configured estimated cost and receive an explicit paid-call confirmation before dispatch.

## Privacy boundary

Project Health may show deployment metadata, service reachability/build identifiers, bounded latency, Neon project/branch health metadata, aggregate Vercel traffic counts, and content-free eval aggregates.

It must not expose provider tokens, database connection strings, raw logs, visitor identities, State project content, prompts, answers, Evidence, Review text, Question text, Current State statements, or detailed traces.

See `docs/product/DATA_PRIVACY.md` and R-020 in `docs/product/RISKS.md`.


### On-demand investigation

The first investigation version is limited to failed Vercel deployments and failed GitHub checks. It verifies the current allowlisted branch server-side, reads the matching provider evidence, and may follow up with Vercel build output or the related commit/PR when the first source is inconclusive. It sends bounded, sanitized evidence to Anthropic for one short summary. The model cannot call tools or select URLs.

Configure these server-side in the Project Health Vercel project before enabling the feature:

- `ANTHROPIC_API_KEY`
- `PROJECT_HEALTH_INVESTIGATION_KEY`, a separate admin key used only to authorize investigation requests

The existing `VERCEL_TOKEN` is used to read Vercel deployment metadata/build output. GitHub check details are read from the public repository API. Do not reuse `PROJECT_HEALTH_RUN_KEY`; that key is only for dispatching paid State eval runs.

The UI asks for confirmation before sending one investigation request to Anthropic. Each request is read-only, limited to the selected project/environment, and uses one model summary call with a fixed output-token cap. Logs/check output are treated as untrusted text and never executed. No Slack, database, code-writing, workflow-dispatch, issue-creation, or deployment access is included.
