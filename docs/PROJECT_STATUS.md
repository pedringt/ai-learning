# Project status

This file is the current, shared picture of where this project stands. It exists so that any AI assistant or new chat session can pick up work without re-deriving context from scratch.

## Current status

_Last updated: September 5, 2026_

`main` remains the production branch. `staging` is the active test branch for the State hardening work and uses the separate staging backend.

Current staging changes include:

- five product-owned Ask starters that are assembled deterministically from live State data and skip the model call;
- deterministic refinement shortcuts for recognized structural refinements;
- bounded interactive Ask provider behavior with no automatic retry spiral;
- free-form Ask streaming restored so useful text appears before the validated final answer is complete;
- Ask timing instrumentation that separates context work from provider time;
- cleaner Ask related-item treatment and more accurate grounding language;
- browser Back/Forward support for Workspace, Project, Open Items, Notes, and History;
- review-completion wording and several Open Items/empty-state polish changes.

The five starter prompts are fast. Free-form Ask remains provider-bound: recent successful model-backed calls have commonly taken roughly 15–28 seconds end to end, with context assembly taking only a few milliseconds. Streaming improves perceived latency, and Ask is capped to a single bounded attempt so a transient provider timeout does not turn into a 60–70 second retry chain.

`staging` has been reconciled with the latest `main` ancestry so GitHub should no longer report it as behind solely because of the two documentation commits that landed on `main` after staging branched.

## Open items

Before any production merge:

- smoke-test browser Back/Forward through several State views;
- smoke-test all five starter prompts plus several free-form Ask queries and refinements;
- verify Copy, New ask, Review/Open links, and the Related open items treatment;
- check mobile and dark mode for regressions;
- keep the staging-only API endpoint configuration out of `main`;
- move production-ready changes through a normal feature PR rather than merging the staging branch directly.

## Hard constraints

- Do not weaken State's authority model: Current State is distinct from Evidence, Reviews, Questions, and History, and consequential Current State changes require human authorization.
- Keep deterministic schema/semantic/authority enforcement around model output.
- No auth, multi-tenant/organizations, vector DB, RAG, or agent framework for this scoped learning project.
- Do not deploy or merge to `main` speculatively.
