/* State product analytics compatibility layer.

   State's first Product Health dashboard should be built from authoritative
   State records and existing backend telemetry, not a paid browser-analytics
   product. This module therefore does not load Vercel Web Analytics and does
   not send custom events anywhere by default.

   Existing product call sites can continue to call StateAnalytics.track(). A
   future first-party collector may explicitly install window.StateAnalyticsSink
   before/while the app runs. The sink receives metadata-only event objects;
   raw Ask queries and project content are intentionally excluded.

   Owner/QA mode remains an opt-out even when a future sink is installed. */
(function () {
  'use strict';

  var OWNER_KEY = 'paigeOwnerMode';
  var SESSION_KEY = 'stateAnalyticsSessionId';
  var REF_KEY = 'stateAnalyticsRef';
  var ownScript = document.currentScript && document.currentScript.src;
  var BUILD = 'unversioned';
  try { BUILD = new URL(ownScript || '', window.location.href).searchParams.get('v') || BUILD; } catch (_) {}

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
      if (ref) {
        sessionStorage.setItem(REF_KEY, ref);
        return ref;
      }
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

  function projectId() {
    var switcher = document.getElementById && document.getElementById('projectSwitcher');
    return switcher && switcher.dataset && switcher.dataset.projectId
      ? switcher.dataset.projectId
      : 'unresolved';
  }

  function safeProps(props) {
    var input = props || {};
    var result = {};
    Object.keys(input).forEach(function (key) {
      // Browser analytics are metadata-only. Keep this broad on purpose: a
      // future call site should fail closed rather than leak project/user text.
      if (/(query|evidence|content|statement|answer|prompt|upload|credential|secret|token|current[_-]?state)/i.test(key)) return;
      result[key] = input[key];
    });
    return result;
  }

  function baseContext() {
    return {
      ref: refLabel(),
      session: sessionId(),
      project_id: projectId(),
      environment: environmentLabel(),
      build: BUILD
    };
  }

  function eventSink() {
    return typeof window.StateAnalyticsSink === 'function' ? window.StateAnalyticsSink : null;
  }

  function track(name, props) {
    if (!name || ownerMode()) return;
    var sink = eventSink();
    if (!sink) return;
    try {
      sink({ name: name, data: Object.assign(baseContext(), safeProps(props)) });
    } catch (_) { /* analytics must never break the product */ }
  }

  // Kept for compatibility with older call sites. Query text is deliberately
  // ignored; only safe metadata supplied in props may reach a future sink.
  function trackAskQuery(_query, props) {
    track('ask_submitted', props || {});
  }

  window.StateAnalytics = {
    track: track,
    trackAskQuery: trackAskQuery,
    refLabel: refLabel,
    sessionId: sessionId,
    ownerMode: ownerMode,
    environmentLabel: environmentLabel,
    projectId: projectId,
    build: BUILD,
    hasSink: function () { return !!eventSink(); }
  };

  // Preserve the event contract for a future first-party sink without sending
  // full external URLs. Paths and query strings may contain sensitive context.
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) {
        track('outbound_link_opened', { destination_origin: url.origin });
      }
    } catch (_) { /* ignore malformed hrefs */ }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { track('state_demo_opened'); }, { once: true });
  } else {
    track('state_demo_opened');
  }
})();

/* Ask already links its cited records inline. Hide the duplicate grounding appendix and open-items summary. */
(function () {
  var style = document.createElement('style');
  style.id = 'state-ask-redundancy-cleanup';
  style.textContent = '#askStateDrawer .ask-grounding,#askStateDrawer .ask-state-actions{display:none!important}';
  document.head.appendChild(style);
})();
