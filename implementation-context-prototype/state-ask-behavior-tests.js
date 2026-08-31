const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};
const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:'},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;
let pass=0,fail=0;
function check(name,ok,detail=''){ if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)} }
function route(q){return api.detectAskIntent(q)?.kind || api.findScenario(q)?.id || (api.structuredAskResult(q)?.kind) || 'fallback'}
const routing=[
 ['What is blocking us?','blockers'],['What’s holding us up?','blockers'],['Catch me up','status'],['What decisions are still open?','open'],['What needs review?','pending'],['What have we decided?','decisions'],['How did we get here?','history'],['What is out of scope?','scope'],['How will reps use it?','workflow'],['Who needs to approve this?','stakeholders'],['What are the security guardrails?','security'],['What’s the automation target?','automation'],['Are we targeting 25%?','automation'],['What data do we need?','data'],['What does good look like?','evaluation'],['Are we ready to launch?','readiness'],['Prepare me for the Security meeting','meeting'],['Where are the contradictions?','compare'],['How do we know that?','provenance'],['Who is the vendor contact?','contacts'],['Find the note about feature access','retrieve'],['Turn the current project state into a Slack update','artifact'],['Write a short status update for the support team','artifact'],['What should I review first?','pending'],["What haven't we figured out?",'open'],['Are we trying for 50%?','automation'],['Is 0% the target?','automation'],['What is authoritative?','data'],['How will we evaluate?','evaluation'],['What does Security care about?','security'],['Will Security approve?','unknown-context'],['When is launch?','unknown-context'],['What will ROI be?','unknown-context']
];
routing.forEach(([q,e])=>check(`route: ${q}`,route(q)===e,`got ${route(q)}`));

const smarterRouting=[
 ['Are we on track?','progress-inference'],['Are we behind?','progress-inference'],
 ['Will this pilot succeed?','unknown-context'],['Is this safe?','unknown-context'],
 ['Can we ship?','unknown-context'],['Should we launch?','unknown-context'],
 ['Should we automate this?','unknown-context'],['Can this be autonomous?','unknown-context'],
 ['Which source should we use for feature access?','unknown-context'],
 ['How accurate does it need to be?','unknown-context'],['What are the launch-blocking thresholds?','unknown-context'],
 ['Who signs off?','unknown-context'],['Who makes the final launch decision?','unknown-context'],
 ['What will this cost?','unknown-context'],['What is the budget?','unknown-context'],
 ["What's most important right now?",'unknown-context'],['What should we prioritize?','unknown-context'],
 ['Why did we decide on 50% automation?','premise-correction'],['Did we agree on 0% autonomy?','premise-correction'],
 ["What aren't we doing?",'scope'],["What isn't decided?",'open'],
 ["What's blocking launch and who owns each item?",'blocker-owners'],
 ['What are we building?','status'],['Summarize the project.','status'],['What should we do next?','readiness']
];
smarterRouting.forEach(([q,e])=>check(`smart route: ${q}`,route(q)===e,`got ${route(q)}`));
let b=api.intentAskHtml(api.detectAskIntent('What is blocking us?'));
check('blockers surface unresolved material',/may be blocking or constraining progress/.test(b)&&/Pending Review|Open Question/.test(b));
let slack=api.intentAskHtml(api.detectAskIntent('Turn the current project state into a Slack update'));
let support=api.intentAskHtml(api.detectAskIntent('Write a short status update for the support team'));
check('Slack and Support artifacts differ',slack!==support);
check('Slack is scannable',/<ul>/.test(slack)&&/Slack update/.test(slack));
check('Support update is audience-specific',/Pilot update for Support/.test(support));
let futureApproval=api.intentAskHtml(api.detectAskIntent('Will Security approve?'));
check('future Security approval stays unknown with context',/Future Security approval is not known/.test(futureApproval)&&/What State knows/.test(futureApproval)&&/What would resolve it/.test(futureApproval));
api.state.resultQuery='When is launch?'; let launchUnknown=api.intentAskHtml(api.detectAskIntent(api.state.resultQuery)); check('launch date stays unknown but useful',/no accepted launch date/i.test(launchUnknown)&&/What State knows/.test(launchUnknown)&&/What would resolve it/.test(launchUnknown));
api.state.resultQuery='What will ROI be?'; let roiUnknown=api.intentAskHtml(api.detectAskIntent(api.state.resultQuery)); check('ROI stays unknown without invention',/ROI has not been established/.test(roiUnknown)&&/What that means/.test(roiUnknown)&&/What would resolve it/.test(roiUnknown));

let falsePremise=api.intentAskHtml(api.detectAskIntent('Why did we decide on 50% automation?'));
check('false premise is corrected rather than reinforced',/We did not decide/.test(falsePremise)&&/request did not become a commitment/.test(falsePremise));
let risk=api.intentAskHtml(api.detectAskIntent('Is this safe?'));
check('risk acceptance separates safeguards from approval',/Risk acceptance has not been recorded/.test(risk)&&/should not convert safeguards/.test(risk));
let thresholds=api.intentAskHtml(api.detectAskIntent('How accurate does it need to be?'));
check('evaluation dimensions do not become invented threshold',/thresholds are not established/.test(thresholds)&&/evaluation dimensions are known/.test(thresholds));
let priority=api.intentAskHtml(api.detectAskIntent('What should we prioritize?'));
check('priority answer surfaces impact without inventing ranking',/No explicit priority ranking/.test(priority)&&/direct launch implications/.test(priority));
let owners=api.intentAskHtml(api.detectAskIntent("What's blocking launch and who owns each item?"));
check('compound blocker-owner question preserves ownership uncertainty',/Likely constraints/.test(owners)&&/not fully assigned/.test(owners));
let track=api.intentAskHtml(api.detectAskIntent('Are we on track?'));
check('schedule health does not infer against missing baseline',/cannot honestly say/.test(track)&&/no accepted launch date/.test(track));
let base=api.intentAskHtml(api.detectAskIntent('What is the automation target?'));
check('baseline automation remains unknown',/Not established/.test(base)&&/Unknown is not 0%/.test(base));
const data=api.state.data;
data.notes.unshift({id:'n-test-auto',title:'Leadership pilot target',text:'Leadership confirmed the first pilot should target 25% autonomous resolution.',source:'Leadership',date:'Aug 29',dateISO:'2026-08-29',topics:['automation'],status:'pending'});
data.reviews.unshift({id:'r-test-auto',evidenceId:'n-test-auto',topics:['automation'],status:'pending',title:'Leadership proposed a 25% pilot target',unresolved:'Whether 25% should become the accepted pilot target.'});
let pending=api.intentAskHtml(api.detectAskIntent('Are we targeting 25%?'));
check('pending 25% is not promoted to truth',/Not established/.test(pending)&&/unreviewed information/.test(pending));
let needsReview=api.intentAskHtml(api.detectAskIntent('What needs review?'));
check('pending automation evidence appears in review answer',/25% pilot target/.test(needsReview));
// Accept the controlled mutation: update maintained Current State, preserve history, clear review.
const k=data.knowledge.find(x=>x.id==='k-autonomy'); const before=k.statement;
k.statement='Leadership confirmed the first pilot should target 25% autonomous resolution. Human review remains required for customer-facing responses.'; k.support=['n-test-auto'];
data.reviews.find(x=>x.id==='r-test-auto').status='update'; data.notes.find(x=>x.id==='n-test-auto').status='accepted';
data.history.unshift({id:'h-test-auto',date:'Aug 29',dateISO:'2026-08-29',knowledgeId:'k-autonomy',type:'Automation target established',before,after:k.statement,reason:'Reviewed leadership evidence',decision:'Human chose Update understanding'});
let accepted=api.intentAskHtml(api.detectAskIntent('What is the automation target?'));
check('accepted mutation changes automation answer',/25% autonomous resolution is the accepted pilot target/.test(accepted));
check('accepted review disappears from pending list',!api.intentAskHtml(api.detectAskIntent('What needs review?')).includes('Leadership proposed a 25% pilot target'));
check('history preserves transition',api.intentAskHtml(api.detectAskIntent('How did we get here?')).includes('Automation target established'));
// Regression: unrelated evidence should not alter automation answer.
data.notes.unshift({id:'n-unrelated',title:'Training note',text:'Training deck needs screenshots.',source:'Support',date:'Aug 29',dateISO:'2026-08-29',topics:['operations'],status:'draft'});
check('unrelated note does not alter automation answer',/25% autonomous resolution is the accepted pilot target/.test(api.intentAskHtml(api.detectAskIntent('What is the automation target?'))));
console.log(`\n${pass} passed, ${fail} failed`); if(fail)process.exit(1);
