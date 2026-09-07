// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const DEPLOY_URL = process.env.STATE_DEPLOY_URL || 'https://ai-learning-git-staging-cairn10.vercel.app';
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

if (!BYPASS_SECRET) {
  // Fails fast with a clear reason instead of every test silently hitting
  // Vercel's SSO login page and failing with a confusing selector timeout.
  throw new Error(
    'VERCEL_AUTOMATION_BYPASS_SECRET is required to run Deep QA against the ' +
    'protected staging deployment. See qa/deployed/README.md for how to generate ' +
    'and configure it.'
  );
}

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-report.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  globalSetup: require.resolve('./global-setup.js'),
  use: {
    baseURL: DEPLOY_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Deliberately NOT extraHTTPHeaders here: that applies to every request in
    // the browser context, including the page's own cross-origin fetches to
    // the Render backend -- which turns those into CORS preflights the
    // backend doesn't allow, breaking every API call with net::ERR_FAILED.
    // Instead each navigation goes through gotoWithBypass() (helpers.js),
    // which uses Vercel's query-param + set-cookie method: the bypass only
    // ever touches the Vercel origin, so backend calls are unaffected.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
