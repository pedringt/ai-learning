# State analytics foundation

State's analytics architecture separates three kinds of evidence that answer different product questions.

1. **Authoritative State lifecycle data** — what happened to Evidence, Reviews, Questions, and Current State.
2. **Privacy-safe product usage metadata** — how the demo/product is being used when the lifecycle database does not already answer the question.
3. **Controlled AI eval results** — repeatable quality checks with known expectations.

These layers must not be collapsed into one health score or one source of truth.

## Authoritative lifecycle data

State's own database remains authoritative for project outcomes.

| Dashboard need | Authoritative source |
| --- | --- |
| Evidence received / source / processing | `evidence` |
| Pending Review age | `review_issues.created_at` where open |
| Review outcome / resolution time | `review_issues` lifecycle fields |
| Actual Current State changes | `history_transitions` joined to project State |
| Open / Blocking Question age | `questions` lifecycle fields |
| Question resolution | `questions.resolved_at` + status/resolution |

Do not infer Current State change from Evidence or Review counts. History is the authority for actual State mutation.

## First-party usage collector

`context-analytics.js` now sends a deliberately small, metadata-only event set to State's own `/api/analytics/events` endpoint. This avoids a paid browser analytics dependency and keeps product analytics under the same product/privacy decisions as State itself.

The browser collector uses an **explicit allowlist**, not a denylist. Supported metadata is limited to fields such as:

- anonymous per-tab session id;
- active project id when known;
- environment and frontend build label;
- referral label;
- approved view name;
- bounded outcome/timing/status metadata;
- outbound destination **origin only**, never full path/query.

Unknown event names and unknown event properties are dropped client-side and rejected server-side. Analytics failures are swallowed by the browser so measurement cannot break State.

Owner/QA mode (`paigeOwnerMode`) remains excluded from browser analytics.

### Events currently useful

The browser collector records demo opens, approved State views, and outbound origins. The backend separately records the operational gap that State's lifecycle tables do not own: Ask submitted/completed/failed plus safe latency/status metadata and server failures.

Do not create duplicate analytics events for Evidence/Review/Question/History outcomes merely to count them. Those records already exist in State.

## Storage and retention

Product usage events are stored in `product_analytics_events` in State's existing database. The analytics module creates this operational table if it is missing.

- Usage-event retention: **90 days**.
- Controlled eval aggregate retention: **365 days**.
- Old rows are pruned opportunistically during analytics reads/writes.
- Project content is not stored in either analytics table.

Staging still uses ephemeral storage, so staging analytics may disappear on a deploy/restart. This is acceptable for the portfolio environment and must not be described as production-grade analytics persistence.

## Controlled evals

`eval/run_eval.py` can continue writing a detailed local JSON report. It can additionally post **aggregate-only** results to `/api/admin/eval-runs` when `STATE_EVAL_INGEST_KEY` is configured.

The analytics store receives only suite/run kind, build/provider/model metadata, counts, precision/recall, error counts, and other approved aggregate quality measures. Scenario Evidence, prompts, traces, model responses, and project content remain outside the dashboard store.

The dashboard must label these results as controlled/synthetic eval data, never usage data.

## AI reliability

State may show operational AI reliability only when it owns the measurement. Current trustworthy coverage includes interpretation success/failure and provider/model identity. Ask latency becomes available from the first-party operational events.

Token usage is not persisted consistently across every model path, so the dashboard shows it as unavailable rather than estimating it. Dollar model cost remains unavailable until State has trustworthy token data plus a versioned pricing source.

## Dashboard boundary

The Product Analytics page is an internal/admin learning surface. It defaults toward an all-project aggregate view and allows aggregate project drilldown. It does **not** display project content or link directly into a project's State workspace.

A real company deployment would need authentication/RBAC for this cross-project admin surface before it could be treated as release-ready for customer data.

## Verification expectations

Regression coverage should protect:

- explicit analytics field/event allowlists;
- no raw Ask/project content in persisted analytics;
- owner-mode suppression;
- project isolation for aggregate drilldowns;
- History authority for State changes;
- no composite health score;
- cold-start retry only once, followed by explicit manual recovery;
- controlled evals remaining separate from usage analytics.
