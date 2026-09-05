(() => {
  const base = window.STATE_API_BASE || document.documentElement?.dataset?.apiBase || 'https://state-api-staging.onrender.com';

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

  async function askStream(query, previousAnswer = null, handlers = {}) {
    const response = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'text/event-stream'},
      body: JSON.stringify({query, ...(previousAnswer ? {previous_answer: previousAnswer} : {})}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail = payload?.detail;
      throw new Error(typeof detail === 'string' ? detail : `API error ${response.status}`);
    }
    if (!response.body) throw new Error('Streaming response is unavailable in this browser');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalPayload = null;

    const dispatch = block => {
      let event = 'message';
      const data = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) return;
      const payload = JSON.parse(data.join('\n'));
      if (event === 'error') throw new Error(payload?.message || 'Ask could not produce a valid grounded answer');
      if (event === 'final') finalPayload = payload;
      handlers[event]?.(payload);
    };

    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (block.trim()) dispatch(block);
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
    if (!finalPayload) throw new Error('Ask stream ended before a validated answer was ready');
    return finalPayload;
  }

  window.STATE_API = Object.freeze({
    base,
    getAttention: () => request('/api/attention'),
    getBootstrap: () => request('/api/bootstrap'),
    getState: () => request('/api/state'),
    getEvidence: () => request('/api/evidence'),
    getReviews: status => request(`/api/reviews?status=${encodeURIComponent(status)}`),
    getHistory: () => request('/api/history'),
    getQuestions: status => request(`/api/questions?status=${encodeURIComponent(status)}`),
    getRules: () => request('/api/rules'),
    getDrafts: () => request('/api/drafts'),
    createDraft: (title, content) => jsonPost('/api/drafts', {title, content}),
    updateDraft: (draftId, title, content) => request(`/api/drafts/${encodeURIComponent(draftId)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title, content})}),
    deleteDraft: draftId => request(`/api/drafts/${encodeURIComponent(draftId)}`, {method:'DELETE'}),
    submitEvidence: (content, sourceType = 'manual_note') => jsonPost('/api/evidence', {content, source_type: sourceType}),
    retryEvidenceAnalysis: evidenceId => request(`/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {method: 'POST'}),
    resolveReview: (reviewId, decision) => jsonPost(`/api/reviews/${encodeURIComponent(reviewId)}/resolve`, {decision}),
    createQuestion: (text, options = {}) => jsonPost('/api/questions', {
      text,
      origin: options.origin || 'Added from Workspace',
      blocking: !!options.blocking,
      ...(options.blocks ? {blocks: options.blocks} : {}),
    }),
    setQuestionBlocking: (questionId, blocking, blocks = null) => request(`/api/questions/${encodeURIComponent(questionId)}/blocking`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({blocking, blocks})}),
    stopQuestion: questionId => request(`/api/questions/${encodeURIComponent(questionId)}/stop`, {method: 'POST'}),
    createRule: (text, category = 'Interpretation') => jsonPost('/api/rules', {text, category}),
    deleteRule: ruleId => request(`/api/rules/${encodeURIComponent(ruleId)}`, {method: 'DELETE'}),
    resetDemo: () => request('/api/demo/reset', {method:'POST'}),
    askPreview: query => jsonPost('/api/ask/preview', {query}),
    // Native structured-output streaming currently exposes token-split whitespace
    // artifacts in visible Ask text. Keep the validated one-call non-stream path
    // for the manager-facing prototype until the stream renderer is safe again.
    askStream: null,
    ask: (query, previousAnswer = null) => jsonPost('/api/ask', {query, ...(previousAnswer ? {previous_answer: previousAnswer} : {})}),
  });
})();
