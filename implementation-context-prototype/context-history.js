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

  function urlForView(view) {
    const url = new URL(window.location.href);
    url.hash = routeForView[view] || 'workspace';
    return `${url.pathname}${url.search}${url.hash}`;
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
    const route = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    navigateFromHistory(event.state?.stateView || viewForRoute[route] || 'overview');
  });

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
