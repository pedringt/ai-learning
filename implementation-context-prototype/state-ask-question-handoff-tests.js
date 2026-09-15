const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const context={window:{},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask-question-handoff.js'),'utf8'),context);
const api=context.window.STATE_ASK_QUESTION_HANDOFF_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

check('test API is exposed',!!api);

const answerable='The approved launch date is October 12, according to Current State.';
check('answerable Ask response does not offer a Question handoff',api.handoffFor('When is launch?',answerable,[]).kind===null);

const unanswerable='State does not currently have enough information to answer this.';
const add=api.handoffFor('Which vendor owns the migration?',unanswerable,[]);
check('unanswerable Ask response offers Add as Question',add.kind==='add',JSON.stringify(add));
check('Add handoff preserves the Ask query for prefilling',add.query==='Which vendor owns the migration?',add.query);
const addHtml=api.handoffMarkup(add);
check('Add handoff explains that Current State will not change',addHtml.includes('does not change Current State'),addHtml);
check('Add handoff requires an explicit button click',addHtml.includes('data-ask-question-handoff="add"'),addHtml);

const exact=[{id:'q-1',text:'Which vendor owns the migration?',status:'open'}];
const exactDecision=api.handoffFor('Which vendor owns the migration?',unanswerable,exact);
check('exact open Question is surfaced instead of duplicate creation',exactDecision.kind==='existing'&&exactDecision.question.id==='q-1',JSON.stringify(exactDecision));
check('existing Question handoff links to that Question',api.handoffMarkup(exactDecision).includes('data-question-id="q-1"'));

const near=[{id:'q-2',text:'Which migration vendor owns this work?',status:'open'}];
const nearDecision=api.handoffFor('Which vendor owns the migration work?',unanswerable,near);
check('conservative near-duplicate wording reuses an open Question',nearDecision.kind==='existing'&&nearDecision.question.id==='q-2',JSON.stringify(nearDecision));

const different=[{id:'q-3',text:'What is the migration deadline?',status:'open'}];
check('different open Question does not suppress the new handoff',api.handoffFor('Which vendor owns the migration?',unanswerable,different).kind==='add');

const closed=[{id:'q-4',text:'Which vendor owns the migration?',status:'stopped'}];
check('closed/stopped matching Question does not count as an existing open Question',api.handoffFor('Which vendor owns the migration?',unanswerable,closed).kind==='add');

for(const wording of [
  'There is not enough project context to determine that.',
  'State cannot reliably answer this from the current project record.',
  'No relevant project records were found.',
  'State does not currently know who owns that decision.'
]){
  check(`recognized unanswerable wording: ${wording}`,api.isUnanswerableAnswer(wording));
}

check('ordinary uncertainty is not treated as a dead-end Ask response',!api.isUnanswerableAnswer('There is an open Question about the vendor, so this is not settled yet.'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
