# Project status

This is the canonical current-state handoff for State and the surrounding portfolio. Read this first, then verify the repository and live environments before relying on older notes or conversation memory.

_Last updated: November 8, 2026, Pacific time. One dated current-state section, then durable reference. Earlier handoff sections (Sept 19 to Oct 27) were moved verbatim to `docs/history/PROJECT_STATUS_THROUGH_2026-10-27.md` (#630). When you update this file, replace "Current state" rather than adding a new dated section above it; move what it replaces to `docs/history/` if it is worth keeping._

## Current state (Nov 8, 2026)

- **`main` (production):** `b111d8a`, the Nov 7 eval release (PR #646). Before it on Nov 7: #636-#638 (the Nov 5 audit fixes, the frontend observer cleanup, the Deep QA wording fix, Project Health release naming).
- **`staging`:** ahead of `main` with work not yet promoted (promotion needs Paige's OK each time):
  - the Nov 5 audit follow-up batches: #619-#621, #625-#627, #629;
  - the State CSS cleanup (#648): dead rules, overridden declarations, about 790 `!important` flags and 132 `html body` prefixes removed, each proven with `scripts/state_ui_compare/compare.py`;
  - the eval session's #640 work that changes Ask behaviour (held on staging; DEC-013's Nov 7 update);
  - the Nov 8 batch: DEC-012 guards (Project Health cooldown claims, migration 023), #624, #630, #622, #628, #623.
  - **Deep QA:** 17/17 on `b3f20aa` (Nov 8), before the Nov 8 batch.
  - Before promoting: migration 023 is a schema change, so take a production backup first (`CLAUDE.md`).
- **Production:** portfolio `https://www.contextswitch.tech/`, State `https://state.contextswitch.tech/`, API `https://state-api-6waw.onrender.com`. **Data** is SQLite on the `state-api` persistent disk (`/var/data/state.db`), not Postgres; backups per `CLAUDE.md`.
- **Model:** `claude-haiku-5-5` (code default). Rollback and model history: `docs/history/PROJECT_STATUS_THROUGH_2026-10-27.md` (Oct 10 and Oct 20 sections).
- **Spend:** State has a $50/day cap on recorded model spend (DEC-014). Project Health's paid actions are open to anyone with cooldowns (DEC-012, updated Nov 8).
- **Release checks:** `make qa-fast` (free, no model calls; Nov 8: 1,172 passed / 149 skipped in `qa-python` before this batch) and `make qa-release` (paid on model-sensitive changes; since #624 it also runs the key-gated pytest files). Deep QA on staging is the browser gate. Paid workflows are pre-approved for testing; report calls and cost afterwards. Details: `QA.md`, `RELEASE.md`, `docs/evals/`.
- **Parked or waiting on Paige:** #594 visitor isolation (parked Nov 8); #567 claim-level Ask authority (design for her approval, no build); #142 is a learning placeholder. GitHub Issues and the **State** Project are the source of truth for open work.
- **Other repos:** Tastemake (`~/code/tastemake`, see its `docs/HANDOFF.md`); Authority Lab (`~/code/authority-lab`).

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

## Infrastructure reference

_Mostly a Sept snapshot; check before relying on it. Since then `render.yaml` declares the `/health` check path and the Vercel plan is Hobby (`CLAUDE.md` has the current deployment rules)._

- **Vercel** (team `team_UxrzvAczWhPiXlO3nvWPAu5b`, one team): project `ai-learning` = `prj_acxPDHf89pEox4gOGMsVcHJLtoUc` (portfolio and, for now, State at the old path; domains `www.` and apex `authenticignorance.site`; DNS is managed by Vercel: `ns1/ns2.vercel-dns.com`); project `state` = `prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl`. Hobby plan: builds are rate-limited, so batch pushes.
- **Render** (workspace `tea-dabo6p3tqb8s73d21u2g`, the only one): `state-api-staging` = `srv-dadloi8n74is73ajsg50` (branch `staging`, free, deploys only on `state-project-complete/**` changes); `state-api` = `srv-dabogoajnfac73dp7h1g` (branch `main`, persistent disk at `/var/data`). The Render MCP tool can write env vars but **cannot read them**; read a value in the dashboard (Environment tab, "Show secret") before changing it, and add to it, never blindly replace it (staging's `CORS_ORIGINS` had four origins that were not documented anywhere).
- **GitHub Actions secrets** (names only): `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` (both used by Deep QA for the portfolio project). `VERCEL_AUTOMATION_BYPASS_SECRET_STATE` **exists** (Paige created it in the Vercel `state` project and set it as a GitHub Actions secret on Sept 20); the drafted step 6 uses it to run Deep QA against the `state` project, and takes effect only once that code is pushed.
- **`STATE_EVAL_INGEST_KEY`** is set on the staging backend only. Recorded eval runs live in staging's ephemeral database and vanish on restart; re-record with `python -m eval.run_quality_evals --record-url https://state-api-staging.onrender.com` from `state-project-complete/`. Keep the key out of chat and shell history (use a hidden prompt), and rotate it if it was ever displayed.

- **Render production has no health-check path** (`state-api`, `healthCheckPath` empty), so a deploy is not zero-downtime: requests during the roughly 90-second swap get 502 (a test session hit this on Sept 21 during PR #250's deploy). Optional dashboard fix: Settings, Health Check Path `/health` (my tools cannot set it; Paige chose to wait). Render production deploys are scoped by root directory, so docs-only and frontend-only merges do not restart it (PR #235 did not).
- **The Vercel free plan caps deployments at 100 per day, team-wide** (the `state` and `ai-learning` projects and Tastemake share it; skipped builds appear to count). A refused deployment shows as the `Vercel – <project>` status "Deployment rate limited" and the API returns 402 `api-deployments-free-per-day` with a quoted reset time; on Sept 21 the cap lifted earlier than quoted, so check the real status instead of waiting. Redeploying through the Vercel API is subject to the project's Ignored Build Step, which now compares against the last deployed commit (see `implementation-context-prototype/README.md`).
- **Slack apps** (api.slack.com/apps): "State" is the staging app and "State prod" is the production app; each was checked on Sept 20 to point its Redirect URL and its Event Subscriptions request URL (Verified) at its own backend.
- **Production data safety net:** Render takes an automatic disk snapshot every 24 hours (kept at least 7 days; no manual snapshot exists, and a restore loses everything written after it). A read-only export of everything production held on Sept 20 was saved on Paige's Mac at `~/state-prod-export-2026-09-20.json` (outside the repo). Nothing on production is unique today: it is the seed data.

## Working notes for the next session (lessons from Sept 19-21)

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

- **Check the neighbouring layer before reporting a finding from one layer.** On Sept 20 I said the finished Ask answer shows raw internal ids because I read the frontend and missed that the backend scrubs first; measuring with the real scrubber showed 0 to 1 of 12 answers affected (#247). Measure with the real function.
- **A conditional approval is a decision.** "I like your recommendation" (measure first, act only if the number is high) was the decision (DEC-009); report the condition's outcome, do not keep listing it as open.
- **Paid model calls:** state the call count and the estimated cost, dry-run first, and get a yes. Reusable eval code goes in a library module with no `load_local_env()`; the runnable script stays thin and is the only thing that loads `.env`; add the script to `ENTRYPOINTS` and the library to the import-time guard in `test_eval_env_isolation.py`. A test that imports a script un-skips the live tests and makes `make qa-fast` call the model (it happened twice on Sept 20; the tell was the skipped count moving from 104 to 103).
- **A prompt change needs a before/after measurement on the affected suites.** For #246 the shape eval looked good while the Ask-quality eval caught a regression the shape eval could not see (fixed section titles leaking into a plain fact answer); the fix scoped the guidance to the `meeting_prep` job and both suites were re-measured. Do not loosen a scorer to make it pass.
- **Reproduce concurrency bugs with both threads alive.** A finished thread's id can be reused by the next one and hide a same-thread SQLite error (#249).
- **Other agents and sessions may test on the live site and write to the demo data.** Compare with the baseline above and reset Northstar the same way, with Paige's OK.
- **Deploys and 502s:** a "Failed to fetch" or 502 right after a merge is probably the deploy window, not a crash: check the Render deploy list first.

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
3. Read "Current state" at the top. Older handoff sections are in `docs/history/PROJECT_STATUS_THROUGH_2026-10-27.md` (history, not instructions). Check the relevant Issue only if Paige asks for something specific.
4. Read `docs/product/PRODUCT_BRIEF.md` and `docs/product/DECISIONS.md` if product behavior is involved.
5. Read `QA.md` before testing or changing QA behavior.
6. Do not deploy or promote because tests passed. Follow `RELEASE.md` and get explicit authorization.
