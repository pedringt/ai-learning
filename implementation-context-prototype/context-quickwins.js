(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const starters = [
    {
      label: 'What should I know?',
      prompt: 'What should I know right now? Give me a concise briefing with Project snapshot, Changed recently, Needs attention, and Still unclear.'
    },
    {
      label: 'Prep me for a meeting',
      prompt: 'Prep me for a project meeting. Focus on settled decisions, recent changes, what needs attention, and questions we still need answered.'
    },
    {
      label: 'What changed recently?',
      prompt: 'What changed recently? Separate accepted Current State changes from pending evidence or unresolved information.'
    },
    {
      label: 'What needs my attention?',
      prompt: 'What needs my attention right now? Prioritize Reviews and blocking questions, then mention other important unresolved items.'
    },
    {
      label: 'What are we still unsure about?',
      prompt: 'What are we still unsure about? Show unresolved questions and pending evidence without turning them into facts.'
    },
    {
      label: 'Give me a project update',
      prompt: 'Give me a concise project update I can copy into Slack or email, with sections Changed, Needs attention, and Still unresolved.'
    }
  ];

  function addAskStarters(scope = document) {
    const panel = scope.querySelector('.ask-panel');
    if (!panel || panel.querySelector('.ask-live-answer, .ask-live-loading, .ask-live-error, .ask-quick-starts')) return;
    const existing = panel.querySelector('.prompt-suggestions');
    if (!existing) return;
    existing.classList.remove('single-suggestion');
    existing.classList.add('ask-quick-starts', 'ask-refinement-chips');
    existing.innerHTML = starters.map(item => `<button type="button" data-prompt="${esc(item.prompt)}">${esc(item.label)}</button>`).join('');
  }

  function addGrounding(scope = document) {
    scope.querySelectorAll('.ask-live-answer').forEach(answer => {
      if (answer.querySelector('.ask-grounding')) return;
      const rows = [...answer.querySelectorAll('.ask-answer-item')].map(row => {
        const badge = row.querySelector('.ask-record-badge')?.textContent?.trim() || '';
        const text = row.querySelector('.ask-item-text')?.textContent?.trim() || '';
        return badge && text ? { badge, text } : null;
      }).filter(Boolean);
      const unique = [];
      const seen = new Set();
      rows.forEach(row => {
        const key = `${row.badge}:${row.text}`;
        if (!seen.has(key)) { seen.add(key); unique.push(row); }
      });
      if (!unique.length) return;
      const details = document.createElement('details');
      details.className = 'evidence ask-grounding';
      details.innerHTML = `<summary>Based on ${unique.length} State ${unique.length === 1 ? 'item' : 'items'}</summary>${unique.map(row => `<article><strong>${esc(row.badge)}</strong><p>${esc(row.text)}</p></article>`).join('')}`;
      const actions = answer.querySelector('.ask-state-actions');
      const safety = answer.querySelector('.ask-open-items-safety');
      if (actions) answer.insertBefore(details, actions);
      else if (safety) answer.insertBefore(details, safety);
      else answer.appendChild(details);
    });
  }

  function improveOpenItemsSummary(scope = document) {
    const page = scope.querySelector('.open-items-page');
    if (!page) return;
    const head = page.querySelector('.page-head p');
    if (!head || head.dataset.quickwinCounts === 'true') return;
    const sections = [...page.querySelectorAll('.open-items-section')];
    if (sections.length < 3) return;
    const readCount = section => {
      const raw = section.querySelector('.open-items-section-count')?.textContent?.trim() || '0';
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const reviews = readCount(sections[0]);
    const blockers = readCount(sections[1]);
    const questions = readCount(sections[2]);
    if ([reviews, blockers, questions].some(v => v === null)) return;
    const summary = document.createElement('strong');
    summary.className = 'open-items-count-summary';
    summary.textContent = `${reviews} ${reviews === 1 ? 'needs review' : 'need review'} · ${blockers} blocking · ${questions} ${questions === 1 ? 'other question' : 'other questions'}`;
    head.prepend(summary, document.createElement('br'));
    head.dataset.quickwinCounts = 'true';
  }

  function improveEmptyStates(scope = document) {
    scope.querySelectorAll('.open-items-empty').forEach(node => {
      const text = node.textContent.trim();
      if (text === 'Nothing needs your decision right now.') node.textContent = 'Nothing needs review. Current State is up to date with accepted evidence.';
      else if (text === 'Nothing is currently blocked on an answer.') node.textContent = 'Nothing is blocking the project right now.';
      else if (text === 'No other open questions.') node.textContent = 'Nothing else is unresolved right now.';
    });
  }

  function enhance(scope = document) {
    addAskStarters(scope);
    addGrounding(scope);
    improveOpenItemsSummary(scope);
    improveEmptyStates(scope);
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance(document);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
