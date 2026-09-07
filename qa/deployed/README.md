# State Deep QA (deployed)

Playwright suite that tests the **real deployed** `staging` environment: the
protected Vercel frontend and the Render `state-api-staging` backend. It never
stubs `window.STATE_API` and never mocks Render -- that job already belongs to
the mocked Chromium suite in `state-project-complete/test_browser_user_flows.py`,
which keeps running on every push via `.github/workflows/tests.yml`.

This suite is the "hammer staging" layer: heavier, real-network, and only run
on demand.

## Running it manually

GitHub -> **Actions** -> **State Deep QA** -> **Run workflow** -> pick the
`staging` branch -> **Run workflow**.

It has two jobs:

1. **preflight** -- reports the GitHub `staging` HEAD SHA, the Vercel-deployed
   frontend SHA, and the Render-deployed backend SHA, and classifies whether
   any skew between them is expected (no backend-relevant files changed) or a
   real problem (backend-relevant commits are undeployed, or something is on
   the wrong branch). Read the job summary first -- it's usually enough to
   answer "is staging actually current?" without opening the Playwright report.
2. **playwright** -- runs the real deployed browser suite described in
   `state-deep-qa.spec.js`. On failure it uploads a Playwright trace,
   screenshots, and the HTML report as workflow artifacts.

## One-time setup this needs (Paige, not Claude)

Two GitHub Actions secrets on `pedringt/ai-learning` are required. Set both
yourself -- from a terminal with the GitHub CLI (`gh`) authenticated, or via
GitHub's own UI (Settings -> Secrets and variables -> Actions -> New repository
secret). Don't paste these values into a chat with Claude; they should only
ever go directly into GitHub's secret store.

### 1. `VERCEL_AUTOMATION_BYPASS_SECRET`

The staging deployment has Vercel Authentication (SSO) turned on for all
deployments, which is what protects it -- the project is on Vercel's Hobby
plan, so Trusted Sources/OIDC bypass (an Enterprise feature) isn't available.
The supported free alternative is Vercel's own "Protection Bypass for
Automation":

1. Vercel dashboard -> `ai-learning` project -> **Settings** -> **Deployment
   Protection**.
2. Under **Protection Bypass for Automation**, click to generate a secret.
   Vercel generates it for you -- you don't type anything.
3. Copy the generated value, then run:
   ```bash
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo pedringt/ai-learning
   ```
   (paste the value when prompted, or use the GitHub web UI instead).

This costs nothing extra and doesn't touch production's protection.

### 2. `VERCEL_TOKEN`

Used only by the preflight job to ask Vercel's API which commit is actually
deployed. Create a token scoped to your account (Vercel dashboard -> Account
Settings -> Tokens -> Create), then:
```bash
gh secret set VERCEL_TOKEN --repo pedringt/ai-learning
```
If this secret is absent, preflight still runs -- it just skips the
frontend-SHA check and says so in the summary, rather than failing the whole
run.

Nothing else needs configuring. The Render backend's `/health` endpoint is
public, so no token is needed to read its deployed build SHA.

## What it deliberately does not do

- Does not touch `main` or production data.
- Does not disconnect or reconfigure Slack.
- Does not change any deployment protection, plan, or billing setting.
- Only mutates data through `POST /api/demo/reset` against
  `state-api-staging.onrender.com` specifically -- every write path checks the
  target host first and refuses to run against anything else.

## Findings from building/running this suite

- **Fixed: "Answer found · Awaiting review" didn't reliably appear.**
  `clarifyQuestionsAwaitingReview()` in `context-quickwins.js` tags an open
  question with `.is-awaiting-review` when an open Review's
  `resolves_question_ids` names it. Root cause: it captured the
  `.open-items-page` element, awaited `getReviews('open')`, then bailed via
  `if(!page.isConnected)return` if Open Items had progressively re-rendered
  (replacing that DOM node) while the request was in flight -- which happens
  routinely during hydration, so the fetch's result was silently discarded
  more often than not. Fixed by re-querying the live `.open-items-page` at
  apply time instead of trusting the possibly-detached original reference.
  Confirmed against real staging: the Deep QA run that first caught this
  (11/12 failing, unrelated CORS bug below) still passed this specific
  assertion on its own, and a second run after the CORS fix also passed it
  cleanly -- consistent with a race that was usually won, not a hard
  failure, which is exactly why the mocked suite (which doesn't load
  `context-quickwins.js` at all) never had a chance to catch it either way.

- **Fixed: Vercel bypass headers broke every backend API call.** The suite
  originally applied the bypass secret as an `extraHTTPHeaders` header on
  every request in the browser context -- including the page's own
  cross-origin fetches to the Render backend, which forced a CORS preflight
  the backend doesn't allow. First real Deep QA run failed 11/12 tests on
  this. Switched to Vercel's query-param + set-cookie method
  (`gotoWithBypass()` in `helpers.js`), which only ever touches the Vercel
  origin. Confirmed via a clean 12/12 run after the fix.

## Local run (optional)

```bash
cd qa/deployed
npm install
npx playwright install --with-deps chromium
VERCEL_AUTOMATION_BYPASS_SECRET=... npx playwright test
```
