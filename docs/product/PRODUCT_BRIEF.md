# State product brief

## Why this exists

State is a working portfolio and learning project used to practice applied AI product management, product judgment, QA, eval design, and AI-assisted software delivery.

State is **not** planned for an external pilot or rollout to a real user group. Other people may interact with the product only as portfolio reviewers or demo visitors. Product exercises in this repo may deliberately ask, “What would we do if this were a real product?” Those exercises should be labeled as hypothetical or portfolio learning rather than presented as real customer activity.

## Product thesis

State maintains a trustworthy answer to:

**What should this project treat as true right now?**

The core authority model is:

**AI interprets -> software enforces -> people authorize.**

AI can interpret new information and propose what it means. Deterministic software enforces structure, authority, immutability, isolation, and version rules. A human decides whether a consequential proposal becomes Current State.

## The real-world problem State is designed around

Project information changes across meetings, Slack, documents, notes, decisions, and follow-up conversations. Traditional knowledge tools can store or retrieve that information, and AI assistants can summarize it, but neither automatically answers a harder question reliably:

**Which of these things should the team actually treat as true now?**

A useful system needs to preserve source evidence, make uncertainty visible, distinguish proposals from established facts, and record who authorized a change.

## Hypothetical target user

If State were a real product, the primary user would be a PM, project lead, delivery lead, or other person responsible for keeping a complex project aligned as information changes.

They would use State to:

- capture new evidence from project work;
- see which changes need judgment;
- authorize or reject updates to maintained project truth;
- keep important unknowns visible;
- understand what changed and why;
- ask grounded questions without treating pending proposals as fact.

This target-user definition is a product-design exercise, not a claim that State currently has these users.

## Core product objects

### Evidence

Immutable source material representing what was said, observed, imported, or submitted.

### Current State

The maintained set of project facts a human-authorized workflow has established as true now.

### Reviews

Consequential proposed interpretations or changes that require human judgment. A Review should ask for a real decision, not merely acknowledgment.

### Questions

Important unknowns that remain open or blocking. Evidence may answer a Question without changing Current State.

### History

The record of authorized state transitions and decisions, including provenance and version-safe changes.

### Ask

A read-only way to use maintained project context for summaries, meeting preparation, changes, open work, and follow-up. Ask must distinguish Current State from uncertainty and pending proposals.

## Primary workflow

1. New information becomes Evidence.
2. AI interprets what the Evidence may mean.
3. Software validates the proposed interpretation and applies deterministic safety rules.
4. Consequential proposals become Reviews or tracked Questions as appropriate.
5. A human authorizes, adjusts, rejects, or otherwise resolves the decision.
6. Authorized Current State changes are applied atomically and recorded in History.
7. Ask and the readable Project view use the maintained result without silently promoting uncertainty to fact.

## Product principles

### Human authorization is the authority boundary

Model confidence is not permission to mutate Current State.

### Evidence is not the same thing as truth

Something can be worth preserving as Evidence without becoming Current State.

### Unknown is not zero, false, or absent

Ambiguity must remain ambiguity unless the evidence resolves it.

### Human review must be selective

The system should surface consequential decisions while avoiding review fatigue and acknowledgment-only work.

### Schema-valid is not necessarily correct

AI output can satisfy a schema while still being semantically wrong. Product QA and evals must test meaning, not only structure.

### Provenance should survive the workflow

A user should be able to understand what evidence existed, what AI proposed, what the human authorized, and what changed.

### Deterministic controls become more important after adding AI

Version checks, project isolation, immutability, validation, and atomic state transitions protect the parts of the product that should not depend on model judgment.

## Non-goals

State is not intended to be:

- an autonomous AI project manager;
- a generic note-taking or summarization app;
- a chat system that treats conversation memory as authority;
- a direct-edit wiki where maintained truth can change without evidence and review;
- a claim of production adoption, customer traction, or real pilot results.

## What success would mean if this were a real product

A real version would need to demonstrate that it can:

- catch consequential project changes reliably;
- avoid overwhelming people with low-value Reviews;
- prevent authority, provenance, isolation, and stale-write failures;
- keep Ask grounded in maintained truth and explicit uncertainty;
- support important workflows without dead ends;
- deliver acceptable model latency and cost for the value provided.

The measurement design for those questions lives in `METRICS.md`. In this portfolio project, evidence may come from tests, evals, curated scenarios, timed runs, and portfolio-review flows. Those results must be described honestly as such rather than as real-user metrics.

## Data reality

State is intended to use seeded, demo, or test information for portfolio use. Portfolio reviewers may type demo content, but should not submit confidential company information, customer data, credentials, or sensitive personal information.

`DATA_PRIVACY.md` documents what additional controls would be required before connecting a hypothetical real product to Slack, documents, transcripts, or other company sources.

## Product-management ownership

Paige owns the product choices, tradeoffs, acceptance decisions, and final judgment represented by this project. AI tools may assist with implementation, research, test generation, documentation drafts, and analysis. AI assistance does not replace product ownership or human authorization inside State itself.
