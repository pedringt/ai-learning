(() => {
  const RELEASE_STYLE_ID = 'state-release-finish';
  document.getElementById(RELEASE_STYLE_ID)?.remove();
  const releaseStyle = document.createElement('style');
  releaseStyle.id = RELEASE_STYLE_ID;
  releaseStyle.textContent = `
    /* Final release rhythm: keep Open Items sections visually consistent. */
    html body .open-items-page .open-items-sections{display:block!important;gap:0!important}
    html body .open-items-page .open-items-section{margin:0!important;padding:0!important}
    html body .open-items-page .open-items-section + .open-items-section{margin-top:28px!important}
    html body .open-items-page .open-items-section-head{margin:0!important;padding:0 0 11px!important;min-height:0!important}
    html body .open-items-page .open-items-section-body{margin-top:12px!important;padding:0!important}

    /* Reviews and Questions share one full-width record geometry. */
    html body .open-items-page .open-items-reviews .open-items-section-body{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;grid-template-columns:none!important;box-sizing:border-box!important}
    html body .open-items-page .open-items-reviews .review-card,
    html body .open-items-page .open-items-reviews .compact-review{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;border:0!important;border-bottom:1px solid #e3e8ef!important;border-radius:0!important;box-sizing:border-box!important}
    html body .open-items-page .open-items-reviews .review-card:last-child,
    html body .open-items-page .open-items-reviews .compact-review:last-child{border-bottom:0!important}
    html body .open-items-page .open-items-reviews .review-card-toggle{width:100%!important;max-width:none!important;min-width:0!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;text-align:left!important;background:transparent!important;border:0!important;padding:13px 0!important;box-sizing:border-box!important;color:inherit!important}
    html body .open-items-page .open-items-reviews .review-card-toggle::after{content:'›'!important;display:block!important;flex:0 0 auto!important;margin-left:auto!important;font-size:22px!important;line-height:1!important;color:#7a8799!important;transform:none!important;transition:transform .14s ease,color .14s ease!important}
    html body .open-items-page .open-items-reviews .review-card-toggle[aria-expanded='true']::after{transform:rotate(90deg)!important}
    html body .open-items-page .open-items-reviews .review-card-toggle:hover::after{color:var(--accent,#40356f)!important}
    html body .open-items-page .open-items-reviews .review-row-head{display:block!important;flex:1 1 auto!important;min-width:0!important;max-width:none!important}

    /* Notes: status stays in the list; History navigation appears only after opening the note. */
    html body .notes-page .note-index-status{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:flex-start!important;gap:3px!important}
    html body .notes-page .note-history-link{display:none!important;margin:1px 0 0!important;font-size:11px!important;line-height:1.25!important;white-space:nowrap!important}
    html body .notes-page .note-index-row.is-expanded .note-history-link{display:block!important}

    /* Settings keeps the current width, but removes the long loose vertical rhythm. */
    html body .settings-page .settings-section{margin-top:0!important;margin-bottom:12px!important}
    html body .settings-page .settings-section:last-child{margin-bottom:0!important}
    html body .settings-page .settings-section-head{margin-bottom:10px!important}
    html body .settings-page .slack-preview,
    html body .settings-page .source-list{margin-top:10px!important;gap:6px!important}
    html body .settings-page .settings-source-grid>.source-row{padding-top:10px!important;padding-bottom:10px!important}
    html body .settings-page .settings-callout{margin-top:10px!important;padding-top:10px!important;padding-bottom:10px!important}
    html body .settings-page .settings-actions{margin-top:10px!important}
    html body .settings-page .settings-slack-status{margin-top:10px!important}
    html body .settings-page .settings-danger{padding-top:14px!important;padding-bottom:14px!important}

    /* History: natural-height white surface with a compact left rail. */
    html body .history-page{width:100%!important;max-width:none!important;min-height:0!important;height:auto!important}
    html body .history-page .history-list,
    html body .history-page #historyList{width:100%!important;max-width:none!important;min-height:0!important;height:auto!important;margin-left:0!important;margin-right:0!important;padding-bottom:16px!important}
    html body .history-page .history-list::before,
    html body .history-page #historyList::before{left:80px!important}
    html body .history-page .history-list article.history-entry,
    html body .history-page #historyList article.history-entry{grid-template-columns:52px minmax(0,1fr)!important;gap:18px!important;margin-left:0!important;margin-right:0!important}
    html body .history-page .history-list article.history-entry:last-child,
    html body .history-page #historyList article.history-entry:last-child{padding-bottom:0!important;margin-bottom:0!important}
    html body .history-page .history-entry-body::before{left:-14px!important}

    @media(max-width:760px){
      html body .open-items-page .open-items-section + .open-items-section{margin-top:24px!important}
      html body .open-items-page .open-items-reviews .review-card-toggle{padding-top:13px!important;padding-bottom:13px!important}
      html body .notes-page .note-index-status{align-items:flex-start!important}
      html body .history-page .history-list,
      html body .history-page #historyList{padding-bottom:14px!important}
      html body .history-page .history-list::before,
      html body .history-page #historyList::before{left:21px!important}
      html body .history-page .history-list article.history-entry,
      html body .history-page #historyList article.history-entry{grid-template-columns:1fr!important;gap:4px!important;padding-left:28px!important}
      html body .history-page .history-entry-body::before{left:-18px!important}
    }
  `;
  document.head.appendChild(releaseStyle);

  const routeForView = {
    overview: 'workspace',
    'project-overview': 'project',
    'open-items': 'open-items',
    notes: 'notes',
    history: 'history',
    settings: 'settings',
  };
  const viewForRoute = Object.fromEntries(Object.entries(routeForView).map(([view, route]) => [route, view]));

  let currentView = 'overview';
  let applyingHistory = false;

  function activeView() {
    const active = document.querySelector('.sidebar-nav [data-view].active, .product-home[data-view].active');
    return active?.dataset?.view || currentView || 'overview';
  }

  function urlForView(view, topic) {
    const url = new URL(window.location.href);
    url.hash = routeForView[view] || 'workspace';
    if (view === 'history' && topic) url.hash += `/${encodeURIComponent(topic)}`;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  // A History topic drilldown (or evidence filter) stays on view==='history'
  // the whole time, so the generic click-based pushIfChanged() below never
  // sees a view change and never pushes a new entry for it -- Back from a
  // topic detail then skips the plain History list entirely and lands on
  // whatever page came before History was opened. context-app.js calls this
  // explicitly right after it changes state.historyTopic, for both entering
  // a topic (from History's own list or from Project/Notes/a Review deep
  // link) and clearing one (View all history ->). Found via live QA
  // 2026-09-07.
  function pushHistoryTopic(topic) {
    if (applyingHistory) return;
    currentView = 'history';
    history.pushState({stateView: 'history', historyTopic: topic || null}, '', urlForView('history', topic));
  }

  function replaceInitialState(view) {
    currentView = view;
    history.replaceState({stateView: view}, '', urlForView(view));
  }

  function pushIfChanged() {
    if (applyingHistory) return;
    const view = activeView();
    if (!routeForView[view] || view === currentView) return;
    currentView = view;
    history.pushState({stateView: view}, '', urlForView(view));
  }

  function closeOpenDialog() {
    const overlay = document.getElementById('overlay');
    if (!overlay || overlay.hidden) return;
    const close = overlay.querySelector('[data-action="close-dialog"]');
    if (close) close.click();
  }

  function navigateFromHistory(view) {
    if (!routeForView[view]) view = 'overview';
    currentView = view;
    const target = document.querySelector(`[data-view="${CSS.escape(view)}"]`);
    if (!target) return;
    applyingHistory = true;
    closeOpenDialog();
    target.click();
    window.setTimeout(() => {
      currentView = activeView();
      applyingHistory = false;
    }, 50);
  }

  function initialView() {
    const route = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    return viewForRoute[route] || history.state?.stateView || 'overview';
  }

  document.addEventListener('click', () => window.setTimeout(pushIfChanged, 0));

  const navObserver = new MutationObserver(() => requestAnimationFrame(pushIfChanged));
  const nav = document.querySelector('.sidebar-nav');
  if (nav) navObserver.observe(nav, {subtree: true, attributes: true, attributeFilter: ['class']});

  window.addEventListener('popstate', event => {
    const route = String(window.location.hash || '').replace(/^#/, '').split('/')[0].toLowerCase();
    const view = event.state?.stateView || viewForRoute[route] || 'overview';
    navigateFromHistory(view);
    if (view === 'history') {
      const topic = event.state?.historyTopic ?? null;
      // navigateFromHistory clicks the sidebar tab, which resets
      // state.historyTopic via context-app.js's own navigateTo() -- restore
      // the popped topic after that settles rather than racing it.
      window.setTimeout(() => window.STATE_HISTORY_RESTORE?.(topic), 60);
    }
  });

  window.STATE_HISTORY_NAV = {pushHistoryTopic};

  const desired = initialView();
  if (desired !== 'overview') {
    requestAnimationFrame(() => {
      navigateFromHistory(desired);
      replaceInitialState(desired);
    });
  } else {
    replaceInitialState('overview');
  }
})();
