# AI Professional Edge

*A compact, living reference for AI product, customer success, and consulting.*

Keep the durable ideas. Use linked sources and deeper references when more detail is useful.

---

## Core AI Product Patterns

### Design the system, not just the model

AI product quality comes from the full system: context, retrieval, tools, permissions, instructions, memory/state, evals, fallbacks, and human review.

**Ask:** How reliable is the whole system at completing this specific job?

### Separate capability from authority

A model may be able to do something without being allowed to do it. Scope access, permissions, approval gates, and action boundaries deliberately.

**Ask:** What can the AI see, what can it do, and what still requires a person?

### Evaluate workflows, not demos

One impressive answer proves little. Test representative scenarios, edge cases, and failures to determine whether the system is good enough for its actual job.

**Key term:** **Evals** are repeatable tests of AI behavior against the job you need done.

### Route work by difficulty

Not every task needs the strongest model. Routine work can use faster or cheaper models while difficult or higher-risk cases escalate.

Model choice is a product decision involving quality, speed, cost, and risk.

**Ask:** Which steps truly need the strongest model?

### Long-running agents need scaffolding

For longer tasks, keep important progress, dependencies, goals, and state outside the model instead of expecting it to reconstruct everything from conversation history.

**Key term:** **Scaffolding** is external structure, tools, and saved state that help AI stay oriented.

### Put risky execution behind trusted boundaries

AI can interpret a request or choose a workflow while conventional software checks policy, performs consequential actions, records changes, and pauses for approval when needed.

**Key term:** **Execution boundary** is the line between what AI may interpret or decide and what trusted systems or humans may actually change.

### More autonomy requires a stronger trust loop

As AI gets more freedom to act, checkpoints, permissions, recovery, observability, auditability, and human escalation become more important.

**Key term:** **Auditability** means being able to trace what the AI did, which tools it used, and where its results came from.

### Bring AI to the workflow

Do not force every job through a prompt box. Text, voice, files, images, and embedded AI are useful when they remove real workflow friction.

**Ask:** Does this interaction make the job easier, or is it just novelty?

### Keep access controlled and close to the source

Agents may need information from several business systems. When practical, give them controlled access to authoritative sources using normal identity and permission rules instead of creating giant copied data stores.

**Key term:** **Federated access** means securely reaching multiple existing sources without first merging them into one database.

---

## ChatGPT & Claude Power Moves

### Separate project state from today's task

Keep stable goals, decisions, constraints, current status, and known issues in a small source-of-truth context. Give the model today's specific task separately.

**Why:** Cleaner context makes long projects and cross-model handoffs more reliable.

### Steer instead of restarting

When a long task changes direction, give the AI the new constraint and ask it to identify what changes while preserving work that is still useful.

**Key term:** **Steering** means changing or adding instructions while AI work is already underway.

### Define the test before generating the work

For important outputs, establish the evaluation criteria first. Then generate or review the work against those criteria.

For higher-stakes work, use a separate review pass or another model as an evaluator.

**Useful for:** Specs, research, QA plans, presentations, prompts, and AI-generated code.

### Turn real failures into reusable evals

When AI produces a meaningful bad result, save the scenario and the behavior you expected.

A failure you can replay is more valuable than a vague warning to "be careful."

**Product habit:** Turn customer risks and edge cases into concrete test cases.

### Use AI as a collaborator, not the authority

Delegate drafting, synthesis, implementation, debugging, and exploration while keeping product decisions, acceptance criteria, and consequential approvals explicit.

**Ask:** What judgment am I delegating, and should I be?

---

## Concepts & Vocabulary

### Agent harness

The orchestration layer around a model that manages context, tools, and the flow of multi-step work.

### Evals

Repeatable tests that measure whether an AI system behaves well enough for its intended job.

### Long-horizon agent

An AI system that pursues a goal across many steps or an extended workflow.

### Scaffolding

External structure, tools, and saved state that help AI stay oriented during complex work.

### Execution boundary

The boundary between what AI may interpret or decide and what trusted software or humans may actually change.

### Auditability

The ability to trace actions, tool use, sources, and decisions after the fact.

### Model routing

Choosing different models for different tasks based on difficulty, cost, speed, or risk.

### Steering

Changing or adding instructions while an AI task is already underway.

### Multimodal interface

An interface that accepts or produces more than one mode, such as text, voice, images, or files.

### Federated access

Controlled access to multiple existing data sources without first copying them into one database.

---

## Questions Worth Asking

Use these during product discovery, design reviews, client conversations, and AI feature proposals.

1. What job are we actually trying to make more reliable, faster, or easier?
2. How reliable is the whole system at that job, not just the model in a demo?
3. What is authoritative, and how does the AI get grounded in it?
4. What can the AI see, decide, and do? What still requires a person?
5. Which parts need flexible AI reasoning, and which should be deterministic?
6. What failure would be merely annoying versus genuinely harmful?
7. What representative scenarios and edge cases should become evals?
8. What important project state should live outside the model?
9. How will we recover when a multi-step agent gets something wrong?
10. How will we inspect what the agent actually did after the fact?
11. Do all steps need the strongest model, or can we route work differently?
12. Does this interaction fit the user's real workflow, or are we adding AI-shaped friction?
13. Which source systems does the AI truly need, and can access remain permissioned?
14. If the AI improves, does this product or workflow still earn its maintenance cost?
