const assert = require('assert');
const path = require('path');

const root = {
  querySelectorAll: () => [],
  addEventListener: () => {},
};

global.window = {
  STATE_API: {
    getHistory: async () => [],
    getReviews: async () => [],
  },
};
global.document = {
  getElementById: id => id === 'viewRoot' ? root : null,
  createElement: () => ({textContent:'', appendChild:()=>{}}),
  head: {appendChild: () => {}},
};
global.MutationObserver = class { observe() {} };

require(path.join(__dirname, 'context-provenance.js'));
const P = window.STATE_PROVENANCE;
assert(P, 'provenance helpers should be exposed');

(function acceptedHistoryCarriesReviewAndEvidence() {
  const data = {
    history: [{
      id:'h1', state_item_id:'k-data', review_id:'r1', transition_type:'updated',
      old_statement:'Old boundary', new_statement:'Read only', changed_at:'2026-09-01',
      resolution:'updated', decision_question:'Accept the read-only boundary?',
      evidence_items:[{id:'e1', source_type:'security_review', content:'Security approved read-only access.'}],
    }],
    resolvedReviews: [{
      id:'r1', status:'resolved', resolution:'updated', decision_question:'Accept the read-only boundary?',
      affected_state_items:[{id:'k-data'}], proposals:[{state_item_id:'k-data'}],
      evidence_items:[{id:'e1', source_type:'security_review', content:'Security approved read-only access.'}],
    }],
    openReviews: [],
  };
  const trace = P.buildTrace('k-data', data);
  assert.equal(trace.history.length, 1);
  assert.equal(trace.acceptedReviews.length, 1);
  assert.equal(trace.evidence.length, 1, 'linked evidence should be de-duplicated across History and Review');
  const html = P.traceMarkup(trace);
  assert(html.includes('Human decisions'));
  assert(html.includes('Evidence used'));
  assert(html.includes('Previously: Old boundary'));
})();

(function openReviewQualifiesButDoesNotSupportTruth() {
  const data = {
    history: [], resolvedReviews: [],
    openReviews: [{
      id:'r-open', status:'open', decision_question:'Should this change?',
      affected_state_items:[{id:'k-access'}], proposals:[{state_item_id:'k-access'}],
      evidence_items:[{id:'e-pending', content:'Pending claim'}],
    }],
  };
  const trace = P.buildTrace('k-access', data);
  assert.equal(trace.acceptedReviews.length, 0);
  assert.equal(trace.evidence.length, 0, 'open-review evidence must not be presented as accepted support');
  assert.equal(trace.openReviews.length, 1);
  const html = P.traceMarkup(trace);
  assert(html.includes('Still pending'));
  assert(html.includes('do not replace Current State'));
})();

(function rejectedReviewIsNotAcceptedProvenance() {
  const data = {
    history: [], openReviews: [],
    resolvedReviews: [{
      id:'r-rejected', status:'resolved', resolution:'not_applied',
      affected_state_items:[{id:'k-pilot'}], proposals:[{state_item_id:'k-pilot'}],
      evidence_items:[{id:'e-rejected', content:'Rejected claim'}],
    }],
  };
  const trace = P.buildTrace('k-pilot', data);
  assert.equal(trace.acceptedReviews.length, 0);
  assert.equal(trace.evidence.length, 0);
})();

(function confirmedCurrentReviewCountsAsSupport() {
  const data = {
    history: [], openReviews: [],
    resolvedReviews: [{
      id:'r-confirm', status:'resolved', resolution:'confirmed_current', decision_question:'Keep the current boundary?',
      affected_state_items:[{id:'k-security'}], proposals:[],
      evidence_items:[{id:'e2', source_type:'security_review', content:'Current boundary remains correct.'}],
    }],
  };
  const trace = P.buildTrace('k-security', data);
  assert.equal(trace.acceptedReviews.length, 1);
  assert.equal(trace.evidence.length, 1);
  assert(P.traceMarkup(trace).includes('Confirmed current'));
})();

console.log('State provenance behavior tests passed');
