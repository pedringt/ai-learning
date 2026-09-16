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

Quality comes from the model plus the system around it: what context reaches it, which tools and permissions it has, and what software or people check the result.

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

### Long-running agents need scaffolding

For longer tasks, keep important progress, dependencies, goals, and state outside the model instead of expecting it to reconstruct everything from conversation history.

**Key term:** **Scaffolding** is external structure, tools, and saved state that help AI stay oriented.

### Design workflows to survive interruption

Multi-step AI work may time out, fail halfway through, receive the same request twice, or pause for human input. Save progress explicitly and make retries safe so the workflow can continue without losing work or repeating a consequential action.

**Ask:** If this stops halfway through or runs twice, what happens?

### Memory and project state are not the same thing

Better model memory helps continuity, but important project truth may still need an explicitly maintained record with clear authority.

**Ask:** What should the AI remember, and what needs to be maintained outside it?

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

### More autonomy requires a stronger trust loop

As AI gets more freedom to act, the system needs stronger limits, checkpoints, recovery paths, and human escalation. Good conversation is not enough protection for a long-running or customer-facing agent.

**Ask:** What new control becomes necessary when this system gets more autonomy?

### Require evidence before increasing risk

Before giving an AI more autonomy, access, or scope, write down the important failure modes, safeguards, eval evidence, monitoring, and remaining uncertainty. The goal is not paperwork; it is a testable reason for proceeding.

**Ask:** What evidence would justify giving this system more autonomy, access, or scope?

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

### Turn real failures into reusable evals

When AI produces a meaningful bad result, save the scenario and the behavior you expected. A failure you can replay is more useful than a vague warning to be careful.

**Product habit:** Turn customer risks and real failures into concrete test cases.

### Observe after you ship

Pre-launch evals are only part of the loop. Real usage shows what needs attention, including quality failures that do not produce an obvious technical error.

**Product habit:** Test before launch, observe after launch, and turn meaningful failures into new evals.

---

## Working Effectively With AI

### Separate project state from today's task

Keep stable goals, decisions, constraints, current status, and known issues in a small source-of-truth context. Give the model today's specific task separately.

**Why:** Cleaner context makes long projects and cross-model handoffs more reliable.

### Steer instead of restarting

When a long task changes direction, give the AI the new constraint and ask it to identify what changes while preserving work that is still useful.

**Key term:** **Steering** means changing or adding instructions while AI work is already underway.

### Define the test before generating the work

For important outputs, establish the evaluation criteria first, then generate or review against them. For higher-stakes work, use a separate review pass.

**Why:** It makes quality less dependent on whether the first answer happens to look convincing.

### Use a two-stage verifier

Run cheap deterministic checks first: required facts, valid fields, correct links, expected structure, and other hard conditions. Then use AI judgment only for the parts that genuinely require interpretation.

**Why:** It reduces cost and makes failures easier to diagnose.

### Verify the assumptions that can change the decision

When AI gives a recommendation, identify the few claims or assumptions that would change the conclusion if they were wrong. Verify those with sources, tools, or calculations, then revise the recommendation if needed.

**Why:** Verification effort goes to the facts that actually matter.

### Choose context deliberately when delegating

Give continuation work the relevant prior context. Give an independent reviewer or self-contained research task a clean context so earlier reasoning does not anchor it unnecessarily.

**Why:** Inherit context for continuity; isolate it for independent checks.

### Load context progressively

Start with a compact source map or index, then bring in only the files, sections, or records the task actually needs.

**Why:** Less irrelevant context reduces distraction, repeated cost, and stale information crowding out the current source of truth.

### Fan out, then merge

For a complex question, split the work into a few focused branches with different jobs, then reconcile conflicts against explicit criteria instead of simply averaging the answers.

**Why:** Parallel exploration improves coverage while keeping each branch focused.

### Turn good one-off work into a reusable skill

When a recurring AI task works well, capture the trigger, inputs, tools, steps, checks, and expected output as a reusable skill, runbook, or project instruction.

**Why:** Reusable procedures make AI work more consistent and easier to improve.

### Give data work a mini semantic layer

Before asking AI to analyze a spreadsheet, dashboard, or database extract, write down the few business definitions that could change the answer and tell the model to flag anything still ambiguous.

**Why:** It helps prevent a polished analysis from quietly using the wrong meaning of a metric.

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

The orchestration layer around a model that manages context, tools, and the flow of multi-step work.

### Agent skill

A reusable set of instructions and tool-use patterns for doing one specific job consistently.

### Context isolation

Giving a subtask only the context it needs so unrelated history does not bias or clutter the work.

### Evals

Repeatable tests that measure whether an AI system behaves well enough for its intended job.

### Offline eval

A test run before release against known cases where you can define expected behavior.

### Online eval

A check on live behavior after release, often without one pre-written correct answer.

### LLM as judge

Using one language model to grade another output against a written rubric. Useful for nuanced checks, but it needs calibration and can share model biases.

### Long-horizon agent

An AI system pursuing a goal across many steps or an extended workflow.

### Scaffolding

External structure, tools, and saved state that help AI stay oriented during complex work.

### Execution boundary

The boundary between what AI may interpret or decide and what trusted software or people may actually change.

### Safety case

A structured, evidence-backed argument that a system is safe enough for a defined use or change, including the remaining uncertainty.

### Auditability

The ability to trace actions, tool use, sources, and decisions after the fact.

### Monitorability

How well you can detect whether an AI system is behaving safely and correctly while it works.

### Defense in depth

Using several independent safeguards so one failure does not remove all protection.

### Sandbox

An isolated environment where an agent can run code, inspect files, or use tools without direct access to the main production system.

### Model routing

Choosing different models for different tasks based on difficulty, cost, speed, or risk.

### Steering

Changing or adding instructions while an AI task is already underway.

### Multimodal interface

An interface that accepts or produces more than one mode, such as text, voice, images, or files.

### Federated access

Controlled access to multiple existing data sources without first copying them into one database.

### OAuth scope

A specific permission granted to an app or agent. Narrow scopes help keep access limited to what the user actually approved.

### Prompt injection

When instructions hidden in user input, files, websites, or retrieved content try to make the model ignore its intended rules or take unsafe actions.

### Fan-out / fan-in

Splitting one problem into focused parallel branches, then merging the results through a final synthesis or decision step.

### Semantic layer

Shared definitions and relationships that explain what business data means so people and AI use metrics consistently.

### Agent trajectory

The sequence of model responses, tool calls, observations, and decisions across an agent run.

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

1. What job are we actually trying to make more reliable, faster, or easier?
2. How reliable is the whole system at that job, not just the model in a demo?
3. What is authoritative, and how does the AI get grounded in it?
4. What can the AI see, decide, and do? What still requires a person?
5. Which limits must be centrally enforced so builders or users cannot weaken them?
6. Which parts need flexible AI reasoning, and which should be deterministic?
7. What failure would be merely annoying versus genuinely harmful?
8. What representative scenarios and edge cases should become evals?
9. Which checks can be deterministic, which need an LLM judge, and how will we calibrate the judge?
10. What can this AI verify directly by running a test, script, calculation, or tool call?
11. What should we test before release, and what should we monitor on live traffic?
12. What important project state should live outside the model?
13. How will we recover when a multi-step agent gets something wrong?
14. How will we inspect what the agent actually did after the fact?
15. What can we observe directly instead of relying on the model to explain itself?
16. Do all steps need the strongest model, or can we route work differently?
17. What are we optimizing for in model selection: speed, cost, quality, or risk?
18. What budget, iteration, or time cap should stop an agent before it runs away?
19. Does this interaction fit the user's real workflow, or are we adding AI-shaped friction?
20. Which source systems does the AI truly need, and can access remain permissioned?
21. Whose identity is the agent acting under, what exact scopes are granted, and can they be revoked?
22. What happens when the agent lacks a source or permission: does it fail clearly or guess?
23. What untrusted content could reach the model, and what stops it from becoming an instruction?
24. If the AI improves, does this product or workflow still earn its maintenance cost?
25. Which subtasks should inherit existing context, and which should get a clean context?
26. Which recurring jobs should become a reusable skill or runbook?
27. Which business definitions or metric rules must be fixed before AI analyzes the data?
28. Which step caused this agent failure, and which later failures only inherited it?
29. Are infrastructure health and agent quality being monitored separately?
30. What does one successful outcome cost after retries, turns, and review?
31. Which context can be loaded only when needed instead of sent every time?
32. Are we measuring adoption, actual workflow use, and user or business value separately?
33. What evidence would justify giving this system more autonomy, access, or scope?
34. Can we change the model or provider without rebuilding the agent workflow?
35. If the interface changes or disappears, where do the authoritative business rules, permissions, and actions still live?
