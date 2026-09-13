'use strict';
// Explicitly authorized live staging check. Never resets the demo or changes
// Current State. It closes only its own Reviews/Questions. Evidence is retained.
const { chromium, request, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const FRONT = 'https://ai-learning-git-staging-cairn10.vercel.app';
const API = 'https://state-api-staging.onrender.com';
const APP = FRONT + '/implementation-context-prototype/';
const TAG = 'qa_question_review_' + (process.env.GITHUB_RUN_ID || Date.now());
const OUT = path.join(__dirname, 'question-live-results');
fs.mkdirSync(OUT, { recursive: true });
const report = { run: TAG, started: new Date().toISOString(), checks: [], submissions: [], asks: {}, errors: [], cleanup: [] };
let http, browser, page, baseline;
const ownReviews = new Set(), ownQuestions = new Set();
const save = () => fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const norm = s => String(s).toLowerCase().trim().replace(/\s+/g, ' ');
async function get(p) {
  const res = await http.get(API + p, { timeout: 45000 });
  if (!res.ok()) throw new Error('GET ' + p + ': HTTP ' + res.status());
  return res.json();
}
async function post(p, data) {
  if (!p.startsWith('/api/') || p.includes('/demo/')) throw new Error('Unsafe write');
  const res = await http.post(API + p, { data, timeout: 75000 });
  if (!res.ok()) throw new Error('POST ' + p + ': HTTP ' + res.status() + ' ' + (await res.text()).slice(0, 600));
  return res.json();
}
async function check(name, fn) {
  const item = { name, status: 'running' }; report.checks.push(item); save();
  console.log('START ' + name);
  try { await fn(item); item.status = 'passed'; }
  catch (e) { item.status = 'failed'; item.error = String(e.message).replace(/x-vercel-protection-bypass=[^&\s]+/g, '[redacted]'); }
  console.log(item.status.toUpperCase() + ' ' + name + (item.error ? ': ' + item.error : '')); save();
}
function recordSubmission(name, content, result) {
  report.submissions.push({ name, content, result });
  for (const r of result.reviews || []) if (!baseline.open_reviews.some(x => x.id === r.id)) ownReviews.add(r.id);
  save(); return result;
}
async function evidence(name, content) {
  return recordSubmission(name, content, await post('/api/evidence', { content, source_type: TAG }));
}
function questionReview(result) {
  const r = (result.reviews || []).find(x => x.review_type === 'open_question');
  expect(r, 'Live model should suggest a Question').toBeTruthy();
  expect(ownReviews.has(r.id), 'Do not act on an existing user Review').toBeTruthy();
  expect(r.question_to_create?.id).toBeTruthy();
  expect(r.proposals.filter(p => p.status === 'pending')).toHaveLength(0);
  return r;
}
async function loaded() {
  await page.waitForFunction(() => window.STATE_ASK_TEST_API?.state.backendStatus.reviews === 'loaded' && window.STATE_ASK_TEST_API?.state.backendStatus.questions === 'loaded', null, { timeout: 60000 });
  expect(await page.evaluate(() => window.STATE_API.base)).toBe(API);
}
async function openReview(id, width = 1365) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await loaded();
  await page.locator('[data-view="open-items"]:visible').first().click();
  const row = page.locator('[data-review-card="' + id + '"]');
  await expect(row).toBeVisible({ timeout: 15000 });
  const toggle = row.locator('[data-action="toggle-review-card"]');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return page.locator('[data-review-card="' + id + '"]');
}
async function clickOutcome(row, label) {
  const response = page.waitForResponse(r => r.url().startsWith(API + '/api/reviews/') && r.url().endsWith('/resolve') && r.request().method() === 'POST', { timeout: 45000 });
  await row.getByRole('button', { name: label, exact: true }).click();
  const res = await response;
  expect(res.ok(), 'Review resolution HTTP ' + res.status()).toBeTruthy();
  return res.json();
}
async function completedAsk() {
  // Streaming previews also have .ask-live-answer. The Copy action is added
  // only by renderFinalAsk, after the validated final payload has arrived.
  await expect(page.locator('#askStateDrawerResult [data-review-batch-action="copy-ask-answer"]')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#askStateDrawerResult .ask-live-error')).toHaveCount(0);
}
async function unchanged() {
  expect((await get('/api/state')).items).toEqual(baseline.state);
  expect((await get('/api/history')).items).toEqual(baseline.history);
}
(async () => {
  try {
    http = await request.newContext();
    let health;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { health = await get('/health'); break; } catch (e) { if (attempt === 2) throw e; }
    }
    report.health = health;
    if (!/^[0-9a-f]{7,40}$/.test(health.build || '')) throw new Error('Backend build is not verifiable');
    const skew = execFileSync('git', ['diff', '--name-only', health.build, 'HEAD', '--', 'state-project-complete/'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim();
    if (skew) throw new Error('Staging backend is missing source changes: ' + skew);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('paigeOwnerMode', 'true'));
    page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.route('**/*', route => {
      const req = route.request(), u = new URL(req.url());
      if (u.hostname === 'state-api-6waw.onrender.com' || (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && u.origin !== API)) return route.abort();
      return route.continue();
    });
    page.on('pageerror', e => report.errors.push(String(e.message)));
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const entry = secret ? APP + '?x-vercel-protection-bypass=' + encodeURIComponent(secret) + '&x-vercel-set-bypass-cookie=true' : APP;
    const nav = await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!nav.ok()) throw new Error('Staging frontend access blocked: HTTP ' + nav.status());
    await page.goto(APP, { waitUntil: 'domcontentloaded' }); await loaded();
    for (const file of ['context-app.js', 'context-open-items-view.js', 'context-api.js', 'context-product-polish.js']) {
      const res = await context.request.get(APP + file);
      expect(res.ok()).toBeTruthy();
      expect(await res.text(), 'Deployed source must match staging: ' + file).toBe(fs.readFileSync(path.resolve(__dirname, '../../implementation-context-prototype', file), 'utf8'));
    }
    baseline = await get('/api/bootstrap'); report.baseline = baseline; save();
    report.checks.push({ name: 'Frontend and backend match staging feature code', status: 'passed' });

    await check('Live concern -> Review -> Question; Ask freshness and reload', async item => {
      const content = "During today's Northstar pilot spot-check, two support reps said they sometimes approve AI drafts after reading only the opening sentence. We have not measured how often this happens or whether the remaining text is checked. Human review is still required; no policy or scope change has been approved.";
      await page.locator('[data-action="add-info"]:visible').first().click();
      await page.locator('#addInfoText').fill(content);
      const response = page.waitForResponse(r => r.url() === API + '/api/evidence' && r.request().method() === 'POST', { timeout: 75000 });
      await page.locator('[data-action="save-info"]').click();
      const res = await response; expect(res.ok()).toBeTruthy();
      const result = recordSubmission('rubber-stamp concern (browser)', content, await res.json());
      const r = questionReview(result); item.reviewId = r.id;
      expect((await get('/api/questions')).items).toEqual(baseline.questions);
      await unchanged();
      await openReview(r.id);
      await page.locator('#askStateLauncher').click();
      const query = 'What do we know about whether Northstar agents carefully check AI drafts before approving them? Separate accepted facts from unresolved concerns.';
      await page.locator('#askStateDrawerInput').fill(query); await page.locator('#askStateDrawerInput').press('Enter');
      await completedAsk();
      report.asks.before = await page.locator('#askStateDrawerResult').innerText(); save();
      await page.locator('[data-review-batch-action="close-ask"]').click();
      const row = page.locator('[data-review-card="' + r.id + '"]');
      await row.screenshot({ path: path.join(OUT, 'question-review-desktop.png') });
      const outcome = await clickOutcome(row, 'Create Question'); item.outcome = outcome;
      const questions = (await get('/api/questions')).items;
      const q = questions.find(q => norm(q.text) === norm(r.question_to_create.text));
      expect(q).toBeTruthy();
      if (!baseline.questions.some(x => x.id === q.id)) ownQuestions.add(q.id);
      expect(!!q.blocking).toBe(false); await unchanged();
      await expect(page.locator('[data-review-card="' + r.id + '"]')).toHaveCount(0);
      await expect(page.locator('.open-question-item[data-question-id="' + q.id + '"]')).toBeVisible();
      item.questionCreated = true; item.questionId = q.id; save();
      await page.locator('#askStateLauncher').click();
      await expect(page.locator('#askStateDrawerResult .ask-state-stale')).toBeVisible({ timeout: 20000 });
      await page.locator('[data-review-batch-action="refresh-ask"]').click();
      await completedAsk();
      await expect(page.locator('#askStateDrawerResult .ask-state-stale')).toHaveCount(0);
      report.asks.after = await page.locator('#askStateDrawerResult').innerText();
      report.asks.rawAfter = await post('/api/ask', { query });
      expect(JSON.stringify(report.asks.rawAfter), 'Ask should ground the follow-up in the created Question').toContain(q.id);
      await page.screenshot({ path: path.join(OUT, 'ask-after-question.png'), fullPage: true });
      await page.locator('[data-review-batch-action="close-ask"]').click();
      await page.reload(); await loaded();
      await page.locator('[data-view="open-items"]:visible').first().click();
      expect((await get('/api/questions')).items.some(x => x.id === q.id)).toBeTruthy();
    });

    await check('Routine noise does not create a Review or Question', async item => {
      const before = (await get('/api/questions')).items;
      const result = await evidence('routine noise', 'Thanks for sharing the Northstar meeting notes. I have read them. Nothing new to add.');
      item.reviewTypes = (result.reviews || []).map(r => r.review_type);
      expect(result.reviews).toHaveLength(0); expect((await get('/api/questions')).items).toEqual(before); await unchanged();
    });

    await check('A definite approval proposes State, not an unknown', async item => {
      const result = await evidence('narrow approved fact', 'The Northstar project owner approved a mandatory 30-minute training session for all pilot support reps before they receive access to the AI draft tool. The approval is final. Training has not happened yet.');
      item.reviewTypes = (result.reviews || []).map(r => r.review_type);
      expect((result.reviews || []).some(r => r.review_type !== 'open_question' && r.proposals.some(p => p.status === 'pending'))).toBeTruthy();
      expect((result.reviews || []).some(r => r.review_type === 'open_question')).toBe(false); await unchanged();
    });

    await check('Dismiss suggestion keeps State, History and Questions unchanged', async item => {
      const before = (await get('/api/questions')).items;
      const result = await evidence('dismissible unknown', 'The Northstar operations lead raised a consequential unresolved concern: if the draft provider is unavailable during a busy shift, who will tell pilot agents to switch back to the manual workflow? No notification owner or fallback communication process has been established, and no new policy was approved.');
      const r = questionReview(result); item.reviewId = r.id;
      const row = await openReview(r.id);
      await clickOutcome(row, 'Dismiss suggestion');
      await expect(page.locator('.state-toast')).toContainText('No Question was created.');
      expect((await get('/api/questions')).items).toEqual(before); await unchanged();
    });

    await check('Exact duplicate is disclosed and linked through the mobile Review', async item => {
      const result = await evidence('duplicate follow-up', 'The Northstar accessibility lead raised an unresolved concern after observing a pilot rep using a screen reader: can screen-reader users distinguish an AI draft from the final response before approving it? The observation did not establish an answer, and the distinction matters for meaningful review. No accessibility requirement or project decision has changed.');
      const r = questionReview(result); item.reviewId = r.id;
      const q = await post('/api/questions', { text: '  ' + r.question_to_create.text.toUpperCase().replace(/ /g, '  ') + '  ', origin: TAG });
      if (!baseline.questions.some(x => x.id === q.id)) ownQuestions.add(q.id);
      const before = (await get('/api/questions')).items;
      const row = await openReview(r.id, 390);
      await expect(row.getByText('Already tracked', { exact: true })).toBeVisible();
      await row.screenshot({ path: path.join(OUT, 'question-review-mobile.png') });
      await clickOutcome(row, 'Link existing Question');
      await expect(page.locator('.state-toast')).toContainText('Linked to the existing Question.');
      expect((await get('/api/questions')).items).toEqual(before); await unchanged(); item.questionId = q.id;
    });

    await check('Live model avoids proposing an already-open unknown again', async item => {
      const q = (await get('/api/questions')).items.find(q => ownQuestions.has(q.id));
      if (!q) throw new Error('No created Question available for the duplicate model check');
      const result = await evidence('already tracked unknown', 'The Northstar team revisited this same unresolved question: ' + q.text + ' There is still no answer and no new decision or evidence beyond what was already discussed.');
      item.reviewTypes = (result.reviews || []).map(r => r.review_type);
      expect((result.reviews || []).some(r => r.review_type === 'open_question')).toBe(false); await unchanged();
    });
    await check('No unhandled browser errors', async () => expect(report.errors).toEqual([]));
  } catch (e) {
    report.checks.push({ name: 'Preflight or walkthrough infrastructure', status: 'blocked', error: String(e.message).replace(/x-vercel-protection-bypass=[^&\s]+/g, '[redacted]') });
    console.log('BLOCKED: ' + report.checks.at(-1).error);
  } finally {
    if (baseline && http) {
      try {
        for (const r of (await get('/api/reviews')).items.filter(r => ownReviews.has(r.id))) {
          await post('/api/reviews/' + r.id + '/resolve', { decision: 'keep', ...(r.question_to_create ? { expected_question_proposal_id: r.question_to_create.id } : {}) });
          report.cleanup.push({ reviewId: r.id, action: 'closed test Review' });
        }
        for (const q of (await get('/api/questions')).items.filter(q => ownQuestions.has(q.id))) {
          await post('/api/questions/' + q.id + '/stop'); report.cleanup.push({ questionId: q.id, action: 'stopped test Question' });
        }
        await unchanged(); report.currentStateAndHistoryUnchanged = true;
        report.remainingTestEvidence = report.submissions.map(s => s.result.evidence_id);
      } catch (e) { report.cleanupError = String(e.message); }
    }
    report.finished = new Date().toISOString(); save();
    if (browser) await browser.close(); if (http) await http.dispose();
    const summary = report.checks.map(c => c.status.toUpperCase() + ': ' + c.name).join('\n'); console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Live staging Question Review check\n\n' + summary.split('\n').map(s => '- ' + s).join('\n') + '\n\nNo demo reset. Test Evidence remains immutable; only this run\'s Reviews/Questions were closed.\n');
    process.exitCode = report.checks.some(c => c.status !== 'passed') || report.cleanupError ? 1 : 0;
  }
})();
