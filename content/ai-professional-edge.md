# AI Professional Edge

*A compact, living reference for AI product, customer success, and consulting.*

Keep the durable ideas. Use deeper references when more detail is useful.

---

## Decide Where AI Belongs

### Start with the job, not the AI

Define what should become more reliable, faster, easier, or cheaper before deciding whether AI belongs in the solution.

**Ask:** What job are we improving, and how will we know it got better?

### Use AI where flexibility earns its complexity

Use AI for interpretation, synthesis, generation, and messy variation. Use deterministic software for arithmetic, exact validation, policy checks, and authoritative writes when the right answer is fully determined by the inputs.

**Ask:** Which parts need flexible judgment, and which should be exact?

### Bring AI to the workflow

Do not force every job through a prompt box. Text, voice, files, images, embedded assistance, and agents are useful when they remove real workflow friction.

**Ask:** Does this interaction make the job easier, or is it just novelty?

### Separate business capabilities from the interface

The useful part of a product is not only its screens. Data, rules, permissions, workflows, and actions can be exposed through APIs, MCP, or skills while the system of record still owns the authoritative behavior.

**Ask:** If the original interface changes or disappears, where do the rules and actions still live?

### Keep the maintenance test in view

A workflow should still earn its cost as models improve and commodity AI gets better. Avoid building around a temporary capability gap without creating durable workflow value.

**Ask:** If the AI improves, does this product or workflow still earn its maintenance cost?

---

## Design the System Around the Model

### Design the system, not just the model

Quality comes from the model plus the system around it: context, retrieval, tools, permissions, state, checks, fallbacks, and human review.

**Ask:** How reliable is the whole system at completing this specific job?

### Centralize the rules that must not drift

Important enterprise limits should not depend on prompt wording or each builder's preference. Enforce the rules that matter centrally when local users or workspaces should not be able to weaken them.

**Ask:** Which limits must be impossible for a local user or workspace to loosen?

### Diagnose multi-step failures at the first bad step

A final success or failure score can hide the real bug. Trace a long agent run back to the first wrong response or tool action, then separate that root cause from later steps that only inherited the mistake.

**Product habit:** Fix the step where the failure starts, not the last place it becomes visible.

### Route work by difficulty and measure the real cost

Routine steps can use faster or cheaper models while uncertain or higher-risk work escalates. Compare models by the cost of an acceptable outcome, including retries, extra turns, review, and rework, rather than token price alone.

**Ask:** What does one successful outcome cost at the quality level the business actually needs?

### Keep long-running state explicit and trustworthy

For longer tasks, keep important progress, decisions, dependencies, and goals outside the model. Treat saved memory and compaction summaries as future inputs that can influence later behavior, so keep them attributable, bounded, and unable to silently override higher-priority rules.

**Ask:** What state must survive, who can write it, and how is it validated before later runs trust it?

### Design workflows to survive interruption

Multi-step AI work may time out, fail halfway through, receive the same request twice, or pause for human input. Save progress explicitly and make retries safe so the workflow can continue without losing work or repeating a consequential action.

**Ask:** If this stops halfway through or runs twice, what happens?

### Separate knowledge from procedure

Retrieval is good at bringing the right facts into context. Skills and runbooks are better for teaching a repeatable method, including what order to follow, which checks to run, and which failure modes to catch.

**Ask:** Does this job fail because the AI lacks information, or because it applies the wrong procedure?

### Treat the agent layer and model provider as separate choices

The workflow, skills, permissions, and user experience do not have to come from the same vendor as the model. Keeping those layers separable can reduce lock-in and make model changes less disruptive.

**Ask:** Can we change the model or provider without rebuilding the agent experience?

### Keep access user-scoped, revocable, and close to the source

Prefer controlled access to authoritative systems over giant copied data dumps. When a user connects a source, keep the permission narrow, tie it to that person's identity, and make it revocable.

**Ask:** Whose identity is the agent acting under, what exact access was granted, and can it be revoked?

### Ground data analysis in shared business definitions

AI can query the right data and still reach the wrong business conclusion if terms such as active customer, churn, or revenue are ambiguous. Give analysis a small semantic layer with the definitions that matter before asking the model to reason over the data.

**Ask:** Which business definitions must be fixed before the AI starts analyzing?

---

## Keep It Trustworthy

### Separate capability from authority

A model may be able to do something without being allowed to do it. Scope access, permissions, approval gates, and action boundaries deliberately.

**Ask:** What can the AI see, what can it do, and what still requires a person?

### Put risky execution behind trusted boundaries

AI can interpret a request or choose a workflow while conventional software checks policy, performs consequential actions, records changes, and pauses for approval. When an agent must run code or inspect untrusted files, isolate that work from the main system.

**Key term:** **Execution boundary** is the line between what AI may interpret or decide and what trusted systems or humans may actually change.

### Increase autonomy progressively, based on evidence

Do not jump from fully supervised to fully autonomous. Give the AI more freedom action by action as reliability evidence, safeguards, observability, and recovery paths justify it, while keeping stronger controls around higher-consequence actions.

**Ask:** What evidence would justify giving this specific action more autonomy, access, or scope?

### Observe behavior from the outside

Do not treat the model's hidden reasoning as the audit record. Record observable evidence such as tool calls, data access, approvals, outputs, and outcome checks so behavior can be inspected independently.

**Ask:** What evidence would let us verify the agent behaved correctly without trusting its own explanation?

### Evaluate workflows, not demos

One impressive answer proves little. Use repeatable scenarios and edge cases before release, then keep evaluating real behavior after release.

**Key term:** **Evals** are repeatable tests of AI behavior against the job you need done.

### Let deterministic checks prove what they can

Use exact checks for hard rules, formats, calculations, permissions, and other things software can prove directly. Use AI judgment for nuanced criteria, and calibrate it against human review where the stakes justify it.

**Ask:** What can this reviewer verify directly, and what still requires judgment?

### Monitor system health and AI quality separately

Infrastructure can be healthy while an agent still misunderstands the user or chooses the wrong action. Track operational health and user-facing quality as different layers.

**Ask:** Is the system running correctly, and is the AI actually succeeding at the job?

### Valid output can still be wrong

Passing a schema proves that an output has the expected structure. It does not prove that the meaning is correct or appropriate for the product.

**Key term:** **Semantic validation** checks whether an output makes sense relative to product rules, context, and known facts.

### Preserve uncertainty instead of smoothing it away

Unknown, proposed, inferred, and confirmed information are not interchangeable. Good AI products keep those distinctions visible when they matter.

**Ask:** Is the system showing what it knows, what it inferred, and what still needs confirmation?

---

## Operate and Improve It

### Separate adoption from value

Usage tells you whether people are trying an AI feature. Outcome metrics tell you whether it actually improves the job. Track both without treating seats, sessions, or message counts as proof of business value.

**Ask:** What user or business outcome should improve if this is genuinely useful?

### Define success before asking AI to evaluate it

AI can help draft test cases, edge cases, rubrics, and expected behaviors. The product person still decides what good means and which failures matter.

**Product habit:** Let AI accelerate eval design without delegating the definition of success.

### AI can accelerate QA without replacing hands-on testing

Use AI to generate test ideas, automate repetitive coverage, inspect logs, and investigate failures. People still need to smoke-test the actual experience and judge whether technically valid behavior makes sense to a user.

**Ask:** Did the system pass its tests, and does the product actually feel right?

### Turn failures into regression tests, then diagnose from traces

Save meaningful bad cases with the expected behavior. Compare successful and failed runs, find the first recurring divergence, make one targeted change, and rerun the eval set before promoting it. Keep a few held-out cases so fixing known failures does not quietly break something else.

**Product habit:** Test before launch, learn from production failures, and turn important failures into reusable protection.

---

## Working Effectively With AI

### Separate project state from today's task

Keep stable goals, decisions, constraints, current status, and known issues in a small source-of-truth context. Give the model today's specific task separately.

**Why:** Cleaner context makes long projects and cross-model handoffs more reliable.

### Steer instead of restarting

When a long task changes direction, give the AI the new constraint and ask it to identify what changes while preserving work that is still useful.

**Why:** Changing direction without throwing away valid work is faster and keeps continuity.

### Define the test before generating the work

For important outputs, establish the evaluation criteria first, then generate or review against them. For higher-stakes work, use a separate review pass.

**Why:** It makes quality less dependent on whether the first answer happens to look convincing.

### Use a two-stage verifier

Run cheap deterministic checks first: required facts, valid fields, correct links, expected structure, and other hard conditions. Then use AI judgment only for the parts that genuinely require interpretation.

**Why:** It reduces cost and makes failures easier to diagnose.

### Verify the assumptions that can change the decision

When AI gives a recommendation, identify the few claims or assumptions that would change the conclusion if they were wrong. Verify those with sources, tools, or calculations, then revise the recommendation if needed.

**Why:** Verification effort goes to the facts that actually matter.

### Delegate with deliberate context

Give continuation work the prior context it needs, give independent reviewers a clean context, and load large sources progressively instead of dumping everything into every task.

**Why:** Inherit context for continuity, isolate it for independent checks, and keep irrelevant or stale material from crowding out the current source of truth.

### Fan out, then merge

For a complex question, split the work into a few focused branches with different jobs, then reconcile conflicts against explicit criteria instead of simply averaging the answers.

**Why:** Parallel exploration improves coverage while keeping each branch focused.

### Turn good one-off work into a reusable skill

When a recurring AI task works well, capture the trigger, inputs, tools, steps, checks, and expected output as a reusable skill, runbook, or project instruction.

**Why:** Reusable procedures make AI work more consistent and easier to improve.

### Preflight tool use before letting the AI act

Before an agent uses tools, distinguish read-only steps from reversible and consequential ones. State what evidence is needed and where approval should be required; keep real permissions and approval gates outside the prompt.

**Why:** Risky assumptions become visible before action.

### Test permission boundaries deliberately

Run a task while intentionally withholding one source or permission. Watch whether the agent states what it cannot know, asks for access, or quietly invents missing information.

**Why:** This is a fast check of whether the system respects access boundaries and uncertainty.

### Map an interface into capabilities

For an existing workflow, ignore the current screens and map the user goal, data, action, permission or approval, and system of record. Then decide which capabilities could be exposed to AI without recreating the whole UI.

**Why:** It reveals whether you are redesigning the job or merely putting a chat box on top of old screens.

### Use AI as a collaborator, not the authority

Delegate drafting, synthesis, implementation, debugging, and exploration while keeping product decisions, acceptance criteria, and consequential approvals explicit.

**Ask:** What judgment am I delegating, and should I be?

---

## AI Discovery & AEO

### Optimize for accurate AI understanding

Answer Engine Optimization is useful when AI systems act as a customer's research layer. The goal is not to game ChatGPT; it is to make accurate, current, differentiating information easy for AI systems to find and understand.

**Ask:** When an AI evaluates our product for a customer, what does it understand correctly and where does that understanding break down?

### Test it like a buyer

Use a small repeatable test instead of one impressive prompt:

- ask realistic buyer questions
- try multiple models and small wording variations
- inspect the visible sources behind the answer
- note what information is missing, stale, or ambiguous
- rerun the same tests over time

---

## Concepts & Vocabulary

### Agent harness

The orchestration layer around a model that manages context, tools, state, and the flow of multi-step work.

### Agent skill

A reusable procedure that tells an agent how to do one kind of job, including the method, tools, checks, and expected output.

### Context isolation

Giving a subtask only the context it needs so unrelated history does not bias or clutter the work.

### Compaction

Compressing older context into a smaller summary so a long-running agent can keep working. Because that summary shapes future behavior, treat it as persisted state that deserves validation and boundaries.

### Evals

Repeatable tests that measure whether an AI system behaves well enough for its intended job.

### LLM as judge

Using one language model to grade another output against a written rubric. Useful for nuanced checks, but it needs calibration and can share model biases.

### Scaffolding

External structure, tools, and saved state that help AI stay oriented during complex work.

### Execution boundary

The boundary between what AI may interpret or decide and what trusted software or people may actually change.

### Progressive autonomy

Giving an AI system more freedom action by action as evidence, safeguards, and recovery paths justify it rather than switching from fully supervised to fully autonomous at once.

### Auditability

The ability to trace actions, tool use, sources, and decisions after the fact.

### Defense in depth

Using several independent safeguards so one failure does not remove all protection.

### Sandbox

An isolated environment where an agent can run code, inspect files, or use tools without direct access to the main production system.

### Model routing

Choosing different models for different tasks based on difficulty, cost, speed, or risk.

### OAuth scope

A specific permission granted to an app or agent. Narrow scopes help keep access limited to what the user actually approved.

### Prompt injection

When instructions hidden in user input, files, websites, or retrieved content try to make the model ignore its intended rules or take unsafe actions.

### Fan-out / fan-in

Splitting one problem into focused parallel branches, then merging the results through a final synthesis or decision step.

### Semantic layer

Shared definitions and relationships that explain what business data means so people and AI use metrics consistently.

### Trace / span

A trace is the recorded end-to-end run. A span is one operation inside it, such as a model call, retrieval, or tool call.

### Silent quality failure

The software executes without an obvious technical error, but the AI still fails the user by misunderstanding the goal, choosing the wrong tool, or producing an unacceptable result.

### Outcome metric

A measure of the user or business result achieved, rather than an adoption signal such as seats, sessions, or message count.

### Headless architecture

A design where useful data, business logic, permissions, and actions can be accessed independently of the original user interface while the source system still owns the rules.

### Semantic validation

Checking whether an output's meaning fits product rules, context, and known facts rather than only checking its structure.

---

## Questions Worth Asking

Use these during product discovery, design reviews, client conversations, and AI feature proposals.

1. What job are we actually trying to make more reliable, faster, or easier, and how will we know it improved?
2. How reliable is the whole system at that job, not just the model in a demo?
3. What is authoritative, and how does the AI get grounded in it?
4. Which parts need flexible AI judgment, and which should be deterministic?
5. What can the AI see, decide, and do, and what still requires a person?
6. What failure would be merely annoying versus genuinely harmful?
7. What representative scenarios should we test before release, and what should we keep evaluating after launch?
8. Which checks can software prove directly, and which genuinely require AI or human judgment?
9. What important state must persist outside the model, who can write it, and how are those writes validated?
10. If a multi-step agent fails, where did the first bad step occur and how will the workflow recover?
11. What observable evidence would let us verify what the AI actually did?
12. Which work needs the strongest model, and what does one acceptable outcome cost after retries and review?
13. What budget, iteration, or time cap should stop an agent before it runs away?
14. Does this interaction fit the user's real workflow, or are we adding AI-shaped friction?
15. Which sources does the AI need, whose identity is it acting under, what access is granted, and what happens when access is missing?
16. What untrusted content could reach the model, and what stops it from becoming an instruction?
17. If the underlying AI improves, does this workflow still earn its maintenance cost?
18. Which tasks should inherit existing context, which need a clean context, and what can be loaded only when needed?
19. Does this job need more facts, or a better procedure for applying the facts?
20. Which business definitions must be fixed before AI analyzes the data?
21. Are we measuring adoption, actual workflow use, and user or business value separately?
22. What evidence would justify giving this specific action more autonomy, access, or scope?
23. Can the model provider or interface change without rebuilding the authoritative workflow underneath it?
