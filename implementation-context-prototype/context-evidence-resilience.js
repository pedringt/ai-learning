(() => {
  const prior = window.STATE_API;
  if (!prior) return;

  // Ongoing Evidence/reanalysis can still take time. Baseline Setup now has a
  // dedicated fast-acknowledge path that stores Evidence first and analyzes it
  // in the background, so the two-minute window is retained only as a fallback
  // for the existing synchronous routes.
  const LONG_EVIDENCE_TIMEOUT_MS = 120000;
  const BASELINE_ACK_TIMEOUT_MS = 30000;
  const BASELINE_POLL_INTERVAL_MS = 1500;
  const BASELINE_POLL_MAX_MS = 300000;
  let baselinePollGeneration = 0;

  function currentProjectId() {
    return document.getElementById('projectSwitcher')?.dataset?.projectId || '';
  }

  function projectHeaders(extra = {}) {
    const projectId = currentProjectId();
    return projectId ? {...extra, 'X-State-Project-Id': projectId} : extra;
  }

  function baselineIsActive() {
    return document.body.classList.contains('state-baseline-active');
  }

  async function request(path, options = {}, timeoutMs = LONG_EVIDENCE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${prior.base}${path}`, {
        ...options,
        headers: projectHeaders(options.headers),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('This source is taking longer than expected to analyze. It may still finish on the server; refresh before submitting it again.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.detail;
      const message = detail?.error_details?.error_message || detail?.code || (typeof detail === 'string' ? detail : null) || `API error ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      error.evidenceId = detail?.evidence_id || null;
      throw error;
    }
    return payload;
  }

  function isBaselineRouteMismatch(error) {
    return error?.status === 409 && error?.payload?.detail?.code === 'baseline_not_active';
  }

  function notifyBaselineSettled() {
    window.STATE_ASK_TEST_API?.hydrateBackend?.();
    document.dispatchEvent(new Event('state-project-record-changed'));
  }

  function pollBaselineUntilSettled(projectId) {
    const generation = ++baselinePollGeneration;
    const startedAt = Date.now();

    const tick = async () => {
      if (generation !== baselinePollGeneration) return;
      if (!projectId || currentProjectId() !== projectId || !baselineIsActive()) return;
      if (Date.now() - startedAt > BASELINE_POLL_MAX_MS) return;

      try {
        const summary = await request('/api/baseline/draft', {}, BASELINE_ACK_TIMEOUT_MS);
        if (generation !== baselinePollGeneration || currentProjectId() !== projectId) return;
        const processing = summary?.counts?.processing_evidence || 0;
        if (processing > 0) {
          setTimeout(tick, BASELINE_POLL_INTERVAL_MS);
          return;
        }
        notifyBaselineSettled();
      } catch (error) {
        // Polling is only a presentation convenience. Evidence is already
        // durable, so a transient read failure must never cause a second write.
        if (generation !== baselinePollGeneration || currentProjectId() !== projectId) return;
        setTimeout(tick, BASELINE_POLL_INTERVAL_MS);
      }
    };

    setTimeout(tick, BASELINE_POLL_INTERVAL_MS);
  }

  function afterBaselineAck(payload) {
    const projectId = currentProjectId();
    document.dispatchEvent(new CustomEvent('state-baseline-analysis-started', {
      detail: {evidenceId: payload?.evidence_id || null},
    }));
    // context-app temporarily assumes a zero-Review response means analysis is
    // finished. Rehydrate immediately so the authoritative pending Evidence
    // status replaces that optimistic local label while background work runs.
    setTimeout(() => window.STATE_ASK_TEST_API?.hydrateBackend?.(), 0);
    pollBaselineUntilSettled(projectId);
    return payload;
  }

  async function submitEvidence(content, sourceType = 'manual_note') {
    if (baselineIsActive()) {
      try {
        const payload = await request('/api/baseline/evidence', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({content, source_type: sourceType}),
        }, BASELINE_ACK_TIMEOUT_MS);
        return afterBaselineAck(payload);
      } catch (error) {
        if (!isBaselineRouteMismatch(error)) throw error;
      }
    }
    return request('/api/evidence', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({content, source_type: sourceType}),
    });
  }

  async function uploadEvidence(file) {
    if (baselineIsActive()) {
      const baselineBody = new FormData();
      baselineBody.append('file', file);
      try {
        const payload = await request('/api/baseline/evidence/upload', {
          method: 'POST',
          body: baselineBody,
        }, BASELINE_ACK_TIMEOUT_MS);
        return afterBaselineAck(payload);
      } catch (error) {
        if (!isBaselineRouteMismatch(error)) throw error;
      }
    }
    const body = new FormData();
    body.append('file', file);
    return request('/api/evidence/upload', {method: 'POST', body});
  }

  function retryEvidenceAnalysis(evidenceId) {
    return request(`/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {method: 'POST'});
  }

  window.STATE_API = Object.freeze({
    ...prior,
    submitEvidence,
    uploadEvidence,
    retryEvidenceAnalysis,
  });

  window.STATE_EVIDENCE_RESILIENCE_TEST_API = Object.freeze({
    LONG_EVIDENCE_TIMEOUT_MS,
    BASELINE_ACK_TIMEOUT_MS,
    BASELINE_POLL_INTERVAL_MS,
    BASELINE_POLL_MAX_MS,
    baselineIsActive,
  });
})();
