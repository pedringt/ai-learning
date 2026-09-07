// Deployed-environment Deep QA for State staging.
//
// This suite hits the REAL Vercel staging deployment and the REAL Render
// staging backend -- it never stubs window.STATE_API or Render. That is the
// point: the mocked Playwright suite in state-project-complete/
// (test_browser_user_flows.py) already covers component/browser behavior in
// isolation. This suite exists to catch what that one structurally cannot:
// deployment protection, routing, CORS, environment config, and
// frontend/backend contract drift between what's actually deployed.
//
// See qa/deployed/README.md for how to run this manually and what it needs.
const { test, expect } = require('@playwright/test');
const { attachDiagnostics, resetDemoData, backendJson, gotoWithBypass } = require('./helpers');

const STATE_URL = '/implementation-context-prototype/index.html';

test.describe('Portfolio -> State entry', () => {
  test('homepage loads and links into State', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, '/');
    await expect(page.getByRole('link', { name: /Try State/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Read case study/i }).first()).toBeVisible();
    diag.assertClean(expect);
  });

  test('Try State opens the State workspace with no auth loop', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page).not.toHaveURL(/vercel\.com\/(login|sso)/i);
    await expect(page.locator('.sidebar-nav [data-view="overview"]')).toBeVisible();
    diag.assertClean(expect);
  });
});

test.describe('Workspace', () => {
  test('attention section hydrates and Ask stays usable', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    // "Opening Northstar..." must clear once hydration finishes -- it must
    // never sit there forever (the thing a cold Render backend could cause).
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    // Ask is a global drawer opened from the floating launcher, not an
    // inline Workspace field -- open it the way a real user would.
    await page.locator('#askStateLauncher').click();
    const askInput = page.locator('#askStateDrawerInput');
    await expect(askInput).toBeVisible();
    await askInput.click();
    await askInput.fill('temporary focus check');
    await expect(askInput).toHaveValue('temporary focus check');
    await expect(askInput).toBeFocused();
    await askInput.fill('');
    diag.assertClean(expect);
  });
});

test.describe('Current State', () => {
  test('Current State view renders as maintained project context', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="project-overview"]').click();
    await expect(page.locator('.project-nav-toggle')).toHaveClass(/active/);
    // At least one maintained-fact disclosure exists and starts collapsed.
    await expect(page.locator('.project-maintained-facts').first()).toBeVisible();
    diag.assertClean(expect);
  });
});

test.describe('Open Items', () => {
  test('Reviews, Blocking, Open questions and Drafts all load', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();
    await expect(page.locator('.open-items-page')).toBeVisible();
    const sections = page.locator('.open-items-section');
    await expect(sections).toHaveCount(4, { timeout: 15_000 });
    for (const label of ['unavailable', 'could not be loaded']) {
      await expect(page.getByText(label, { exact: false })).toHaveCount(0);
    }
    diag.assertClean(expect);
  });

  test('an open question can be opened from its list', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();
    const firstQuestion = page.locator('[data-action="open-question"]').first();
    await expect(firstQuestion).toBeVisible({ timeout: 15_000 });
    await firstQuestion.click();
    await expect(page.locator('#dialogTitle')).toBeVisible();
    await expect(page.locator('[data-action="answer-question"]')).toBeVisible();
    await page.locator('[data-action="close-dialog"]').click();
    diag.assertClean(expect);
  });
});

test.describe('Settings', () => {
  test('Settings loads and is not clobbered by in-flight hydration', async ({ page }) => {
    const diag = attachDiagnostics(page);
    // Navigating to Settings immediately, before the rest of the workspace
    // hydrates, used to race with hydration replacing the view. This is the
    // regression that protection guards against; verify it against the real
    // deployed build rather than only the mocked suite.
    await gotoWithBypass(page, STATE_URL);
    await page.locator('.sidebar-nav [data-view="settings"]').click();
    await expect(page.locator('.nav-item[data-view="settings"]')).toHaveClass(/active/);
    await page.waitForTimeout(3_000); // let any pending hydration attempt to redraw
    await expect(page.locator('.nav-item[data-view="settings"]')).toHaveClass(/active/);
    diag.assertClean(expect);
  });
});

test.describe('Ask', () => {
  test('a safe query produces a grounded, non-error answer', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('#askStateLauncher').click();
    const askInput = page.locator('#askStateDrawerInput');
    await expect(askInput).toBeVisible();
    await askInput.fill("What needs my attention right now?");
    await page.locator('#askStateDrawer [data-review-batch-form="ask"] button[type="submit"]').click();
    await expect(page.locator('#askStateDrawer .ask-live-answer')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#askStateDrawer .ask-live-error')).toHaveCount(0);
    diag.assertClean(expect);
  });
});

test.describe('Mobile smoke', () => {
  test.use({ viewport: { width: 390, height: 720 } });
  test('workspace is usable at phone width', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    // Ask's entry point at phone width is the floating launcher, not an
    // inline field -- confirm it's visible and reachable rather than open it.
    await expect(page.locator('#askStateLauncher')).toBeVisible();
    await page.locator('.sidebar-nav [data-view="open-items"]').click();
    await expect(page.locator('.open-items-page')).toBeVisible();
    const box = await page.locator('.open-items-page').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
    diag.assertClean(expect);
  });
});

// Deterministic mutation flow. Uses curated demo IDs from seed_demo.py rather
// than live AI judgment, per the product's own preference for this kind of
// test: demo-review-retention is seeded already linked (via review_questions)
// to q-retention, so accepting it exercises the real
// Question -> Evidence -> Review -> resolution rule without depending on
// what the interpretation pipeline decides on a given run.
test.describe('Review + Question resolution (deterministic demo data)', () => {
  test.beforeAll(async ({ request }) => {
    await resetDemoData(request);
  });
  test.afterAll(async ({ request }) => {
    await resetDemoData(request);
  });

  // Open Items renders every review card collapsed (accordion mode) except
  // whichever one is currently expanded -- review-update/review-keep only
  // exist in the DOM once a card is expanded via its toggle.
  async function expandReviewCard(page, reviewId) {
    const card = page.locator(`[data-review-card="${reviewId}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.locator('[data-action="toggle-review-card"]').click();
    await expect(card.locator('[data-action="review-update"], [data-action="review-keep"]').first()).toBeVisible({ timeout: 5_000 });
    return card;
  }

  test('accepting a linked review resolves its question (not the reverse)', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const beforeQuestions = await backendJson(request, '/api/questions?status=open');
    const beforeIds = (beforeQuestions.items || beforeQuestions).map(q => q.id);
    expect(beforeIds).toContain('q-retention');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    // The question must show as awaiting review, not silently disappear or
    // resolve just because evidence/a review exists -- only accepting the
    // explicitly linked Review is allowed to resolve it. (This indicator has
    // shown intermittent timing issues in manual testing -- see
    // qa/deployed/README.md "Known findings". If this assertion starts
    // failing in CI, check there first before assuming a new regression.)
    const questionRow = page.locator('[data-question-id="q-retention"]');
    await expect(questionRow).toHaveClass(/is-awaiting-review/, { timeout: 15_000 });

    const reviewCard = await expandReviewCard(page, 'demo-review-retention');
    await reviewCard.locator('[data-action="review-update"]').click();
    await expect(reviewCard).toHaveCount(0, { timeout: 10_000 });

    await expect(async () => {
      const afterQuestions = await backendJson(request, '/api/questions?status=open');
      const afterIds = (afterQuestions.items || afterQuestions).map(q => q.id);
      expect(afterIds).not.toContain('q-retention');
    }).toPass({ timeout: 15_000 });
    diag.assertClean(expect);
  });

  test('accepting a review with a proposed change updates Current State and History', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const before = await backendJson(request, '/api/state');
    const beforeEscalation = (before.items || before).find(s => s.id === 'k-escalation');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    const reviewCard = await expandReviewCard(page, 'demo-review-escalation');
    await reviewCard.locator('[data-action="review-update"]').click();
    await expect(reviewCard).toHaveCount(0, { timeout: 10_000 });

    await expect(async () => {
      const after = await backendJson(request, '/api/state');
      const afterEscalation = (after.items || after).find(s => s.id === 'k-escalation');
      expect(afterEscalation?.statement).not.toEqual(beforeEscalation?.statement);
    }).toPass({ timeout: 15_000 });

    const history = await backendJson(request, '/api/history');
    const historyItems = history.items || history;
    expect(historyItems.some(h => h.review_id === 'demo-review-escalation')).toBeTruthy();
    diag.assertClean(expect);
  });

  test('leaving a review unchanged does not mutate Current State', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const before = await backendJson(request, '/api/state');
    const beforeAccess = (before.items || before).find(s => s.id === 'k-access');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    const reviewCard = await expandReviewCard(page, 'demo-review-access');
    await reviewCard.locator('[data-action="review-keep"]').click();
    await expect(reviewCard).toHaveCount(0, { timeout: 10_000 });

    const after = await backendJson(request, '/api/state');
    const afterAccess = (after.items || after).find(s => s.id === 'k-access');
    expect(afterAccess?.statement).toEqual(beforeAccess?.statement);
    diag.assertClean(expect);
  });
});
