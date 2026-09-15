(() => {
  const prior = window.STATE_API;
  if (!prior) return;

  // Baseline imports can legitimately fan out into several bounded model calls.
  // Keep ordinary API requests on the existing 30s timeout, but give Evidence
  // intake/reanalysis enough time to finish instead of telling the user a write
  // failed while the server is still successfully processing it.
  const LONG_EVIDENCE_TIMEOUT_MS = 120000;

  function projectHeaders(extra = {}) {
    const projectId = document.getElementById('projectSwitcher')?.dataset?.projectId || '';
    return projectId ? {...extra, 'X-State-Project-Id': projectId} : extra;
  }

  async function evidenceRequest(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LONG_EVIDENCE_TIMEOUT_MS);
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

  function submitEvidence(content, sourceType = 'manual_note') {
    return evidenceRequest('/api/evidence', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({content, source_type: sourceType}),
    });
  }

  function uploadEvidence(file) {
    const body = new FormData();
    body.append('file', file);
    return evidenceRequest('/api/evidence/upload', {method: 'POST', body});
  }

  function retryEvidenceAnalysis(evidenceId) {
    return evidenceRequest(`/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {method: 'POST'});
  }

  window.STATE_API = Object.freeze({
    ...prior,
    submitEvidence,
    uploadEvidence,
    retryEvidenceAnalysis,
  });

  window.STATE_EVIDENCE_RESILIENCE_TEST_API = Object.freeze({LONG_EVIDENCE_TIMEOUT_MS});
})();
