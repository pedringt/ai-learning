# Project status

This file is the current, shared picture of where this project stands. It exists so that any AI assistant or new chat session can pick up work without re-deriving context from scratch.

## Current status

_Last updated: September 4, 2026_

`main` is the production branch and contains the tested State hardening work released on September 4. The current `main` test workflow is green across the deterministic Python/Playwright suite and the JavaScript Ask behavior suite.

Production now includes:

- five product-owned Ask starters assembled deterministically from live State data, skipping the model call;
- deterministic refinement shortcuts for recognized structural refinements;
- bounded interactive Ask provider behavior with no automatic retry spiral;
- free-form Ask streaming so useful text appears before the validated final answer is complete;
- Ask timing instrumentation that separates context work from provider time;
- cleaner Ask related-item treatment and more accurate grounding language;
- browser Back/Forward support for Workspace, Project, Open Items, Notes, and History;
- review-completion wording and Open Items/empty-state polish;
- normalized frontend asset cache versions and updated regression coverage.

Render production is configured on the Starter plan, not the sleeping free plan. Treat cold-start/spin-down as already addressed unless production telemetry demonstrates a different hosting problem.

The five starter prompts are intentionally fast. Free-form Ask remains provider-bound: recent successful model-backed calls have commonly taken roughly 15–28 seconds end to end while context assembly takes only a few milliseconds. Streaming improves perceived latency, and Ask is capped to a single bounded attempt so a transient provider timeout does not turn into a retry chain.

`staging` is currently ahead of `main` only for staging-specific/experimental work: its frontend points at the staging backend, and it carries an unpromoted Ask output-budget experiment that lowers `ASK_ONE_CALL_MAX_TOKENS` from 1800 to 1650. Do not merge `staging` wholesale into `main` because the staging API endpoint must not reach production. The 1650-token experiment should be promoted only after live quality/latency validation shows it is an improvement without increasing truncated or invalid Ask responses.

## Open items

Remaining work is validation and measured improvement, not another State redesign:

- do a deployed smoke pass of browser Back/Forward, retained Ask state, New ask, Reset demo, Copy, Review/Open links, and Related open items;
- include mobile and dark mode in that deployed smoke pass;
- compare production Ask timing logs before making another latency change, with provider time treated as the primary suspect rather than Render cold start;
- live-test the staging 1650-token Ask budget against representative free-form questions before deciding whether to promote it;
- keep the staging-only API endpoint configuration out of `main`.

The older `docs/history/STATE_DEFERRED_QA_NOTES_2026-09-03.md` is historical. Several of its test-maintenance items are now covered by the green current suite; use this file for the current remaining work rather than treating that old list as an active backlog.

## Hard constraints

- Do not weaken State's authority model: Current State is distinct from Evidence, Reviews, Questions, and History, and consequential Current State changes require human authorization.
- Keep deterministic schema/semantic/authority enforcement around model output.
- No auth, multi-tenant/organizations, vector DB, RAG, or agent framework for this scoped learning project.
- Do not deploy or merge to `main` speculatively.
