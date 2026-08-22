# Meridian Capstone — Complete Context Summary

## The Scenario
- **Company:** Meridian Support Operations (simulated B2B SaaS)
- **Team:** ~450 employees, 14 support reps (8 Tier 1, 6 Tier 2)
- **Problem:** First-response time increased (2 hrs → 8+ hrs), CSAT dropped (91% → 82%)
- **Pilot:** AI-assisted support workflow for Tier 1, mandatory human review of all AI output

## The Agent (CONFIGURE)
**Type:** Drafting tool + human reviewer (NOT autonomous)

**Flow:**
1. Ticket arrives
2. AI classifies into category (Account & Access, Billing, Product How-To, Technical, Integrations, Other/Needs Review)
3. **High-risk category?** (money/security) → Skip drafting, route straight to human
4. **Standard category** → Retrieve KB + billing/account data, generate draft
5. Assess confidence (based on retrieval quality, missing info, source conflicts, guardrail matches)
6. Route for human review based on confidence + risk
7. Human chooses: approve / edit / start over
8. **Multi-turn escalation?** (5+ exchanges, upset customer, explicit escalation request, risk category mid-thread) → Escalate to human

## Success Measurement (PLAN)
| Metric | Baseline | Pilot Target | Notes |
|--------|----------|--------------|-------|
| AHT | 12.4 min | Hold steady | Human review caps savings |
| First-response | >8 hrs | ~7 hrs | Via timestamp proxy, not rep tagging |
| CSAT | 82% (current), 91% (pre-growth) | Monitor only | Not a hard pilot target |
| **Quality** | N/A | ≥80% approved without substantive edit | Launch/scale gate |
| **Human Intervention** | N/A | ≤20% need substantive correction | Complement of Quality |
| **Adoption** | N/A | Eligible-workflow penetration + repeat use | NOT blanket daily use |
| **Guardrails** | N/A | Zero-tolerance for money/security breaches | Single incident = pause category |

## Key Decisions Locked In
- **KB retrieval:** Semantic/embedding-based (not keyword matching)
- **Billing access:** Use existing nightly-synced field (no new integration)
- **High-risk categories:** Skip AI drafting entirely (refunds, credits, disputes, password resets, account changes, security actions)
- **Default to escalate** for anything ambiguous; refinement allowed if over-escalating
- **Escalation threshold:** 5+ exchanges (justified by 90-day data showing ~12% of tickets go beyond 4 exchanges)
- **Classification rule:** Classify by first operational blocker in multi-issue tickets, not customer's category selection
- **Adoption metric:** Shift from "daily use" to measuring eligible-workflow use, appropriate non-use, return rate

## What Changed During Discovery
1. **Adoption metric:** Initially leaned toward "8/8 reps use daily" → Revised to "eligible-workflow penetration + appropriate non-use"
2. **First-response target:** Originally ~6 hrs → Revised to ~7 hrs when rep discovery showed only 2/8 reps do quick-ack workflow (not the mixed model PM assumed)
3. **Classification model:** "Ambiguous = escalate" → Added "Other/Needs Review" category per actual Meridian taxonomy
4. **Retrieval expectations:** Fair to expect model to know source freshness only if metadata exists → Escalate conflicting sources without it

## Open Questions Still Flagged
- **Q5 (Draft Scope):** Legal may clear AI drafting for money categories later — if so, add those back into Quality scope
- **Q9 (Measurement Ownership):** Dev team builds instrumentation spec; Paige owns raw data interpretation
- **Q16 (Config-dependent answers):** Some how-to answers need per-customer CRM/config data (e.g., plan-tier features)

## Eval Architecture (VALIDATE)
**Five areas planned; two designed:**

### 1. Ticket Classification (DESIGNED — 8 cases)
**Straightforward (5):** Locked-out account → Account & Access; Double billing → Billing; etc.
**Edge cases (3):** 
- Customer selects wrong category but describes billing issue → Classify as Billing (evidence beats hint)
- Vague "I can't generate reports" → Other/Needs Review
- Multi-issue (login + billing + reporting) → Account & Access (first blocker)

### 2. Knowledge Retrieval (DESIGNED — 4 cases)
**Scoring:** Source Selection | Safe Fallback | Grounded Use (use N/A for inapplicable)

**Cases:**
- Plan-tier access question → Retrieve KB-106
- Missing dashboard data → Use KB-108, resist tempting KB-101
- Custom email-integration updates → No authoritative source → Escalate
- Monthly-report setup conflict (KB-101 vs. stale KB-107) → Don't choose arbitrarily without authority metadata → Escalate

**Key insight:** Stale-knowledge handling is often a system-design problem, not just a model-intelligence problem.

### 3–5. Remaining areas (NOT YET DESIGNED)
- Draft Response Quality (factuality, policy adherence, tone, completeness)
- Appropriate Human Escalation (financial actions, security, explicit escalation requests, repeated exchanges)
- Confidence & Review Routing (calibration, whether low-confidence gets scrutinized)

## Critical Reasoning Principles
- Classification accuracy is separate from safety — a guardrail failure cannot depend on correct classification alone
- Offline evals test controlled scenarios (classification, retrieval, drafting); production signals (reopen rates, real edits, customer pushback) belong in post-launch monitoring
- Adopted "root cause: KB" tag for failures traced to stale/conflicting content, to build evidence for a KB-automation proposal later (EXPAND-stage idea)

---

**Next step:** Run and score the 4 designed cases (Classification + Retrieval), diagnose failures, revise system, rerun. Then design the remaining 3 eval areas.
