# Meridian — Durable Context Handoff

Use this file to continue Meridian work without relying on older chats. `CURRENT_STATE.md` governs the full site; this file contains Meridian-specific product and learning context.

## Scenario and evidence boundary

- Simulated B2B SaaS organization, roughly 450 employees.
- Support team: 14 reps, including eight Tier 1 and six Tier 2.
- Simulated problem: monthly ticket volume grew to roughly 2,200; first-response time worsened from under two hours to over eight; CSAT declined from 91% to 82%.
- Proposed pilot: AI-assisted Tier 1 support with mandatory human review.
- Meridian is not a real client implementation. Lab runs are real local prototype activity, but they are not customer, operational, or business outcomes.

## Proposed operating design

1. A Tier 1 ticket enters the workflow.
2. The system checks eligibility and high-risk boundaries independently of classification.
3. Eligible tickets are classified into Account & Access, Billing, Product How-To, Technical Issue, Integrations, or Other / Needs Review.
4. High-risk financial actions, security concerns, and protected account changes skip drafting and route to a human.
5. Standard eligible tickets retrieve approved knowledge and, where appropriate, permitted account/configuration context.
6. The system creates a bounded draft with source evidence.
7. Confidence/review routing considers source quality, conflicts, missing information, ambiguity, and guardrail state.
8. A human reviews every draft during the pilot and may approve, edit, start over, or escalate.

The proposed production retrieval approach remains open and eval-driven. It may use keyword, semantic, hybrid, metadata filtering, reranking, direct context injection, or safe fallback. Do not describe semantic retrieval as locked.

## Durable decisions and changes of mind

- Adoption changed from blanket daily use to eligible-workflow penetration, repeat use, appropriate non-use, and qualitative reasons for non-use.
- Manual workflow tagging was rejected when existing timestamps could provide more reliable measurement.
- A copy/paste complaint was recognized as a display/configuration problem rather than automatically becoming an AI integration.
- Ambiguous tickets have an explicit Other / Needs Review route.
- Classification is not the sole safety control; high-risk detection must work independently.
- Stale or conflicting knowledge is often a source-governance/system problem rather than a prompt problem.
- Strong-looking efficiency results must be checked for automation bias, rework, and quality degradation.
- Any future reduction in human review must be selective and earned by evidence for low-risk, well-supported categories.

## Measurement design

The pilot should evaluate several signals together rather than optimizing one metric:

- First-response and resolution time.
- Draft approval without substantive correction and correction/rework rate.
- Grounding/source quality.
- Guardrail recognition and no-draft behavior.
- Escalation appropriateness.
- CSAT and reopen/customer-follow-up patterns.
- Eligible-workflow use, repeat use, appropriate non-use, friction, and trust.
- Cost and operational burden where defensible.

Current numbers on the site are simulated baselines or proposed targets. The Lab’s activity counts are learning metrics only.

## Meridian Lab architecture

Routes:

1. Support Tool — try the proposed rep workflow with fictional tickets.
2. Eval Runner — exploratory inputs plus a fixed regression suite.
3. Knowledge Base — inspect the bundled sample sources and freshness status.
4. Learning Log — preserve objectives, scoring, diagnosis, reflection, next questions, and rerun lineage.
5. Learning Dashboard — summarize experiments, diagnosed runs, linked reruns, and next questions.

Technical contract:

- `meridian-core.js` owns the bundled knowledge, fixed cases, deterministic classification/retrieval/guardrails/drafting behavior, and browser-local workspace/run schemas.
- `lab.js` renders views and interactions.
- `lab.css` owns the Lab UI.
- Support Tool and Eval Runner must call the same shared pipeline.
- Browser-local data should be backed up with JSON export. No model API, database, authentication, or production telemetry exists today.
- Imported workspace and run records are shape-validated before storage; core thresholds, high-risk guardrails, persistence, and import behavior have executable regression coverage.

## Current eval state

Runnable fixed suite:

- Eight classification cases.
- Four retrieval cases.

The deterministic Lab is a learning scaffold, not a claim that these rules represent the final AI system. A deliberately failing or surprising case is useful when it produces diagnosis and revision.

Coverage still to deepen:

- Draft quality.
- Appropriate human escalation, including explicit requests and multi-turn frustration.
- Confidence and review routing.
- Source conflict and unknown/missing source behavior.
- Multi-issue classification and operational consequences.

## Immediate next step

Complete one bounded experiment cycle in the Lab:

1. Write one experiment objective.
2. Run a representative subset of fixed cases and a few targeted exploratory cases.
3. Score and diagnose results.
4. Make one justified change.
5. Use linked reruns.
6. Record the conclusion and next question.
7. Export the workspace backup.

Only after this exists should the portfolio decide how to present MVP runs and results separately from eval design.
