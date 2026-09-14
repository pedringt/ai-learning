# State product health metrics

State is a portfolio/learning product, not a planned external pilot. Other people may interact with it as portfolio reviewers or demo visitors, but there is no intended rollout to a real user group.

This file is an AI PM exercise in measurement design: define how State would be evaluated if a real team used it, and use tests, curated scenarios, model evals, and reviewer flows to gather product-quality evidence where practical. Do not present hypothetical measures, synthetic results, or reviewer interactions as production user metrics.

## North-star question

**If a real team used State, would it help them maintain trustworthy project truth with less ambiguity and acceptable human review effort?**

## Recommended metric set

### 1. Consequential change recall

Of evidence/events that truly should require human judgment, how often does State surface them for Review?

Why it matters: missing a consequential change is more dangerous than creating a small amount of extra review work.

### 2. Review precision

Of items State sends to Review, how many genuinely require a human decision?

Why it matters: too many low-value Reviews create fatigue and undermine the review model.

### 3. Review burden

Reviews requiring action per meaningful evidence event, plus time/steps to resolve a typical Review.

Why it matters: human authorization is only viable if the workflow stays selective and actionable.

### 4. State integrity failure rate

Rate of failures where Current State becomes unsupported, stale, cross-project, incorrectly versioned, or otherwise violates the authority model.

Target posture: these are high-severity events; some categories should effectively be zero-tolerance release blockers.

### 5. Ask grounding quality

Share of sampled Ask answers that correctly distinguish Current State, pending Reviews, open Questions, uncertainty, and History/provenance.

Track serious failures separately, especially fabricated quotes, decisions, or certainty.

### 6. Question usefulness

For Questions created or maintained by State: how many represent real consequential unknowns, and how many are later resolved by meaningful evidence?

Why it matters: Questions should make uncertainty explicit, not become a dumping ground for vague concerns.

### 7. Workflow completion / recovery

Can a reviewer complete key flows (add evidence, review, adjust/update/leave unchanged, create/link a Question, inspect History, Ask) without dead ends or unclear recovery?

### 8. AI response latency

Track the time required for model-dependent tasks such as Evidence interpretation and Ask, including typical and slow-tail behavior.

Why it matters: a correct AI workflow can still be unusable if the user waits too long for routine actions. When measuring, prefer p50/p95 or a similarly honest distribution instead of one best-case number.

### 9. Model cost / efficiency

Track approximate model cost per meaningful task, such as one Evidence interpretation or one Ask request, against a representative context size.

Why it matters: quality improvements that multiply cost or context size may not be viable in a real product. Cost should be considered together with quality and latency, not optimized in isolation.

## Practical measurement approach for this project

Because State has no real user rollout, prefer evidence that is honest about its source:

- deterministic regression results for hard integrity rules;
- curated product scenarios for consequentiality and review burden;
- targeted real-model evals for semantic/model behavior;
- timed runs for latency;
- provider usage/cost estimates for representative calls;
- manual portfolio-review flows for clarity, recovery, and trust observations.

If a number comes from a synthetic test, eval set, or portfolio review, label it that way. Do not call it adoption, retention, customer success, or production usage.

## Guardrails

- Do not optimize for raw number of Reviews, Questions, Evidence items, or Ask queries. Those are usage counts, not success.
- Segment severe integrity failures from ordinary UX errors.
- Pair quantitative metrics with sampled qualitative review because schema-valid output can still be semantically wrong.
- Choose a small useful subset before adding instrumentation. A real AI PM should know what decision a metric will support before collecting it.
- Treat quality, latency, and cost as a three-way product tradeoff. Improving one does not automatically justify harming the other two.

## PM follow-up

Issue #121 tracks choosing the first small metric set and documenting how each would be measured if State were a real team product. This is a learning/portfolio exercise, not preparation for an actual pilot.
