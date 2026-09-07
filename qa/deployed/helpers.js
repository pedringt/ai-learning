const BACKEND_URL = process.env.STATE_BACKEND_URL || 'https://state-api-staging.onrender.com';
const REQUIRED_BACKEND_HOST = 'state-api-staging.onrender.com';
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

/**
 * Navigates past Vercel's Deployment Protection using the query-param +
 * set-cookie method, NOT extraHTTPHeaders. extraHTTPHeaders applies to every
 * request in the browser context -- including the page's own cross-origin
 * fetches to the Render backend -- which turns those into CORS preflights
 * the backend doesn't allow, breaking every API call. The query param only
 * ever touches the Vercel origin and sets a same-origin cookie, so backend
 * requests are never affected.
 */
async function gotoWithBypass(page, path) {
  if (!BYPASS_SECRET) {
    throw new Error(
      'VERCEL_AUTOMATION_BYPASS_SECRET is not set. See qa/deployed/README.md.'
    );
  }
  const separator = path.includes('?') ? '&' : '?';
  const url = `${path}${separator}x-vercel-protection-bypass=${encodeURIComponent(BYPASS_SECRET)}&x-vercel-set-bypass-cookie=true`;
  return page.goto(url);
}

// Harmless noise this suite should not fail on. Kept narrow on purpose --
// the point of Deep QA is to make real failures visible, not to suppress
// broad categories of console/network activity.
const CONSOLE_ALLOWLIST = [
  /favicon/i,
  /google-analytics|googletagmanager|analytics/i,
];
const NETWORK_ALLOWLIST_URL = [
  /favicon/i,
];

/**
 * Attaches console/pageerror/network listeners to a page and returns a
 * diagnostics object the caller can assert against at any point. Call
 * assertClean() near the end of a test for a clear failure message instead
 * of a generic Playwright timeout when something logged an error.
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
 * Resets Northstar demo data to its curated baseline via the backend's own
 * reset endpoint. Refuses to run against anything but the known staging
 * host -- this is the one destructive-ish call in the suite, and a
 * misconfigured STATE_BACKEND_URL must never be able to point it elsewhere.
 */
async function resetDemoData(request) {
  let host;
  try {
    host = new URL(BACKEND_URL).host;
  } catch {
    throw new Error(`STATE_BACKEND_URL is not a valid URL: ${BACKEND_URL}`);
  }
  if (host !== REQUIRED_BACKEND_HOST) {
    throw new Error(
      `Refusing to reset demo data: target host "${host}" is not the known staging ` +
      `backend "${REQUIRED_BACKEND_HOST}". Aborting rather than mutating an unexpected environment.`
    );
  }
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

module.exports = { attachDiagnostics, resetDemoData, backendJson, gotoWithBypass, BACKEND_URL, REQUIRED_BACKEND_HOST };
