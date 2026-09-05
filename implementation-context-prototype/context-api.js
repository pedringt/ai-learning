(() => {
  const inferredBase = /(^|[-.])staging([-.]|$)|-git-/i.test(location.hostname)
    ? 'https://state-api-staging.onrender.com'
    : 'https://state-api-6waw.onrender.com';
  const base = window.STATE_API_BASE || document.documentElement?.dataset?.apiBase || inferredBase;

  // Plain fetch() has no timeout: a request against a backend that's mid
  // restart (e.g. a Render redeploy) can hang indefinitely with no error
  // and no visible feedback, even though the write may have already gone
  // through server-side. Abort after a generous window instead, and mark
  // the error so callers can show a "try refreshing" hint rather than a
  // generic failure.
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${base}${path}`, {...options, signal: controller.signal});
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutError = new Error('This is taking longer than expected. The request may still complete on the server -- try refreshing before trying again.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
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

  const jsonPost = (path, body) => request(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  async function askStream(query, previousAnswer = null, handlers = {}) {
    const response = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'Accept':'text/event-stream'},
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
    retryEvidenceAnalysis: evidenceId => request(`/api/evidence/${encodeURIComponent(evidenceId)}/reanalyze`, {method:'POST'}),
    resolveReview: (reviewId, decision) => jsonPost(`/api/reviews/${encodeURIComponent(reviewId)}/resolve`, {decision}),
    createQuestion: (text, options = {}) => jsonPost('/api/questions', {text, origin: options.origin || 'Added from Workspace', blocking: !!options.blocking, ...(options.blocks ? {blocks: options.blocks} : {})}),
    setQuestionBlocking: (questionId, blocking, blocks = null) => request(`/api/questions/${encodeURIComponent(questionId)}/blocking`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({blocking, blocks})}),
    stopQuestion: questionId => request(`/api/questions/${encodeURIComponent(questionId)}/stop`, {method:'POST'}),
    createRule: (text, category = 'Interpretation') => jsonPost('/api/rules', {text, category}),
    deleteRule: ruleId => request(`/api/rules/${encodeURIComponent(ruleId)}`, {method:'DELETE'}),
    getSlackChannels: () => request('/api/integrations/slack/channels'),
    updateSlackChannel: (channelRowId, updates) => request(`/api/integrations/slack/channels/${encodeURIComponent(channelRowId)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updates)}),
    getSlackHealth: () => request('/api/integrations/slack/health'),
    resetDemo: () => request('/api/demo/reset', {method:'POST'}),
    askPreview: query => jsonPost('/api/ask/preview', {query}),
    // Free-form Ask streams visible answer text while the final grounded payload
    // is still validated server-side. Product-owned starters remain deterministic.
    askStream,
    ask: (query, previousAnswer = null) => jsonPost('/api/ask', {query, ...(previousAnswer ? {previous_answer: previousAnswer} : {})}),
  });
})();
