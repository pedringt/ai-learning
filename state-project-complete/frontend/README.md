# Project Context Workspace — behavioral prototype

Project Context Workspace is the redesigned Implementation Context prototype. It follows `PROJECT-CONTEXT-UI-UX-FROZEN-IMPLEMENTATION-SPEC.md`: high fidelity in product behavior and interaction, intentionally low fidelity in backend AI implementation.

## Editable source

- `index.html` — application shell and five-part information architecture
- `context-tool.css` — product styling
- `context-data.js` — deterministic fixture/state model
- `context-app.js` — routing, rendering, state transitions, Review decisions, Questions, Notes, and History behavior

## Product model

Primary navigation is **Overview · Notes · Questions · Review · History**. `+ Add information` is a persistent write action. Overview is a fixed-size launching surface; substantive AI results replace it temporarily in-page and disappear when the user returns.

The prototype supports deterministic natural-language variants for retrieval, Q&A, change summaries, Security meeting preparation, summaries, leadership drafting, and unresolved questions. Unsupported queries fail intentionally. Pending evidence is surfaced through explicit topic relationships and is never silently incorporated into current understanding.

## Core trust loop

**Ask → encounter an unknown → track it → add evidence → leave Review pending → encounter relevant pending evidence during normal work → review → update current understanding → ask again → see changed output → inspect History.**

A second seeded Security review demonstrates that reviewed evidence can resolve an open question and leave a History trace.

## Prototype honesty

There is no live model, production retrieval, embeddings, vector store, database, authentication, or backend. Retrieval, classification, generation, relevance, and state transitions are simulated using deterministic fixtures and curated interactions.

## Project browse view (Aug 31 prototype update)
Project is a deterministic, readable view of maintained Current State. It uses three intentionally broad categories: Product & Workflow, Safety & Constraints, and Evaluation & Rollout. Categories are populated from `knowledge[].projectArea`; pending review does not change the displayed statement until Review is accepted. The only category-management control exposed in the prototype is hide/show. This deliberately leaves edge-case taxonomy and user reorganization out of scope until real testing shows they matter.
