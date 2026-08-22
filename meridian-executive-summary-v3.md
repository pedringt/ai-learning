# Meridian Support Pilot — Executive Summary

## The Problem

Ticket volume has grown faster than headcount, creating growing backlog pressure. First-response time degraded from <2 hrs to 8+ hrs. CSAT dropped from 91% to 82%. We need proof that AI assistance can improve throughput without sacrificing quality.

## The Approach

Tier 1 pilot: AI generates suggested drafts using KB research + synthesis. Humans review every draft before it goes out. Financial, security, and account-change requests bypass AI entirely—they skip to manual escalation with no AI involvement.

**This is assistance, not automation.** Reps control the workflow; AI saves time on research and composition.

## Why This Matters

We're gathering evidence on AI accuracy and safety with Tier 1. If the pilot proves accuracy levels support safe automation, low-risk, high-confidence tickets can move to selective auto-send in future phases—delivering real time savings without sacrificing safety on complex or risky cases.

## Key Risks

| Risk | How We Handle It |
|------|------------------|
| **Stale KB data in responses** | Track as a distinct failure type; fix articles when they cause pilot failures. |
| **Reps won't actually use it** | Measure adoption as eligible-workflow penetration + repeat use (not daily use). Investigate friction directly. |
| **Over-trusting the suggested draft** | Quality threshold of ≥80% approved without substantive edit. Track approval patterns for drift. |
| **High-risk cases slip through** | Zero tolerance: one confirmed money/security breach pauses that category. Single-incident trigger. |

## Pilot Targets (Week 8)

| Metric | Baseline | Target | Rationale |
|--------|----------|--------|-----------|
| First-response time | 8+ hrs | ~7 hrs | 1-hour improvement reduces queue backlog and customer wait. Modest gains reflect human-review overhead. |
| AHT | 12.4 min | Hold steady | Human review adds time during this phase. Real AHT reduction comes when selective automation removes review layer for low-risk tickets. |
| Draft quality | — | ≥80% approved without substantive edit | Threshold for automation eligibility post-pilot. Proves accuracy supports selective auto-send. |
| CSAT | 82% | Monitor only | Unclear if low CSAT is caused by ticket volume alone; tracked as a leading indicator, not a decision gate. |
| Guardrail breaches | — | Zero | Non-negotiable. Single confirmed breach pauses that category. Critical gate for any future automation. |

## Week 8 Decision Gate

**All targets met → Assess readiness for selective automation in Tier 2** (approval required from leadership; expansion requires explicit sign-off on which ticket categories are eligible for auto-send)

**Targets missed → Pause and diagnose** (is it accuracy, adoption, workflow fit, KB quality, or measurement?)

**Guardrail breach → Pause category immediately.** No automation or expansion until breach is resolved and root cause is addressed.
