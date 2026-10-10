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

  let lastRenderedPayload = null;

  function followupIntent(query, previousPayload) {
    if (!previousPayload) return 'new';
    const q = norm(query);
    if (!q) return 'new';
    if (transformHints.some(hint => q.includes(norm(hint)))) return 'transform';
    if (dependentExact.has(q) || dependentHints.some(hint => q.includes(norm(hint)))) return 'dependent';
    if (q.split(' ').length <= 5 && /\b(it|that|those|them|this|these)\b/.test(q)) return 'dependent';
    return 'new';
  }

  function responseMode(intent) {
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

  function dedupeAnswerPayload(payload) {
    if (!payload?.answer?.sections) return payload;
    const seen = new Set();
    const sections = [];
    for (const section of payload.answer.sections) {
      const items = [];
      for (const item of section.items || []) {
        const key = item?.record_id ? `${item.record_type || 'none'}:${item.record_id}` : null;
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        items.push(item);
      }
      if (items.length) sections.push({...section, items});
    }
    if (sections.length === payload.answer.sections.length && sections.every((s, i) => s.items.length === (payload.answer.sections[i].items || []).length)) return payload;
    return {...payload, answer: {...payload.answer, sections}};
  }

  function render(payload, liveStatus) {
    const cleaned = dedupeAnswerPayload(payload);
    lastRenderedPayload = cleaned || null;
    const html = prior.render(cleaned, liveStatus);
    if (typeof html !== 'string') return html;
    return html.replace(/<aside class="ask-state-actions">[\s\S]*?<\/aside>/g, '');
  }

  window.STATE_ASK = Object.freeze({
    ...prior,
    followupIntent,
    followupMode,
    submitStream,
    submit,
    render,
    syncWorkspaceDecorations: syncReviewerGuide,
  });

  if (typeof document === 'undefined') return;

  const GUIDE_KEY = 'stateReviewerGuideDismissedV1';
  const root = document.getElementById('viewRoot');

  function isDismissed() {
    try { return localStorage.getItem(GUIDE_KEY) === 'true'; }
    catch (_) { return false; }
  }

  function setDismissed(value) {
    try {
      if (value) localStorage.setItem(GUIDE_KEY, 'true');
      else localStorage.removeItem(GUIDE_KEY);
    } catch (_) {}
  }


  // Blank-project bug report (2026-09-15): a brand-new project showed the
  // exact same "Exploring State?" tour banner as an established one, even
  // though Open Items/Current State -- what that banner points at -- are
  // both empty. onboardingStage() reads the app's own state (exposed via
  // context-app.js's window.STATE_ASK_TEST_API, available by the time this
  // runs off a MutationObserver callback, i.e. after a real render) to pick
  // one of three banners. Absence of that hook (older bundle, test harness
  // without context-app.js loaded) falls back to the original banner.
  function onboardingStage() {
    const app = window.STATE_ASK_TEST_API?.state;
    const data = app?.data;
    if (!data) return 'established';
    // #482 (Cowork, Oct 9): a new tab on Northstar showed "Add your first evidence" because
    // this ran before the project's Evidence had loaded. Unknown is not "no evidence".
    if (app.backendStatus?.evidence === 'loading') return null;
    if (!(data.notes || []).length) return 'no_evidence';
    // syncApiState() never removes a knowledge item on an empty backend
    // response, only tags it state:'retired' (context-backend-sync.js) --
    // the same pattern every other "is anything actually established"
    // check in this codebase already follows (context-app.js/
    // context-project-view.js's currentKnowledge()), so this needs the
    // same filter rather than a raw .length check.
    if (!(data.knowledge || []).some(k => k.state === 'current')) return 'evidence_not_established';
    return 'established';
  }

  function guideMarkup(stage) {
    if (stage === 'no_evidence') {
      return `<aside class="state-reviewer-guide" aria-label="Add your first evidence" data-guide-stage="no_evidence"><div class="state-reviewer-guide-copy"><strong>Add your first evidence</strong><p>Add notes from a meeting, document, or other project source. State will interpret what matters and surface anything that needs your review.</p></div><div class="state-reviewer-guide-actions"><button type="button" class="state-reviewer-guide-start" data-action="add-info">Add Evidence →</button><button type="button" class="state-reviewer-guide-dismiss" data-action="dismiss-reviewer-guide" aria-label="Dismiss quick tour">×</button></div></aside>`;
    }
    if (stage === 'evidence_not_established') {
      return `<aside class="state-reviewer-guide" aria-label="Review what State found" data-guide-stage="evidence_not_established"><div class="state-reviewer-guide-copy"><strong>State is reviewing your evidence</strong><p>Check Open Items for anything that needs a decision. Current State fills in once you accept a proposal.</p></div><div class="state-reviewer-guide-actions"><button type="button" class="state-reviewer-guide-start" data-view="open-items">Go to Open Items →</button><button type="button" class="state-reviewer-guide-dismiss" data-action="dismiss-reviewer-guide" aria-label="Dismiss quick tour">×</button></div></aside>`;
    }
    return `<aside class="state-reviewer-guide" aria-label="Quick tour of State" data-guide-stage="established"><div class="state-reviewer-guide-copy"><strong>Exploring State?</strong><p>Start with Open Items to see what needs attention, check Current State for what the project treats as true, then try Ask State to use that context.</p></div><div class="state-reviewer-guide-actions"><button type="button" class="state-reviewer-guide-start" data-view="open-items">Start with Open Items →</button><button type="button" class="state-reviewer-guide-dismiss" data-action="dismiss-reviewer-guide" aria-label="Dismiss quick tour">×</button></div></aside>`;
  }

  // A separate, always-visible "Quick tour" button used to live permanently
  // in the sidebar (and mobile help area) as the only way to bring the
  // banner back after dismissing it. That meant two permanent "orient me"
  // entry points competing on every single page (this one, and "Need help?").
  // Consolidated 2026-09-12: the reopen entry point now lives inside the
  // Need Help modal (context-app.js's showDemoHelp(), a "Take the quick
  // tour" action) instead of its own persistent chip; this module only
  // needs to handle the [data-action="show-reviewer-guide"] click, wherever
  // it comes from.
  function syncReviewerGuide() {
    if (!root) return;
    const overview = root.querySelector('.overview');
    const existing = root.querySelector('.state-reviewer-guide');
    const showBanner = !!overview && !isDismissed();
    if (!showBanner) {
      existing?.remove();
      return;
    }
    const stage = onboardingStage();
    if (stage === null) { existing?.remove(); return; }  // still loading; the next render decides
    if (!existing) { overview.insertAdjacentHTML('afterbegin', guideMarkup(stage)); return; }
    if (existing.dataset.guideStage !== stage) existing.outerHTML = guideMarkup(stage);
  }

  function decorateAskCurrentStateLinks() {
    if (!root || !lastRenderedPayload?.answer) return;
    const stateItems = (lastRenderedPayload.answer.sections || [])
      .flatMap(section => section.items || [])
      .filter(item => item.record_type === 'state' && item.record_id);
    if (!stateItems.length) return;
    const rows = [...root.querySelectorAll('.ask-answer-item')]
      .filter(row => row.querySelector('.ask-record-state'));
    rows.forEach((row, index) => {
      const item = stateItems[index];
      if (!item || row.querySelector('[data-action="ask-open-current-state"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button ask-item-link ask-item-action ask-current-state-link';
      button.dataset.action = 'ask-open-current-state';
      button.dataset.stateId = item.record_id;
      button.textContent = 'View current →';
      row.appendChild(button);
    });
  }

  function focusCurrentStateFact(stateId) {
    const nav = document.querySelector('.sidebar-nav [data-view="project-overview"], .mobile-primary-nav [data-view="project-overview"]');
    if (!nav || !stateId) return;
    nav.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('.project-maintained-fact[data-state-id]')]
        .find(el => el.dataset.stateId === stateId);
      if (!target) return;
      const disclosure = target.closest('details');
      if (disclosure) disclosure.open = true;
      target.classList.add('is-ask-target');
      target.scrollIntoView({behavior:'smooth', block:'center'});
      setTimeout(() => target.classList.remove('is-ask-target'), 2400);
    }));
  }

  document.addEventListener('click', event => {
    const askCurrent = event.target.closest?.('[data-action="ask-open-current-state"]');
    if (askCurrent) {
      focusCurrentStateFact(askCurrent.dataset.stateId);
      return;
    }
    const dismiss = event.target.closest?.('[data-action="dismiss-reviewer-guide"]');
    if (dismiss) {
      setDismissed(true);
      root?.querySelector('.state-reviewer-guide')?.remove();
      syncReviewerGuide();
      return;
    }
    const reopen = event.target.closest?.('[data-action="show-reviewer-guide"]');
    if (reopen) {
      setDismissed(false);
      // Now only reachable from inside the Need Help modal (context-app.js's
      // showDemoHelp()) -- close it directly via the shared overlay/dialogBody
      // elements, the same cross-module approach context-settings.js's
      // showSettingsDialog() already uses, since closeDialog() itself is a
      // private closure in context-app.js.
      const overlay = document.getElementById('overlay');
      if (overlay && !overlay.hidden) {
        overlay.hidden = true;
        const dialogBody = document.getElementById('dialogBody');
        if (dialogBody) dialogBody.innerHTML = '';
        document.body.classList.remove('modal-open');
      }
      const workspace = document.querySelector('[data-view="overview"]');
      if (workspace && !root?.querySelector('.overview')) workspace.click();
      requestAnimationFrame(syncReviewerGuide);
    }
  }, true);

  if (root) {
    const observer = new MutationObserver(() => requestAnimationFrame(() => {
      syncReviewerGuide();
      decorateAskCurrentStateLinks();
    }));
    observer.observe(root, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    syncReviewerGuide();
    decorateAskCurrentStateLinks();
  }, {once:true});
  else {
    syncReviewerGuide();
    decorateAskCurrentStateLinks();
  }

  window.STATE_ONBOARDING_TEST_API = {onboardingStage, guideMarkup, syncReviewerGuide};
})();
