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
const openItems=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const question={id:'q-retention',text:'What retention terms apply?',blocking:true,blocks:'Security approval'};
const linkedReview={
  id:'r-retention',status:'pending',resolvesQuestionIds:['q-retention'],
  title:'Retention terms',summary:'Vendor confirmed retention terms',
  evidence:'Slack indicates the client approved a 30-day retention window on September 6.',
  current:'Retention terms are unconfirmed.',proposals:[],reviewType:'missing_understanding',
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
const dialogWithLink=openItems.questionDialogHtml(question,linkedReview);
check('linked-review dialog surfaces the evidence as the found answer',
  dialogWithLink.includes('Slack indicates the client approved a 30-day retention window'));
check('linked-review dialog links directly to the Review',
  dialogWithLink.includes('data-action="open-specific-review"') && dialogWithLink.includes('data-review-id="r-retention"'));
check('linked-review dialog names a question-only Review as an answer review',
  dialogWithLink.includes('Review answer →') && !dialogWithLink.includes('Review proposed update →'));
check('linked-review dialog is not just "Add what you learned"',
  !/^[^<]*<div class="dialog-actions"><button[^>]*data-action="answer-question"/.test(dialogWithLink.replace(/\s+/g,' ')));

// Without a linked review, the original "Add what you learned" flow is
// unchanged (this must keep working for a genuinely unanswered question).
const dialogNoLink=openItems.questionDialogHtml(question,undefined);
check('question with no linked review still offers "Add what you learned"',
  dialogNoLink.includes('data-action="answer-question"') && dialogNoLink.includes('Add what you learned'));
check('question with no linked review does not claim an answer was found',
  !dialogNoLink.includes('Answer found'));

// Review actions must describe the effect of the human decision, not imply
// that already-saved Evidence is being accepted into the system.
const proposedReview={
  id:'r-proposed',status:'pending',reviewType:'proposed_update',summary:'Move launch date?',
  current:'Launch is October 1.',proposed:'Launch is October 15.',evidence:'Security review moved the launch.',
  establishes:'The launch date changed.',doesNot:'Nothing changes until approved.',
  proposals:[{operation:'update',state_item_id:'state-launch',proposed_statement:'Launch is October 15.'}],
  resolvesQuestionIds:[],
};
const proposedUi=openItems.reviewDecisionUi(proposedReview);
check('proposed State change uses explicit Current State actions',
  proposedUi.primary==='Update Current State' && proposedUi.secondary==='Keep Current State',JSON.stringify(proposedUi));
const proposedHtml=openItems.reviewCard(proposedReview,true,false);
check('proposed State change explains the consequence',
  proposedHtml.includes('This will update Current State.') && proposedHtml.includes('>Update Current State<') && proposedHtml.includes('>Keep Current State<'));
check('proposed State change no longer says Accept as reviewed evidence',
  !proposedHtml.includes('Accept as reviewed evidence') && !proposedHtml.includes('Update understanding'));

const questionOnlyUi=openItems.reviewDecisionUi(linkedReview);
check('question-only Review uses confirm/open-question actions',
  questionOnlyUi.primary==='Confirm answer' && questionOnlyUi.secondary==='Keep question open',JSON.stringify(questionOnlyUi));
const questionOnlyHtml=openItems.reviewCard(linkedReview,true,false);
check('question-only Review says Current State will not change',
  questionOnlyHtml.includes('Confirming this will resolve 1 open question. Current State will not change.') && questionOnlyHtml.includes('>Confirm answer<') && questionOnlyHtml.includes('>Keep question open<'));

const riskReview={
  id:'r-risk',status:'pending',reviewType:'state_at_risk',summary:'Can we still trust the vendor policy?',
  current:'Vendor content is not used for model training.',evidence:'Legal says the contract language may conflict with that claim.',
  establishes:'Current understanding may no longer be reliable.',doesNot:'No replacement policy is established.',
  proposals:[],resolvesQuestionIds:[],
};
const riskUi=openItems.reviewDecisionUi(riskReview);
check('state-at-risk Review does not expose a misleading affirmative resolution',
  riskUi.primary===null && riskUi.secondary==='Keep Current State' && /Leave this Review open/.test(riskUi.leaveOpen||''),JSON.stringify(riskUi));
const riskHtml=openItems.reviewCard(riskReview,true,false);
check('state-at-risk Review tells the reviewer why it remains open',
  riskHtml.includes('raises uncertainty but does not establish a replacement') && riskHtml.includes('Leave this Review open if more evidence is needed.') && !riskHtml.includes('data-action="review-update"'));

const reviewedOnly={
  id:'r-info-1',status:'pending',reviewType:'state_at_risk',summary:'Record this context?',
  current:'No Current State change is proposed.',evidence:'Useful contextual information.',establishes:'Context only.',
  proposals:[],resolvesQuestionIds:[],
};
const reviewedOnlyUi=openItems.reviewDecisionUi({...reviewedOnly,reviewType:'informational'});
check('fallback no-State-change Review uses Mark reviewed rather than Accept evidence',
  reviewedOnlyUi.primary==='Mark reviewed' && reviewedOnlyUi.consequence.includes('Current State will not change'));

// Regression coverage for a second bug found in a live-testing logic review
// (2026-09-07): mapApiReview() used to accept a caller-supplied
// `resolvesQuestionId` as a fallback whenever the backend's own
// resolves_question_ids came back empty. The one real caller of that
// fallback was the "submit an answer to this Question" flow, which passed
// the Question's own id -- meaning any Review returned from evidence
// submitted through the Question UI got treated as resolving that Question
// regardless of what the backend actually determined. mapApiReview() must
// only ever reflect the backend's own resolves_question_ids, never infer a
// relationship from where the Evidence came from.
const backendReviewNoResolution={id:'review_x1',review_type:'state_at_risk',decision_question:'Does this change anything?',evidence_content:'Some answer text.',resolves_question_ids:[]};
const mappedNoResolution=api.mapApiReview(backendReviewNoResolution,'Some answer text.');
check('a backend review with an empty resolves_question_ids is never treated as resolving a question, even from the answer-a-question flow',
  mappedNoResolution.resolvesQuestionIds.length===0 && !mappedNoResolution.resolvesQuestionId,
  JSON.stringify({resolvesQuestionIds:mappedNoResolution.resolvesQuestionIds,resolvesQuestionId:mappedNoResolution.resolvesQuestionId}));

const backendReviewWithResolution={id:'review_x2',review_type:'proposed_update',decision_question:'Does this resolve it?',evidence_content:'A real answer.',resolves_question_ids:['q-retention']};
const mappedWithResolution=api.mapApiReview(backendReviewWithResolution,'A real answer.');
check('a backend review that DOES return resolves_question_ids is still correctly mapped',
  mappedWithResolution.resolvesQuestionIds.includes('q-retention') && mappedWithResolution.resolvesQuestionId==='q-retention');

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
