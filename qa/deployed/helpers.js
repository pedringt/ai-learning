const BACKEND_URL = process.env.STATE_BACKEND_URL || 'https://state-api-staging.onrender.com';
const REQUIRED_BACKEND_HOST = 'state-api-staging.onrender.com';
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

function backendHost(url, label = 'STATE_BACKEND_URL') {
  try {
    return new URL(url).host;
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }
}

function assertKnownStagingHost(action, url = BACKEND_URL, label = 'STATE_BACKEND_URL') {
  const host = backendHost(url, label);
  if (host !== REQUIRED_BACKEND_HOST) {
    throw new Error(
      `Refusing to ${action}: target host "${host}" is not the known staging ` +
      `backend "${REQUIRED_BACKEND_HOST}". Aborting rather than mutating an unexpected environment.`
    );
  }
}

/**
 * Navigates past Vercel's Deployment Protection using the query-param +
 * set-cookie method, NOT extraHTTPHeaders. extraHTTPHeaders applies to every
 * request in the browser context, including the page's own cross-origin
 * fetches to Render, and can create unwanted CORS preflights.
 *
 * After navigation, also fail closed if the deployed State page exposes a
 * backend URL other than the known staging Render host. Deep QA includes UI
 * writes, so a miswired staging frontend must never be allowed to mutate a
 * different environment.
 */
async function gotoWithBypass(page, path) {
  if (!BYPASS_SECRET) {
    throw new Error(
      'VERCEL_AUTOMATION_BYPASS_SECRET is not set. See qa/deployed/README.md.'
    );
  }
  const separator = path.includes('?') ? '&' : '?';
  const url = `${path}${separator}x-vercel-protection-bypass=${encodeURIComponent(BYPASS_SECRET)}&x-vercel-set-bypass-cookie=true`;
  const response = await page.goto(url);
  const configuredBackend = await page.evaluate(() => window.STATE_API?.base || '').catch(() => '');
  if (configuredBackend) {
    assertKnownStagingHost('run browser Deep QA writes', configuredBackend, 'window.STATE_API.base');
  }
  return response;
}

// Harmless noise this suite should not fail on. Kept narrow on purpose.
const CONSOLE_ALLOWLIST = [
  /favicon/i,
  /google-analytics|googletagmanager|analytics/i,
];
const NETWORK_ALLOWLIST_URL = [
  /favicon/i,
];

/**
 * Attaches console/pageerror/network listeners to a page and returns a
 * diagnostics object the caller can assert against near the end of a test.
 */
function attachDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_ALLOWLIST.some(re => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
  });
  page.on('response', res => {
    const url = res.url();
    if (NETWORK_ALLOWLIST_URL.some(re => re.test(url))) return;
    if (res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    assertClean(expect) {
      expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `unhandled page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(failedRequests, `failed API requests:\n${failedRequests.join('\n')}`).toEqual([]);
    },
  };
}

/**
 * Resets Northstar demo data to its curated baseline. Refuses to run against
 * anything but the known staging host.
 */
async function resetDemoData(request) {
  assertKnownStagingHost('reset demo data');
  const health = await request.get(`${BACKEND_URL}/health`);
  if (!health.ok()) throw new Error(`Backend health check failed before reset: HTTP ${health.status()}`);
  const healthBody = await health.json();
  if (!healthBody.demo_bootstrap) {
    throw new Error('Backend reports demo_bootstrap=false -- /api/demo/reset would 404. Aborting.');
  }

  const res = await request.post(`${BACKEND_URL}/api/demo/reset`);
  if (!res.ok()) throw new Error(`POST /api/demo/reset failed: HTTP ${res.status()}`);
  return res.json();
}

async function backendJson(request, path) {
  const res = await request.get(`${BACKEND_URL}${path}`);
  if (!res.ok()) throw new Error(`GET ${path} failed: HTTP ${res.status()}`);
  return res.json();
}

/**
 * POSTs JSON to the backend. This can create real records, so it only runs
 * against the known staging backend. The default timeout accommodates a real
 * interpretation round-trip when the endpoint invokes the model.
 */
async function backendPost(request, path, data, { timeout = 60_000 } = {}) {
  assertKnownStagingHost(`POST ${path}`);
  const res = await request.post(`${BACKEND_URL}${path}`, { data, timeout });
  if (!res.ok()) throw new Error(`POST ${path} failed: HTTP ${res.status()} ${await res.text()}`);
  return res.json();
}

/**
 * DELETEs a resource on the known staging backend. Used by the Baseline
 * lifecycle test to remove its temporary project after all analysis settles.
 */
async function backendDelete(request, path, { timeout = 60_000 } = {}) {
  assertKnownStagingHost(`DELETE ${path}`);
  const res = await request.delete(`${BACKEND_URL}${path}`, { timeout });
  if (!res.ok()) throw new Error(`DELETE ${path} failed: HTTP ${res.status()} ${await res.text()}`);
  return res.json();
}

module.exports = {
  attachDiagnostics,
  resetDemoData,
  backendJson,
  backendPost,
  backendDelete,
  gotoWithBypass,
  BACKEND_URL,
  REQUIRED_BACKEND_HOST,
};
