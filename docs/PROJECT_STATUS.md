# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: September 15, 2026 Pacific time._

## Current product state

State is a working portfolio/learning product for maintaining trustworthy project understanding as new information arrives.

Core authority model:

> **AI interprets. Software enforces. People authorize.**

The product currently includes:

- immutable Evidence/Notes intake
- AI interpretation with schema and semantic validation
- human-authorized Reviews
- human adjustment of AI proposals while preserving the original proposal for provenance
- Open and Blocking Questions
- Review-to-Question creation/linking/resolution flows
- Current State as a readable maintained project wiki
- History with accepted transition provenance
- Ask with authority-aware grounding, streaming, follow-ups, cancellation, and project isolation
- project rules in Settings
- project switching with the Northstar and Juniper Office Move seeded examples
- Slack intake from approved channels plus sharing accepted changes back to Slack

State is a portfolio and learning product. There is no planned external pilot or customer rollout. Portfolio reviewers/demo visitors may use it. Product exercises may model what a real deployment would require, but the repo must not invent customers, adoption, pilot results, or production-user evidence.

## Branch and deployment state

`staging` is at `ca308a0` (verified deployed to `state-api-staging`). `main` has not been updated with the September 15 work below; promotion needs explicit authorization. Verify the current branch heads when resuming work rather than assuming they are still identical.

September 15 additions on `staging`, on top of the September 14 QA baseline:

- Fixed the blank-project bug cluster: Notes cross-project leakage (`syncApiEvidence()` matched static fixture notes via a double-negative filter), a hydration race on rapid project switching, missing Reset/Delete project lifecycle controls (two separate Settings surfaces both needed the fix), and a non-state-aware onboarding banner.
- Added bootstrap mode (`BOOTSTRAP_GUIDANCE`, active only when a project's Current State is empty) and explicit human promotion (`POST /api/evidence/{id}/promote`, the "Ask State to reconsider this" button) so a person can force State to reconsider Evidence it previously declined. Neither path bypasses Review or writes Current State directly. Verified against the real Anthropic model, not just mocked providers.
- Added drag-and-drop file upload to the Add Evidence dialog; drops of more than one file are rejected with a message rather than silently truncated to the first file.
- Fixed a cross-project 500 in `_reanalyze()` (unscoped evidence-id lookup let a cross-project id crash instead of 404ing); affects both `/reanalyze` and the new `/promote`.
- Filed [#145](https://github.com/pedringt/ai-learning/issues/145): production `state-api` has no persistent disk and no Postgres anywhere in the Render account, so every production deploy wipes non-seeded project data. Not yet fixed, pending an infra decision (disk vs. Postgres).
- Filed [#146](https://github.com/pedringt/ai-learning/issues/146): the promote button only appears on a Note when State generated zero Reviews for it (`no_review_needed`). It does not appear when State generated Reviews that never produced a Current State create/update (e.g. all resolved as open questions) -- confirmed live on staging, where this is exactly the case blocking one user-created project's baseline. Not yet fixed.
- Confirmed staging's own ephemeral-storage risk in practice, not just by inspection: two user-created staging projects' ids changed mid-session across redeploys, discarding their Notes/Current State. Tracked as R-014 in `docs/product/RISKS.md` (accepted staging tradeoff, distinct from the production risk in #145).

Production surfaces:

- Portfolio: `https://ai-learning-rouge.vercel.app/`
- State case study: `https://ai-learning-rouge.vercel.app/implementation-context`
- State product: `https://ai-learning-rouge.vercel.app/implementation-context-prototype/`
- Production API: Render `state-api`

Staging surfaces:

- Frontend: Vercel staging/preview for the `staging` branch
- Backend: `https://state-api-staging.onrender.com`

Hard release rule: product/site changes go through `staging` first unless the user explicitly authorizes a narrow exception. Promotion to `main` always requires explicit current authorization. Passing tests is not permission to deploy.

## Latest verified QA baseline

Application commit `afdc24582624c3d40cbc1b721eded8a48d1a68d6` recorded a green deterministic verification baseline of:

- 479 Python tests passed
- 18 frontend VM/behavior suites passed
- 15 Playwright browser tests passed

Treat those as evidence for that commit, not a permanent claim about future heads. Use the current GitHub Actions results for newer commits.

For routine QA, use the repository-root `QA.md` and `Makefile`:

```bash
make qa-fast
make qa-release
```

GitHub Actions runs the fast deterministic suite on pull requests and on pushes to `main`/`staging`. The frontend CI job automatically runs every `state-*-tests.js` suite.

## Deploy verification rule

After any push that changes `state-project-complete/` on a Render-backed branch, verify the code actually being served before trusting further smoke tests.

Use:

```bash
scripts/verify-render-deploy.sh <service>/health [expected-sha]
```

This checks the `/health` response's actual build SHA. Do not rely only on the Render dashboard/API reporting a deploy as live. A September 14 incident showed the dashboard could report the expected commit while the service still served older code.

## Current product invariants

Do not weaken these without an explicit product decision:

- AI never authorizes Current State changes.
- Evidence is immutable.
- Accepted state changes and History are written atomically.
- Stale proposals fail closed.
- Unknown is not equivalent to `0`, `false`, or absent.
- Schema-valid model output can still be semantically wrong.
- Ask is read-only and cannot present pending proposals or uncertainty as settled fact.
- Review outcomes are independent.
- Project data must stay isolated across projects.
- Provenance must remain available for consequential accepted changes and human-adjusted AI proposals.

## Current known risks

See `docs/product/RISKS.md` for the maintained register. The most important implementation-specific known risk is:

- `project_areas.id` is a global primary key rather than project-scoped. It works for the two current seeded projects because their IDs do not collide, but it should be redesigned before expanding the project model further.

Known UX issue:

- Ask's **What should I know?** starter (`meeting_prep`) can visibly grow and then shrink on the first streamed answer. The raw streaming preview renders more model output than the post-stream normalizer ultimately keeps. The final answer is intentionally capped, so this is a presentation mismatch rather than a grounding/correctness failure. A future fix should either apply the same caps during streaming or use a lighter drafting state for this job.

Also keep model/provider drift, fabricated provenance, cross-project leakage, unnecessary Review burden, latency/cost, and sensitive-data exposure in view when making AI changes.

## Current product/PM work

The repo now uses a GitHub-first operating model:

- GitHub Project for work state
- Issues for work, bugs, risks, and product questions
- PRs for what changed
- Actions for automated QA evidence
- `docs/product/DECISIONS.md` for settled product decisions
- `docs/product/RISKS.md` for known risks
- `docs/product/METRICS.md` for quality/latency/cost measurement design
- `docs/evals/` for evals
- `docs/incidents/` for incident learning

Open learning exercises include:

- **#121**: define a small set of State product-quality metrics as an AI PM exercise, without pretending a real pilot exists
- **#122**: write a short incident review from a real recent production/deployment failure

## Documentation ownership

Use these as the current sources of truth:

- `README.md`: project overview and repository map
- `docs/PROJECT_STATUS.md`: current handoff
- `docs/product/PRODUCT_BRIEF.md`: product definition and portfolio boundary
- `docs/product/DECISIONS.md`: settled product decisions
- `docs/product/RISKS.md`: risk register
- `QA.md`: QA contract
- `RELEASE.md`: release and rollback gate
- `CLAUDE.md`: AI coding/workflow instructions

`docs/history/` contains point-in-time records. Historical files are useful for provenance, but they are not current operating instructions.

## Resume checklist

When starting a new work session:

1. Read this file.
2. Verify `main`/`staging` heads and any relevant open PRs.
3. Check the relevant GitHub Issue/Project item.
4. Read `docs/product/PRODUCT_BRIEF.md` and `docs/product/DECISIONS.md` if product behavior is involved.
5. Read `QA.md` before testing or changing QA behavior.
6. Do not deploy or promote because tests passed. Follow `RELEASE.md` and get explicit authorization.
