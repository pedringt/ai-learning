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
   rather than standing up new analytics infrastructure, per the "avoid
   heavyweight analytics infrastructure" guidance. No new dependency, no
   server-side component, no PII collected -- only an anonymous per-tab
   session id, the ?ref= label, event names, and the specific properties
   listed at each call site.

   Respects the same owner-mode opt-out already used on the portfolio pages
   (`localStorage.paigeOwnerMode==='true'`, toggled via ?owner=true/false),
   so QA/dev browsing marked as owner mode does not pollute reviewer
   analytics -- this is what keeps internal usage from dominating the data,
   per the doc's explicit concern. */
(function () {
  'use strict';

  var OWNER_KEY = 'paigeOwnerMode';
  var SESSION_KEY = 'stateAnalyticsSessionId';
  var REF_KEY = 'stateAnalyticsRef';

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
  // query param itself has been navigated away from (e.g. deep inside the
  // State app). Falls back to 'direct' for ordinary/no-referral traffic.
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

  // context-app.js predates consequence-specific Review labels and still
  // emits accepted/rejected event names. Normalize those at the analytics
  // boundary so "Keep Current State" is never reported as rejection of the
  // Evidence itself. New question-only Review actions already emit
  // review_decision directly with their specific outcome.
  function normalizeReviewEvent(name, props) {
    if (name === 'review_accepted') return {
      name: 'review_decision',
      props: Object.assign({ outcome: 'current_state_updated' }, props || {})
    };
    if (name === 'review_rejected') return {
      name: 'review_decision',
      props: Object.assign({ outcome: 'current_state_kept' }, props || {})
    };
    return { name: name, props: props || {} };
  }

  function track(name, props) {
    if (!name || ownerMode()) return;
    ensureBeacon();
    var normalized = normalizeReviewEvent(name, props);
    var payload = Object.assign({ ref: refLabel(), session: sessionId() }, normalized.props || {});
    try { window.va('event', { name: normalized.name, data: payload }); } catch (_) { /* analytics must never break the product */ }
  }

  // Ask query text is genuinely useful product research (see doc: "Ask
  // queries are especially valuable"), but it's user-entered content, so it
  // is only ever sent under this one function -- callers should not read
  // ui/query text into any other track() call.
  function trackAskQuery(query, props) {
    track('ask_submitted', Object.assign({ query: String(query || '').slice(0, 300) }, props || {}));
  }

  window.StateAnalytics = {
    track: track,
    trackAskQuery: trackAskQuery,
    refLabel: refLabel,
    sessionId: sessionId,
    ownerMode: ownerMode
  };

  // Generic outbound-link tracker -- covers "source link opened" without
  // instrumenting every individual source-rendering call site. Only fires
  // for links leaving the current origin (external evidence/source links,
  // not in-app navigation, which already has its own view-change tracking).
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) track('outbound_link_opened', { href: url.href });
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
