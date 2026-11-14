// #640 Draft 1 (Paige, Nov 8): the Answered Questions section and the record-built Question view. Every line appears
// only when the record supports it; no model calls, no network.
const assert=require('assert');
global.window={STATE_BACKEND_SYNC:{formatBackendDate:v=>v?`D(${v})`:''}};
require('./context-open-items-view.js');
const V=window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('✓',name);}catch(e){fail++;console.error('✗',name,'\n ',e.message);}}

const item={id:'q-review',text:'What evidence would justify reconsidering human review?',status:'resolved',resolved_at:'2026-09-04 10:00:00'};
const evidence={id:'e1',content:'Security discovery follow-up: no new boundary decision is needed yet.',source_type:'demo_seed',submitted_at:'2026-09-03 14:00:00'};
const review={id:'r1',decision_question:'Does the Security note answer it?',resolution_note:'Confirmed the existing boundary covers this.'};
const opts={sourceLabel:t=>`Label(${t})`,hasNoteFor:id=>id==='e1'};

check('a resolved Question with an identified Review shows the Evidence, the reviewer note and "No linked Current State update"',()=>{
  const html=V.answeredQuestionDialogHtml(item,{evidence,resolving_review:review,state_updates:[]},opts);
  assert.match(html,/<span class="eyebrow">Answered<\/span>/);
  assert.match(html,/Answered · D\(2026-09-04 10:00:00\)/);
  assert.match(html,/Evidence used to resolve this Question/);
  assert.match(html,/Label\(demo_seed\) · D\(2026-09-03 14:00:00\)/);
  assert.match(html,/Reviewer's note:<\/strong> “Confirmed the existing boundary covers this\.”/);
  assert.match(html,/No linked Current State update is recorded\./);
  assert.match(html,/data-action="view-answer-evidence" data-evidence-id="e1"/);
  assert.doesNotMatch(html,/Recorded answer|did not change Current State|View in History/);
});

check('linked Current State updates are listed and offer History',()=>{
  const html=V.answeredQuestionDialogHtml(item,{evidence,resolving_review:review,state_updates:[{new_statement:'Retention is 30 days.'}]},opts);
  assert.match(html,/This Review also updated<\/span><ul><li>Retention is 30 days\.<\/li>/);
  assert.match(html,/data-action="view-answer-history"/);
  assert.doesNotMatch(html,/No linked Current State update/);
});

check('without an identified resolving Review: no note, no Review, no Current State claim',()=>{
  const html=V.answeredQuestionDialogHtml(item,{evidence,resolving_review:null,state_updates:[{new_statement:'should not show'}]},opts);
  assert.match(html,/Resolving Review not recorded\./);
  assert.doesNotMatch(html,/Reviewer's note|This Review also updated|No linked Current State update|should not show|View in History/);
  assert.match(html,/Evidence used to resolve this Question/,'the Question\'s own explicit link still shows');
});

check('missing date, missing Evidence and a missing note are each left out',()=>{
  const html=V.answeredQuestionDialogHtml({...item,resolved_at:null},{evidence:null,resolving_review:{...review,resolution_note:null},state_updates:[]},opts);
  assert.doesNotMatch(html,/Answered ·|Evidence used to resolve|Reviewer's note|View evidence/);
  assert.match(html,/No linked Current State update is recorded\./);
});

check('"View evidence" appears only when the Evidence has a note to open',()=>{
  const html=V.answeredQuestionDialogHtml(item,{evidence:{...evidence,id:'e-other'},resolving_review:review,state_updates:[]},opts);
  assert.doesNotMatch(html,/view-answer-evidence/);
});

check('record text is escaped',()=>{
  const html=V.answeredQuestionDialogHtml({...item,text:'<b>x</b>'},{evidence:{...evidence,content:'<script>'},resolving_review:null,state_updates:[]},opts);
  assert.doesNotMatch(html,/<b>x<\/b>|<script>/);
});

check('the section: loading, error with retry, empty, rows with dates only when recorded, and Show more only with a next page',()=>{
  assert.match(V.answeredSectionBody({status:'loading',items:[]}),/Loading answered questions/);
  assert.match(V.answeredSectionBody({status:'error',items:[]}),/data-action="retry-answered-questions"/);
  assert.match(V.answeredSectionBody({status:'loaded',items:[],nextOffset:null}),/No questions have been answered yet/);
  const rows=V.answeredSectionBody({status:'loaded',items:[item,{id:'q2',text:'Undated?',resolved_at:null}],nextOffset:10});
  assert.match(rows,/data-action="open-answered-question" data-question-id="q-review"/);
  assert.match(rows,/Answered · D\(2026-09-04 10:00:00\)/);
  assert.strictEqual((rows.match(/open-question-meta/g)||[]).length,1,'the undated row has no date line');
  assert.match(rows,/data-action="show-more-answered"/);
  assert.doesNotMatch(V.answeredSectionBody({status:'loaded',items:[item],nextOffset:null}),/show-more-answered/);
});

check('Open Items renders the Answered section collapsed by default, at the bottom',()=>{
  const html=V.render({reviewsStatus:'loaded',questionsStatus:'loaded',draftsStatus:'loaded',reviews:[],questions:[],draftNotes:[],notes:[],
    openQuestionsExpanded:false,expandedReviewId:null,openItemSections:{answered:null},renderDraftNote:()=>'',answered:{status:'idle',items:[],nextOffset:0}});
  assert.match(html,/open-items-answered is-collapsed/);
  assert.ok(html.indexOf('Answered Questions')>html.indexOf('Draft notes'),'after Draft notes');
});

check('Answered-question cards in Ask answers open the Question by id',()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'context-ask.js'),'utf8');
  assert.match(src,/record_type==='answered_question'&&i\.record_id\)\{[\s\S]*?data-action="open-answered-question"/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
