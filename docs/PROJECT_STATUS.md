# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: September 19, 2026 (evening), Pacific time. Written as a handoff for a fresh session._

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

**Snapshot on Sept 19 night (verify before relying on it):** `main` = `fef27b2` (production; the merge of PR #234 at 22:44 UTC). `staging` = `fef27b2` plus any docs commit after it (it was fast-forwarded to `main`). No open PRs. **Sept 19: `staging` was promoted to `main` with Paige's explicit authorization (PR #234, 71 commits, 61 files).** Verified on production: Render `state-api` `/health` build is `fef27b2`; first-boot logs show a clean startup with no errors (migrations 016/017 are not logged, so their application is inferred from a clean boot and normal serving, not read directly); the Vercel production deployments of both `ai-learning` and `state` are READY at `fef27b2`; read-only smoke requests to the live site and the production API returned 200. Rollback: revert the merge commit (`git revert -m 1 fef27b2`), Vercel instant rollback for the frontends; the migrations are additive, so reverting code after they ran is safe.

Promoted to `main` in #234 on Sept 19 and now live on production (all verified on staging first):

- **Portfolio content:** homepage "How I work with AI" block (#221); Learning Library additions in stages 02/05/06/07/09 (#221, #220); the Human + AI Workflow Design cheat sheet and its Stage 06 link (#194).
- **State app self-contained** (#228 step 1): the app no longer loads portfolio files; it has its own shell, header ("Case study" link back to the portfolio) and functions; the analytics dashboard moved from the portfolio root into the app folder (`/state-product-health` on `main` becomes `/implementation-context-prototype/state-product-health`).
- **Backend (Render production redeployed):** Ask relevance fix for entity nouns like "vendor" (#223); new aggregate-only quality-analytics endpoints (#206); database migrations **016 and 017** (rehearsed on a production-shaped copy: 15 -> 17 applied, only the five new columns added, second boot clean; production is SQLite on a persistent disk, so the Sept 14 Postgres failure class does not apply).
- **QA/tooling:** eval harness fixes (#222), `make qa-fast` no longer makes paid model calls when a `.env` exists (#224), dashboard fixes (#225, #226).
- **Baseline review dialog no longer goes stale (#230)** and **Deep QA gates on app correctness, recording model quality as observations (DEC-008)**; see "Release gate" below.

Already on `main` (earlier work):

- Fixed the blank-project bug cluster: Notes cross-project leakage (`syncApiEvidence()` matched static fixture notes via a double-negative filter), a hydration race on rapid project switching, missing Reset/Delete project lifecycle controls (two separate Settings surfaces both needed the fix), and a non-state-aware onboarding banner.
- Added explicit Baseline Setup for new user-created projects. State assembles a draft Starting State from preserved Evidence; routine starting facts can be confirmed together, while conflicts, consequential ambiguity, and important unresolved choices stay in individual Reviews or Questions. A person explicitly confirms the Starting State before setup ends.
- Expanded explicit Evidence promotion (`POST /api/evidence/{id}/promote`) into the current **Propose for Current State** recovery path. It can be used after earlier Reviews have resolved, or after the Evidence already changed one State fact, when a person believes State missed another fact. It is hidden while an unresolved Review from that Evidence is still open. Promotion reruns interpretation and never bypasses Review, validation, stale protection, provenance, or human authorization.
- Added drag-and-drop file upload to the Add Evidence dialog; drops of more than one file are rejected with a message rather than silently truncated to the first file.
- Fixed a cross-project 500 in `_reanalyze()` (unscoped evidence-id lookup let a cross-project id crash instead of 404ing); affects both `/reanalyze` and the new `/promote`.
- Fixed [#145](https://github.com/pedringt/ai-learning/issues/145): production `state-api` now uses a Render persistent disk with SQLite at `/var/data/state.db`. A user-created project was verified to survive a separate redeploy. Staging remains intentionally ephemeral.
- Fixed [#146](https://github.com/pedringt/ai-learning/issues/146): **Propose for Current State** is no longer limited to Evidence that originally produced zero Reviews. It remains available after resolved Reviews and after one accepted State change when another fact may have been missed, subject to the unresolved-Review guard above.
- Confirmed staging's own ephemeral-storage risk in practice, not just by inspection: two user-created staging projects' ids changed mid-session across redeploys, discarding their Notes/Current State. Tracked as R-014 in `docs/product/RISKS.md` (accepted staging tradeoff, distinct from the production risk in #145).

Production surfaces (today):

- Portfolio: `https://www.authenticignorance.site/` (the apex `authenticignorance.site` 308-redirects to `www`)
- State case study: `https://www.authenticignorance.site/implementation-context`
- State product: `https://www.authenticignorance.site/implementation-context-prototype/`
- Production API: Render `state-api` (`https://state-api-6waw.onrender.com`)
- Planned: the State product moves to `https://state.authenticignorance.site` (#228; the domain is not attached yet).

Staging surfaces (all behind Vercel login; Vercel Auth "all except custom domains"):

- Portfolio + State at the old path: `https://ai-learning-git-staging-cairn10.vercel.app/` (Vercel project `ai-learning`)
- State on its own project, served at a domain root: `https://state-git-staging-cairn10.vercel.app/` (Vercel project `state`, created Sept 19)
- Backend: `https://state-api-staging.onrender.com` (free tier: sleeps when idle and **loses all its data on every restart or redeploy**, R-014)

Hard release rule: product/site changes go through `staging` first unless the user explicitly authorizes a narrow exception. Promotion to `main` always requires explicit current authorization. Passing tests is not permission to deploy.

## Latest verified QA baseline

On `staging` head `7ef2837` (Sept 19; `make qa-fast` re-run there: 610 passed, 96 skipped, all JS suites green; the earlier line below describes `c5afbb6`): State QA Fast is green in CI, and `make qa-fast` passes locally (607 Python tests, 96 skipped because they need a real model key or Postgres, plus every `state-*-tests.js` suite, including the new `state-base-path-tests.js`). Locally `qa-fast` makes **no** real-model calls even when a `.env` exists (#224).

**State Deep QA is NOT green on this revision** (see "Release gate" below): 13 of 14 tests pass every run; the Baseline Setup lifecycle test fails intermittently.

Treat numbers here as evidence for that commit, not a permanent claim. Use current GitHub Actions results for newer commits.

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

- `project_areas.id` is a global primary key rather than project-scoped (R-009, tracked as #136, P2). It works because the two seeded projects use non-colliding hand-chosen IDs and user-created projects generate `area_<uuid>` IDs, so it is not biting today. Redesign it before adding another hand-seeded project or any path where a person or model chooses an area ID; the migration needs real Postgres coverage.

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

## In flight: moving State to its own Vercel project and subdomain (#228)

Decision (Paige, Sept 19): **Option A**. A second Vercel project from this same repo (Root Directory `implementation-context-prototype/`), served at `state.authenticignorance.site`. No repo extraction for State for now. **New products (for example Tastemake) start in their own repo.** The full research, coupling list and rehearsal notes are in the comments on #228.

| Step | Status |
|---|---|
| 1. Make the app self-contained (own shell, header, functions, dashboard; relative asset paths via `window.__STATE_BASE`) | **Done and on `main` (production) since Sept 19 (#234).** Proven behavior-neutral: computed styles of every element in all six views, at 1280 and 375 px, are identical before and after apart from the added "Case study" link. |
| 2. Create the Vercel project `state` | **Done.** Root Directory `implementation-context-prototype`, Ignored Build Step `git diff HEAD^ HEAD --quiet .`, same protection as the portfolio project. **No custom domain attached.** |
| 3. Add the new origins to backend `CORS_ORIGINS` | **Done and verified** on both Render services (additive only). |
| 4. Promote to `main`, confirm `state` builds `main` as production against the production API, attach `state.authenticignorance.site`, then set `STATE_FRONTEND_BASE_URL` on both services and check the Slack app's URL settings | **Partly done (Sept 19, #234).** Done and verified: `main` promoted; the `state` project built `main` as **production** (READY, ref `main`), so its production branch is `main`; production `state-api` serves `fef27b2`. **Still to do, needs Paige's explicit go-ahead (production infrastructure):** attach `state.authenticignorance.site`, set `STATE_FRONTEND_BASE_URL` on both Render services, check the Slack app's URL settings. |
| 5. Portfolio: point the 8 links (6 pages) at the subdomain in a new tab, redirect the old `/implementation-context-prototype/*`, stop serving the app and the root `api/state-config.js` from the portfolio deployment | Not started (after 4). |
| 6. Repoint `deep-qa.yml` (hard-codes the old staging URL and the portfolio Vercel project id), the Playwright/`qa/deployed` specs and `tools/`; update `QA.md` and `RELEASE.md`; trim the portfolio-only selectors that were copied into `state-shell.*` | Not started. |

Things a new session must know about this work:

- **The `state` project now has a real production deployment: `main` at `fef27b2` (READY).** Its two `state-*.vercel.app` production URLs (`state-cairn10.vercel.app`, `state-eight-theta.vercel.app`) are aliases of the production deployment; they used to serve a stale staging-branch build (Vercel labels a project's first deployment "production" whatever its branch) and were not re-checked individually after the merge. They are behind Vercel login and CORS-limited. No custom domain is attached yet. `api/state-config.js` picks the production API when `VERCEL_ENV` is `production`.
- **Verified:** the Ignored Build Step works (a docs-only push, `d5a4053`, left the `state` project's deployment CANCELED while the portfolio project built), and the `state` project's production branch is `main` (its production deployment is ref `main`, built at the merge). One more thing for step 5: the old dashboard URL `/state-product-health` now 404s on production because the page moved into the app folder (`/implementation-context-prototype/state-product-health` works); nothing in the repo links to the old path and the dashboard is internal, so only a bookmark breaks; step 5's redirects should cover it.
- The app must never hard-code `/implementation-context-prototype/`. `state-base-path-tests.js` fails if any app source does.
- Backend `CORS_ORIGINS` today: staging = `http://localhost:3000` + `ai-learning-git-staging`, four old `ai-learning-git-pr{1..4}-…` preview origins, and `https://state-git-staging-cairn10.vercel.app`; production = `http://localhost:3000`, `https://ai-learning-rouge.vercel.app`, `https://authenticignorance.site`, `https://www.authenticignorance.site`, and `https://state.authenticignorance.site`. `STATE_FRONTEND_BASE_URL` (where Slack connect lands) is unchanged on purpose.

## Release gate (#230): resolved; promoted to `main` on Sept 19 (#234)

Paige set "State Deep QA passes" as the bar for opening the `staging` -> `main` PR. On `c5afbb6` (backend and both frontends verified identical to it) it was run 4 times: **13 of 14 tests pass every run, including every authority-relevant one; only the Baseline Setup lifecycle test fails, 4 of 4 runs, each for a different reason** (model output that failed schema validation, a manual-add that did not redraw, facts all in one area, and zero facts with no error logged). The evidence indicates this is **not** caused by the promotion diff: no Baseline frontend or backend module changed since the last green run (Sept 16); 8/8 uploads on `main`'s backend and 8/8 on `staging`'s each produced exactly 3 facts; the manual-add sequence passed 5/5 on `main`'s full stack and 5/5 on `staging`'s in a real browser. But it is still red.

**Paige's decision: fix first. Fix landed on `staging` (`7ef2837`, 2026-09-19).** Findings: (1) the review dialog rendered a one-time snapshot, so opened during analysis it never redrew when analysis finished (reproduced deterministically); the banner also re-shows its review button briefly during analysis because two banner renderers compete, which is how a fast click or Deep QA opens the dialog early; (2) the manual-add path reopened the dialog by clicking that banner button, a silent no-op when the button is absent (Deep QA run 2). The dialog now watches the draft while analysis runs and redraws (keeping edits, removed facts and focus), drops out-of-order responses, and reopens directly after a manual add. Tests: `state-project-complete/test_baseline_dialog_redraw_browser.py` (3 real-browser tests, no model calls; all fail on the old frontend). `make qa-fast` green. **Deep QA on `7ef2837`: 4 of 4 runs green** (runs 35470920751, 35471009623, 35471088545, 35471167944), against 0 of 4 before. Not proof by itself: two failure causes are model variance the fix does not touch (schema-violating output; all facts in one area).

**Deep QA assertions (Paige chose option C, DEC-008, 2026-09-19):** hard checks gate (dialog not stale, at least 1 fact, manual add adds one row, confirm and follow-up Evidence work); model-quality observations (fact count, area count, "General") are recorded as annotations and printed in the job summary, never failing. Two further paths surfaced on the first runs of the new spec (`b6586e2`, both red): (1) the model sometimes raises a real Question/Review for the sample source, so Confirm is correctly blocked; the test now verifies the block and reports the run as **skipped (inconclusive)**; (2) a latent app race: right after Confirm's page reload the app still shows its seed project (Northstar) until hydration finishes, and Evidence added in that window is sent to Northstar (#232); the test now waits out the reload and asserts the Evidence request's project header. **Deep QA on `502b097`: 4 of 4 green** (35472154538, 35472228559, 35472323146, 35472396403; 14 of 14 expected, 0 skipped, the model split the file ideally every time). Overall since the fix: 8 green, 2 red, and both reds explained above; still a small sample, and a skipped Baseline test means re-run, not pass.

**Resolution (Sept 19):** Paige authorized the promotion. Before merging, the one model-sensitive change in the diff (#223, Ask candidate filtering) was checked with the real model: the Ask-quality eval (`python -m eval.run_quality_evals --suite ask`, 8 scenarios including the exact #223 case) passed 8 of 8 on `8f073ab`. Note for the future: `make qa-release`'s paid eval is the Evidence-consequentiality suite, not the Ask suite, and the `qa-release.yml` workflow diffs against `origin/staging`, so on the `staging` ref it skips the paid eval; the Makefile's model-sensitive regex triggers on the filename `ask_provider.py`. The Cowork exploratory pass, Paige's manual trust pass and a latency/cost check were not run. Merged as PR #234 (merge commit `fef27b2`). Follow-ups, all in Backlog: #231 (no retry for failed Baseline analysis), #232 (Evidence sent to the seed project right after load; pre-existing), #233 (Baseline decomposition eval).

Promotion checklist reminders (`RELEASE.md`): explicit destination-specific authorization each time; confirm CI on the exact revision; migrations 016/017, backend and frontends promote together; recovery plan (revert the merge; Vercel instant rollback for frontends; the migrations are additive and backward compatible, so reverting code after they ran is safe). A production Render redeploy takes about 50 s.

## Work tracking (GitHub Project "State", https://github.com/users/pedringt/projects/1)

Snapshot after the Sept 19 promotion:

- **In progress:** #228 (the split; steps 1-3 done and on production; step 4 partly done: `main` promoted and the `state` project builds `main` as production; domain, `STATE_FRONTEND_BASE_URL` and Slack URL check still pending Paige's go-ahead; steps 5-6 not started).
- **Staging:** empty. Released in #234 and moved to Done (issues closed): #230, #194, #206, #220, #221, #222, #223, #224, #225, #226.
- **Ready:** #227 (P2: Ask's prose backstop rewrites "approved" to "proposed for approval (not yet approved)" even for approved Current State), #136 (P2, project-area ids; downgraded from P1), #135, #138, #139 (tech-debt audits, now with Work Type Tech debt and Product Area Platform; no Priority set; each explicitly allows deciding the current state is acceptable).
- **Backlog:** #231 (P2: failed Baseline analysis has no retry in the Baseline UI), #232 (P2: Evidence added right after load can go to the seed project), #233 (P2: Baseline decomposition eval), #229 (P2: the app renders half-dark in dark-mode browsers, pre-existing), #195 and #196 (cheat sheets; Paige is producing the content and will say when the PDFs are ready), #142 (**a learning placeholder that may never ship in State; leave it alone**).
- Board notes: the Priority field only has P0/P1/P2 (the setup doc also lists P3); new issues land in Backlog. `gh` now has Project scope, so Status and fields can be set with `gh project item-edit`.

Completed learning/measurement work includes:

- **#121**: defined State product-quality metrics as an AI PM exercise without inventing a real pilot or customer results
- **#122**: completed the State incident review from the September 14 production/deployment failure
- **#133**: repo metadata set; 27 merged/superseded remote branches pruned (only `main` and `staging` remain on GitHub); auto-delete of merged branches stays OFF

## Infrastructure reference

- **Vercel** (team `team_UxrzvAczWhPiXlO3nvWPAu5b`, one team): project `ai-learning` = `prj_acxPDHf89pEox4gOGMsVcHJLtoUc` (portfolio and, for now, State at the old path; domains `www.` and apex `authenticignorance.site`; DNS is managed by Vercel: `ns1/ns2.vercel-dns.com`); project `state` = `prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl`. Hobby plan: builds are rate-limited, so batch pushes.
- **Render** (workspace `tea-dabo6p3tqb8s73d21u2g`, the only one): `state-api-staging` = `srv-dadloi8n74is73ajsg50` (branch `staging`, free, deploys only on `state-project-complete/**` changes); `state-api` = `srv-dabogoajnfac73dp7h1g` (branch `main`, persistent disk at `/var/data`). The Render MCP tool can write env vars but **cannot read them**; read a value in the dashboard (Environment tab, "Show secret") before changing it, and add to it, never blindly replace it (staging's `CORS_ORIGINS` had four origins that were not documented anywhere).
- **GitHub Actions secrets** (names only): `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` (both used by Deep QA for the portfolio project). A new bypass secret would be needed to run Deep QA against the `state` project.
- **`STATE_EVAL_INGEST_KEY`** is set on the staging backend only. Recorded eval runs live in staging's ephemeral database and vanish on restart; re-record with `python -m eval.run_quality_evals --record-url https://state-api-staging.onrender.com` from `state-project-complete/`. Keep the key out of chat and shell history (use a hidden prompt), and rotate it if it was ever displayed.

## Working notes for the next session (lessons from Sept 19)

- **Test the real deployed URL shape before claiming a frontend change works.** Vercel `cleanUrls` serves the app at `/implementation-context-prototype` (no trailing slash); plain relative asset URLs broke staging for a few minutes because my local server did not emulate that. Emulate `cleanUrls` locally, and check that *every* loaded asset returns 200.
- **One model sample proves nothing.** The Baseline flow varies run to run (2-3 facts, 1-2 areas, occasionally malformed output). Compare code versions with repeated runs on the same machine at the same time. Check your probe before trusting its conclusion: an early probe here read the wrong response field and produced a false "stuck for 2 minutes" finding.
- **Rehearse migrations on a production-shaped database:** build it with `main`'s own code (including its lazily created tables), then boot `staging`'s code on a copy.
- **Confirm which origin/backend a page really uses** (`window.STATE_API_BASE`); a new Vercel project's first deployment is labelled production.
- **Shell traps on this machine:** the default shell is zsh (no word-splitting of unquoted variables; `$var:x` is a modifier). Use `bash -c '...'` for loops over a variable. Python from python.org lacks root certificates: set `SSL_CERT_FILE="$(.venv/bin/python -c 'import certifi;print(certifi.where())')"` for HTTPS from scripts. Do not name a script `inspect.py`.
- **Log search tools:** the Render log filter does not support `|` alternation; use one term per query.
- **The browser's HTTP cache lies during local verification.** Serve with `Cache-Control: no-store` and clear localStorage before snapshotting; saved state changes what the app renders.
- **Paige prefers hand-run steps one at a time**, `cd` first, and never pasting secrets into chat.
- **Never present pending proposals as settled truth; never weaken the authority model to make a test pass.** Report failures faithfully, including your own mistakes.

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
3. Check the relevant GitHub Issue/Project item. Start with #228 (the split): its comments hold the evidence and next steps, and step 4's remainder needs Paige's explicit go-ahead. #230 is closed.
4. Read `docs/product/PRODUCT_BRIEF.md` and `docs/product/DECISIONS.md` if product behavior is involved.
5. Read `QA.md` before testing or changing QA behavior.
6. Do not deploy or promote because tests passed. Follow `RELEASE.md` and get explicit authorization.
