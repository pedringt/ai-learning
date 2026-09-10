// Regression coverage for Review/Question handoff semantics. These tests keep
// the UI aligned with State's authority model: Evidence already exists;
// human Review authorizes a consequence (State update, Question resolution,
// or no change) rather than "accepting Evidence" into the system.
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

api.state.data.reviews=[{...linkedReview,status:'update'}];
check('linkedReviewFor ignores a review that is no longer pending',
  api.linkedReviewFor('q-retention')===undefined);

// A linked question-only Review surfaces the found answer and accurately says
// that confirming it resolves the Question without changing Current State.
const dialogWithLink=openItems.questionDialogHtml(question,linkedReview);
check('linked-review dialog surfaces the evidence as the found answer',
  dialogWithLink.includes('Slack indicates the client approved a 30-day retention window'));
check('linked-review dialog links directly to the Review',
  dialogWithLink.includes('data-action="open-specific-review"') && dialogWithLink.includes('data-review-id="r-retention"'));
check('linked-review dialog names a question-only Review as an answer review',
  dialogWithLink.includes('Review answer →') && !dialogWithLink.includes('Review proposed update →'));
check('question-only dialog says the Question stays open until confirmation and State will not change',
  dialogWithLink.includes('The question stays open until you confirm the answer. Current State will not change.'));

// Without a linked Review, the original evidence-submission path remains.
const dialogNoLink=openItems.questionDialogHtml(question,undefined);
check('question with no linked review still offers "Add what you learned"',
  dialogNoLink.includes('data-action="answer-question"') && dialogNoLink.includes('Add what you learned'));
check('question with no linked review does not claim an answer was found',
  !dialogNoLink.includes('Answer found'));

// Proposed Current State change.
const proposedReview={
  id:'r-proposed',status:'pending',reviewType:'proposed_update',summary:'Move launch date?',
  current:'Launch is October 1.',proposed:'Launch is October 15.',evidence:'Security review moved the launch.',
  establishes:'The launch date changed.',doesNot:'Nothing changes until approved.',
  proposals:[{operation:'update',state_item_id:'state-launch',proposed_statement:'Launch is October 15.'}],
  resolvesQuestionIds:[],
};
const proposedUi=openItems.reviewDecisionUi(proposedReview);
check('proposed State change uses explicit Current State actions',
  proposedUi.primary==='Update Current State' && proposedUi.primaryAction==='review-update' && proposedUi.secondary==='Keep Current State',JSON.stringify(proposedUi));
const proposedHtml=openItems.reviewCard(proposedReview,true,false);
check('proposed State change explains the consequence',
  proposedHtml.includes('This will update Current State.') && proposedHtml.includes('>Update Current State<') && proposedHtml.includes('>Keep Current State<'));
check('proposed State change no longer says Accept as reviewed evidence',
  !proposedHtml.includes('Accept as reviewed evidence') && !proposedHtml.includes('Update understanding'));

// Question-only Review.
const questionOnlyUi=openItems.reviewDecisionUi(linkedReview);
check('question-only Review uses consequence-specific action handlers',
  questionOnlyUi.primary==='Confirm answer' && questionOnlyUi.primaryAction==='review-confirm-answer' && questionOnlyUi.secondaryAction==='review-keep-question',JSON.stringify(questionOnlyUi));
const questionOnlyHtml=openItems.reviewCard(linkedReview,true,false);
check('question-only Review says Current State will not change',
  questionOnlyHtml.includes('Confirming this will resolve 1 open question. Current State will not change.') && questionOnlyHtml.includes('>Confirm answer<') && questionOnlyHtml.includes('>Keep question open<'));
check('question-only Review routes through specialized question actions rather than legacy generic Review handling',
  questionOnlyHtml.includes('data-action="review-confirm-answer"') && questionOnlyHtml.includes('data-action="review-keep-question"'));

// Proposal + Question: changing State and resolving the Question is still one
// consequential State-update path.
const proposedQuestionReview={...proposedReview,resolvesQuestionIds:['q-retention']};
const proposedQuestionUi=openItems.linkedReviewQuestionUi(proposedQuestionReview);
check('proposal-linked Question keeps the Current-State-pending explanation',
  proposedQuestionUi.action==='Review proposed update →' && proposedQuestionUi.detail.includes('Current State has not changed yet'));

// state_at_risk must take precedence over Question resolution when there is no
// replacement proposal, otherwise backend accept would record confirmed_current
// for a Review whose whole point is that Current State may be unreliable.
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

const riskLinked={...riskReview,resolvesQuestionIds:['q-retention']};
const riskLinkedUi=openItems.reviewDecisionUi(riskLinked);
const riskQuestionUi=openItems.linkedReviewQuestionUi(riskLinked);
const riskDialog=openItems.questionDialogHtml(question,riskLinked);
check('state-at-risk takes precedence even when backend linked it to a Question',
  riskLinkedUi.primary===null && riskLinkedUi.secondary==='Keep Current State' && !riskLinkedUi.primaryAction,JSON.stringify(riskLinkedUi));
check('Question linked to state-at-risk is framed as uncertainty, not an answer',
  riskQuestionUi.action==='Review uncertainty →' && riskQuestionUi.kicker==='Uncertainty found · Awaiting review' && riskDialog.includes('Review uncertainty →') && !riskDialog.includes('Answer found'));

// A zero-proposal missing_understanding Review with no linked Question has no
// concrete decision to authorize. It must stay open instead of accepting into
// backend confirmed_current just to clear the queue.
const missingNoOutcome={
  id:'r-missing',status:'pending',reviewType:'missing_understanding',summary:'What is the authoritative system?',
  current:'No authoritative source is established.',evidence:'The team confirmed the old source is insufficient.',
  establishes:'More information is required.',doesNot:'No replacement source is established.',proposals:[],resolvesQuestionIds:[],
};
const missingUi=openItems.reviewDecisionUi(missingNoOutcome);
const missingHtml=openItems.reviewCard(missingNoOutcome,true,false);
check('zero-proposal missing-understanding has no fake completion action',
  missingUi.primary===null && missingUi.secondary===null && /Leave this Review open/.test(missingUi.leaveOpen||''),JSON.stringify(missingUi));
check('zero-proposal missing-understanding renders guidance but no mutation/keep buttons',
  missingHtml.includes('Leave this Review open and add Evidence when more is known.') && !missingHtml.includes('data-action="review-update"') && !missingHtml.includes('data-action="review-keep"'));

// mapApiReview must only reflect explicit backend Question links.
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
