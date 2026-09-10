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

  // The code above is also evaluated by Node-only behavior tests. The reviewer
  // guide is browser-only UI, so stop here when there is no DOM.
  if (typeof document === 'undefined') return;

  // Reviewer/demo orientation. Keep this separate from State's product model:
  // it only guides an unfamiliar visitor through the existing surfaces.
  const GUIDE_KEY = 'stateReviewerGuideDismissedV1';
  const root = document.getElementById('viewRoot');
  const sidebar = document.querySelector('.app-sidebar');

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

  function addGuideStyles() {
    if (document.getElementById('state-reviewer-guide-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-reviewer-guide-styles';
    style.textContent = `
      .state-reviewer-guide{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;margin:0 0 16px;padding:14px 16px;border:1px solid #d9e3f0;border-radius:12px;background:#f7faff;color:#26344c;box-sizing:border-box}
      .state-reviewer-guide-copy{min-width:0}
      .state-reviewer-guide-copy strong{display:block;margin-bottom:3px;font-size:13px;color:#18253a}
      .state-reviewer-guide-copy p{margin:0;font-size:12.5px;line-height:1.5;color:#59677d}
      .state-reviewer-guide-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
      .state-reviewer-guide-start{min-height:38px;padding:8px 11px;border:1px solid #b9cbe0;border-radius:9px;background:#fff;color:#1769e8;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
      .state-reviewer-guide-dismiss{min-width:38px;min-height:38px;border:0;background:transparent;color:#6b778a;font:inherit;font-size:20px;line-height:1;cursor:pointer;border-radius:8px}
      .state-reviewer-guide-dismiss:hover,.state-reviewer-guide-dismiss:focus-visible{background:#edf3f9;color:#26344c}
      .state-reviewer-guide-reopen{display:block;width:100%;margin-top:7px;padding:7px 12px;border:0;background:transparent;color:#68768a;font:inherit;font-size:12px;font-weight:700;text-align:left;cursor:pointer}
      .state-reviewer-guide-reopen:hover{text-decoration:underline}
      .state-mobile-help .state-reviewer-guide-reopen{width:auto;margin:8px 0 0;padding:4px 0;min-height:40px}
      body.v88-dark .state-reviewer-guide{background:#171b22;border-color:#303946;color:#eef2f7}
      body.v88-dark .state-reviewer-guide-copy strong{color:#f2f5f8}
      body.v88-dark .state-reviewer-guide-copy p{color:#b5bfcc}
      body.v88-dark .state-reviewer-guide-start{background:#202631;border-color:#44556c;color:#9fc6ff}
      body.v88-dark .state-reviewer-guide-dismiss{color:#aeb8c5}
      @media(max-width:760px){
        .state-reviewer-guide{grid-template-columns:1fr;gap:11px;margin:0 14px 14px;padding:13px 14px}
        .state-reviewer-guide-actions{justify-content:flex-start}
        .state-reviewer-guide-start{min-height:44px}
        .state-reviewer-guide-dismiss{position:absolute;right:8px;top:8px;min-width:44px;min-height:44px}
        .state-reviewer-guide-copy{padding-right:38px}
        #askStateDrawer .ask-item-action,#askStateDrawer .ask-item-link,#askStateDrawer .ask-copy-answer{min-height:44px!important;padding-top:8px!important;padding-bottom:8px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function guideMarkup() {
    return `<aside class="state-reviewer-guide" aria-label="Quick tour of State"><div class="state-reviewer-guide-copy"><strong>Exploring State?</strong><p>Start with Open Items to see what needs attention, check Current State for what the project treats as true, then try Ask State to use that context.</p></div><div class="state-reviewer-guide-actions"><button type="button" class="state-reviewer-guide-start" data-view="open-items">Start with Open Items →</button><button type="button" class="state-reviewer-guide-dismiss" data-action="dismiss-reviewer-guide" aria-label="Dismiss quick tour">×</button></div></aside>`;
  }

  function ensureReopenControls() {
    if (sidebar && !sidebar.querySelector('.state-reviewer-guide-reopen')) {
      const existingHelp = sidebar.querySelector('.demo-help-button');
      const reopen = document.createElement('button');
      reopen.type = 'button';
      reopen.className = 'state-reviewer-guide-reopen';
      reopen.dataset.action = 'show-reviewer-guide';
      reopen.textContent = 'Quick tour';
      if (existingHelp) existingHelp.after(reopen); else sidebar.appendChild(reopen);
    }
    const mobileHelp = root?.querySelector('.state-mobile-help');
    if (mobileHelp && !mobileHelp.querySelector('.state-reviewer-guide-reopen')) {
      const reopen = document.createElement('button');
      reopen.type = 'button';
      reopen.className = 'state-reviewer-guide-reopen';
      reopen.dataset.action = 'show-reviewer-guide';
      reopen.textContent = 'Quick tour →';
      mobileHelp.appendChild(reopen);
    }
  }

  function syncReviewerGuide() {
    if (!root) return;
    addGuideStyles();
    ensureReopenControls();
    const overview = root.querySelector('.overview');
    const existing = root.querySelector('.state-reviewer-guide');
    if (!overview || isDismissed()) {
      existing?.remove();
      return;
    }
    if (!existing) overview.insertAdjacentHTML('afterbegin', guideMarkup());
  }

  document.addEventListener('click', event => {
    const dismiss = event.target.closest?.('[data-action="dismiss-reviewer-guide"]');
    if (dismiss) {
      setDismissed(true);
      root?.querySelector('.state-reviewer-guide')?.remove();
      return;
    }
    const reopen = event.target.closest?.('[data-action="show-reviewer-guide"]');
    if (reopen) {
      setDismissed(false);
      const workspace = document.querySelector('[data-view="overview"]');
      if (workspace && !root?.querySelector('.overview')) workspace.click();
      requestAnimationFrame(syncReviewerGuide);
    }
  }, true);

  if (root) {
    const observer = new MutationObserver(() => requestAnimationFrame(syncReviewerGuide));
    observer.observe(root, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncReviewerGuide, {once:true});
  else syncReviewerGuide();
})();