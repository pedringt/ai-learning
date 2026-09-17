const assert = require('assert');
const { derive } = require('../state-product-health.js');

let pass = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('✓', name); }
  catch (error) { console.error('✗', name); throw error; }
}

const now = new Date('2026-09-17T03:00:00Z');
const hoursAgo = n => new Date(now.getTime() - n * 36e5).toISOString();
const daysAgo = n => new Date(now.getTime() - n * 864e5).toISOString();

function basePayload() {
  return {
    project: {id:'alpha', name:'Alpha'},
    evidence: {items:[
      {id:'e-change', processing_status:'processed', submitted_at:daysAgo(2)},
      {id:'e-question', processing_status:'processed', submitted_at:daysAgo(4)},
      {id:'e-pending', processing_status:'processed', submitted_at:daysAgo(1)},
      {id:'e-alone', processing_status:'processed', submitted_at:daysAgo(1)},
    ]},
    open_reviews: {items:[
      {id:'r-pending', status:'open', review_type:'proposed_update', decision_question:'Should this change?', created_at:hoursAgo(30), evidence_items:[{id:'e-pending'}], proposals:[{id:'p-pending',status:'pending'}]},
    ]},
    resolved_reviews: {items:[
      {id:'r-change', status:'resolved', resolution:'updated', review_type:'proposed_update', decision_question:'Change State?', created_at:hoursAgo(60), resolved_at:hoursAgo(48), evidence_items:[{id:'e-change'}], proposals:[{id:'p-change',status:'accepted'}]},
      {id:'r-question', status:'resolved', resolution:'question_created', review_type:'state_at_risk', decision_question:'Track uncertainty?', created_at:hoursAgo(100), resolved_at:hoursAgo(90), evidence_items:[{id:'e-question'}], resolves_question_ids:['q-resolved'], proposals:[]},
      {id:'r-no-change', status:'resolved', resolution:'confirmed_current', review_type:'missing_understanding', decision_question:'Leave State unchanged?', created_at:hoursAgo(40), resolved_at:hoursAgo(35), evidence_items:[{id:'e-change'}], proposals:[]},
    ]},
    history: {items:[
      {id:'h1', review_id:'r-change', state_item_id:'s1', transition_type:'updated', changed_at:daysAgo(1), old_statement:'Old', new_statement:'New', evidence_items:[{id:'e-change'}]},
    ]},
    open_questions: {items:[
      {id:'q-blocking', text:'Who approves launch?', blocking:true, blocks:'Launch', created_at:hoursAgo(72)},
      {id:'q-open', text:'What is the budget?', blocking:false, created_at:hoursAgo(12)},
    ]},
    resolved_questions: {items:[
      {id:'q-resolved', text:'Which vendor?', status:'resolved', source_evidence_id:'e-question', created_at:hoursAgo(120), resolved_at:hoursAgo(80)},
    ]},
    stopped_questions: {items:[]},
  };
}

check('History is the authority for Current State change counts', () => {
  const result = derive(basePayload(), now);
  assert.equal(result.changes.state_changes_7d, 1);
  assert.equal(result.changes.state_changes_30d, 1);
  assert.equal(result.evidence_outcomes.evidence_with_state_change, 1);
});

check('A resolved Review with no History does not count as a State change', () => {
  const result = derive(basePayload(), now);
  assert.equal(result.evidence_outcomes.no_state_change_reviews, 2);
  assert.equal(result.changes.state_changes_7d, 1);
});

check('Question outcomes are represented without pretending State changed', () => {
  const result = derive(basePayload(), now);
  assert.equal(result.evidence_outcomes.evidence_with_question_outcome, 1);
  assert.equal(result.evidence_outcomes.evidence_with_state_change, 1);
});

check('Accepted or processed Evidence alone is not a State change', () => {
  const payload = basePayload();
  payload.evidence.items.push({id:'e-processed-only', processing_status:'processed', submitted_at:hoursAgo(1)});
  const result = derive(payload, now);
  assert.equal(result.evidence_outcomes.total_evidence, 5);
  assert.equal(result.evidence_outcomes.evidence_with_state_change, 1);
  assert.equal(result.evidence_outcomes.evidence_without_review, 2);
});

check('Open Review and Question ages use creation timestamps', () => {
  const result = derive(basePayload(), now);
  assert.equal(result.lifecycle.oldest_pending_review_hours, 30);
  assert.equal(result.lifecycle.oldest_open_question_hours, 72);
  assert.equal(result.attention.oldest_unresolved.kind, 'question');
  assert.equal(result.attention.oldest_unresolved.id, 'q-blocking');
});

check('Lifecycle timing uses resolved timestamps', () => {
  const result = derive(basePayload(), now);
  assert.equal(result.lifecycle.review_resolution.sample_size, 3);
  assert.equal(result.lifecycle.review_resolution.median_hours, 10);
  assert.equal(result.lifecycle.question_resolution.median_hours, 40);
});

check('Sparse projects produce empty measures without a fake health score', () => {
  const result = derive({project:{id:'blank',name:'Blank'},evidence:{items:[]},open_reviews:{items:[]},resolved_reviews:{items:[]},history:{items:[]},open_questions:{items:[]},resolved_questions:{items:[]},stopped_questions:{items:[]}}, now);
  assert.equal(result.attention.pending_reviews, 0);
  assert.equal(result.attention.oldest_unresolved, null);
  assert.equal(result.lifecycle.review_resolution.median_hours, null);
  assert.ok(!('health_score' in result));
  assert.ok(!('confidence' in result));
});

check('Metrics stay scoped to only the payload for the selected project', () => {
  const alpha = derive(basePayload(), now);
  const beta = derive({project:{id:'beta',name:'Beta'},evidence:{items:[{id:'b1',processing_status:'processed'}]},open_reviews:{items:[]},resolved_reviews:{items:[]},history:{items:[]},open_questions:{items:[]},resolved_questions:{items:[]},stopped_questions:{items:[]}}, now);
  assert.equal(alpha.project.id, 'alpha');
  assert.equal(beta.project.id, 'beta');
  assert.equal(beta.evidence_outcomes.total_evidence, 1);
  assert.equal(beta.changes.state_changes_30d, 0);
});

console.log(`\n${pass} passed, 0 failed`);
