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

---

### DEC-006 — Bootstrap, normal interpretation, and explicit promotion are distinct paths

**Status:** Settled  
**Date:** 2026-09-15  
**Related:** Issues #129, #144, #146

**Decision**  
State has three distinct ways of deciding what reaches human Review:

1. **Bootstrap/backfill:** when a project has no established Current State, interpretation should bias more toward coverage so an existing project's baseline can be reconstructed without requiring every important fact to already have a State item to compare against.
2. **Normal ongoing interpretation:** once Current State exists, State should remain selective and escalate only consequential new facts, changes, contradictions, qualifications, or important unknowns.
3. **Explicit human promotion:** a person may say that processed Evidence contains something they want proposed for Current State. For that pass, the consequentiality decision is human-supplied. AI still interprets what the Evidence actually establishes and may preserve unresolved material as a Question rather than inventing certainty. Promotion always creates a Review path and never writes Current State directly.

Explicit promotion must remain available after partial prior interpretation. It is not limited to Evidence that received zero Reviews: State may have surfaced only Questions, or may have captured one Current State fact while missing another. An unresolved existing Review should be completed before offering another promotion from the same Evidence to avoid duplicate concurrent proposals.

Mixed planning/spec documents must be interpreted item by item. Words such as “should” do not by themselves make the entire document tentative; settled decisions, tentative ideas, and explicit open questions can coexist in one source.

**Why**  
Human review can reject a bad proposal but cannot correct an important fact the model never surfaced. The problem is especially acute during adoption/backfill, when a mature project may have substantial existing knowledge but little or no Current State yet. Explicit promotion gives the human authority a recovery path without making normal interpretation noisier or allowing direct writes.

**Rejected / deferred**  
Making the normal model globally more aggressive; limiting promotion to `no_review_needed`; hiding promotion after any prior Current State change; allowing promotion to bypass Review; treating omission detection as solved by this feature. Systematic omission detection remains separate work.

---

### DEC-007 — Baseline Setup is an explicit project lifecycle

**Status:** Settled  
**Date:** 2026-09-15  
**Related:** Issue #155; Issues #144, #146

**Decision**  
A new user-created project remains in **Baseline Setup** until a person explicitly finishes establishing its starting understanding. Accepting the first Current State fact does not end bootstrap behavior.

During Baseline Setup, State may internally split a large source into bounded interpretation chunks while preserving the original source as one immutable Evidence item. Interpretation should favor useful baseline coverage, surface explicit important Questions, keep Current State proposals independently maintainable, and use a small set of project-derived organizational areas where helpful. Areas are organizational metadata, not authoritative facts, and are persisted only after associated material is human-authorized.

Before the person finishes Baseline Setup, State should show a coverage summary across the intended starting Evidence. Structural coverage warnings may identify material that deserves another look, but they are not proof that something is missing and do not authorize State changes.

After Baseline Setup is explicitly finished, normal ongoing interpretation becomes the default. Explicit human promotion remains available as a recovery path for later omissions.

**Why**  
Dogfooding AI Notes and State planning material showed opposite failure modes from the old `Current State is empty` trigger: one large source was over-compressed into broad blobs, while later baseline material disappeared after early facts were accepted. A real project may need many notes or documents to establish its starting picture, so baseline construction must span multiple Evidence items and human decisions rather than end after the first acceptance.

**Rejected / deferred**  
Ending bootstrap when Current State first becomes non-empty; requiring people to manually split large source documents; solving large-input failures only by raising the model token ceiling; autonomous baseline acceptance; treating structural coverage as a complete semantic omission detector.

---

### DEC-008 — The Deep QA gate measures the app; model quality is observed, not gated

**Status:** Settled  
**Date:** 2026-09-19  
**Related:** Issue #230; R-016; Issue #231

**Decision**  
The State Deep QA Baseline lifecycle test uses two tiers of checks. **Hard checks** fail the gate because they mean the app or the analysis path is broken: the review dialog does not stay stale during analysis, at least one draft fact appears (zero facts is a real failure), a manually added fact adds exactly one row, and confirming Starting State and later Evidence work. **Soft observations** (the number of facts, the number of areas, use of the "General" area) are recorded as annotations in the report and job summary but never fail the gate. The real model stays in the loop on the deployed stack.

**Why**  
The test used to require exactly 3 facts and more than one area from a real model. The same file yields 2 or 3 facts and 1 or 2 areas, so the gate failed intermittently for reasons that were not regressions, blocking promotion on model variance. App correctness and model quality are different questions and should not share one pass/fail.

**Also**  
If the model raises a Review that blocks Confirm (State's authority rule working as designed), the test verifies the block and reports the run as skipped (inconclusive), not passed or failed, because confirm and follow-up Evidence were not exercised.

**Rejected / deferred**  
A deterministic provider for this flow (it would need a test-only provider switch on a deployed server, and would stop exercising the real model path where the schema-violation failure occurred; deterministic lifecycle coverage already runs in `make qa-fast`); silently retrying schema-violating output in the test (hides a real product reliability problem, tracked in R-016 and #231). Model quality for Baseline decomposition is deferred to an eval (follow-up issue).

---

### DEC-009 — Baseline analysis does not retry automatically for now; measure first

**Status:** Settled  
**Date:** 2026-09-20  
**Related:** R-016; Issues #231, #233, #240; DEC-008

**Decision**  
When Baseline Setup analysis fails (for example the model returns output that fails schema validation), State does **not** retry automatically. The failure stays visible and the person can retry by hand from the Baseline UI (#231). Paige approved a measure-first approach: measure the real failure rate with the corrected Baseline decomposition eval (#233), and add an automatic retry only if that rate is meaningfully above a few percent.

**Why**  
The first valid measurement (Sept 20, Haiku 4.5, the Baseline provider the deployed app uses) was **1 failed analysis in 36 real calls (about 3%)**, and the cause was not identified: it did not reproduce in 12 targeted re-runs, and the call logs rule out a routine truncation (largest output 895 of 2,000 tokens, every call ended normally) and a timeout (7 to 10 s against 30 s). One failure in 36 is too few to say the rate is real, and a retry costs another model call and added latency, and can hide a real reliability signal (DEC-008 already declines to retry silently in the test for that reason).

**Revisit when**  
A real failure is recorded with a `schema_violation` code (the eval now records the failure code and message), or a larger measurement shows a rate meaningfully above a few percent. If revisited, the smallest option is one retry, only for `schema_violation`, in the background, recording both attempts (Ask already retries once on a contract failure).

**Rejected / deferred**  
An automatic retry now (no evidence it is needed); a repair pass that sends the invalid output back to the model (a new prompt, so a product change that needs its own eval); keeping the valid parts of a bad output (edges toward AI deciding what counts as valid); prevention by tuning chunk size or output limits (needs failure data first).
