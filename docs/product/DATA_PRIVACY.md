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

### Authority Lab evidence export (#517)

The review interpretation suite's results can be exported as evidence for Authority Lab (`pedringt/authority-lab`, a **public** repository), which judges what State's interpretation step may do. The export (`eval/authority_lab_export.py`) is aggregate-only:

- counts and rates (scenarios passed, interpretation quality, high-severity failures, consequential evidence that missed Review, unnecessary Reviews, unsafe-direction misses, errors), with severity groups and kinds of risk as segments;
- version identifiers: provider, model, build, a prompt fingerprint (a hash of the instruction text and prompt-rendering code, not of any rendered prompt) and an eval-set fingerprint;
- the run's id and its GitHub Actions link.

It never includes scenario ids, Evidence, Current State, Questions, proposals, rationales, prompts, model output or traces; a test checks this. Only controlled synthetic eval runs are exported. Production activity is not, because production holds seeded demo data and resettable visitor activity, which isn't meaningful production evidence (Paige, Oct 12). Delivery to Authority Lab is a pull request to that repository (#518), so anything exported becomes public.

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
- whether Vercel Web Analytics is connected and receiving page views (30 days) and whether any arrived in the last 7 days, as booleans; the server reads aggregate counts but does not return them (Oct 11);
- the same content-free controlled eval aggregates already allowed above.

Project Health must not expose provider API keys, database connection strings, raw logs, visitor identities, request bodies, State project content, model prompts/responses, or detailed traces merely to make the dashboard richer. Provider credentials stay server-side in environment variables. Missing provider credentials or telemetry are shown as "not connected" rather than inferred.

The dashboard-run control is a separate authorization boundary from read-only health data. Since Sept 28 (064ddac) it no longer uses an admin key: it needs a server-side GitHub credential, a configured cost estimate and an explicit paid-call confirmation, and it is meant to work only from a protected (Vercel-login) deployment. On Oct 16 the public production dashboard still reported `can_run_here: true`, so that guard does not hold there; Paige accepted anyone being able to start runs for now (DEC-012). Those secrets must never be shipped to the browser.

The failure investigator (`api/project-health-investigate.js`) sends one bounded evidence bundle to Anthropic per request: failed check names, titles and summaries, the Vercel deployment's error fields and filtered build-output lines, the related commit message, and (Oct 16) an excerpt of each of the first two failed GitHub Actions job logs: at most 25 error-looking lines (or the last 25 lines), 300 characters a line and 3,000 characters a job. Every line goes through the same redaction as the rest of the evidence (bearer tokens, Anthropic/GitHub/Slack/Vercel tokens, `*_KEY`/`*_TOKEN`/`*_SECRET`/`*_PASSWORD` assignments, and every URL outside github.com and vercel.com). Job logs come only from the four allowlisted repositories, which are public, and are read with the server-side `GITHUB_TOKEN`. They are not stored. The investigator does not check an admin key, so anyone who can reach the endpoint can trigger one Haiku call while a project has a current failure; Paige accepted that for now (DEC-012).
