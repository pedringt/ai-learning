// #678 / DEC-026 (re-check reminders) and #679 / DEC-027 (review load), at the rendering layer. The backend decides
// which items need a re-check and the Review order (test_state_confirmations.py); these check what each view shows.
// No network, no model calls.
const assert=require('assert');
global.window={STATE_BACKEND_SYNC:{formatBackendDate:v=>v?`D(${v})`:''}};
require('./context-project-view.js');
require('./context-open-items-view.js');
const PROJECT_VIEW=window.STATE_PROJECT_VIEW;
const OPEN_ITEMS=window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('✓',name);}catch(e){fail++;console.error('✗',name,'\n ',e.message);}}

const area={projectArea:'workflow',areaName:'Scope & workflow',areaDescription:'',areaSortOrder:10,state:'current'};
const knowledge=[
  {...area,id:'k-pilot',title:'Pilot',statement:'The core pilot use case is Tier 1 troubleshooting assistance.',lastConfirmed:'Sep 30',needsRecheck:false,recheckDays:null},
  {...area,id:'k-entry',title:'Entry',statement:'The assistant supports the rep inside the existing workflow.',lastConfirmed:'Aug 18',needsRecheck:true,recheckDays:30},
  {...area,id:'k-grounding',title:'Grounding',statement:'Guidance is grounded in approved support material.',lastConfirmed:'Oct 2',needsRecheck:false,recheckDays:null},
];
const page=props=>PROJECT_VIEW.render({backendState:'loaded',projectName:'Northstar',knowledge,history:[],pendingFor:()=>[],...props});

check('Current State keeps its prose and lists the flagged item in a box under its area (layout B)',()=>{
  const html=page({recheckDays:60});
  assert.match(html,/class="project-wiki-prose"/);
  assert.match(html,/1 item needs a re-check/);
  assert.match(html,/Needs re-check · last confirmed Aug 18/);
  assert.match(html,/data-action="state-still-true" data-state-id="k-entry">Still true</);
  assert.match(html,/data-action="suggest-recheck-question" data-state-id="k-entry">Suggest a re-check question</);
  assert.ok(!/data-state-id="k-pilot">Still true/.test(html),'only flagged items in the box');
});

check('the overview counts items needing a re-check; the off pointer shows only when reminders are off',()=>{
  assert.match(page({recheckDays:60}),/<dt>Re-check<\/dt><dd>1 item needs a re-check<\/dd>/);
  assert.ok(!/Re-check reminders are off/.test(page({recheckDays:60})));
  const off=page({recheckDays:null,knowledge:knowledge.map(k=>({...k,needsRecheck:false}))});
  assert.match(off,/Re-check reminders are off\. <button[^>]*data-action="open-recheck-settings">Turn them on in Settings\.<\/button>/);
  assert.ok(!/<dt>Re-check<\/dt>/.test(off),'no count when nothing is flagged');
});

check('"Show dates" lists every item with its date, its own interval and Still true',()=>{
  const html=page({recheckDays:60,showDates:true});
  assert.match(html,/aria-pressed="true">Hide dates</);
  assert.ok(!/class="project-wiki-prose"/.test(html),'items replace the prose');
  assert.match(html,/Confirmed Sep 30/);
  assert.match(html,/Needs re-check · last confirmed Aug 18/);
  assert.match(html,/<option value="30" selected>30 days<\/option>/);
  assert.match(html,/<option value="" selected>Project default<\/option>/);
  assert.equal((html.match(/>Still true</g)||[]).length,3);
});

check('the re-check filter from Open Items shows only areas with flagged items, with a way back',()=>{
  const other={...area,projectArea:'budget',areaName:'Budget',areaSortOrder:20,id:'k-budget',title:'Budget',statement:'Budget is $40,000.',lastConfirmed:'Oct 1',needsRecheck:false};
  const html=PROJECT_VIEW.render({backendState:'loaded',projectName:'Northstar',knowledge:[...knowledge,other],history:[],pendingFor:()=>[],recheckDays:60,recheckOnly:true});
  assert.match(html,/Showing the 1 item that needs a re-check/);
  assert.match(html,/data-action="clear-recheck-filter">Show all Current State</);
  assert.ok(!/id="project-budget"/.test(html),'area without flagged items hidden');
});

const proposal=(id,op='update',stateId='k-entry')=>({id,operation:op,state_item_id:stateId,proposed_statement:'x'});
const reviews=[
  {id:'r1',backendReviewId:'r1',status:'pending',summary:'Does the note change scope?',whyConsequential:'The pilot boundary decides who can use it.',reviewType:'proposed_update',proposals:[proposal('p1')]},
  {id:'r2',backendReviewId:'r2',status:'pending',summary:'Is the vendor claim authoritative?',whyConsequential:'Retention terms are unconfirmed.',reviewType:'state_at_risk',proposals:[]},
  {id:'r3',backendReviewId:'r3',status:'pending',summary:'Add the rollout date?',whyConsequential:'Rollout timing affects training.',reviewType:'proposed_update',proposals:[proposal('p3','create',null)]},
];
const openItems=props=>OPEN_ITEMS.render({reviewsStatus:'loaded',questionsStatus:'loaded',draftsStatus:'loaded',reviews,questions:[],draftNotes:[],notes:[],
  openQuestionsExpanded:false,expandedReviewId:null,openItemSections:{},renderDraftNote:()=>'',...props});

check('each collapsed Review row shows its "why this matters" line',()=>{
  const html=openItems({});
  assert.match(html,/<span class="open-question-why">The pilot boundary decides who can use it\.<\/span>/);
  assert.match(html,/<span class="open-question-why">Retention terms are unconfirmed\.<\/span>/);
});

check('bulk Leave unchanged offers a box only on Reviews with that decision, and a bar for the selection',()=>{
  const html=openItems({selectedReviewIds:new Set(['r1','r2'])});
  assert.match(html,/data-review-select="r1" checked/);
  assert.match(html,/data-review-select="r3"/);
  assert.ok(!/data-review-select="r2"/.test(html),'an at-risk Review has no Leave unchanged');
  assert.match(html,/<span>1 selected<\/span><button type="button" class="btn secondary" data-action="bulk-leave-unchanged">Leave selected unchanged<\/button>/);
  const none=openItems({});
  assert.match(none,/<span>0 selected<\/span>.*aria-disabled="true"/s);
  const one=openItems({reviews:[reviews[0]]});
  assert.ok(!/review-bulk-bar/.test(one),'no bulk bar with a single eligible Review');
});

check('the re-check entry sits after the Reviews and counts as one',()=>{
  const html=openItems({recheckCount:3});
  assert.match(html,/3 Current State items need a re-check/);
  assert.match(html,/data-action="open-recheck-items"/);
  assert.ok(html.indexOf('need a re-check')>html.indexOf('Add the rollout date?'),'after the Reviews');
  assert.match(html,/<strong class="open-items-count-summary">4 need review/);
  assert.match(html,/aria-label="4 items need attention">4</);
  const empty=openItems({reviews:[],recheckCount:1});
  assert.match(empty,/1 Current State item needs a re-check/);
  assert.ok(!/Nothing needs review/.test(empty));
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
