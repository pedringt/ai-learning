/* State product analytics: metadata only, first-party, content-free. */
(function () {
  'use strict';

  var OWNER_KEY = 'paigeOwnerMode';
  var SESSION_KEY = 'stateAnalyticsSessionId';
  var REF_KEY = 'stateAnalyticsRef';
  var PROJECT_KEY = 'stateAnalyticsProjectId';
  var ownScript = document.currentScript && document.currentScript.src;
  var BUILD = 'unversioned';
  try { BUILD = new URL(ownScript || '', window.location.href).searchParams.get('v') || BUILD; } catch (_) {}

  var SAFE_PROP_KEYS = new Set([
    'outcome','source_type','duration_ms','view','destination_origin','status_code'
  ]);
  var SAFE_EVENT_NAMES = new Set([
    'state_demo_opened','view_opened','outbound_link_opened','ask_submitted',
    'ask_completed','ask_failed','ask_cancelled','api_failure'
  ]);
  var SAFE_VIEWS = new Set(['overview','open-items','project-overview','notes','history','settings']);

  function ownerMode() {
    try { return localStorage.getItem(OWNER_KEY) === 'true'; }
    catch (_) { return false; }
  }
  function sessionId() {
    try {
      var id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (_) { return 'no-storage'; }
  }
  function refLabel() {
    try {
      var params = new URLSearchParams(window.location.search);
      var ref = params.get('ref');
      if (ref) { sessionStorage.setItem(REF_KEY, ref); return ref; }
      return sessionStorage.getItem(REF_KEY) || 'direct';
    } catch (_) { return 'direct'; }
  }
  function environmentLabel() {
    var hostname = String(window.location && window.location.hostname || '');
    if (window.location && window.location.protocol === 'file:') return 'local';
    if (/localhost|127\.0\.0\.1/i.test(hostname)) return 'local';
    if (/(^|[-.])staging([-.]|$)|-git-/i.test(hostname)) return 'staging';
    return 'production';
  }
  function inferredApiBase() {
    var configured = window.STATE_API_BASE || (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.apiBase);
    if (configured) return String(configured).replace(/\/$/, '');
    return environmentLabel() === 'staging'
      ? 'https://state-api-staging.onrender.com'
      : 'https://state-api-6waw.onrender.com';
  }
  function projectId() {
    try {
      var saved = sessionStorage.getItem(PROJECT_KEY);
      if (saved) return saved;
    } catch (_) {}
    var switcher = document.getElementById && document.getElementById('projectSwitcher');
    return switcher && switcher.dataset && switcher.dataset.projectId ? switcher.dataset.projectId : 'unresolved';
  }
  function setProjectId(value) {
    try {
      if (value) sessionStorage.setItem(PROJECT_KEY, String(value));
      else sessionStorage.removeItem(PROJECT_KEY);
    } catch (_) {}
  }
  function safeProps(props) {
    var input = props || {}, result = {};
    Object.keys(input).forEach(function (key) {
      if (!SAFE_PROP_KEYS.has(key)) return;
      var value = input[key];
      if (key === 'view' && value && !SAFE_VIEWS.has(String(value))) return;
      if (key === 'destination_origin' && value) {
        try {
          var u = new URL(String(value));
          value = u.origin;
        } catch (_) { return; }
      }
      result[key] = value;
    });
    return result;
  }
  function baseContext() {
    return {
      session_id: sessionId(),
      project_id: projectId(),
      environment: environmentLabel(),
      build: BUILD,
      ref_label: refLabel()
    };
  }
  function firstPartySink(event) {
    if (typeof fetch !== 'function' || !event || !SAFE_EVENT_NAMES.has(event.name)) return;
    var payload = Object.assign({name:event.name}, event.data || {});
    try {
      fetch(inferredApiBase() + '/api/analytics/events', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        keepalive:true
      }).catch(function () {});
    } catch (_) {}
  }
  function eventSink() {
    return typeof window.StateAnalyticsSink === 'function' ? window.StateAnalyticsSink : firstPartySink;
  }
  function track(name, props) {
    if (!name || ownerMode() || !SAFE_EVENT_NAMES.has(name)) return;
    var sink = eventSink();
    try { sink({name:name, data:Object.assign(baseContext(), safeProps(props))}); }
    catch (_) { /* analytics must never break State */ }
  }
  function trackAskQuery(_query, props) { track('ask_submitted', props || {}); }

  window.StateAnalytics = {
    track:track,
    trackAskQuery:trackAskQuery,
    refLabel:refLabel,
    sessionId:sessionId,
    ownerMode:ownerMode,
    environmentLabel:environmentLabel,
    projectId:projectId,
    setProjectId:setProjectId,
    build:BUILD,
    hasSink:function(){ return typeof fetch === 'function' || typeof window.StateAnalyticsSink === 'function'; }
  };

  document.addEventListener('click', function (e) {
    var viewTarget = e.target && e.target.closest && e.target.closest('[data-view]');
    if (viewTarget && SAFE_VIEWS.has(String(viewTarget.dataset.view || ''))) {
      track('view_opened', {view:viewTarget.dataset.view});
    }
    var link = e.target && e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) track('outbound_link_opened', {destination_origin:url.origin});
    } catch (_) {}
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ track('state_demo_opened'); }, {once:true});
  } else {
    track('state_demo_opened');
  }
})();

/* Ask already links cited records inline. Hide the duplicate grounding appendix. */
(function () {
  var style = document.createElement('style');
  style.id = 'state-ask-redundancy-cleanup';
  style.textContent = '#askStateDrawer .ask-grounding,#askStateDrawer .ask-state-actions{display:none!important}';
  document.head.appendChild(style);
})();
