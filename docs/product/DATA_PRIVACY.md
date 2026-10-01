# State data and privacy assumptions

## Current portfolio reality

State is a portfolio/learning product, not a deployed company system with real teams. Public/demo data should be seeded, synthetic, or test content. Portfolio reviewers should not submit confidential employer information, customer data, credentials, regulated data, or sensitive personal information.

Do not describe hypothetical enterprise controls as already implemented unless the repository and deployed system enforce them.

## Product Analytics privacy boundary

The internal Product Analytics page is intentionally **content-minimizing**. Its purpose is to understand product use, workflow burden, reliability, and controlled AI quality without turning analytics access into project-content access.

### What may be persisted as product analytics

Only approved metadata such as:

- anonymous per-tab session id;
- project id when known;
- environment and build label;
- referral label;
- approved State view name;
- event outcome/status;
- bounded duration in milliseconds;
- outbound destination origin only.

The browser and server both use explicit schemas/allowlists. Unknown properties are not treated as safe by default.

### What product analytics must not contain

- raw Ask query text or Ask answer bodies;
- Evidence bodies;
- Review decision text/rationale;
- Question text;
- Current State statements;
- uploaded file contents or filenames when avoidable;
- model prompts/responses;
- traces containing source content;
- credentials, secrets, access tokens, or full external URLs with paths/query strings.

Authoritative Evidence/Review/Question/History records remain in State because the product itself needs them. The analytics store does not copy that content.

## Analytics storage and retention

State's first-party usage metadata is stored in `product_analytics_events` in the existing State database. Controlled eval aggregates are stored separately in `product_eval_runs`.

- usage events: retain up to **90 days**;
- controlled eval aggregates: retain up to **365 days**;
- pruning happens opportunistically during analytics reads/writes;
- staging remains ephemeral and may lose analytics data after deploys/restarts.

Because State has no authenticated admin role in the portfolio demo, the current cross-project Product Analytics page is appropriate only for synthetic/demo data. A real company deployment would require authenticated admin authorization/RBAC before exposing cross-project aggregate analytics.

Product Analytics access should not imply permission to open the underlying project. The dashboard therefore avoids a direct `Open State` project-content affordance.

## Controlled eval data

Reusable eval fixtures should remain synthetic/curated unless a separately approved privacy-safe process exists for real customer data.

The dashboard may ingest aggregate eval results such as precision, recall, miss/error counts, build, provider, and model identifier. It must not ingest scenario Evidence, prompts, model responses, or trace bodies merely to make a dashboard richer.

Eval result ingestion requires a server-side `STATE_EVAL_INGEST_KEY`. The key must never be shipped to the browser.

## If State were a real company product

Before connecting real Slack channels, documents, transcripts, or other company sources, product and engineering would need explicit controls for:

### Source authorization and least privilege
- Connect only sources a customer/admin explicitly approved.
- Use narrow scopes and preserve source identity/provenance.
- Never let an AI model expand its own access.

### Sensitive data and secrets
- Define which categories of personal, financial, health, legal, credential, and customer data may enter State.
- Detect/block obvious secrets where practical.
- Keep unnecessary source text out of logs, traces, errors, and analytics.

### Model/provider data handling
Verify provider retention, training use, residency, subprocessors, deletion, and incident expectations. A provider/model change can be a privacy change.

### Retention and deletion
Define retention independently for Evidence, Current State, Questions, Reviews, History, source files, traces, logs, usage analytics, and eval aggregates. Account/project deletion behavior must include analytics metadata where applicable.

### Tenant/project isolation
Project/customer identity must be explicit at every read/write boundary. Cross-project exposure is a release-blocking integrity/privacy failure. Authorization belongs in software, not prompts.

### Human transparency
Make it clear when information is sent to an AI model and which sources are connected. Meeting/transcription sources require explicit notice/consent decisions before use.

## Change-review rule

A PR should explicitly call out data/privacy impact when it:

- adds a new source or connector;
- sends new data to a model/third party;
- changes logging/tracing/analytics payloads;
- changes retention/deletion behavior;
- changes tenant/admin authorization boundaries;
- changes provider/model data handling.

Update `RISKS.md` and this file when those changes are material.


## Project Health privacy boundary

Project Health is a portfolio-operations surface across State, Tastemake, and NARC. It may read deployment, infrastructure, database-project metadata, aggregate site analytics, and controlled quality results from external providers.

Allowed Project Health data is intentionally narrow:

- repository/branch/commit identifiers and CI/deployment status;
- Render service reachability, build identifier, and bounded response latency;
- Neon project/branch health metadata such as project name, region, branch count, and primary-branch state;
- Vercel Web Analytics aggregate visitor/page-view counts;
- the same content-free controlled eval aggregates already allowed above.

Project Health must not expose provider API keys, database connection strings, raw logs, visitor identities, request bodies, State project content, model prompts/responses, or detailed traces merely to make the dashboard richer. Provider credentials stay server-side in environment variables. Missing provider credentials or telemetry are shown as "not connected" rather than inferred.

The dashboard-run control is a separate authorization boundary from read-only health data. It requires a server-side GitHub credential, a separate admin key, a configured cost estimate, and an explicit confirmation of paid model calls before dispatching a workflow. Those secrets must never be shipped to the browser.
