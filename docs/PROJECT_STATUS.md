# Project status

This file is the current, shared picture of where this project stands. It
exists so that any AI assistant — or any new chat session with one — can pick
up work here without re-deriving context from scratch or relying on notes that
only existed in one earlier conversation. If you are an assistant starting
work on this repo, read this file first.

Update this file's **Current status** and **Open items** sections as part of
any work session that changes them. Treat it like `docs/architecture/` — a
live description of *now*, not a running log. If you need to leave a durable
record of what happened, that belongs in `docs/history/`, not here.

---

## Current status

_Last updated: September 5, 2026_

`main` is deployed and current. The repository cleanup described in
`docs/history/` (one authoritative frontend/backend copy, honest README,
runnable tests, CSS consolidation, the Ask response cache) is merged. CI runs
on every push to `main` and every pull request (`.github/workflows/tests.yml`)
— Python and JavaScript suites, deterministic, no live model calls.

Both production services deploy automatically from `main`:

- Frontend: Vercel, static hosting, from the repository root.
- Backend: Render (`state-api`), `rootDir: state-project-complete`. See root
  `render.yaml`.

There is also a `staging` branch and a separate Render service
(`state-api-staging`) wired to it, for testing backend changes against a real
model before they reach `main`. `staging` carries one commit not meant for
`main` — it points the frontend at the staging backend instead of production.
Never merge `staging` into `main` directly; when work on it is ready, open a
normal PR from the feature branch into `main` instead.

## Open items

**In progress on `staging` (not on `main`):** Phase 1 of a planned "Ask
speed" pass. Commit `c47cc73` adds:

- A deterministic-refinement shortcut — recognized structural refinements
  ("make this 3 bullets," "shorten it," "focus on blockers," "turn into
  agenda," "leadership-ready," "more detailed") now skip the model call
  entirely when a previous answer exists. `ask_refinement_transforms.py`
  already reshaped these deterministically with zero AI involvement, but the
  old path paid for a full context fetch and a real model round-trip first
  and threw most of that output away.
- A split latency `timing` breakdown: `context_ms` is now backed by separate
  `db_ms` (raw `list_state`/`list_reviews`/etc. queries) and `trim_ms`
  (lexical relevance scoring) fields, and streaming responses also get
  `first_token_ms`.

Backend suite passes (242 passed, 4 skipped) but this hasn't been exercised
against a live model on the staging deploy yet, and isn't merged toward
`main`. Next planned step: use the new db_ms/trim_ms/first_token_ms fields to
see where remaining latency actually goes on non-refinement queries before
doing more Ask-speed work (routing common Ask jobs deterministically,
per-job output-length limits).

If you're an assistant picking this up: check `staging`'s latest commit
against this note before assuming it's still current, and correct this
section if something here is stale.

## Hard constraints

These carry forward to any future change, regardless of who or what makes it:

- The authority model in the root `README.md` is not to be weakened for
  convenience — see that file for the specifics (Evidence vs. Current State,
  human authorization for consequential changes, optimistic concurrency, and
  so on).
- No auth, multi-tenant/organizations, vector DB, RAG, or agent framework.
  This is a scoped learning project with intentional tradeoffs, not an
  enterprise build-out.
- Browser Ask streaming stays disabled (a prior implementation produced
  corrupted output); it's parked, not removed, in case it's revisited.
- Don't deploy or merge to `main` speculatively. This project has occasionally
  been under an explicit review freeze (a human reviewing the live site before
  further changes ship) — check with the project owner before assuming none
  is in effect.
