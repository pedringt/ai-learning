# State product analytics and quality metrics

State is a portfolio/learning product, not a real customer rollout. The analytics surface is therefore a **product-management learning exercise** using demo/reviewer activity, authoritative State lifecycle records, controlled evals, and operational telemetry. Do not describe these signals as customer adoption, retention, or production usage.

## Product questions

The admin dashboard should help answer four questions:

1. **Are people using State?**
2. **How are they using it?**
3. **Where is the workflow creating friction or failing?**
4. **Is the AI behaving well enough to trust the product?**

No single score can answer all four.

## Product usage signals

Use privacy-safe metadata only.

- demo sessions in recent windows;
- projects with measured usage;
- major State views used;
- Ask submitted/completed/failed;
- Evidence source mix;
- Reviews and Questions opened/resolved;
- authorized Current State changes;
- processing failures and aging work.

Raw activity volume is not success. A large Review count may mean adoption, unnecessary escalation, or accumulating burden.

## Authoritative product outcomes

Do not duplicate facts State already owns in browser analytics.

- Evidence received: `evidence.submitted_at`, source, processing status
- Review lifecycle: `review_issues.created_at`, `resolved_at`, status/resolution
- Question lifecycle: `questions.created_at`, `resolved_at`, status/blocking
- Actual Current State changes: **History transitions only**

A reviewed Evidence item can legitimately leave Current State unchanged, answer/open a Question, or require follow-up. None of those should be rewritten into a fake linear funnel.

## AI quality metrics

Controlled eval results are a separate dataset from product usage.

### Consequential-change recall
Of events that truly should require human judgment, how often does State surface them for Review?

### Review precision
Of items State sends to Review, how many genuinely require a human decision?

### State integrity failures
Track unsupported, stale, cross-project, incorrectly versioned, or authority-violating outcomes separately from ordinary UX errors. High-severity integrity failures are release-blocking.

### Ask grounding
Sample whether Ask distinguishes Current State, pending Reviews, open Questions, uncertainty, and History/provenance correctly.

### Question usefulness
Evaluate whether State surfaces real consequential unknowns rather than producing vague/noisy Questions.

Controlled eval runs must retain build/model/provider metadata where available so regressions can be compared across product changes. Synthetic or controlled results must always be labeled as such.

## AI reliability and efficiency

Where State owns trustworthy telemetry, track:

- provider/model success and failure;
- AI latency, preferably p50/p95 when sample size supports it;
- input/output tokens only where actually captured;
- timeout/recovery behavior.

Do not invent token counts from text length. Do not show dollar cost until State has both trustworthy token data and a versioned provider/model pricing source.

## Interpreting combinations

The useful PM work comes from combining signals rather than optimizing one number.

Examples:

- Review volume rises while Review precision falls → investigate over-escalation.
- Ask use grows while grounding evals regress → popular feature, quality risk.
- Evidence grows while Review backlog ages → human authorization may be becoming burdensome.
- State changes remain low with low Review burden → may be perfectly healthy if Evidence usually confirms existing understanding.

Treat these as investigation prompts, not automatic conclusions.

## Guardrails

- No composite health score.
- No raw Ask text, Evidence, Review text, Question text, Current State statements, prompts, answers, or uploaded content in product analytics.
- Separate usage/live signals from controlled evals.
- Separate severe integrity failures from ordinary UX errors.
- Prefer a small metric set tied to a product decision over collecting every click.
- Preserve the portfolio boundary: demo/reviewer activity is not customer adoption.
