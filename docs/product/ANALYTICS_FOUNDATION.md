# State analytics foundation

This document defines which data a future State Product Health dashboard should use and which measurements are intentionally **not** treated as project truth.

## Principle

State already owns the authoritative lifecycle record for project understanding. A dashboard should aggregate that record rather than duplicate it into a browser analytics product.

Operational model telemetry answers a second question: how slow and reliable are AI-backed flows, and what token usage is available from the provider?

Optional product-usage analytics answer a third question: how are people using State? Those signals are useful, but they are not required for the first dashboard and should not create a paid dependency for this portfolio project.

Keep those layers separate.

## Project Health data sources

Use the database as the source of truth for project-health/dashboard calculations.

| Dashboard need | Authoritative source |
| --- | --- |
| Evidence received | `evidence.submitted_at` + `processing_status` |
| Pending Review age | `review_issues.created_at` where `status='open'` |
| Review outcome / time to decision | `review_issues.resolution` + `resolved_at` |
| Proposal outcome / time to decision | `proposed_state_changes.status` + `decided_at` |
| Actual Current State changes | `history_transitions.changed_at` + transition fields |
| Open / Blocking Question age | `questions.created_at`, `status`, `blocking` |
| Question resolution | `questions.resolved_at` + `resolution` |

Do not infer a Current State change from Evidence or Review counts. A reviewed item may leave State unchanged, answer/open a Question, or create another human follow-up.

## Browser analytics boundary

The first Product Health dashboard does **not** depend on Vercel custom events or another paid browser-analytics service.

`context-analytics.js` now acts as a compatibility layer for existing product call sites:

- it does not load Vercel Web Analytics;
- it does not send events anywhere by default;
- it does not send raw Ask query text;
- it preserves a metadata-only event contract so a future first-party collector can be added without rewriting all call sites;
- owner/QA mode remains an opt-out if a future collector is installed.

A future first-party sink may receive event name plus safe metadata such as anonymous session id, referral label, active project id, environment, build label, route/outcome metadata, and timing. Content-bearing fields are filtered out.

The first dashboard should not wait on this optional behavior layer.

## Operational AI metrics currently available

### Evidence interpretation — Anthropic

The live Anthropic adapter already logs, per provider call:

- provider;
- model identifier;
- provider duration (`elapsed_ms`);
- input tokens;
- output tokens;
- stop reason.

`interpretation_records` separately preserves provider/model, success/failure, error code, and interpretation timestamp with the Evidence processing record.

These are operational signals, not project truth.

### Evidence interpretation — OpenAI

The interpretation record preserves provider/model and success/failure, but the current OpenAI adapter does not yet emit token/duration telemetry equivalent to the Anthropic adapter.

This is a known instrumentation gap. Do not invent token counts from text length.

### Ask

Ask already returns backend timing metadata to the UI. Depending on the path, this includes:

- pipeline;
- total backend duration;
- provider duration;
- first-token duration for streaming.

The first Product Health dashboard may expose this timing only if it is stored or otherwise made available through State-owned telemetry. Browser custom events are not the persistence mechanism.

Ask does not currently persist provider token usage.

## Cost policy

State does **not** currently calculate a model-call cost estimate.

That is intentional. A trustworthy estimate needs a versioned price source tied to provider, exact model, token categories, and the date/pricing contract in effect. Hard-coding a current public price or approximating tokens from characters would create a number that looks more authoritative than it is.

Until that mechanism exists, dashboards should show cost as unavailable rather than fabricate an estimate. Token counts and latency can still support efficiency analysis where the provider exposes them.

## Dashboard implication

Build the first dashboard as a separate internal/portfolio Product Health surface rather than adding analytics clutter to the normal State workflow.

Start with:

1. **Project Health** — computed from Evidence, Reviews, proposals, History, and Questions.
2. **Operational AI signals** — clearly labeled model/provider timing, success/failure, and token data where State already owns trustworthy telemetry.

Behavioral product analytics can be added later through a State-owned first-party collector if the learning value justifies it.

Do not combine these layers into one overall “health score.” Show the underlying conditions directly.

## Verification expectations

Regression coverage should protect:

- no paid browser analytics dependency by default;
- no raw Ask query capture in browser analytics;
- owner-mode suppression when a future sink is installed;
- project/environment/build metadata for that optional sink;
- content exclusion from browser analytics;
- authoritative lifecycle timestamps for State changes, no-change Reviews, and Questions;
- the rule that no-State-change Review outcomes do not manufacture History.
