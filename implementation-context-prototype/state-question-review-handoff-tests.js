// Regression coverage for a bug found in live staging QA (2026-09-07): a
// question marked "Answer found · Awaiting review" opened a dialog with no
// link to the discovered answer or the related Review -- the only visible
// action was "Add what you learned", a dead end that breaks State's own
// workflow (open question -> new evidence -> review -> state update ->
// resolved question). questionDialogHtml() must surface the linked Review
// and a direct path to it whenever one exists.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const question={id:'q-retention',text:'What retention terms apply?',blocking:true,blocks:'Security approval'};
const linkedReview={
  id:'r-retention',status:'pending',resolvesQuestionIds:['q-retention'],
  title:'Retention terms',summary:'Vendor confirmed retention terms',
  evidence:'Slack indicates the client approved a 30-day retention window on September 6.',
  current:'Retention terms are unconfirmed.',proposals:[],
};
const unrelatedReview={id:'r-other',status:'pending',resolvesQuestionIds:['q-other'],evidence:'Unrelated evidence.',summary:'Unrelated',current:'x'};

// linkedReviewFor()
api.state.data.reviews=[unrelatedReview,linkedReview];
check('linkedReviewFor finds the review whose resolvesQuestionIds names this question',
  api.linkedReviewFor('q-retention')?.id==='r-retention');
check('linkedReviewFor returns nothing for a question with no linked review',
  api.linkedReviewFor('q-thresholds')===undefined);

api.state.data.reviews=[{...linkedReview,status:'update'}]; // already resolved, no longer pending
check('linkedReviewFor ignores a review that is no longer pending',
  api.linkedReviewFor('q-retention')===undefined);

// questionDialogHtml() with a linked review must not dead-end on "Add what
// you learned" as the only action -- it must surface the answer and a
// direct path to the Review.
const html=api.questionDialogHtml.length; // sanity: function exists
const dialogWithLink=context.window.STATE_OPEN_ITEMS_VIEW.questionDialogHtml(question,linkedReview);
check('linked-review dialog surfaces the evidence as the found answer',
  dialogWithLink.includes('Slack indicates the client approved a 30-day retention window'));
check('linked-review dialog links directly to the Review',
  dialogWithLink.includes('data-action="open-specific-review"') && dialogWithLink.includes('data-review-id="r-retention"'));
check('linked-review dialog is not just "Add what you learned"',
  !/^[^<]*<div class="dialog-actions"><button[^>]*data-action="answer-question"/.test(dialogWithLink.replace(/\s+/g,' ')));

// Without a linked review, the original "Add what you learned" flow is
// unchanged (this must keep working for a genuinely unanswered question).
const dialogNoLink=context.window.STATE_OPEN_ITEMS_VIEW.questionDialogHtml(question,undefined);
check('question with no linked review still offers "Add what you learned"',
  dialogNoLink.includes('data-action="answer-question"') && dialogNoLink.includes('Add what you learned'));
check('question with no linked review does not claim an answer was found',
  !dialogNoLink.includes('Answer found'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
