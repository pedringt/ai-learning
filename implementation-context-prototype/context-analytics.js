/* State product analytics -- lightweight, privacy-conscious event tracking.

   Goals (see docs/PROJECT_STATUS.md "Next Marching Orders" -- Phase 1):
   - distinguish reviewer traffic from owner/QA traffic via a ?ref= parameter
   - portfolio-level events (State demo opened) and State-level events
     (view changes, Review decisions, Ask usage, Copy context) so real
     reviewer behavior becomes observable
   - Ask queries are the most valuable signal, so they are tracked too --
     but only with an always-visible disclosure in the Ask State drawer
     (see context-product-polish.js's drawer help text), never silently.

   Reuses the existing lightweight infrastructure already on the portfolio
   pages (Vercel Web Analytics' custom-event beacon, `window.va('event', ...)`)
   rather than standing up new analytics infrastructure. No new dependency or
   analytics backend is added here.

   Respects the same owner-mode opt-out already used on the portfolio pages
   (`localStorage.paigeOwnerMode==='true'`, toggled via ?owner=true/false),
   so QA/dev browsing marked as owner mode does not pollute reviewer analytics. */
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

  function ensureBeacon() {
    if (ownerMode()) return;
    if (window.va) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
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

  // A reviewer link looks like ?ref=kim-review. Captured once per session
  // and reused on every event after, including ones that happen after the
  // query param itself has been navigated away from. Falls back to 'direct'.
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

  // Generic analytics should carry metadata, not project content. Raw Ask
  // query text has one intentional, disclosed exception through
  // trackAskQuery(). Everything else drops obviously content-bearing keys so
  // a future call site cannot accidentally beacon Evidence, Current State,
  // prompts, answers, uploads, or credentials under a familiar property name.
  function safeProps(name, props) {
    var input = props || {};
    var result = {};
    Object.keys(input).forEach(function (key) {
      if (key === 'query' && name === 'ask_submitted') {
        result[key] = input[key];
        return;
      }
      if (/(evidence|content|statement|answer|prompt|upload|credential|secret|current[_-]?state)/i.test(key)) return;
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

  function track(name, props) {
    if (!name || ownerMode()) return;
    ensureBeacon();
    var payload = Object.assign(baseContext(), safeProps(name, props));
    try { window.va('event', { name: name, data: payload }); } catch (_) { /* analytics must never break the product */ }
  }

  // Ask query text is user-entered content, so this is the only analytics
  // function allowed to send it. It is deliberately bounded to 300 chars.
  function trackAskQuery(query, props) {
    track('ask_submitted', Object.assign({ query: String(query || '').slice(0, 300) }, props || {}));
  }

  window.StateAnalytics = {
    track: track,
    trackAskQuery: trackAskQuery,
    refLabel: refLabel,
    sessionId: sessionId,
    ownerMode: ownerMode,
    environmentLabel: environmentLabel,
    projectId: projectId,
    build: BUILD
  };

  // Ask lifecycle instrumentation lives at the shared STATE_ASK boundary so
  // product logic stays untouched. context-analytics.js loads before
  // context-ask.js; this setter wraps the finished Ask module when it is
  // published, then context-product-polish.js captures the wrapped version.
  var askModule = window.STATE_ASK;
  var pendingAsk = null;
  var lastStarterQuery = null;
  function nowMs() { return window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now(); }
  function roundedDuration(startedAt) { return Math.max(0, Math.round(nowMs() - startedAt)); }
  function beginAsk(query, source) {
    var clean = String(query || '').trim();
    if (!clean) return null;
    var interaction = { query: clean, source: source || 'typed', startedAt: nowMs(), submitted: false, backendStarted: false };
    pendingAsk = interaction;
    // If the UI handles the request locally (read-only mutation warning or
    // routing to an authoritative State surface), no STATE_ASK method runs.
    // One tick later, classify it as routed rather than silently losing it.
    window.setTimeout(function () {
      if (pendingAsk !== interaction || interaction.backendStarted) return;
      emitAskSubmitted(interaction);
      track('ask_completed', { source: interaction.source, outcome: 'routed', duration_ms: roundedDuration(interaction.startedAt) });
      pendingAsk = null;
    }, 0);
    return interaction;
  }
  function emitAskSubmitted(interaction) {
    if (!interaction || interaction.submitted) return;
    interaction.submitted = true;
    trackAskQuery(interaction.query, { source: interaction.source });
  }
  function consumeAsk(query) {
    var clean = String(query || '').trim();
    var interaction = pendingAsk && pendingAsk.query === clean
      ? pendingAsk
      : { query: clean, source: 'unknown', startedAt: nowMs(), submitted: false, backendStarted: false };
    interaction.backendStarted = true;
    emitAskSubmitted(interaction);
    return interaction;
  }
  function finishAsk(interaction, outcome, payload) {
    if (!interaction) return;
    var timing = payload && payload.timing || {};
    track('ask_completed', {
      source: interaction.source,
      outcome: outcome,
      duration_ms: roundedDuration(interaction.startedAt),
      pipeline: timing.pipeline || null,
      backend_total_ms: Number.isFinite(timing.total_ms) ? timing.total_ms : null,
      provider_ms: Number.isFinite(timing.provider_ms) ? timing.provider_ms : null,
      first_token_ms: Number.isFinite(timing.first_token_ms) ? timing.first_token_ms : null
    });
    if (pendingAsk === interaction) pendingAsk = null;
  }
  function wrapAsk(value) {
    if (!value || value.__stateAnalyticsWrapped) return value;
    var wrapped = {};
    Object.keys(value).forEach(function (key) { wrapped[key] = value[key]; });
    ['submit', 'submitStream'].forEach(function (method) {
      if (typeof value[method] !== 'function') return;
      wrapped[method] = async function () {
        var args = Array.prototype.slice.call(arguments);
        var interaction = consumeAsk(args[0]);
        try {
          var result = await value[method].apply(value, args);
          finishAsk(interaction, 'answered', result);
          return result;
        } catch (error) {
          var outcome = error && error.isCancelled ? 'cancelled' : (error && error.isTimeout ? 'failed_timeout' : 'failed');
          finishAsk(interaction, outcome, null);
          throw error;
        }
      };
    });
    Object.defineProperty(wrapped, '__stateAnalyticsWrapped', { value: true, enumerable: false });
    return Object.freeze(wrapped);
  }
  try {
    Object.defineProperty(window, 'STATE_ASK', {
      configurable: true,
      get: function () { return askModule; },
      set: function (value) { askModule = wrapAsk(value); }
    });
    if (askModule) askModule = wrapAsk(askModule);
  } catch (_) { /* analytics must never block Ask initialization */ }

  // Capture intent before the Ask UI's own handlers run. This is how the
  // shared wrapper can distinguish a starter, typed submission, and refresh
  // without importing or changing product-owned UI state.
  document.addEventListener('click', function (e) {
    var prompt = e.target && e.target.closest && e.target.closest('[data-review-batch-prompt]');
    if (prompt) {
      lastStarterQuery = String(prompt.dataset.reviewBatchPrompt || '').trim();
      beginAsk(lastStarterQuery, 'starter');
      return;
    }
    var action = e.target && e.target.closest && e.target.closest('[data-review-batch-action]');
    if (!action) return;
    var type = action.dataset.reviewBatchAction;
    if (type === 'refresh-ask') {
      var input = document.getElementById && document.getElementById('askStateDrawerInput');
      beginAsk(input && input.value || '', 'refresh');
    } else if (type === 'copy-ask-answer') {
      track('ask_answer_copied');
    }
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target && e.target.closest && e.target.closest('[data-review-batch-form="ask"]');
    if (!form) return;
    var input = form.querySelector && form.querySelector('input');
    var query = String(input && input.value || '').trim();
    beginAsk(query, query && query === lastStarterQuery ? 'starter' : 'typed');
    if (query !== lastStarterQuery) lastStarterQuery = null;
  }, true);

  // Generic outbound-link tracker. Do not send the full URL: query strings
  // and paths can themselves contain sensitive source information. Origin is
  // enough to learn which external service reviewers opened.
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) track('outbound_link_opened', { destination_origin: url.origin });
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
