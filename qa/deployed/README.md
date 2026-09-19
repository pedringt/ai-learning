# State Deep QA (deployed)

Playwright suite that tests the **real deployed** `staging` environment: the
protected Vercel frontend and the Render `state-api-staging` backend. It never
stubs `window.STATE_API` and never mocks Render. The mocked Chromium suite in
`state-project-complete/test_browser_user_flows.py` continues to cover local
component/browser behavior on every push.

This suite is the "hammer staging" layer: heavier, real-network, and only run
on demand after staging is explicitly approved.

## Running it manually

GitHub -> **Actions** -> **State Deep QA** -> **Run workflow** -> pick the
`staging` branch -> **Run workflow**.

It has two jobs:

1. **preflight** reports the GitHub `staging` HEAD SHA, the Vercel-deployed
   frontend SHA, and the Render-deployed backend SHA, and classifies whether
   any skew between them is expected or a real problem. Read the job summary
   first.
2. **playwright** runs the real deployed browser suite in
   `state-deep-qa.spec.js`. On failure it uploads a Playwright trace,
   screenshots, and the HTML report as workflow artifacts.

Current coverage includes portfolio entry, Workspace hydration, Current State,
Open Items, Settings, a real Ask request, mobile navigation, deterministic
Review/Question authority flows, a full temporary-project Baseline Setup flow,
and the real-model consequentiality regression for authority-backed billing
scope changes.

The Baseline flow intentionally exercises the current user path end to end:
create a blank project, upload one starting source, wait for the Starting State
draft, add a missing fact, confirm Starting State, verify Current State, then
submit ordinary Evidence after Baseline is complete. The temporary project is
switched away from and deleted after all background analysis has settled.

The real model's output for that file varies run to run, so the test separates
two kinds of checks (DEC-008). **Hard checks fail the gate:** the review dialog
does not stay stuck on "still being analyzed", at least one draft fact appears
(zero facts is a real failure), adding a fact adds exactly one row, and confirm
and the later Evidence flow work. **Soft observations never fail the gate:** the
number of facts, the number of areas, and whether "General" was used are
recorded as `model-quality` annotations and printed in the job summary
(`NOTE`, or `WARN` when the split differs from the ideal of 3 facts, more than
one area, no "General"). Model quality is tracked in evals, not in this gate.

## One-time setup this needs (Paige, not Claude)

Two GitHub Actions secrets on `pedringt/ai-learning` are required. Set both
yourself, either with the GitHub CLI (`gh`) authenticated or through GitHub's UI
(Settings -> Secrets and variables -> Actions -> New repository secret). Do not
paste these values into chat; they should only go into GitHub's secret store.

### 1. `VERCEL_AUTOMATION_BYPASS_SECRET`

The staging deployment has Vercel Authentication (SSO) turned on. On the Hobby
plan, the supported automation path is Vercel's Protection Bypass for
Automation:

1. Vercel dashboard -> `ai-learning` project -> **Settings** -> **Deployment Protection**.
2. Under **Protection Bypass for Automation**, generate a secret.
3. Copy the generated value, then run:
   ```bash
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo pedringt/ai-learning
   ```
   Paste the value when prompted, or use the GitHub web UI instead.

This does not change production protection.

### 2. `VERCEL_TOKEN`

Used only by preflight to ask Vercel which commit is actually deployed. Create
a token scoped to your account (Vercel dashboard -> Account Settings -> Tokens
-> Create), then:

```bash
gh secret set VERCEL_TOKEN --repo pedringt/ai-learning
```

If this secret is absent, preflight still runs. It skips the frontend-SHA check
and says so in the summary rather than failing the whole run.

Nothing else needs configuring. The Render backend's `/health` endpoint is
public, so no token is needed to read its deployed build SHA.

## Mutation safety

- The suite does not touch `main` or production data.
- It does not disconnect or reconfigure Slack.
- Every direct backend write helper refuses to run unless
  `STATE_BACKEND_URL` resolves to `state-api-staging.onrender.com`.
- After loading the deployed State UI, `gotoWithBypass()` also checks
  `window.STATE_API.base`. If the staging frontend is accidentally wired to a
  backend host other than `state-api-staging.onrender.com`, the suite fails
  closed before browser-driven writes are allowed to proceed.
- Northstar mutations use the backend's own `POST /api/demo/reset` before and
  after the relevant test group.
- Baseline coverage creates one uniquely named temporary project, switches the
  app to it, performs the real Baseline and post-Baseline Evidence flows, then
  switches back to Northstar and deletes only that temporary project.

## Findings from building/running this suite

- **Fixed: "Answer found · Awaiting review" didn't reliably appear.**
  `clarifyQuestionsAwaitingReview()` in `context-quickwins.js` tags an open
  question with `.is-awaiting-review` when an open Review's
  `resolves_question_ids` names it. Root cause: it captured the
  `.open-items-page` element, awaited `getReviews('open')`, then discarded the
  result if progressive hydration had replaced that DOM node. The fix re-queries
  the live page at apply time.

- **Fixed: Vercel bypass headers broke every backend API call.** The suite
  originally applied the bypass secret as an `extraHTTPHeaders` header on every
  browser request, including cross-origin requests to Render, which forced CORS
  preflights the backend does not allow. `gotoWithBypass()` now uses Vercel's
  query-param + set-cookie method so the bypass only touches the Vercel origin.

- **Deep QA assertions must follow the product, not old markup.** The suite now
  targets the current `Open State` CTA, rendered Current State wiki content,
  expandable Question rows, mobile primary navigation, current seeded Review
  IDs, and a non-routing Ask query. Generic attention inventory questions are
  intentionally routed to the Open Items card and should not be asserted as
  synthesized Ask answers.

## Local run (optional)

```bash
cd qa/deployed
npm install
npx playwright install --with-deps chromium
VERCEL_AUTOMATION_BYPASS_SECRET=... npx playwright test
```
