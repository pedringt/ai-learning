(() => {
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
