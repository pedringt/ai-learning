# AI Professional Edge

*A compact, living reference for the AI techniques, product patterns, tools, and questions I am actively using or watching.*

Durable principles live in Durable AI Knowledge. Day-to-day efficiency habits live in the Efficient AI Use for Product Work cheat sheet. This page stays closer to current patterns, tools, vocabulary, and techniques that may change.

<!-- edge-review: 2026-10-04 -->

---

## Ways I Work With AI

### Define the test before generating the work

For important outputs, establish the evaluation criteria first, then generate or review against them. For higher-stakes work, use a separate review pass.

**Why:** Quality becomes less dependent on whether the first answer happens to look convincing.

### Verify the assumptions that can change the decision

When AI gives a recommendation, identify the few claims or assumptions that would change the conclusion if they were wrong. Verify those with sources, tools, or calculations.

**Why:** Verification effort goes to the facts that actually matter.

### Test permission boundaries deliberately

Run a task while intentionally withholding one source or permission. Watch whether the agent states what it cannot know, asks for access, or quietly invents missing information.

**Why:** It is a fast check of whether the system respects access boundaries and uncertainty.

---

## Current Product Patterns

These are useful patterns I want close at hand, but they are still specific enough to stay here rather than in Durable Knowledge.

### Separate knowledge from procedure

Retrieval is good at bringing the right facts into context. Skills and runbooks are better for teaching a repeatable method, including what order to follow, which checks to run, and which failure modes to catch.

**Ask:** Does this job fail because the AI lacks information, or because it applies the wrong procedure?

### Design workflows to survive interruption

Multi-step AI work may time out, fail halfway through, receive the same request twice, or pause for human input. Save progress explicitly and make retries safe.

**Ask:** If this stops halfway through or runs twice, what happens?

### Diagnose multi-step failures at the first bad step

A final success or failure score can hide the real bug. Trace a long run back to the first wrong response or tool action, then separate that root cause from later steps that inherited it.

**Product habit:** Fix the step where the failure starts, not the last place it becomes visible.

### Ground analysis in shared business definitions

AI can query the right data and still reach the wrong business conclusion if terms such as active customer, churn, or revenue are ambiguous. Give analysis a small semantic layer with the definitions that matter.

**Ask:** Which business definitions must be fixed before the AI starts analyzing?

### Map an interface into capabilities

For an existing workflow, ignore the current screens and map the user goal, data, action, permission or approval, and system of record. Then decide which capabilities could be exposed to AI without recreating the whole UI.

**Why:** It reveals whether you are redesigning the job or merely putting a chat box on top of old screens.

### Keep the agent layer and model provider separable

The workflow, skills, permissions, and user experience do not have to come from the same vendor as the model. Keeping those layers separable can make model changes less disruptive.

**Ask:** Can we change the model or provider without rebuilding the agent experience?

### Treat persistent agents as standing product roles

AI products are increasingly moving from one-off interactions toward persistent agents that can hold a role, retain relevant context, use approved tools, and continue work across sessions. That turns product design from a single prompt and response into an ongoing workflow.

Scope the role explicitly: its goal, context and memory, tools, authority, execution rules, observability, evaluation, human intervention, and how long its authority should remain valid. Permissions that make sense for a short task may be too broad for a worker that can keep acting indefinitely.

**Ask:** When does a repeated workflow deserve a standing AI worker? What does it own, remember, access, and need approval for? How long does that authority last, and when should it expire or be renewed?

### Behavior contracts may become more important than model selection

Today, teams often choose a specific model first. A more mature pattern may be to define the behavior a workflow needs, such as quality, latency, cost, tool support, output structure, and risk tolerance, then map that contract to an approved model or model configuration.

**Why:** Models change quickly. The durable product requirement is the behavior the job needs, while the underlying model may become a replaceable implementation detail.

### Treat model behavior like a versioned dependency

A stable API does not guarantee stable product behavior. A provider can change the model behind an alias or managed preset and shift outputs, tool use, refusals, latency, cost, or edge-case handling without any change to your own code.

**Product habit:** Track the resolved model or configuration, run affected evals after known upstream changes, and use small scheduled behavioral canaries to catch changes you were not explicitly told about.

---

## Tools & Systems Worth Knowing

These are not endorsements or a shopping list. They are useful examples of how current AI products are solving recurring product and architecture problems.

### Specialized models and bounded decisions

- [**TypeSafe AI · Jev**](https://typesafe.ai/blog/introducing-system-one-models-and-jev) — A specialized “System One” model for fast, typed decisions such as classification, routing, scoring, and escalation. Useful as a concrete example of not using a generative LLM for every judgment.
- [**Astra for Law**](https://help.openai.com/en/articles/20001528-astra-for-law) — A vertical AI system combining a strong general model with a refreshed legal index, domain instructions, plugins, and cited-source review. Useful as an example of specialization through the whole system, not just model training.

### Memory, context, and business knowledge

- [**Jev-Mem**](https://arxiv.org/abs/2609.23986) — A research architecture that uses a lightweight control layer to decide what memory to retrieve, how much to retrieve, and when to stop before heavier reasoning runs.
- [**V7 Context Graph**](https://openai.com/index/v7/) — An enterprise example of turning scattered documents into structured, source-linked entities, relationships, facts, and citations that agents can use.
- [**UiPath Cartographer**](https://www.uipath.com/product/cartographer) — Builds a living, governed “Map of Work” from process knowledge, including rules, exceptions, systems, judgment, provenance, and approvals.

### Agent governance and enterprise access

- [**Dataiku Agent Management**](https://www.dataiku.com/company/news/dataiku-agent-management-general-availability) — Discovers agents across platforms and tracks ownership, value, technical performance, and risk.
- [**Okta Agentic Enterprise Blueprint**](https://www.okta.com/solutions/secure-ai/agentic-enterprise-blueprint/) — A reference architecture for agent identity, task-scoped access, traceable delegation, runtime monitoring, and containment.
- [**AWS AgentCore + MCP multi-account pattern**](https://aws.amazon.com/blogs/machine-learning/build-a-multi-account-ai-agent-with-agentcore-gateway-and-mcp/) — A federated pattern where teams keep ownership of their data while agents access approved capabilities through controlled gateways.

### Agent tooling and deployment patterns

- [**Vercel Plugin for Coding Agents**](https://vercel.com/changelog/introducing-vercel-plugin-for-coding-agents) — A useful example of dynamically loading current platform knowledge and specialized skills into an agent instead of stuffing everything into a system prompt.
- [**Vercel AI SDK 7**](https://vercel.com/blog/ai-sdk-7) — A practical reference for production agent capabilities such as tool approvals, durability, sandboxes, telemetry, model-provider flexibility, and realtime voice.
- [**Tenable CyberAgents Exchange AI Inspector**](https://www.tenable.com/blog/ai-agent-security-openai-tenable-cyberagents-exchange-inspector) — An example of evaluating community-built agents, skills, MCP servers, and multi-agent playbooks before deployment.
- [**SoundHound OASYS Edge**](https://www.soundhound.com/resource/introducing-oasys-edge) — A concrete example of deploying voice agents locally, in the cloud, or as a hybrid based on latency, privacy, connectivity, and cost.

---

## Things I'm Watching

### AI Discovery & AEO

Answer Engine Optimization matters when AI systems act as a customer's research layer. The useful goal is not to game a chatbot; it is to make accurate, current, differentiating information easy for AI systems to find and understand.

**Ask:** When an AI evaluates a product for a customer, what does it understand correctly and where does that understanding break down?

A practical test:

- ask realistic buyer questions
- try multiple models and small wording variations
- inspect the visible sources behind the answer
- note what information is missing, stale, or ambiguous
- rerun the same tests over time

### Memory routing and context budgets

Systems such as Jev-Mem point toward memory becoming more actively managed: deciding what to retrieve, how much to retrieve, and when more context stops being worth the cost.

**Ask:** What deserves to enter context for this step, and what can stay outside it?

### Voice and local or hybrid agents

Realtime voice and local or hybrid execution are making latency, privacy, connectivity, and environment part of the product decision rather than implementation details.

**Ask:** Does this job benefit enough from immediacy or local execution to justify a different architecture?

### Persistent and shared bots

Personal and team bots point toward a different product model: instead of opening a fresh chat each time, people may work with named AI roles that keep context, use assigned tools, and operate within defined permissions over time.

**Ask:** If this bot became a long-running coworker, what should it remember, what should it forget, and when should it ask a person before acting?

---

## Working Vocabulary

These are the terms I still find useful enough to keep visible.

### Bot

A broad, informal term for AI set up to do a job. Some bots only respond to requests; others are more capable and persistent.

### Agent

A more specific kind of bot that can choose steps or tools to pursue a goal within defined permissions and stopping rules.

### Agent harness

The orchestration layer around a model that manages context, tools, state, and the flow of multi-step work.

### Agent skill

A reusable procedure that tells an agent how to do one kind of job, including the method, tools, checks, and expected output.

### Context isolation

Giving a subtask only the context it needs so unrelated history does not bias or clutter the work.

### Compaction

Compressing older context into a smaller summary so a long-running agent can keep working. Because that summary shapes future behavior, treat it as persisted state.

### Execution boundary

The boundary between what AI may interpret or decide and what trusted software or people may actually change. For consequential actions, prefer fail-closed controls: if permission or policy cannot be verified, block the action rather than assume it is safe.

### Fan-out / fan-in

Splitting one problem into focused parallel branches, then merging the results through a final synthesis or decision step.

### Semantic layer

Shared definitions and relationships that explain what business data means so people and AI use metrics consistently.

### Trace / span

A trace is the recorded end-to-end run. A span is one operation inside it, such as a model call, retrieval, or tool call.

### Silent quality failure

The software executes without an obvious technical error, but the AI still fails the user by misunderstanding the goal, choosing the wrong tool, or producing an unacceptable result.

### Headless architecture

A design where useful data, business logic, permissions, and actions can be accessed independently of the original user interface while the source system still owns the rules.

### Behavioral canary

A small set of critical eval cases run regularly to detect meaningful drift in AI behavior before a full regression suite is needed.

### Blast radius

The amount of harm a failure could cause before someone notices and stops it. A workflow with broader permissions, more users, or harder-to-reverse actions has a larger blast radius.

---

## Questions I'm Adding to My Toolkit

These are the questions that still feel useful beyond the shorter durable set.

1. Does this job need more facts, or a better procedure for applying the facts?
2. Which tasks should inherit existing context, which need a clean context, and what can be loaded only when needed?
3. If a multi-step agent fails, where did the first bad step occur and how will the workflow recover?
4. Which business definitions must be fixed before AI analyzes the data?
5. Can the model provider or interface change without rebuilding the authoritative workflow underneath it?
6. Can this model, alias, or preset change underneath us, and how will we know if that changes product behavior?
7. If the underlying AI improves, does this workflow still earn its maintenance cost?
8. If this were a standing AI worker instead of a one-off interaction, what would it own, remember, access, and need approval for?
9. What evidence would we need before moving this from pilot to a standard workflow?
