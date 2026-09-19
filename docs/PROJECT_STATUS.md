# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: September 19, 2026 Pacific time._

## Current product state

State is a working portfolio/learning product for maintaining trustworthy project understanding as new information arrives.

Core authority model:

> **AI interprets. Software enforces. People authorize.**

The product currently includes:

- immutable Evidence/Notes intake
- AI interpretation with schema and semantic validation
- human-authorized Reviews plus Baseline Setup confirmation for routine Starting State facts
- human adjustment of AI proposals while preserving the original proposal for provenance
- Open and Blocking Questions
- Review-to-Question creation/linking/resolution flows
- Current State as a readable maintained project wiki
- History with accepted transition provenance
- Ask with authority-aware grounding, streaming, follow-ups, cancellation, project isolation, and a human-reviewed handoff for unanswered Questions
- project rules in Settings
- project switching with the Northstar and Juniper Office Move seeded examples
- Slack intake from approved channels plus sharing accepted changes back to Slack

State is a portfolio and learning product. There is no planned external pilot or customer rollout. Portfolio reviewers/demo visitors may use it. Product exercises may model what a real deployment would require, but the repo must not invent customers, adoption, pilot results, or production-user evidence.

## Branch and deployment state

As of September 19, the latest main-only documentation/case-study changes have been copied forward to `staging`. `staging` still intentionally contains additional analytics/eval work that has not been promoted to `main`. Always verify current branch heads before resuming work rather than relying on this snapshot.

Recent product changes now present on `main` include:

- Fixed the blank-project bug cluster: Notes cross-project leakage (`syncApiEvidence()` matched static fixture notes via a double-negative filter), a hydration race on rapid project switching, missing Reset/Delete project lifecycle controls (two separate Settings surfaces both needed the fix), and a non-state-aware onboarding banner.
- Added explicit Baseline Setup for new user-created projects. State assembles a draft Starting State from preserved Evidence; routine starting facts can be confirmed together, while conflicts, consequential ambiguity, and important unresolved choices stay in individual Reviews or Questions. A person explicitly confirms the Starting State before setup ends.
- Expanded explicit Evidence promotion (`POST /api/evidence/{id}/promote`) into the current **Propose for Current State** recovery path. It can be used after earlier Reviews have resolved, or after the Evidence already changed one State fact, when a person believes State missed another fact. It is hidden while an unresolved Review from that Evidence is still open. Promotion reruns interpretation and never bypasses Review, validation, stale protection, provenance, or human authorization.
- Added drag-and-drop file upload to the Add Evidence dialog; drops of more than one file are rejected with a message rather than silently truncated to the first file.
- Fixed a cross-project 500 in `_reanalyze()` (unscoped evidence-id lookup let a cross-project id crash instead of 404ing); affects both `/reanalyze` and the new `/promote`.
- Fixed [#145](https://github.com/pedringt/ai-learning/issues/145): production `state-api` now uses a Render persistent disk with SQLite at `/var/data/state.db`. A user-created project was verified to survive a separate redeploy. Staging remains intentionally ephemeral.
- Fixed [#146](https://github.com/pedringt/ai-learning/issues/146): **Propose for Current State** is no longer limited to Evidence that originally produced zero Reviews. It remains available after resolved Reviews and after one accepted State change when another fact may have been missed, subject to the unresolved-Review guard above.
- Confirmed staging's own ephemeral-storage risk in practice, not just by inspection: two user-created staging projects' ids changed mid-session across redeploys, discarding their Notes/Current State. Tracked as R-014 in `docs/product/RISKS.md` (accepted staging tradeoff, distinct from the production risk in #145).

Production surfaces:

- Portfolio: `https://www.authenticignorance.site/`
- State case study: `https://www.authenticignorance.site/implementation-context`
- State product: `https://www.authenticignorance.site/implementation-context-prototype/`
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
- Ask does not directly authorize mutations and cannot present pending proposals or uncertainty as settled fact. An unanswered Ask may hand a Question to a person to review/add.
- Review resolution is review-level in the current implementation: multiple pending proposals bundled into one Review receive the same Review decision.
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

Current tracked work relevant to handoff:

- **#206**: Review interpretation + Ask quality analytics is implemented on `staging` via merged PR #207, but remains open because the work has not been promoted to `main`. Do not re-implement it from scratch; verify the existing staging work and issue state first.
- **#133**: public GitHub metadata/branch-hygiene cleanup remains open. Automatic deletion of merged head branches must stay disabled while `staging` is a long-lived promotion branch; merged feature branches should be pruned manually instead.

Completed learning/measurement work includes:

- **#121**: defined State product-quality metrics as an AI PM exercise without inventing a real pilot or customer results
- **#122**: completed the State incident review from the September 14 production/deployment failure

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
