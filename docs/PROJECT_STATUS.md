# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: September 14, 2026 Pacific time._

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

The application baseline immediately before the QA/product-ops cleanup work was commit `afdc24582624c3d40cbc1b721eded8a48d1a68d6`, which had been aligned on both `main` and `staging`. Verify the current branch heads when resuming work rather than assuming they are still identical.

That baseline includes the latest user-facing fixes from the September 14 QA pass, including Ask cancellation/abort handling, project-switch cancellation behavior, and the remaining Review scroll path fix.

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

Application commit `afdc24582624c3d40cbc1b721eded8a48d1a68d6` records a green deterministic verification baseline of:

- 479 Python tests passed
- 18 frontend VM/behavior suites passed
- 15 Playwright browser tests passed

Treat those as evidence for that commit, not a permanent claim about future heads.

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
