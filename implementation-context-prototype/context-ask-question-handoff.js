(() => {
  const STOP_WORDS = new Set([
    'a','an','and','are','as','at','be','can','could','did','do','does','for','from','has','have','how','i','in','is','it','me','my','of','on','or','please','should','tell','that','the','this','to','was','we','what','when','where','which','who','why','will','with','would','you','your'
  ]);
  const UNANSWERABLE_PATTERNS = [
    /\b(?:state|the project record)?\s*(?:does not|doesn't|doesn’t) (?:currently )?have enough (?:confirmed )?(?:information|evidence|context)\b/i,
    /\bnot enough (?:project )?(?:information|evidence|context) (?:to|for) (?:answer|determine|establish)\b/i,
    /\b(?:cannot|can't|can’t|unable to) (?:reliably )?answer (?:this|that|the question)?\b/i,
    /\bno relevant (?:project )?(?:records?|information|evidence|context) (?:were |was )?(?:found|available|recorded)?\b/i,
    /\bstate (?:does not|doesn't|doesn’t) currently know\b/i,
  ];

  const norm = value => String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function contentTokens(value) {
    return [...new Set(norm(value).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token)))];
  }

  function isUnanswerableAnswer(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return !!clean && UNANSWERABLE_PATTERNS.some(pattern => pattern.test(clean));
  }

  function equivalentQuestion(query, questions = []) {
    const queryNorm = norm(query);
    if (!queryNorm) return null;
    const queryTokens = contentTokens(query);
    for (const question of questions) {
      if (!question || question.status && question.status !== 'open') continue;
      const text = question.text || question.question || '';
      const questionNorm = norm(text);
      if (!questionNorm) continue;
      if (questionNorm === queryNorm) return question;

      const questionTokens = contentTokens(text);
      if (queryTokens.length < 2 || questionTokens.length < 2) continue;
      const querySet = new Set(queryTokens);
      const questionSet = new Set(questionTokens);
      const overlap = queryTokens.filter(token => questionSet.has(token)).length;
      const smaller = Math.min(querySet.size, questionSet.size);
      const larger = Math.max(querySet.size, questionSet.size);
      // Conservative near-duplicate check: most of the smaller wording must
      // overlap, and the two questions cannot differ wildly in scope.
      if (overlap >= 2 && overlap / smaller >= 0.8 && smaller / larger >= 0.6) return question;
    }
    return null;
  }

  function handoffFor(query, answerText, questions = []) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery || !isUnanswerableAnswer(answerText)) return {kind: null};
    const existing = equivalentQuestion(cleanQuery, questions);
    return existing ? {kind: 'existing', question: existing} : {kind: 'add', query: cleanQuery};
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function handoffMarkup(decision) {
    if (decision?.kind === 'existing') {
      const q = decision.question || {};
      return `<aside class="ask-question-handoff" data-ask-question-handoff-card="existing"><strong>Already tracked as a Question</strong><p>State still does not have an established answer, and this unknown is already being tracked.</p><button class="btn secondary" type="button" data-action="go-open-question" data-question-id="${esc(q.id || '')}">Open Question</button></aside>`;
    }
    if (decision?.kind === 'add') {
      return `<aside class="ask-question-handoff" data-ask-question-handoff-card="add"><strong>State does not currently have enough information to answer this.</strong><p>Track the unknown as a Question so it does not get lost. You can review or edit the wording before saving. Adding a Question does not change Current State.</p><button class="btn secondary" type="button" data-ask-question-handoff="add">Add as Question</button></aside>`;
    }
    return '';
  }

  const testApi = Object.freeze({norm, contentTokens, isUnanswerableAnswer, equivalentQuestion, handoffFor, handoffMarkup});
  if (typeof window !== 'undefined') window.STATE_ASK_QUESTION_HANDOFF_TEST_API = testApi;
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  let lastQuery = '';
  let renderQueued = false;

  function currentOpenQuestions() {
    const state = window.STATE_ASK_TEST_API?.state;
    const questions = state?.data?.questions;
    if (!Array.isArray(questions)) return [];
    return questions.filter(question => question?.status === 'open');
  }

  function answerSummaryText(answer) {
    if (!answer) return '';
    const headline = answer.querySelector('h2')?.textContent || '';
    const summary = answer.querySelector('.result-lede')?.textContent || '';
    return `${headline} ${summary}`.replace(/\s+/g, ' ').trim();
  }

  function renderHandoff() {
    const result = document.getElementById('askStateDrawerResult');
    if (!result) return;
    const existingCard = result.querySelector('[data-ask-question-handoff-card]');
    const answer = result.querySelector('.ask-live-answer');
    if (!answer || result.querySelector('.ask-live-loading,.ask-live-error,.ask-readonly-message')) {
      existingCard?.remove();
      return;
    }
    const query = lastQuery || document.getElementById('askStateDrawerInput')?.value.trim() || '';
    const decision = handoffFor(query, answerSummaryText(answer), currentOpenQuestions());
    const signature = decision.kind === 'existing'
      ? `existing:${decision.question?.id || ''}:${norm(query)}`
      : decision.kind === 'add' ? `add:${norm(query)}` : '';
    if (!signature) {
      existingCard?.remove();
      return;
    }
    if (existingCard?.dataset?.handoffSignature === signature) return;
    existingCard?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = handoffMarkup(decision);
    const card = holder.firstElementChild;
    if (!card) return;
    card.dataset.handoffSignature = signature;
    answer.appendChild(card);
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      renderHandoff();
    });
  }

  function openQuestionComposer(query) {
    document.querySelector('[data-review-batch-action="close-ask"]')?.click();
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.dataset.action = 'add-question';
    proxy.hidden = true;
    document.body.appendChild(proxy);
    proxy.click();
    proxy.remove();
    requestAnimationFrame(() => {
      const input = document.getElementById('manualQuestion');
      if (!input) return;
      input.value = String(query || '').trim();
      input.focus();
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
  }

  document.addEventListener('submit', event => {
    if (!event.target?.matches?.('[data-review-batch-form="ask"]')) return;
    lastQuery = document.getElementById('askStateDrawerInput')?.value.trim() || '';
  }, true);

  document.addEventListener('click', event => {
    const prompt = event.target.closest?.('[data-review-batch-prompt]');
    if (prompt) lastQuery = String(prompt.dataset.reviewBatchPrompt || '').trim();
    const add = event.target.closest?.('[data-ask-question-handoff="add"]');
    if (!add) return;
    event.preventDefault();
    event.stopPropagation();
    const query = lastQuery || document.getElementById('askStateDrawerInput')?.value.trim() || '';
    openQuestionComposer(query);
  }, true);

  function installObserver() {
    const result = document.getElementById('askStateDrawerResult');
    if (!result || result.dataset.questionHandoffObserved === 'true') return false;
    result.dataset.questionHandoffObserved = 'true';
    new MutationObserver(scheduleRender).observe(result, {childList: true, subtree: true, characterData: true});
    scheduleRender();
    return true;
  }

  const bodyObserver = new MutationObserver(() => {
    if (installObserver()) bodyObserver.disconnect();
  });
  if (!installObserver()) bodyObserver.observe(document.body, {childList: true, subtree: true});

  if (!document.getElementById('ask-question-handoff-styles')) {
    const style = document.createElement('style');
    style.id = 'ask-question-handoff-styles';
    style.textContent = `.ask-question-handoff{margin-top:16px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)}.ask-question-handoff strong{display:block;margin-bottom:4px;font-size:13px}.ask-question-handoff p{margin:0 0 10px;color:var(--muted);font-size:12px;line-height:1.45}.ask-question-handoff .btn{width:auto}`;
    document.head.appendChild(style);
  }
})();
