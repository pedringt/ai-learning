# State product decision log

Use this file for durable product decisions that future contributors or agents should not casually reopen. This is not State's in-product History; it records decisions about building State itself.

## Entry format

### DEC-XXX — Short decision title

**Status:** Settled / Revisit if condition changes  
**Date:** YYYY-MM-DD  
**Related:** Issue/PR/docs links

**Decision**  
What we decided.

**Why**  
The product reasoning and tradeoff.

**Rejected / deferred**  
Important alternatives we chose not to take.

**Revisit when**  
Only include if there is a clear trigger.

---

## Current settled decisions

### DEC-001 — Human authorization owns Current State

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
AI may interpret evidence and propose outcomes, but only a human-authorized workflow may change Current State.

**Why**  
State exists to maintain trustworthy project truth. Model confidence is not authority.

**Rejected / deferred**  
Autonomous AI mutation of Current State.

---

### DEC-002 — Answering a Question does not require a Current State change

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
Evidence can answer or close a Question without creating or changing a maintained fact.

**Why**  
Forcing every resolved unknown into Current State would create unnecessary or misleading maintained facts.

**Rejected / deferred**  
Treating accepted/reviewed evidence as automatically state-changing.

---

### DEC-003 — Human review must be selective

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
State should escalate consequential ambiguity or proposed truth changes while avoiding low-value acknowledgment work.

**Why**  
Human review only works if the system is selective about what reaches people and makes each decision clear enough to act on.

---

### DEC-004 — GitHub is the project system of record

**Status:** Settled  
**Date:** 2026-09-14

**Decision**  
Use GitHub Issues/Projects/PRs/Actions plus repo Markdown for State product operations. Add external PM tools only when they solve a real gap.

**Why**  
The code, QA, agents, work tracking, and durable product context can stay linked instead of being duplicated across systems.

---

### DEC-005 — State is a portfolio/learning product, not an external pilot

**Status:** Settled  
**Date:** 2026-09-14  
**Related:** `PRODUCT_BRIEF.md`, `METRICS.md`, Issue #121

**Decision**  
State will not be planned or represented as a product being rolled out to a real user group. Other people may interact with it as portfolio reviewers or demo visitors. Product-management exercises may deliberately model what a real deployment would require, but they must be labeled as hypothetical/learning work rather than real customer or pilot activity.

**Why**  
The goal is to demonstrate applied AI product judgment and learn realistic product practices without inventing users, adoption, customer evidence, or production outcomes that do not exist.

**Rejected / deferred**  
Creating fake pilot plans, adoption metrics, stakeholder reports, or customer evidence to make the portfolio project appear more mature than it is.

**Revisit when**  
Only if Paige explicitly decides to turn State into a product intended for real external/team use.
