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

None blocking as of the last update. If you're an assistant reading this and
something here is stale or you're picking up unfinished work, correct this
section rather than leaving it as-is.

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
