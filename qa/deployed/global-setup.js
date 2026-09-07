// Waits out a Render free-tier cold start before any test runs, and fails
// fast (rather than as a confusing per-test timeout) if the backend never
// comes up at all.
const BACKEND_URL = process.env.STATE_BACKEND_URL || 'https://state-api-staging.onrender.com';
const MAX_WAIT_MS = 90_000;
const POLL_INTERVAL_MS = 4_000;

module.exports = async function globalSetup() {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < MAX_WAIT_MS) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const body = await res.json();
        console.log(
          `[global-setup] backend ready after ${Math.round((Date.now() - started) / 1000)}s: ` +
          `build=${body.build} demo_bootstrap=${body.demo_bootstrap}`
        );
        return;
      }
      lastError = new Error(`/health returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    console.log(`[global-setup] backend not ready yet (waking from cold start?), retrying...`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Backend at ${BACKEND_URL} did not become ready within ${MAX_WAIT_MS / 1000}s. ` +
    `Last error: ${lastError?.message || 'unknown'}. This looks like the application is ` +
    `actually broken, not just a slow cold start.`
  );
};
