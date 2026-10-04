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

Useful examples of how current AI products are solving recurring product and architecture problems, not endorsements or a shopping list.

### Specialized models and bounded decisions

- [**TypeSafe AI · Jev**](https://typesafe.ai/blog/introducing-system-one-models-and-jev) — Specialized model for fast, typed decisions such as classification, routing, scoring, and escalation.
- [**Astra for Law**](https://help.openai.com/en/articles/20001528-astra-for-law) — Vertical AI combining a general model with legal data, domain instructions, plugins, and cited-source review.

### Memory, context, and business knowledge

- [**Jev-Mem**](https://arxiv.org/abs/2609.23986) — Lightweight control layer that decides what memory to retrieve, how much, and when to stop.
- [**V7 Context Graph**](https://openai.com/index/v7/) — Turns scattered documents into structured, source-linked facts, entities, relationships, and citations.
- [**UiPath Cartographer**](https://www.uipath.com/product/cartographer) — Maps process knowledge, rules, exceptions, systems, judgment, provenance, and approvals.

### Agent governance and enterprise access

- [**Dataiku Agent Management**](https://www.dataiku.com/company/news/dataiku-agent-management-general-availability) — Tracks agents across platforms, including ownership, value, performance, and risk.
- [**Okta Agentic Enterprise Blueprint**](https://www.okta.com/solutions/secure-ai/agentic-enterprise-blueprint/) — Reference architecture for agent identity, scoped access, delegation, monitoring, and containment.
- [**AWS AgentCore + MCP multi-account pattern**](https://aws.amazon.com/blogs/machine-learning/build-a-multi-account-ai-agent-with-agentcore-gateway-and-mcp/) — Federated pattern for controlled agent access while teams retain data ownership.

### Agent tooling and deployment patterns

- [**Vercel Plugin for Coding Agents**](https://vercel.com/changelog/introducing-vercel-plugin-for-coding-agents) — Loads current platform knowledge and specialized skills dynamically instead of stuffing everything into one prompt.
- [**Vercel AI SDK 7**](https://vercel.com/blog/ai-sdk-7) — Reference for approvals, durable execution, sandboxes, telemetry, provider flexibility, and realtime voice.
- [**Tenable CyberAgents Exchange AI Inspector**](https://www.tenable.com/blog/ai-agent-security-openai-tenable-cyberagents-exchange-inspector) — Evaluates community-built agents, skills, MCP servers, and playbooks before deployment.
- [**SoundHound OASYS Edge**](https://www.soundhound.com/resource/introducing-oasys-edge) — Example of local, cloud, or hybrid voice deployment based on latency, privacy, connectivity, and cost.

---

## Watching

- **AI Discovery & AEO:** Can AI systems find and correctly understand the facts that matter when they research a product for a customer?
- **Memory routing and context budgets:** Which information deserves to enter context for this step, and when does more context stop being worth the cost?
- **Voice and local or hybrid agents:** When do latency, privacy, connectivity, or environment justify local or hybrid execution?
- **Persistent and shared bots:** If an AI becomes a long-running coworker, what should it remember, forget, access, and ask before acting?

---

## Working Vocabulary

- **Bot:** Broad term for AI set up to do a job. Some only respond; others are persistent and more capable.
- **Agent:** AI that can choose steps or tools to pursue a goal within defined permissions and stopping rules.
- **Agent harness:** The layer around a model that manages context, tools, state, and multi-step execution.
- **Agent skill:** A reusable procedure for doing one kind of job, including method, tools, checks, and expected output.
- **Context isolation:** Giving a subtask only the context it needs.
- **Compaction:** Compressing older context so long-running work can continue; treat the summary as persisted state.
- **Execution boundary:** The line between what AI may interpret or decide and what trusted software or people may actually change. For consequential actions, fail closed when permission or policy cannot be verified.
- **Fan-out / fan-in:** Split one problem into focused parallel branches, then merge the results.
- **Semantic layer:** Shared definitions and relationships that keep business data meaning consistent.
- **Trace / span:** A trace is the full recorded run; a span is one operation inside it.
- **Silent quality failure:** The software works technically, but the AI still misunderstands the goal, uses the wrong tool, or gives an unacceptable result.
- **Headless architecture:** Data, rules, permissions, and actions are accessible independently of the original UI while the source system still owns the rules.
- **Behavioral canary:** A small set of critical eval cases run regularly to detect meaningful behavior drift.
- **Blast radius:** How much harm a failure could cause before someone notices and stops it.

---

## Questions I'm Adding to My Toolkit

1. Does this job need more facts, or a better procedure for applying the facts?
2. If a multi-step agent fails, where did the first bad step occur and how will the workflow recover?
3. Which business definitions must be fixed before AI analyzes the data?
4. Can the model or provider change without rebuilding the authoritative workflow, and how will we know if behavior changes underneath us?
5. If this were a standing AI worker, what would it own, remember, access, need approval for, and how long should that authority last?
6. What evidence would we need before moving this from pilot to a standard workflow?
