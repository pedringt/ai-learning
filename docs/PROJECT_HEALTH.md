# Project Health

Project Health is a portfolio-operations dashboard for Paige's active product work. It is intentionally product-facing rather than a replacement for Vercel, Render, Neon, GitHub, or dedicated eval tooling.

## V1 projects

- State
- Tastemake
- NARC (in progress)
- Authority Lab (in progress)

## Common health layers

- Delivery: GitHub branch/commit status plus Vercel commit status.
- Infrastructure: Render service health where a project has a Render backend, plus optional Neon project/branch metadata.
- Site analytics: whether production Vercel Web Analytics is connected and receiving page views, with 7-day recency. Raw page-view and visitor counts are not shown or returned (Oct 11).
- Product quality: project-specific checks. State currently reuses its content-free Review/Ask quality aggregates.
- Attention: plain-language interpretation of concrete signals; no combined health score.
- Run controls: guarded project-specific health workflows where one is explicitly configured.

## Oct 27 changes (PM review, DEC-016)

- **One measurement per card.** State's Overview cards are the AI Evals tab's four measurements (`STATE_QUALITY_METRICS`): Update understanding, Evidence grounding, Decision authority, Uncertainty handling. Each card's score, high-impact failures and change come from the same field, and changes are in points ("↓ 10 pts"). The old "Answer quality" card showed grounding's score with the whole suite's change and failures.
- **Stale-eval detection watches what the evals run (Oct 27, after the production smoke test).** `evalBehaviorPaths` lists the Ask and Review modules the eval harness imports (traced, stopping at infrastructure), and `evalContractPaths` lists the scenarios, harness and grader. The old list had three files and missed #566's change to `ask_authority_text.py`, so the dashboard called the Oct 26 scores current. `test_project_health_eval_paths.py` re-traces the imports and fails when a run module isn't watched. A failed GitHub lookup for any path now reads as "could not check", not "no change". A contract change gives its own reason ("The eval contract changed…").
- **Eval coverage on the Overview.** A line under the quality cards says which build the evals ran on and whether they still cover the live release. A release that differs from the eval build is only flagged when State's AI behavior files changed after the run, or when that history could not be checked.
- **Where reports come from.** The Overview card built by rules is "Assessment from current signals" and says no AI was called. The quality investigation says it is built from recorded eval evidence. Only the failure investigator is labeled AI, with its model and "accuracy not yet measured".
- **Healthy on what's measured.** See DEC-016. A project's `unmeasuredQuality` list keeps it from plain Healthy; today only Authority Lab declares one.
- **15 s p95 target for State's AI calls.** `responseTargetP95Ms` on the State project; above it the AI response speed signal reads Watch.
- **Small samples.** Below five checks a card shows the count ("1 / 1"), and NARC's pass/fail checks show Passing, Failing, Done or Pending, never 100% or 0%.
- **Analytics loading.** The card says "Checking site analytics…" while it loads and names the actual failure otherwise. It used to say "still loading or temporarily unavailable" for both.
- **Shared decision log.** Stored on the State backend (`project_health_decisions`), read by anyone, written with `PROJECT_HEALTH_DECISION_KEY`.
- **Investigator planted-case accuracy.** See `docs/evals/README.md`.

## Oct 19 changes

- **Server errors are not monitored.** Vercel's runtime-logs API is a live tail with no time range, so it cannot return past errors, and history needs Log Drains (Vercel Pro). The dashboard says "Not monitored on this plan" instead of reporting a clean or partial scan, and no longer waits on the stream.
- **Each project's quality cards live in `QUALITY_VIEWS`** in `project-health.js` (Overview cards, metrics, quality tab, links-menu label). A project without an entry gets the neutral fallback, and a test checks that each view uses only its own terms.
- **Paid eval runs, last 30 days:** State's quality tab shows how many State AI quality check runs finished in 30 days (every branch and trigger, so an upper bound) and, with the configured estimate, an upper-bound cost. This is DEC-012's revisit signal. Investigations are counted too: each call's usage (project, model, tokens, duration; never content) is recorded in the State backend, and the tab shows the 30-day total.
- **Authority Lab "Run tests"** starts its `test.yml` on main (free). That workflow accepts manual runs since pedringt/authority-lab#146 (Oct 20).
- **The investigator's job-log excerpt** prefers real failure markers (a non-zero failure count, `not ok`, `x name` result lines, AssertionError, pytest `FAILED`) with the lines after each, so a suite's own logging is no longer mistaken for the failure.
- **The investigator eval runs weekly** (Mondays, Haiku only, about $0.02), and fails only on API errors or reports cut off at the cap.

## Server-side configuration

The dashboard works without these variables, but unavailable integrations stay labeled as not connected.

### Vercel Web Analytics

- `VERCEL_TOKEN`

The token stays server-side. Project Health reads aggregate page-view counts for the allowlisted Vercel project IDs server-side and returns only booleans: `receiving` (any page views in 30 days) and `recent` (any in the last 7 days).

### Neon health

- `NEON_API_KEY`
- `PROJECT_HEALTH_NEON_PROJECT_TASTEMAKE`
- `PROJECT_HEALTH_NEON_PROJECT_NARC`

Only configure a project-id variable when that project actually uses the corresponding Neon project. State does not (#508, Oct 20): its production data is SQLite on the Render `state-api` disk, so its database card shows that note instead, and `PROJECT_HEALTH_NEON_PROJECT_STATE` is no longer read. The idle Neon "State" projects can be deleted whenever Paige decides. Project Health returns only project/branch health metadata, not connection strings, roles, query results, or credentials.

### Investigation usage

- `PROJECT_HEALTH_USAGE_KEY`: the same random value on the Vercel project (Production and Preview) and on both Render services (`state-api`, `state-api-staging`)

Without it the investigator still works, but its calls are not counted. Production records to the production State API, previews to staging.

### Decision log

- `PROJECT_HEALTH_DECISION_KEY`: a random value on both Render services (`state-api`, `state-api-staging`). The Vercel project needs nothing new: `api/project-health-decisions.js` passes the key Paige types to the State API, which checks it.

Without it the log still reads, and adding an entry returns "not configured for writes". The table comes from migration `021_project_health_decisions.sql`, so take the production SQLite backup before the backend deploy that adds it.

### Dashboard-run controls

State's existing staging-only controlled eval workflow can be dispatched from Project Health only when all of these are configured:

- `GITHUB_TOKEN` with the minimum repository Actions permission required to dispatch the allowlisted workflow
- `PROJECT_HEALTH_RUN_KEY`, a separate admin secret entered by Paige when starting a run
- `PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE`, a human-maintained cost estimate shown before confirmation

The run endpoint allowlists the repository, workflow file, and `staging` ref in code. It does not accept arbitrary workflow names or refs from the browser.

State's current run describes at least 16 controlled cases (8 Review interpretation + 8 Ask quality) plus the existing live walkthrough. The dashboard must show the configured estimated cost and receive an explicit paid-call confirmation before dispatch.

## Privacy boundary

Project Health may show deployment metadata, service reachability/build identifiers, bounded latency, Neon project/branch health metadata, aggregate Vercel traffic counts, and content-free eval aggregates.

It must not expose provider tokens, database connection strings, raw logs, visitor identities, State project content, prompts, answers, Evidence, Review text, Question text, Current State statements, or detailed traces.

See `docs/product/DATA_PRIVACY.md` and R-020 in `docs/product/RISKS.md`.


### On-demand investigation

The first investigation version is limited to failed Vercel deployments and failed GitHub checks. It verifies the current allowlisted branch server-side, reads the matching provider evidence, and may follow up with Vercel build output or the related commit/PR when the first source is inconclusive. It sends bounded, sanitized evidence to Anthropic for one short summary. The model cannot call tools or select URLs.

Configure these server-side in the Project Health Vercel project before enabling the feature:

- `ANTHROPIC_API_KEY`
- `PROJECT_HEALTH_INVESTIGATION_KEY`, a separate admin key used only to authorize investigation requests

The existing `VERCEL_TOKEN` is used to read Vercel deployment metadata/build output. GitHub check details are read from the public repository API. GitHub Actions leaves a failed check's title and summary empty, so (Oct 16) the investigator also reads a bounded, redacted excerpt of the first two failed jobs' logs with `GITHUB_TOKEN`; without it the report says the log was not available. Each check counts by its latest run only, and State's paid eval jobs (`evalCheckNames`: `quality`, `walkthrough`) are quality evidence, not release checks, so a flaky eval run no longer reads as a failed release check. Do not reuse `PROJECT_HEALTH_RUN_KEY`; that key is only for dispatching paid State eval runs.

The UI asks for confirmation before sending one investigation request to Anthropic. Each request is read-only, limited to the selected project/environment, and uses one model summary call with a fixed output-token cap (900 tokens since Oct 16, DEC-011). Logs/check output are treated as untrusted text and never executed. No Slack, database, code-writing, workflow-dispatch, issue-creation, or deployment access is included.
