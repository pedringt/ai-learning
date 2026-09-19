// Deployed-environment Deep QA for State staging.
//
// This suite hits the REAL Vercel staging deployment and the REAL Render
// staging backend. It exists to catch deployment protection, routing, CORS,
// environment config, real-model behavior, and frontend/backend contract drift
// that the mocked browser suite cannot cover.
//
// See qa/deployed/README.md for how to run this manually and what it mutates.
const { test, expect } = require('@playwright/test');
const {
  attachDiagnostics,
  resetDemoData,
  backendJson,
  backendPost,
  backendDelete,
  gotoWithBypass,
} = require('./helpers');

const STATE_URL = '/implementation-context-prototype/index.html';


test.describe('Portfolio -> State entry', () => {
  test('homepage loads and links into State', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, '/');
    await expect(page.getByRole('link', { name: /Open State/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Read (?:the )?case study/i }).first()).toBeVisible();
    diag.assertClean(expect);
  });

  test('State workspace opens with no auth loop', async ({ page }) => {
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
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
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
  test('Current State view renders maintained project context', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="project-overview"]').click();
    await expect(page.locator('.project-nav-toggle')).toHaveClass(/active/);
    await expect(page.locator('.project-outline-section').first()).toBeVisible();
    await expect(page.locator('.project-wiki-prose p').first()).toBeVisible();
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
    await expect(page.locator('.open-items-section')).toHaveCount(4, { timeout: 15_000 });
    for (const label of ['unavailable', 'could not be loaded']) {
      await expect(page.getByText(label, { exact: false })).toHaveCount(0);
    }
    diag.assertClean(expect);
  });

  test('an open question expands from its list', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();
    const firstQuestion = page.locator('.open-question-item').first();
    await expect(firstQuestion).toBeVisible({ timeout: 15_000 });
    await firstQuestion.locator('summary').click();
    await expect(firstQuestion.locator('[data-action="answer-question"]')).toBeVisible();
    diag.assertClean(expect);
  });
});


test.describe('Settings', () => {
  test('Settings loads and is not clobbered by in-flight hydration', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await page.locator('.sidebar-nav > [data-view="settings"]').click();
    await expect(page.locator('.sidebar-nav > [data-view="settings"]')).toHaveClass(/active/);
    await page.waitForTimeout(3_000);
    await expect(page.locator('.sidebar-nav > [data-view="settings"]')).toHaveClass(/active/);
    diag.assertClean(expect);
  });
});


test.describe('Ask', () => {
  test('a safe non-routing query produces a grounded, non-error answer', async ({ page }) => {
    const diag = attachDiagnostics(page);
    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('#askStateLauncher').click();
    const askInput = page.locator('#askStateDrawerInput');
    await expect(askInput).toBeVisible();
    await askInput.fill('What is the current pilot scope?');
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
    await expect(page.locator('#askStateLauncher')).toBeVisible();
    await page.locator('.mobile-primary-nav [data-view="open-items"]').click();
    await expect(page.locator('.open-items-page')).toBeVisible();
    const box = await page.locator('.open-items-page').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
    diag.assertClean(expect);
  });
});


// Deterministic mutation flow. Curated demo Reviews exercise the authority
// boundary without depending on model judgment.
test.describe('Review + Question resolution (deterministic demo data)', () => {
  test.beforeAll(async ({ request }) => {
    await resetDemoData(request);
  });

  test.afterAll(async ({ request }) => {
    await resetDemoData(request);
  });

  async function expandReviewCard(page, reviewId) {
    const card = page.locator(`[data-review-card="${reviewId}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.locator('[data-action="toggle-review-card"]').click();
    await expect(
      card.locator('[data-action="review-update"], [data-action="review-keep"]').first()
    ).toBeVisible({ timeout: 5_000 });
    return card;
  }

  async function confirmProposedUpdate(page, reviewCard) {
    await reviewCard.locator('[data-action="review-update"]').click();
    const confirmButton = page.locator('[data-action="confirm-review-update"]');
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();
    await expect(reviewCard).toHaveCount(0, { timeout: 10_000 });
  }

  test('accepting a linked review resolves its question', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const beforeQuestions = await backendJson(request, '/api/questions?status=open');
    const beforeIds = (beforeQuestions.items || beforeQuestions).map(q => q.id);
    expect(beforeIds).toContain('q-thresholds');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    const questionRow = page.locator('.open-question-item[data-question-id="q-thresholds"]');
    await expect(questionRow).toBeVisible({ timeout: 15_000 });
    await questionRow.locator('summary').click();
    await expect(questionRow.getByText(/Answer found · Awaiting review/i)).toBeVisible();
    await expect(questionRow.locator('[data-action="open-specific-review"]')).toBeVisible();

    const reviewCard = await expandReviewCard(page, 'demo-review-launch');
    await confirmProposedUpdate(page, reviewCard);

    await expect(async () => {
      const afterQuestions = await backendJson(request, '/api/questions?status=open');
      const afterIds = (afterQuestions.items || afterQuestions).map(q => q.id);
      expect(afterIds).not.toContain('q-thresholds');
    }).toPass({ timeout: 15_000 });
    diag.assertClean(expect);
  });

  test('accepting a proposed change updates Current State and History', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const before = await backendJson(request, '/api/state');
    const beforeAccess = (before.items || before).find(s => s.id === 'k-access');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    const reviewCard = await expandReviewCard(page, 'demo-review-access');
    await confirmProposedUpdate(page, reviewCard);

    await expect(async () => {
      const after = await backendJson(request, '/api/state');
      const afterAccess = (after.items || after).find(s => s.id === 'k-access');
      expect(afterAccess?.statement).not.toEqual(beforeAccess?.statement);
    }).toPass({ timeout: 15_000 });

    const history = await backendJson(request, '/api/history');
    const historyItems = history.items || history;
    expect(historyItems.some(h => h.review_id === 'demo-review-access')).toBeTruthy();
    diag.assertClean(expect);
  });

  test('leaving a review unchanged does not mutate Current State', async ({ page, request }) => {
    const diag = attachDiagnostics(page);
    const before = await backendJson(request, '/api/state');
    const beforeVip = (before.items || before).find(s => s.id === 'k-vip');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await page.locator('.sidebar-nav [data-view="open-items"]').click();

    const reviewCard = await expandReviewCard(page, 'demo-review-retire-vip');
    await reviewCard.locator('[data-action="review-keep"]').click();
    await expect(reviewCard).toHaveCount(0, { timeout: 10_000 });

    const after = await backendJson(request, '/api/state');
    const afterVip = (after.items || after).find(s => s.id === 'k-vip');
    expect(afterVip?.statement).toEqual(beforeVip?.statement);
    diag.assertClean(expect);
  });
});


// Full deployed lifecycle for the new Baseline Setup experience. The test uses
// one temporary project, waits for all background interpretation to settle,
// and deletes only that project after switching the app back to Northstar.
test.describe.serial('Baseline Setup lifecycle (real deployed staging)', () => {
  let projectId = null;

  test.beforeAll(async ({ request }) => {
    const project = await backendPost(request, '/api/projects', {
      name: `Deep QA Baseline ${Date.now()}`,
    });
    projectId = project.id;
    await backendPost(request, '/api/projects/switch', { project_id: projectId });
  });

  test.afterAll(async ({ request }) => {
    await backendPost(request, '/api/projects/switch', { project_id: 'northstar' });
    if (projectId) {
      await backendDelete(request, `/api/projects/${projectId}`);
    }
  });

  test('upload -> organize -> edit -> confirm -> normal Evidence', async ({ page, request }) => {
    test.setTimeout(180_000);
    const diag = attachDiagnostics(page);
    const source = [
      'Purpose',
      'Project Atlas replaces the weekly spreadsheet status report with one maintained project summary.',
      '',
      'Delivery',
      'The target launch date is October 15, 2026.',
      'Morgan Lee owns launch readiness.',
    ].join('\n');

    await gotoWithBypass(page, STATE_URL);
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#projectSwitcher')).toContainText('Deep QA Baseline');
    await expect(page.locator('[data-baseline-add-starting]')).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-baseline-add-starting]').click();
    await expect(page.locator('#dialogTitle')).toHaveText('Add starting material');
    await page.locator('#baselineStartingFile').setInputFiles({
      name: 'deep-qa-baseline.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(source, 'utf8'),
    });

    await expect(page.locator('[data-baseline-review-starting]')).toBeVisible({ timeout: 90_000 });
    await page.locator('[data-baseline-review-starting]').click();
    const draft = page.locator('.baseline-draft-dialog');
    await expect(draft).toBeVisible();

    // Hard checks (a failure here means the app or the analysis path is broken):
    // the dialog must not stay stuck on "still being analyzed" (#230), and the
    // analysis must produce at least one draft fact. Zero facts is a real
    // failure: the person is left with an empty draft (R-016, #231).
    const facts = draft.locator('.baseline-draft-fact');
    await expect(page.locator('.baseline-draft-status')).not.toContainText('still being analyzed', { timeout: 30_000 });
    await expect(async () => {
      expect(await facts.count()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000 });

    // Soft observations (model quality, not app correctness): how the model
    // split this particular file varies run to run, so it is recorded in the
    // report instead of failing the gate. Model quality belongs in the evals.
    const areas = await facts.locator('[data-baseline-area]').evaluateAll(inputs =>
      inputs.map(input => input.value.trim()).filter(Boolean)
    );
    const distinctAreas = new Set(areas.map(area => area.toLowerCase()));
    const factCount = await facts.count();
    const usedGeneral = areas.some(area => area.toLowerCase() === 'general');
    test.info().annotations.push({
      type: 'model-quality',
      description: `facts=${factCount} (ideal 3), areas=${distinctAreas.size} (ideal >1), general=${usedGeneral} (ideal false): ${[...distinctAreas].join(' | ')}`,
    });
    if (factCount !== 3 || distinctAreas.size < 2 || usedGeneral) {
      test.info().annotations.push({
        type: 'model-quality-warning',
        description: 'Baseline analysis differed from the ideal split for this file. Not a gate failure; see the eval follow-up for tracking model quality.',
      });
    }

    const beforeManualCount = factCount;
    await draft.locator('[data-baseline-add-fact]').click();
    await page.locator('[data-baseline-new-area]').fill('Success');
    await page.locator('[data-baseline-new-topic]').fill('Success measure');
    await page.locator('[data-baseline-new-statement]').fill(
      'The first release succeeds if weekly status preparation takes under 30 minutes.'
    );
    await page.locator('[data-baseline-save-new-fact]').click();
    await expect(page.locator('.baseline-draft-dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.baseline-draft-fact')).toHaveCount(beforeManualCount + 1, { timeout: 15_000 });

    const confirmButton = page.locator('[data-baseline-confirm-starting]');
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.locator('#baselineSetupBanner')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#appLoadStatus')).toBeHidden({ timeout: 30_000 });

    const currentState = await backendJson(request, '/api/state');
    const currentItems = currentState.items || currentState;
    expect(currentItems.length).toBeGreaterThanOrEqual(beforeManualCount + 1);
    expect(
      currentItems.some(item => item.statement === 'The first release succeeds if weekly status preparation takes under 30 minutes.')
    ).toBeTruthy();

    const followup = 'Post-baseline QA check: the weekly status review is scheduled for October 22, 2026.';
    await page.locator('[data-action="add-info"]').first().click();
    await expect(page.locator('#dialogTitle')).toHaveText('Add Evidence');
    await page.locator('#addInfoText').fill(followup);

    const normalEvidenceResponse = page.waitForResponse(response => {
      if (response.request().method() !== 'POST') return false;
      try {
        return new URL(response.url()).pathname === '/api/evidence';
      } catch {
        return false;
      }
    }, { timeout: 75_000 });
    await page.locator('[data-action="save-info"]').click();
    const evidenceResponse = await normalEvidenceResponse;
    expect(evidenceResponse.status()).toBe(201);
    await expect(page.locator('#baselineSetupBanner')).toBeHidden();

    await expect(async () => {
      const evidence = await backendJson(request, '/api/evidence');
      const items = evidence.items || evidence;
      expect(items.some(item => item.content === followup)).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    diag.assertClean(expect);
  });
});


// Real-model regression case against the actual deployed provider. Northstar's
// Current State explicitly keeps billing actions outside the first
// implementation, so attributed leadership direction to move forward on a
// billing capability must reach human Review rather than silently no_review.
test.describe('Evidence intake consequentiality (real model)', () => {
  test.beforeAll(async ({ request }) => {
    await resetDemoData(request);
  });

  test.afterAll(async ({ request }) => {
    await resetDemoData(request);
  });

  test('VP billing note reaches Review, not a silent no_review', async ({ request }) => {
    test.setTimeout(90_000);
    const result = await backendPost(request, '/api/evidence', {
      content: 'VP says we can move forward on auto drafting billing quesitons',
    }, { timeout: 75_000 });
    expect(Array.isArray(result.reviews)).toBeTruthy();
    expect(result.reviews.length).toBeGreaterThan(0);
  });
});