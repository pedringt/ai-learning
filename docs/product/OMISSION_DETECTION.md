# Omission detection safeguard

State already has two ways to recover when interpretation misses something: bootstrap/baseline behavior reduces omissions while a project is being established, and **Propose for Current State** lets a person manually recover a fact after noticing a miss. Issue #144 adds a separate safeguard for the harder case: noticing a likely omission without waiting for a person to spot it.

## Decision

Omission detection runs as a **separate targeted pass**, not as a lower threshold inside normal interpretation.

The primary interpretation still decides whether Evidence needs Review. Afterward, an operator-run omission check looks only at successful `no_review` interpretations with deterministic signals that suggest the Evidence may be higher consequence, such as an explicit decision, ownership change, risk, requirement, launch/deadline change, date, quantity, or a direct Question response. This gate controls cost and review burden. A signal never becomes a fact and never creates a Review by itself.

The second model pass gets the Evidence, the primary no-Review explanation, and the current project context. Its instructions are deliberately narrow: look only for a **concrete consequential item plainly present in the Evidence that the first pass omitted**. It is told not to become generally more conservative or manufacture work from missing details.

## Authority

A suspected omission is not Current State. If the second pass finds one, its structured result is routed back through the existing interpretation pipeline under an `*-omission-check` provider identity. Normal schema validation, semantic validation, duplicate protection, Review creation, and human authorization still apply. Current State remains unchanged until a person accepts the Review.

Negative second-pass results are also persisted as omission-check interpretation records. That makes the safeguard auditable and prevents repeatedly spending a model call on the same primary no-Review result.

## When it runs

The safeguard is intentionally separate from latency-sensitive Evidence intake. It can be run periodically or during an eval/QA pass with a bounded batch size. The default operator command checks at most five candidates and can be configured with:

- `OMISSION_CHECK_MAX`
- `OMISSION_CHECK_MIN_SCORE`
- `DATABASE_URL`
- `STATE_PROVIDER`

This keeps the first implementation lightweight. It can later be scheduled by the hosting environment without changing the detection or authority model.

## What to measure

Eval coverage should include both sides of the tradeoff:

- **Omission recall:** consequential items missed by the first pass are surfaced by the second pass.
- **Review burden:** routine/noisy Evidence is not selected for a second model call, and a second pass that finds no concrete omission creates no human Review.

Issue #143's silent-miss audit remains complementary. Sampling no-Review cases measures what this safeguard still misses; confirmed misses can become regression cases and can improve the deterministic prioritization gate or the targeted second-pass prompt.
