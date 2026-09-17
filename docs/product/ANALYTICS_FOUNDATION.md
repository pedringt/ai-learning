# State analytics foundation

This document defines which data a future State dashboard should use and which measurements are intentionally **not** treated as project truth.

## Principle

State already owns the authoritative lifecycle record for project understanding. A dashboard should aggregate that record rather than duplicate it into analytics.

Product/demo analytics answer a different question: how are people using State?

Operational model telemetry answers a third question: how expensive, slow, and reliable are AI-backed flows?

Keep those three layers separate.

## Project Pulse data sources

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

## Product/demo analytics contract

Every browser analytics event carries:

- anonymous per-tab session id;
- referral label;
- active project id when hydrated;
- environment (`local`, `staging`, `production`);
- frontend build label from the loaded asset version.

Owner/QA mode suppresses these events.

### Ask lifecycle

Ask instrumentation distinguishes:

- source: typed, starter, refresh, or unknown/fallback;
- submitted query;
- outcome: answered, routed, cancelled, timeout failure, or other failure;
- total browser-observed duration;
- backend timing returned by Ask when available (`pipeline`, total, provider, first-token);
- copy-answer action.

Locally handled Ask requests are recorded as `routed` rather than pretending a model answered them.

Raw query text is limited to the disclosed `ask_submitted` event and capped at 300 characters. Generic analytics payloads reject content-bearing property names. Ask answer bodies, Evidence bodies, Current State text, uploaded content, prompts, credentials, and secrets are outside the analytics contract.

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

Ask already returns backend timing metadata and the browser analytics layer records it on successful answers. Depending on the path, this includes:

- pipeline;
- total backend duration;
- provider duration;
- first-token duration for streaming.

Ask does not currently persist provider token usage.

## Cost policy

State does **not** currently calculate a model-call cost estimate.

That is intentional. A trustworthy estimate needs a versioned price source tied to provider, exact model, token categories, and the date/pricing contract in effect. Hard-coding a current public price or approximating tokens from characters would create a number that looks more authoritative than it is.

Until that mechanism exists, dashboards should show cost as unavailable rather than fabricate an estimate. Token counts and latency can still support efficiency analysis where the provider exposes them.

## Dashboard implications

A future dashboard can be built in two layers:

1. **Project Pulse** — computed from Evidence, Reviews, proposals, History, and Questions.
2. **Owner/product analytics** — reviewer behavior, Ask behavior, provenance/copy actions, operational timing, and clearly labeled eval/test evidence.

Do not combine those layers into one overall “health score.” Show the underlying conditions directly.

## Verification expectations

Regression coverage should protect:

- owner-mode suppression;
- Ask lifecycle classification;
- project/environment/build context;
- content exclusion from generic analytics;
- authoritative lifecycle timestamps for State changes, no-change Reviews, and Questions;
- the rule that no-State-change Review outcomes do not manufacture History.
