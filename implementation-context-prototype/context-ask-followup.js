(() => {
  const prior = window.STATE_ASK;
  if (!prior) return;

  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const transformHints = [
    'shorten','shorter','make it concise','make this concise','condense','3 bullets','three bullets',
    'focus only on blockers','turn it into an agenda','agenda format','leadership ready','leadership-ready',
    'exec ready','exec-ready','executive summary','make it more detailed','more detail','expand this','go deeper'
  ];
  const dependentExact = new Set(['why','why?','how','how?','who else','who else?','what else','what else?']);
  const dependentHints = [
    'source supports that','sources support that','what source supports that','where did that come from',
    'where did you get that','how do you know','why is that','why does that','tell me more about that',
    'expand on that','more about that','what do you mean by that','what about that','and that','those items',
    'those points','that source','that review','that question','that item','that decision','that change'
  ];

  function followupIntent(query, previousPayload) {
    if (!previousPayload) return 'new';
    const q = norm(query);
    if (!q) return 'new';
    if (transformHints.some(hint => q.includes(norm(hint)))) return 'transform';
    if (dependentExact.has(q) || dependentHints.some(hint => q.includes(norm(hint)))) return 'dependent';
    // Pronoun-heavy very short prompts usually depend on the preceding answer.
    if (q.split(' ').length <= 5 && /\b(it|that|those|them|this|these)\b/.test(q)) return 'dependent';
    return 'new';
  }

  function responseMode(intent) {
    // Never render the full previous answer again. Dependent follow-ups use the
    // previous answer as context, while transformations replace it in place.
    return intent === 'new' ? 'new' : 'replace';
  }

  function followupMode(query, previousPayload) {
    return responseMode(followupIntent(query, previousPayload));
  }

  async function submitStream(query, previousPayload = null, handlers = {}) {
    const intent = followupIntent(query, previousPayload);
    const contextualPrevious = intent === 'new' ? null : previousPayload;
    const payload = await prior.submitStream(query, contextualPrevious, handlers);
    if (payload && typeof payload === 'object') payload.followup_mode = responseMode(intent);
    return payload;
  }

  async function submit(query, previousPayload = null) {
    const intent = followupIntent(query, previousPayload);
    const contextualPrevious = intent === 'new' ? null : previousPayload;
    const payload = await prior.submit(query, contextualPrevious);
    if (payload && typeof payload === 'object') payload.followup_mode = responseMode(intent);
    return payload;
  }

  window.STATE_ASK = Object.freeze({
    ...prior,
    followupIntent,
    followupMode,
    submitStream,
    submit,
  });
})();
