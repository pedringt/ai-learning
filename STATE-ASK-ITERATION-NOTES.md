# State Ask — deterministic retrieval iteration

This iteration keeps Ask non-AI and makes it more useful as a forgiving interface over structured project state.

Changes:
- Framing is now “Ask what State knows about the project.”
- Canned scenario matching is substantially more conservative to reduce confident false routes.
- Added deterministic topic retrieval across Current State, Notes/evidence, Open Items, and History.
- Results visibly distinguish Current State, Evidence, Pending Review, Open Question, and Historical / Superseded information.
- Historical language such as changed, originally, previously, used to, superseded, and selected “why” questions routes to History.
- Existing high-value templated scenarios remain: meeting prep, weekly summary, leadership/support drafts, known unknowns, contact lookup, implementation readiness, and the feature-access review demonstration.
- Unsupported questions still fall back rather than guessing.

Suggested manual prompts:
- What's the current pilot scope?
- What do we know about human review?
- Can the AI send replies automatically?
- What are our success metrics?
- What does Security care about?
- Show me notes about security.
- What did we originally think about automation?
- How has feature access changed?
- Did we ever consider Slack as a source?
- Why isn't Slack included?
- What is unresolved about retention?
- What do we know about training?
- What should we do next? (should fall back rather than invent an answer)
