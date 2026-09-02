(() => {
  const base = window.STATE_API_BASE || document.documentElement?.dataset?.apiBase || 'https://state-api-6waw.onrender.com';

  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, options);
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

  const jsonPost = (path, body) => request(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  window.STATE_API = Object.freeze({
    base,
    getState: () => request('/api/state'),
    getEvidence: () => request('/api/evidence'),
    getReviews: status => request(`/api/reviews?status=${encodeURIComponent(status)}`),
    getHistory: () => request('/api/history'),
    getQuestions: status => request(`/api/questions?status=${encodeURIComponent(status)}`),
    submitEvidence: (content, sourceType = 'manual_note') => jsonPost('/api/evidence', {content, source_type: sourceType}),
    retryEvidenceAnalysis: evidenceId => request(`/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {method: 'POST'}),
    resolveReview: (reviewId, decision) => jsonPost(`/api/reviews/${encodeURIComponent(reviewId)}/resolve`, {decision}),
    createQuestion: (text, options = {}) => jsonPost('/api/questions', {
      text,
      origin: options.origin || 'Added from Workspace',
      blocking: !!options.blocking,
      ...(options.blocks ? {blocks: options.blocks} : {}),
    }),
    stopQuestion: questionId => request(`/api/questions/${encodeURIComponent(questionId)}/stop`, {method: 'POST'}),
  });
})();
