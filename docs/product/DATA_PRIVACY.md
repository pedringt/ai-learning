# State data and privacy assumptions

## Current portfolio reality

State is a portfolio/learning product, not a deployed company system with real teams using it.

The intended data for the public/demo experience is seeded, synthetic, or test content. Portfolio reviewers may enter demo information while exploring the product, but they should **not** submit confidential employer information, customer data, credentials, regulated data, or sensitive personal information.

Do not describe hypothetical enterprise controls in this file as controls that are already implemented unless the repository and deployed system actually enforce them.

## Portfolio analytics boundary

The first State Product Health dashboard is based on State-owned lifecycle records and existing operational telemetry. It does not require a paid browser-analytics product.

### Current browser behavior

`context-analytics.js` does not load Vercel Web Analytics and does not send custom events anywhere by default.

Existing product call sites still use a compatibility interface so a future first-party collector can be added deliberately without rewriting the UI. If such a collector is installed, owner/QA activity marked with `paigeOwnerMode` remains excluded.

### What a future first-party collector may include

Only metadata needed for product learning, such as:

- anonymous per-tab session id;
- referral label such as `?ref=kim-review`;
- active project id;
- environment and frontend build label;
- event names and bounded operational metadata such as route, outcome, or timing.

### What browser analytics must not include

Browser analytics must not include:

- raw Ask query text;
- Evidence bodies;
- Current State statements;
- uploaded file contents;
- Ask answer bodies;
- model prompts;
- credentials, secrets, or tokens.

Outbound-link events, if a future collector is installed, should record destination origin only rather than full URLs because URL paths and query strings can contain sensitive information.

Any future change that actually enables browser-event persistence must define where the events are stored, how long they are retained, and how they can be deleted before the implementation is treated as release-ready.

## If State were a real company product

Before connecting real Slack channels, documents, transcripts, or other company sources, product and engineering would need explicit decisions and controls in the following areas.

### Source authorization and least privilege

- Connect only sources a customer/admin has explicitly approved.
- Use the narrowest practical scopes and channel/document permissions.
- Preserve source identity and provenance so imported information can be traced back to an authorized source.
- Do not let a model or agent expand its own access beyond the permissions granted by the system.

### Sensitive data and secrets

- Define which categories of personal, customer, financial, health, legal, credential, and other sensitive data may or may not enter the system.
- Detect or block obvious secrets and credentials where practical.
- Avoid placing unnecessary sensitive source text in prompts, traces, logs, error reports, or analytics.
- Treat a change that sends a new category of data to a model/provider as a product and privacy change, not merely an implementation detail.

### Model/provider data handling

For every provider/model used with real company data, verify rather than assume:

- whether prompts/outputs are retained and for how long;
- whether customer data can be used for provider training;
- regional/data-residency options where relevant;
- subprocessors and contractual terms;
- deletion and incident-response expectations.

A provider switch or model-hosting change should trigger a fresh check if the data-handling terms differ.

### Retention and deletion

- Define retention separately for Evidence, Current State, Questions, Reviews, History, logs, traces, and uploaded source files.
- Decide what deletion means when Evidence/History are intentionally immutable for audit purposes.
- Make customer/account deletion behavior explicit rather than assuming database-row deletion is sufficient.
- Ensure backups and observability systems follow the intended retention policy.

### Logging, tracing, and evals

- Prefer metadata and redacted excerpts over full sensitive payloads when full content is unnecessary.
- Control who can view traces and logs.
- Keep production/customer data out of reusable eval fixtures unless there is an approved, privacy-safe process for doing so.
- Separate synthetic eval data from real customer data.

### Tenant/project isolation

- Project/customer identity must be explicit at every read/write boundary.
- Cross-project or cross-customer data exposure is a release-blocking integrity/privacy failure.
- Authorization must be enforced by software, not by prompt instructions or model behavior.

### Human transparency and consent

- Make it clear when information is being sent to an AI model.
- For meeting/transcription sources, define notice/consent requirements before ingesting recordings or transcripts.
- Give users/admins a clear understanding of which sources are connected and how to disable them.

## Change-review rule

A PR should explicitly call out a data/privacy impact when it:

- adds a new source or connector;
- sends new fields/content to a model or third party;
- changes logging/tracing payloads;
- changes retention/deletion behavior;
- changes project/tenant authorization boundaries;
- changes provider/model in a way that affects data handling.

When one of those changes is material, update `RISKS.md` and this file as needed before treating the change as release-ready.

## Portfolio boundary

These requirements are intentionally written as if State were being prepared for real company use because that is useful AI PM practice. They are **not** evidence that State has real customers, production company integrations, or an external pilot.
