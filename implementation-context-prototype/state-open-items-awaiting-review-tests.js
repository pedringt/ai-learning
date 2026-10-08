// #450: a question whose answer is waiting in a pending Review. The Open Items
// template renders the final copy directly (it used to be rewritten afterwards
// by context-feedback-pass-3.js styleEvidenceCallout).
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub};
const context={window:{},document,console,setTimeout,location:{protocol:'file:',search:''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
const view=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const render=(review)=>view.render({
  reviewsStatus:'loaded',questionsStatus:'loaded',draftsStatus:'loaded',
  reviews:[review],questions:[{id:'q-1',text:'Who owns the outage fallback?',status:'open',blocking:false}],
  draftNotes:[],notes:[],openQuestionsExpanded:true,expandedReviewId:null,
  openItemSections:{reviews:null,blockers:null,questions:null,drafts:null},renderDraftNote:()=>''
});

const bare=render({id:'r-1',status:'pending',reviewType:'open_question',resolvesQuestionIds:['q-1'],summary:'',evidence:''});
check('linked question shows it is awaiting review',bare.includes('Answer found · Awaiting review'));
check('with no evidence text, the callout says the answer still needs review',
  bare.includes('<p class="evidence-answer-callout">New evidence may answer this question. Review it before State treats the question as resolved.</p>'));
check('the callout never claims the question is resolved',!/question (is|was) resolved/i.test(bare));

const withEvidence=render({id:'r-2',status:'pending',reviewType:'open_question',resolvesQuestionIds:['q-1'],summary:'',evidence:'Ops named the on-call lead as owner.'});
check('with evidence text, that text is shown instead of the callout',
  withEvidence.includes('Ops named the on-call lead as owner.')&&!withEvidence.includes('evidence-answer-callout'));

const unlinked=render({id:'r-3',status:'pending',reviewType:'proposed_update',resolvesQuestionIds:[],summary:'x',evidence:'y'});
check('a question with no linked Review stays plainly unresolved',
  unlinked.includes('This stays unresolved until reviewed evidence establishes an answer.')&&!unlinked.includes('Answer found'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
