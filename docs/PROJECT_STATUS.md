# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: September 20, 2026 (evening), Pacific time. Written as a handoff for a fresh session._

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

**UPDATE Sept 20 night: PR #248 merged (`main` = `5c5d8a8`, 03:17 UTC Sept 21); see the #246 section below for what is and is not live yet. The rest of this paragraph describes the state right after PR #237.** **Snapshot on Sept 20 evening (verify before relying on it):** `main` = `4bea28c` (production; **PR #237 merged Sept 20 17:09 UTC with Paige's explicit authorization**, merge commit; before it `ffbc59e` = PR #236, `94710ae` = PR #235, `fef27b2` = PR #234). `staging` was fast-forwarded to `main` plus one docs commit after the merge (recount with `git rev-list --count main..staging`), so the only thing waiting for a promotion is that docs commit. PR #237 promoted #229, #138, #135, #139 and the Sept 20 batch (#238, #239, #136 option C, #233 eval tooling, #228 step 6). **Verified on production after #237:** Render `/health` build `4bea28cb981f` (checked with `scripts/verify-render-deploy.sh`); a clean boot (one startup, no errors or warnings; both demo projects re-seeded idempotently, so #136's guard did not raise; the #238 index swap ran on that startup and had been rehearsed on a production-shaped copy); both Vercel production deployments READY at `4bea28c`; the live app on `state.authenticignorance.site` in a dark-preferring browser used the production API only, all six views loaded real Northstar data, the body class was empty (light-only, #229) and the console had no errors. **Not exercised in production:** a live Ask (the #239 streaming change was verified by test and on staging only). **No copy of the production database (`/var/data/state.db`) was taken before the deploy**, so the rollback caveat in the batch table below applies (rolling the backend back after two projects hold identical open Reviews would merge them across projects). **Earlier, after #236 (verified then):** Render `/health` build `ffbc59e`, clean boot, both Vercel production deployments READY, live app on `state.authenticignorance.site` serves the new code and passes a read-only smoke (six views, production API only, no console errors, a live Ask question with the pending-vs-confirmed boundary intact). **Sept 19: `staging` was promoted to `main` with Paige's explicit authorization (PR #234, 71 commits, 61 files).** Verified on production: Render `state-api` `/health` build is `fef27b2`; first-boot logs show a clean startup with no errors (migrations 016/017 are not logged, so their application is inferred from a clean boot and normal serving, not read directly); the Vercel production deployments of both `ai-learning` and `state` are READY at `fef27b2`; read-only smoke requests to the live site and the production API returned 200. Rollback: revert the merge commit (`git revert -m 1 fef27b2`), Vercel instant rollback for the frontends; the migrations are additive, so reverting code after they ran is safe.

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
- State product: `https://state.authenticignorance.site` (attached to the Vercel `state` project on Sept 19; also still served at the old path `https://www.authenticignorance.site/implementation-context-prototype/` until #228 step 5)
- Production API: Render `state-api` (`https://state-api-6waw.onrender.com`)
- The portfolio's State links still point at the old path; step 5 of #228 repoints them and adds redirects.

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

- `project_areas.id` is a global primary key rather than project-scoped (R-009, #136, P2, Backlog). **Decided Sept 19 (Paige): option C, no schema change.** Seeding an area id that is already taken now raises instead of silently skipping, and tests pin that hand-seeded ids are unique across seeded projects and that user projects generate `area_<uuid>` ids. The structural limit remains; it just cannot be hit silently. Reopen the composite-key migration (option A) if a third hand-seeded project is proposed, if any path lets a person or model choose an area id, or if real user projects are expected on production (production holds only the two demo projects, which makes the migration cheapest now). Proposal, options and the migration plan: `docs/architecture/PROPOSAL_136_PROJECT_SCOPED_AREA_IDS.md`.
- **#238 (P1, Ready): the open-Review uniqueness index `uq_open_review_identity` had no `project_id`**, so Evidence in one project could fail with a 500 when another project had the same open Review. Fixed in the batch below (verified on SQLite and on Postgres 16.2).

Known UX issue (fixed in the local batch, [#239](https://github.com/pedringt/ai-learning/issues/239)):

- Ask's **What should I know?** starter (`meeting_prep`) used to visibly grow and then shrink on the first streamed answer, because the streaming preview drew every section item while the backend's `_normalize_meeting_prep` later merged repeated sections, de-duplicated records and capped sections and items. `renderStream` (`context-ask.js`) now streams only the headline and summary for `meeting_prep` and holds the sections back for the final answer, with a short "Choosing what belongs in the brief…" line between. Other jobs are unchanged. Regression test `state-ask-stream-meeting-prep-tests.js`; checked in the browser. Mirroring the caps in JS was rejected (duplicated backend logic that would drift). Not yet seen against the live model's stream.

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
| 2. Create the Vercel project `state` | **Done.** Root Directory `implementation-context-prototype`, Ignored Build Step `git diff HEAD^ HEAD --quiet .`, same protection as the portfolio project. Custom domain `state.authenticignorance.site` attached Sept 19 (step 4). |
| 3. Add the new origins to backend `CORS_ORIGINS` | **Done and verified** on both Render services (additive only). |
| 4. Promote to `main`, confirm `state` builds `main` as production against the production API, attach `state.authenticignorance.site`, then set `STATE_FRONTEND_BASE_URL` on both services and check the Slack app's URL settings | **Done (Sept 19; the Slack check was finished Sept 20).** `main` promoted (#234); the `state` project builds `main` as production; `state.authenticignorance.site` attached to the `state` project (verified: valid Let's Encrypt certificate, HTTPS 200, the app loads and calls only the production API, no CORS or console errors); `STATE_FRONTEND_BASE_URL` set on both Render services (production `https://state.authenticignorance.site`, staging `https://state-git-staging-cairn10.vercel.app`), each redeploy verified live and the Slack-connect landing URL confirmed from outside (`/api/integrations/slack/oauth/callback` redirects to the new value). **Slack app URLs checked by Paige on Sept 20 (read-only, in Slack's admin console): both apps point at their own backend.** "State prod" (production): Redirect URL `https://state-api-6waw.onrender.com/api/integrations/slack/oauth/callback`, Event Subscriptions request URL `https://state-api-6waw.onrender.com/api/integrations/slack/events` (Verified). "State" (staging): the same paths on `https://state-api-staging.onrender.com` (request URL Verified). Only those two URL settings per app were checked (other Slack app settings were not inspected). The production restart took about a minute. |
| 5. Portfolio: point the 8 links (6 pages) at the subdomain in a new tab, redirect the old `/implementation-context-prototype/*`, stop serving the app and the root `api/state-config.js` from the portfolio deployment | **Done and live on production (Sept 19, PR #235, merge `94710ae`).** All 8 links (6 pages) point at `https://state.authenticignorance.site/` (new tab). `vercel.json` redirects the old `/implementation-context-prototype`, `/index.html`, `/:path*` and `/state-product-health` to the subdomain with **temporary (307) redirects on the production host `www.authenticignorance.site` only** (staging still serves the old path for Deep QA until step 6). **Verified on production after deploy:** the redirects return 307 to the matching subdomain URLs; full chains from the apex, `www` and `ai-learning-rouge.vercel.app` old paths end on `state.authenticignorance.site` with 200 and the query string intact; a browser landing on the old path with `?slack_connect=error#settings-slack` ends on the subdomain in the app's Settings view with Northstar loaded from the production API; all 6 pages link to the subdomain and none to the old path. `/index.html` and trailing-slash URLs take an extra same-host 308 first (Vercel clean URLs), so the old path costs up to 2-3 hops. The `state` project also rebuilt production (the new test file is under its root; app unchanged). The app files and root `api/state-config.js` remain in the repo for staging Deep QA; remove them with step 6. Regression test `state-portfolio-links-tests.js`. Once stable, change the redirects to permanent (308). |
| 6. Repoint `deep-qa.yml` (hard-codes the old staging URL and the portfolio Vercel project id), the Playwright/`qa/deployed` specs and `tools/`; update `QA.md` and `RELEASE.md`; trim the portfolio-only selectors that were copied into `state-shell.*` | Not started. |

Things a new session must know about this work:

- **The `state` project now has a real production deployment: `main` at `fef27b2` (READY).** Its two `state-*.vercel.app` production URLs (`state-cairn10.vercel.app`, `state-eight-theta.vercel.app`) are aliases of the production deployment; they used to serve a stale staging-branch build (Vercel labels a project's first deployment "production" whatever its branch) and were not re-checked individually after the merge. They are behind Vercel login and CORS-limited. The custom domain `state.authenticignorance.site` was attached on Sept 19 (step 4). `api/state-config.js` picks the production API when `VERCEL_ENV` is `production`.
- **Verified:** the Ignored Build Step works (a docs-only push, `d5a4053`, left the `state` project's deployment CANCELED while the portfolio project built), and the `state` project's production branch is `main` (its production deployment is ref `main`, built at the merge). One more thing for step 5: the old dashboard URL `/state-product-health` now 404s on production because the page moved into the app folder (`/implementation-context-prototype/state-product-health` works); nothing in the repo links to the old path and the dashboard is internal, so only a bookmark breaks; step 5's redirects should cover it.
- The app must never hard-code `/implementation-context-prototype/`. `state-base-path-tests.js` fails if any app source does.
- `STATE_FRONTEND_BASE_URL` (where Slack connect lands; the backend appends `?slack_connect=…#settings-slack`): production is now `https://state.authenticignorance.site`, staging is `https://state-git-staging-cairn10.vercel.app`. **Previous values, for rollback:** staging was `https://ai-learning-git-staging-cairn10.vercel.app/implementation-context-prototype/index.html` (read from the live redirect before the change); production's was not read before the change, but by the same pattern it was almost certainly `https://www.authenticignorance.site/implementation-context-prototype/index.html` (inferred, unverified). Backend `CORS_ORIGINS` today: staging = `http://localhost:3000` + `ai-learning-git-staging`, four old `ai-learning-git-pr{1..4}-…` preview origins, and `https://state-git-staging-cairn10.vercel.app`; production = `http://localhost:3000`, `https://ai-learning-rouge.vercel.app`, `https://authenticignorance.site`, `https://www.authenticignorance.site`, and `https://state.authenticignorance.site`. `STATE_FRONTEND_BASE_URL` was changed on Sept 19 (see the previous-values note above).

## Release gate (#230): resolved; promoted to `main` on Sept 19 (#234)

Paige set "State Deep QA passes" as the bar for opening the `staging` -> `main` PR. On `c5afbb6` (backend and both frontends verified identical to it) it was run 4 times: **13 of 14 tests pass every run, including every authority-relevant one; only the Baseline Setup lifecycle test fails, 4 of 4 runs, each for a different reason** (model output that failed schema validation, a manual-add that did not redraw, facts all in one area, and zero facts with no error logged). The evidence indicates this is **not** caused by the promotion diff: no Baseline frontend or backend module changed since the last green run (Sept 16); 8/8 uploads on `main`'s backend and 8/8 on `staging`'s each produced exactly 3 facts; the manual-add sequence passed 5/5 on `main`'s full stack and 5/5 on `staging`'s in a real browser. But it is still red.

**Paige's decision: fix first. Fix landed on `staging` (`7ef2837`, 2026-09-19).** Findings: (1) the review dialog rendered a one-time snapshot, so opened during analysis it never redrew when analysis finished (reproduced deterministically); the banner also re-shows its review button briefly during analysis because two banner renderers compete, which is how a fast click or Deep QA opens the dialog early; (2) the manual-add path reopened the dialog by clicking that banner button, a silent no-op when the button is absent (Deep QA run 2). The dialog now watches the draft while analysis runs and redraws (keeping edits, removed facts and focus), drops out-of-order responses, and reopens directly after a manual add. Tests: `state-project-complete/test_baseline_dialog_redraw_browser.py` (3 real-browser tests, no model calls; all fail on the old frontend). `make qa-fast` green. **Deep QA on `7ef2837`: 4 of 4 runs green** (runs 35470920751, 35471009623, 35471088545, 35471167944), against 0 of 4 before. Not proof by itself: two failure causes are model variance the fix does not touch (schema-violating output; all facts in one area).

**Deep QA assertions (Paige chose option C, DEC-008, 2026-09-19):** hard checks gate (dialog not stale, at least 1 fact, manual add adds one row, confirm and follow-up Evidence work); model-quality observations (fact count, area count, "General") are recorded as annotations and printed in the job summary, never failing. Two further paths surfaced on the first runs of the new spec (`b6586e2`, both red): (1) the model sometimes raises a real Question/Review for the sample source, so Confirm is correctly blocked; the test now verifies the block and reports the run as **skipped (inconclusive)**; (2) a latent app race: right after Confirm's page reload the app still shows its seed project (Northstar) until hydration finishes, and Evidence added in that window is sent to Northstar (#232); the test now waits out the reload and asserts the Evidence request's project header. **Deep QA on `502b097`: 4 of 4 green** (35472154538, 35472228559, 35472323146, 35472396403; 14 of 14 expected, 0 skipped, the model split the file ideally every time). Overall since the fix: 8 green, 2 red, and both reds explained above; still a small sample, and a skipped Baseline test means re-run, not pass.

**Resolution (Sept 19):** Paige authorized the promotion. Before merging, the one model-sensitive change in the diff (#223, Ask candidate filtering) was checked with the real model: the Ask-quality eval (`python -m eval.run_quality_evals --suite ask`, 8 scenarios including the exact #223 case) passed 8 of 8 on `8f073ab`. Note for the future: `make qa-release`'s paid eval is the Evidence-consequentiality suite, not the Ask suite, and the `qa-release.yml` workflow diffs against `origin/staging`, so on the `staging` ref it skips the paid eval; the Makefile's model-sensitive regex triggers on the filename `ask_provider.py`. The Cowork exploratory pass, Paige's manual trust pass and a latency/cost check were not run. Merged as PR #234 (merge commit `fef27b2`). Follow-ups, all in Backlog: #231 (no retry for failed Baseline analysis), #232 (Evidence sent to the seed project right after load; pre-existing), #233 (Baseline decomposition eval).

Promotion checklist reminders (`RELEASE.md`): explicit destination-specific authorization each time; confirm CI on the exact revision; migrations 016/017, backend and frontends promote together; recovery plan (revert the merge; Vercel instant rollback for frontends; the migrations are additive and backward compatible, so reverting code after they ran is safe). A production Render redeploy takes about 50 s.

## The Sept 20 batch (pushed to `staging` at `99fdcc1`; promoted to production in PR #237 as `4bea28c`)

Everything below was pushed to `staging` in **one push** on Sept 20 (`7f5e4c6` -> `99fdcc1`, 20 commits; the Vercel limit had cleared and both projects accepted it). Because PR #237 was `staging` -> `main`, it carried all of this and was merged on Sept 20 (see the snapshot above). Before the push: `make qa-fast` was green (664 Python passed, 104 skipped; all 33 JS suites 0 failed) and the whole Python suite with real Postgres 16.2 enabled is green (716 passed, 50 skipped, all real-model tests). No model calls were made.

| Item | What it is | Notes for shipping |
|---|---|---|
| #238 (P1) | Scope the open-Review uniqueness backstop to a project (`database_migration_backed.py`, one new test file) | Touches `state-project-complete/`, so it restarts Render production: verify `/health` build SHA with `scripts/verify-render-deploy.sh`. **Rehearsed Sept 20 on a production-shaped SQLite database** (built by `origin/main`'s code: 2 projects, 7 areas, 26 Reviews): the new code booted a copy twice with no errors, swapped the index (`uq_open_review_identity` -> `uq_open_review_identity_by_project`) and left every area and Review unchanged. **Rollback caveat:** after this ships, two projects can hold identical open Reviews. Rolling the backend back to the old code does not crash, but the old code's unscoped startup repair then silently **merges those Reviews across projects** (rehearsed: Northstar went from 8 open Reviews to 7, one folded into Juniper's) and recreates the old global index. So the recovery plan for this change is a forward fix, or restoring `/var/data/state.db` from a copy taken before the deploy; do not treat a plain backend rollback as harmless once cross-project duplicates exist. **Sept 20 production data check:** no copy of the database file could be taken (Render offers only automatic disk snapshots, once every 24 hours, kept at least 7 days, no manual snapshot; SSH to the service is not set up from Paige's machine). Instead a read-only export of everything production holds was saved to `~/state-prod-export-2026-09-20.json` on Paige's Mac (outside the repo and the synced Desktop), and its counts were compared with a database built from the seed code alone: **production has exactly the two seeded projects and every count matches the seed** (evidence, active state, History, areas, Reviews open and resolved, Questions open and resolved, Rules, for both projects). So today nothing in production is unique and a bad rollback would be recovered by re-seeding. **This stops being true as soon as a real project is created on production**, at which point backups and #136 need revisiting. |
| #136 (option C) | Loud area-id collision guard, tests, proposal doc, R-009 reworded | No migration. |
| #233 | Baseline decomposition eval (`eval/baseline_decomposition.py`, `run_baseline_decomposition.py`, tests) | **The first paid run (Sept 20, 24 calls) is retracted.** The harness injected the plain `AnthropicProvider`; the deployed app uses the Baseline provider (area schema, Baseline prompt guidance, chunking, area metadata), and `create_app(provider=...)` uses what it is given as-is, so every fact landed in "General". `real_provider()` now builds the deployed provider and `run_scenarios` refuses a plain one. The scorer also separates hedged from asserted mentions and flags an invented year or amount. **First valid results (Sept 20, 36 real calls, both routes, Haiku 4.5)** are in `docs/evals/README.md` and on #233: 1 failure in 36 (cause unknown, not reproduced in 12 targeted re-runs), recall 99%, areas vary by source and possibly by route, and the model invented a year the source does not state in 2 of 36 runs (tracked as #240, Backlog, P2). The eval now records why a run failed. An audit found no other harness affected. |
| #228 step 6 (draft) | Deep QA runs the State tests against the `state` Vercel project when `VERCEL_AUTOMATION_BYPASS_SECRET_STATE` exists; unchanged behavior otherwise | The secret now exists (created Sept 20). Once this branch is pushed, run Deep QA once and confirm it targets the `state` project and passes (14 of 14 expected); until it is pushed, Deep QA still runs the old way. |

| #239 (P2) | Ask starter no longer grows then shrinks while streaming (`context-ask.js`, one new JS suite) | Frontend only, so it builds on Vercel but does not restart Render. |

**Verification after the push (Sept 20):** staging is `daad6f6` (the batch plus two docs commits and the `state` README note). The `state` Vercel project skipped the first two builds (Ignored Build Step, tip commit not in the app folder; an API redeploy is skipped by the same rule), so the tip commit was made to touch `implementation-context-prototype/` and `state` then built `daad6f6` and serves the #239 code. **State Deep QA on `daad6f6`, first run with the step 6 wiring** (frontend = `state` staging, backend = Render staging on `99fdcc1`): run 1 passed 13 of 14 (the real-model *VP billing note reaches Review* check got 0 Reviews; staging logs show a clean, valid model response and no validation warnings, so it looks like model variance, but the model's output was not captured and it is **unresolved**); the rerun passed **14 of 14, 0 skipped**. Whether that check should keep hard-gating is an open product decision for Paige. PR #237's title and body were rewritten to match what it now carries (27+ commits, #238 index swap, rollback caveat). CI was green on the head and the PR `CLEAN`; **it was then merged with Paige's explicit authorization** (`4bea28c`, Sept 20 17:09 UTC).

Two comments were posted on GitHub on Sept 20: the #136 decision and the #233 correction.

## Ask meeting_prep streaming, fix at the source (#246, #247): merged to `main` in PR #248; the `state` frontend deploy is blocked until Vercel's daily cap resets

**Where production stands (Sept 21, 03:20 UTC), verified:** PR #248 was merged with Paige's explicit authorization (she also accepted the meeting-prep label side effect). **Live:** Render production `state-api` serves `5c5d8a80a840` (`scripts/verify-render-deploy.sh`), clean boot (no warnings or errors, both demo projects re-seeded idempotently, "Application startup complete"), and the `ai-learning` production deployment is READY at the merge commit; the app, the portfolio and the case study all return 200. **NOT live: the `state` frontend** (`state.authenticignorance.site`). Its production build was refused: `Vercel - state: Deployment rate limited`, and a direct API attempt returned 402 `api-deployments-free-per-day` (limit 100 deployments per day for the free plan, 0 remaining, resets **Mon Sept 21, 8:20 PM Pacific = Tue Sept 22 03:20 UTC**). The state production site still serves the previous frontend (the #239 hold and the old streaming scrub). That combination is compatible (the API is unchanged): users get the new backend (final-shape meeting-prep answers, whole-slug id scrub, the label side effect) with the old streaming display (headline and summary, a wait, then the sections) until the frontend deploys. **To finish:** after the reset, FIRST create one production deployment of `main` for the `state` project (Vercel MCP `create_deployment` with `project: prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl`, `target: production`, `gitSource` github `pedringt/ai-learning` ref `main` sha `5c5d8a8...`; or Redeploy in the dashboard), confirm it is READY and that the served `context-ask.js` has no `holdSections`, do a read-only smoke, THEN close #246/#247 and write "frozen at `<commit>`". **Do not push to `staging` or `main` before that**: each push spends deployments (two per push, and skipped builds appear to count) and the cap is shared by the whole team, including Tastemake. Do NOT "Promote" the staging preview deployment to production: a preview deployment's `api/state-config.js` points at the staging API. The details of the change, the measurements and the checks follow.

Paige found the #239 fix odd on production (headline and summary stream, then the screen stalls while the sections are written; a whole answer takes about 14 s). #246 fixes it at the source instead. **Root cause:** the one-call prompt told the model "at most 4 items per section" while `_normalize_meeting_prep` capped kinds at 2/2/2/3/3/4/4/4, merged repeated kinds, reordered sections and retitled them. **Change (pushed to `staging` as `a986299`, Sept 20):** the section order, per-kind item caps, section cap, refinement cap and titles are shared constants (`MEETING_PREP_*` in `ask_contract.py`) used by both the normalizer and the prompt guidance, which is generated from them so they cannot drift (`test_ask_meeting_prep_shape.py` keeps them in step); the #239 hold is removed, so `meeting_prep` streams live again. **Measured with the real model (Haiku 4.5, 24 calls, about a quarter of a dollar; details in `docs/evals/README.md`):** the answer is already in the backend's final shape 83% of the time (0% before), order and titles never change, size and latency are unchanged, and a "Decisions needed" section citing open Reviews appears in 12 of 12 answers (7 of 12 before). **Residual:** 2 of 12 answers wrote 3 Decisions items against a cap of 2, so one bullet is trimmed at the end; tightening that wording needs its own measurement. **Verified on staging (Sept 20, head `6410d28`):** Deep QA 14 of 14 (0 skipped, 0 failed; run 35554977812); Paige tried the streaming on staging and said it looks good; the `state` Vercel project built the docs-only tip commit, which proves the new Ignored Build Step (it compares against the last deployed commit). **Ask-quality eval (RELEASE.md check for the prompt change):** the first guidance scored 7 of 8 (`ask_conflicting_evidence` failed; A/B on that scenario: old wording 6 of 6, first new wording 3 of 6, because its fixed titles leaked into a plain fact answer). **Revised** so the guidance applies ONLY to `meeting_prep` (test-pinned): that scenario 5 of 6, the full suite **8 of 8 with 0 high-severity failures**, and 100% of meeting-prep answers already in final shape. **Side effect for Paige to weigh:** the model now labels the Northstar "What should I know?" briefing `meeting_prep` in only about 2 of 3 runs (it was every run), so the rest lack the "Meeting prep" label and the blank Meeting notes block (structure and length are unchanged, and nothing shrinks either way). **Not yet done:** Deep QA on the revised head, and any promotion to `main` (needs her explicit go-ahead). **Decided (Paige, Sept 20): #240 waits until after the freeze; the goal is to freeze the site soon, so nothing else needs to ship first.** **Separate finding, fixed on the branch and going up with the next push (#247):** the model sometimes writes an internal record id into its text (7 of 12 raw old-guidance answers, 3 of 12 new-guidance); the backend scrubber removes nearly all of them, but a slug-style id such as `demo-juniper-review-elevator` can leave a mangled fragment ("Demo-juniper- qualifies this risk."), seen in 0 to 1 of 12 answers, mainly on the Juniper demo. Low frequency and cosmetic. **Fix:** the scrubber removes a seeded slug whole (`_DEMO_SLUG_ID`) and is given every id the model was shown, selected or not; the streaming view mirrors the slug pattern; re-running the audit on the 24 real answers leaves 0 of 12 with an id or fragment (was 1 of 12), covered by `test_ask_id_scrub.py` and `state-ask-stream-id-scrub-tests.js`. Note: this push could not prove the Vercel Ignored Build Step change (its tip commit touches the app folder, so the old rule would also have built it).

## Work tracking (GitHub Project "State", https://github.com/users/pedringt/projects/1)

Snapshot after the Sept 19 promotion:

- **In progress:** #228 (the split; steps 1-5 done and live on production, including the Slack app URL check; step 6 drafted in the local batch (the Deep QA repoint; the bypass secret now exists, so it needs the batched push and one Deep QA run); still to do after that: `tools/`, `QA.md`/`RELEASE.md`, then remove the old in-portfolio app files and root `api/state-config.js`; later switch the redirects to permanent).
- **Done (promoted to production Sept 20 in PR #237 and verified there; #238 and #239 were fixed after the PR opened and shipped with it):** #238 (P1, Review uniqueness index scoped per project) and #239 (Ask starter no longer shrinks while streaming), plus the original four: #229 (State is light-only; no more half-dark in dark-preferring browsers), #138 (one canonical import path for the validation package, dead `fake_provider.py` and `db_wrapper.py` removed), #135 (decision: keep the historical frontend patch layers; dev-only `seedStressNotes` removed; frontend map), #139 (neutral cleanup of the homepage inline styles, proven identical with `tools/style_parity.py`; CSS deliberately left inline because block order relative to the `<link>`s is load-bearing). Each has a comment on its issue. Deep QA was 14 of 14 on the relevant heads.
- **Backlog, decided:** #136 (P2, project-area ids; Paige chose option C on Sept 19, the guard shipped in #237; the composite-key migration is deferred with explicit triggers, see `docs/architecture/PROPOSAL_136_PROJECT_SCOPED_AREA_IDS.md`). **New:** #240 (P2, Baseline analysis can invent a year the source never states).
- **Backlog:** #233 (P2: Baseline decomposition eval), #195 and #196 (cheat sheets; Paige is producing the content and will say when the PDFs are ready), #142 (**a learning placeholder that may never ship in State; leave it alone**).
- Board notes: the Priority field only has P0/P1/P2 (the setup doc also lists P3); new issues land in Backlog. `gh` now has Project scope, so Status and fields can be set with `gh project item-edit`.

Completed learning/measurement work includes:

- **#121**: defined State product-quality metrics as an AI PM exercise without inventing a real pilot or customer results
- **#122**: completed the State incident review from the September 14 production/deployment failure
- **#133**: repo metadata set; 27 merged/superseded remote branches pruned (only `main` and `staging` remain on GitHub); auto-delete of merged branches stays OFF

## Infrastructure reference

- **Vercel** (team `team_UxrzvAczWhPiXlO3nvWPAu5b`, one team): project `ai-learning` = `prj_acxPDHf89pEox4gOGMsVcHJLtoUc` (portfolio and, for now, State at the old path; domains `www.` and apex `authenticignorance.site`; DNS is managed by Vercel: `ns1/ns2.vercel-dns.com`); project `state` = `prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl`. Hobby plan: builds are rate-limited, so batch pushes.
- **Render** (workspace `tea-dabo6p3tqb8s73d21u2g`, the only one): `state-api-staging` = `srv-dadloi8n74is73ajsg50` (branch `staging`, free, deploys only on `state-project-complete/**` changes); `state-api` = `srv-dabogoajnfac73dp7h1g` (branch `main`, persistent disk at `/var/data`). The Render MCP tool can write env vars but **cannot read them**; read a value in the dashboard (Environment tab, "Show secret") before changing it, and add to it, never blindly replace it (staging's `CORS_ORIGINS` had four origins that were not documented anywhere).
- **GitHub Actions secrets** (names only): `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` (both used by Deep QA for the portfolio project). `VERCEL_AUTOMATION_BYPASS_SECRET_STATE` **exists** (Paige created it in the Vercel `state` project and set it as a GitHub Actions secret on Sept 20); the drafted step 6 uses it to run Deep QA against the `state` project, and takes effect only once that code is pushed.
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
- **Batch pushes (Paige, Sept 20).** About two dozen `staging` pushes in one session hit the Vercel Hobby limit, which put a failing check on the promotion PR. Stack finished work on a local branch, verify the combination, fold doc updates into the same push as the code, and push once. Do not spend a push to test whether a limit has cleared.
- **The `state` project's Ignored Build Step used to look only at the last commit of a push** (`git diff HEAD^ HEAD --quiet .`); **Paige approved changing it on Sept 20 and it now compares against the last successfully deployed commit (`VERCEL_GIT_PREVIOUS_SHA`), failing open** (exact command and rollback in `implementation-context-prototype/README.md`; the tool cannot read the setting back, and it has **not yet been observed on a real push**, so check that the first batched push actually builds `state`). Old behavior: A multi-commit push whose tip commit is docs-only skips the build even when earlier commits changed the app, so a batched push can leave the `state` staging frontend stale (this happened on the Sept 20 push: `state` staging stayed on `1943f45`, missing #135 and #239, while `ai-learning` built). Check what the `state` project actually built before verifying a frontend change on it. A fix (compare against `VERCEL_GIT_PREVIOUS_SHA`, failing open) is a Vercel project setting and needs Paige's go-ahead. A promotion merge commit is not affected, because its diff against the first parent includes everything.
- **A harness that disagrees with the deployed app is a wiring bug until proven otherwise.** The first Baseline eval run measured a plain provider, not the deployed one, and reported "all General" as a model finding. A result that is identical in every run is a smell. Build test providers the way the deployed app does (`baseline_setup._provider_from_env`).
- **Run schema-touching changes on real Postgres before shipping.** No Postgres or Docker is installed locally; use the embedded `pgserver` recipe (scratch venv on the system Python, project venv with `STATE_TEST_POSTGRES_URL`); CI runs `postgres:16`.
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
- `docs/architecture/BACKEND_RUNTIME_MAP.md`: the live backend runtime path, test-only files, and the one canonical import path (#138)
- `docs/architecture/FRONTEND_MODULE_MAP.md`: the 28 frontend modules, their layers, overlaps, and the decision to keep the historical patch layers (#135)
- `docs/architecture/PORTFOLIO_INLINE_STYLES.md`: why the homepage inline styles stay inline, and how to verify a cleanup with `tools/style_parity.py` (#139)

`docs/history/` contains point-in-time records. Historical files are useful for provenance, but they are not current operating instructions.

## Resume checklist

When starting a new work session:

1. Read this file.
2. Verify `main`/`staging` heads and any relevant open PRs.
3. Check the relevant GitHub Issue/Project item. Start with #228 (the split): its comments hold the evidence and next steps. Steps 1-5 are live and the Slack check is done; step 6 (Deep QA against the `state` project) is now on `main`, so what remains is `tools/`, `QA.md`/`RELEASE.md`, removing the old in-portfolio app files and root `api/state-config.js`, and later switching the redirects to permanent. Other open items: Backlog #136 (option C decided), #233, #240, #195, #196, #142 (a learning placeholder, leave it alone). Read the Sept 20 snapshot at the top before trusting anything here.
4. Read `docs/product/PRODUCT_BRIEF.md` and `docs/product/DECISIONS.md` if product behavior is involved.
5. Read `QA.md` before testing or changing QA behavior.
6. Do not deploy or promote because tests passed. Follow `RELEASE.md` and get explicit authorization.
