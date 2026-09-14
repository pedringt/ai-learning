// Deterministic coverage for state.md #107: decision-specific Review wording,
// the Adjust dialog, and grouped/retirement edge cases in reviewCard() /
// adjustDialogHtml(). Same lightweight vm harness as
// state-question-review-handoff-tests.js -- exercises the pure
// rendering/classification layer (reviewCard, adjustDialogHtml), not the
// async accept/adjust network flow, which is covered by
// test_review_adjustment_provenance.py and test_api.py on the backend and by
// manual/live browser verification for the full click-through experience.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};
const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
const openItems=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// --- 1. Normal Current State update (single proposal) ----------------------
const normalReview={
  id:'r-normal',status:'pending',reviewType:'proposed_update',summary:'Move launch date?',
  current:'Launch is October 1.',proposed:'Launch is October 15.',
  evidence:'Security review moved the launch.',establishes:'The launch date changed.',
  proposals:[{id:'p-launch',operation:'update',state_item_id:'k-launch',proposed_statement:'Launch is October 15.'}],
};
const normalHtml=openItems.reviewCard(normalReview,true,false);
check('normal update review shows Update Current State, Adjust, and Leave unchanged',
  normalHtml.includes('>Update Current State<') && normalHtml.includes('>Adjust<') && normalHtml.includes('>Leave unchanged<'));
check('normal update review\'s Adjust button targets the right review',
  normalHtml.includes('data-action="open-adjust-review" data-review="r-normal"'));

// --- 2. Adjust dialog for that same review ----------------------------------
const adjustHtml=openItems.adjustDialogHtml(normalReview);
check('adjust dialog shows the original AI proposal text plainly',
  adjustHtml.includes('State proposed') && adjustHtml.includes('Launch is October 15.'));
check('adjust dialog pre-fills an editable textarea with the AI text',
  /<textarea id="adjust-p-launch"[^>]*>Launch is October 15\.<\/textarea>/.test(adjustHtml));
check('adjust dialog frames this as correcting interpretation, not editing Current State directly',
  adjustHtml.includes('not a direct edit to Current State'));
check('adjust dialog submits via confirm-review-adjust, not a second confirmation step',
  adjustHtml.includes('data-action="confirm-review-adjust" data-review="r-normal"') && !adjustHtml.includes('data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-review-update"'));

// --- 3. Leave unchanged is always present and labeled plainly ---------------
check('Leave unchanged uses the existing review-keep action (no new backend concept needed)',
  normalHtml.includes('data-action="review-keep" data-review="r-normal">Leave unchanged<'));

// --- 4. state_at_risk / uncertainty-only Review -----------------------------
const riskReview={
  id:'r-risk',status:'pending',reviewType:'state_at_risk',summary:'Is the vendor claim still reliable?',
  current:'Vendor confirms no training on customer content.',evidence:'Legal flagged a possible contract conflict.',
  establishes:'Legal has not reached a conclusion.',proposals:[],
};
const riskHtml=openItems.reviewCard(riskReview,true,false);
check('state_at_risk review does not show Update/Adjust/Leave unchanged',
  !riskHtml.includes('data-action="review-update"') && !riskHtml.includes('data-action="open-adjust-review"') && !riskHtml.includes('data-action="review-keep"'));
check('state_at_risk review does not fall back to a generic Mark reviewed label',
  !riskHtml.includes('>Mark reviewed<'));
check('state_at_risk review offers its own real decision, phrased domain-neutrally (#111)',
  riskHtml.includes('>Keep tracking<') && riskHtml.includes('>Dismiss concern<'));
check('state_at_risk actions map to acknowledge-risk/dismiss-risk data-actions',
  riskHtml.includes('data-action="review-acknowledge-risk" data-review="r-risk"') && riskHtml.includes('data-action="review-dismiss-risk" data-review="r-risk"'));

// --- 5. Existing Question potentially answered ------------------------------
// A proposed_update that would also resolve an open Question stays on the
// ordinary Update/Adjust/Leave-unchanged path -- #107 doesn't invent a 4th
// control for this; the compound consequence is informational context, not
// a separate button (Leave-unchanged's optional Question follow-up lives in
// context-app.js and needs a live/mocked API, covered by manual QA below).
const answersQuestionReview={
  ...normalReview,id:'r-answers-question',resolvesQuestionIds:['q-retention'],
};
const answersQuestionHtml=openItems.reviewCard(answersQuestionReview,true,false);
check('a Review that would also resolve a Question still uses the ordinary three actions',
  answersQuestionHtml.includes('>Update Current State<') && answersQuestionHtml.includes('>Adjust<') && answersQuestionHtml.includes('>Leave unchanged<'));

// --- 6. New Question suggestion (open_question) is unchanged ---------------
const questionReview={
  id:'r-question',status:'pending',reviewType:'open_question',summary:'Track a new unknown?',
  questionToCreate:{id:'qp-1',status:'pending',text:'Who owns provider-outage fallback?'},
  current:'Current State will stay unchanged. This Review is about tracking an unknown.',
  evidence:'Ops flagged no fallback owner.',establishes:'No owner or process exists yet.',
  proposals:[],
};
const questionHtml=openItems.reviewCard(questionReview,true,false);
check('open_question review keeps its bespoke Create Question / Dismiss suggestion actions',
  questionHtml.includes('>Create Question<') && questionHtml.includes('>Dismiss suggestion<'));
check('open_question review is never treated as checkOnly (no acknowledge/dismiss-risk actions)',
  !questionHtml.includes('data-action="review-acknowledge-risk"') && !questionHtml.includes('data-action="review-dismiss-risk"'));

// --- 7. Stale Review: rendering itself doesn't change; a stale accept fails
// safely at the API layer (test_review_adjustment_provenance.py's
// test_stale_version_blocks_an_adjusted_acceptance, test_api.py, and
// context-app.js's executeReviewDecision catch block, which restores
// r.status and shows "Nothing was changed." -- not re-tested here since it
// requires a live/mocked network call, out of scope for this pure-rendering
// harness).

// --- 8. Grouped Review with more than one proposal --------------------------
const groupedReview={
  id:'r-grouped',status:'pending',reviewType:'proposed_update',summary:'Security approval bundle',
  current:'Retention and access are unset.',
  proposed:'Retention is 30 days. • Access is five named agents.',
  evidence:'Security approved both together.',establishes:'One security review approved both.',
  proposals:[
    {id:'p-retention',operation:'update',state_item_id:'k-data',proposed_statement:'Retention is 30 days.'},
    {id:'p-access',operation:'update',state_item_id:'k-security',proposed_statement:'Access is five named agents.'},
  ],
};
const groupedHtml=openItems.reviewCard(groupedReview,true,false);
check('grouped review still shows exactly one set of Update/Adjust/Leave-unchanged actions (no partial acceptance UI)',
  (groupedHtml.match(/data-action="review-update"/g)||[]).length===1 &&
  (groupedHtml.match(/data-action="open-adjust-review"/g)||[]).length===1 &&
  (groupedHtml.match(/data-action="review-keep"/g)||[]).length===1);
const groupedAdjustHtml=openItems.adjustDialogHtml(groupedReview);
check('grouped review\'s Adjust dialog shows one editable block per proposal',
  groupedAdjustHtml.includes('id="adjust-p-retention"') && groupedAdjustHtml.includes('id="adjust-p-access"'));
check('grouped Adjust dialog preserves each proposal\'s own AI text distinctly',
  groupedAdjustHtml.includes('Retention is 30 days.') && groupedAdjustHtml.includes('Access is five named agents.'));

// A retirement has no wording to adjust -- Adjust must be disabled (not
// absent: state.md QA follow-up 2026-09-14, a vanishing button read as
// confusing/broken) for a Review whose only proposal is a retire, and a
// retire mixed into a grouped Review must not get its own (nonsensical)
// editable block.
const retireOnlyReview={
  ...normalReview,id:'r-retire-only',
  proposals:[{id:'p-retire',operation:'retire',state_item_id:'k-old',proposed_statement:'Old statement being retired.'}],
};
const retireOnlyHtml=openItems.reviewCard(retireOnlyReview,true,false);
check('a retire-only review shows Adjust disabled, not absent',
  retireOnlyHtml.includes('data-action="open-adjust-review"') && /data-action="open-adjust-review"[^>]*\sdisabled/.test(retireOnlyHtml));
check('a retire-only review still offers Update Current State and Leave unchanged',
  retireOnlyHtml.includes('>Update Current State<') && retireOnlyHtml.includes('>Leave unchanged<'));

const mixedReview={
  ...normalReview,id:'r-mixed',
  proposals:[
    {id:'p-keep-editable',operation:'update',state_item_id:'k-data',proposed_statement:'Retention is 30 days.'},
    {id:'p-retire-mixed',operation:'retire',state_item_id:'k-old',proposed_statement:'Old statement being retired.'},
  ],
};
const mixedAdjustHtml=openItems.adjustDialogHtml(mixedReview);
check('a mixed grouped review\'s Adjust dialog shows the editable proposal but not the retirement',
  mixedAdjustHtml.includes('id="adjust-p-keep-editable"') && !mixedAdjustHtml.includes('id="adjust-p-retire-mixed"'));

console.log(`\n${pass} passed, ${fail} failed`); if(fail)process.exit(1);
