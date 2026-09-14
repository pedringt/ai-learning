# State product health metrics

These are candidate product-health measures for a real pilot. They are not invented portfolio results. Do not claim them as measured until instrumentation or a study actually exists.

## North-star question

**Does State help a team maintain trustworthy project truth with less ambiguity and acceptable human review effort?**

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

Can users complete key flows (add evidence, review, adjust/update/leave unchanged, create/link a Question, inspect History, Ask) without dead ends or unclear recovery?

## Guardrails

- Do not optimize for raw number of Reviews, Questions, Evidence items, or Ask queries. Those are usage counts, not success.
- Segment severe integrity failures from ordinary UX errors.
- Pair quantitative metrics with sampled qualitative review because schema-valid output can still be semantically wrong.
- Before a broader pilot, choose a small measurable subset rather than instrumenting everything at once.

## PM follow-up

Issue #121 tracks selecting the first small metric set before broader pilot use.
