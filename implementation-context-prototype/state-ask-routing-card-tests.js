// Coverage for the Ask "routing card" behavior: a generic inventory question
// ("What needs review?", "List every open review") should route to a
// compact Open Items card (count + CTA) instead of a synthesized answer, so
// Ask never becomes a second, potentially-inconsistent source of truth for
// counts the real Open Items view already tracks. A topic-qualified variant
// of the same question ("open items related to security") should NOT route
// -- the person wants an answer scoped to that topic, which is what
// structuredAskResult's topic-filtered branch already provides.
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
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// Generic inventory phrasing routes to the compact card, not a full answer.
const genericReview=[
  'What needs review?',
  'List every open review',
  'Show me the open reviews',
  'Show me pending reviews',
  'What should I approve?',
  'What do I need to approve?',
];
for(const q of genericReview){
  const intent=api.detectAskIntent(q);
  check(`generic review phrasing detected as "pending": "${q}"`, intent?.kind==='pending', JSON.stringify(intent));
  const html=api.intentAskHtml(intent);
  check(`"${q}" renders a routing card`, html.includes('ask-routing-card') && html.includes('data-anchor="open-items-reviews"'), html.slice(0,120));
}

const genericQuestions=[
  'Show unresolved questions',
  'What questions are still open?',
  'List all open questions',
  'List every open question',
  'What still needs answering?',
  'What has not been answered?',
];
for(const q of genericQuestions){
  const intent=api.detectAskIntent(q);
  check(`generic questions phrasing detected as "open": "${q}"`, intent?.kind==='open', JSON.stringify(intent));
  const html=api.intentAskHtml(intent);
  check(`"${q}" renders a routing card`, html.includes('ask-routing-card') && html.includes('data-anchor="open-items-questions"'), html.slice(0,120));
}

const genericBlockers=[
  'What needs my attention?',
  'What requires attention?',
];
for(const q of genericBlockers){
  const intent=api.detectAskIntent(q);
  check(`generic attention phrasing detected as "blockers": "${q}"`, intent?.kind==='blockers', JSON.stringify(intent));
  const html=api.intentAskHtml(intent);
  check(`"${q}" renders a routing card`, html.includes('ask-routing-card') && html.includes('data-anchor="open-items-blockers"'), html.slice(0,120));
}

// A topic qualifier means the person wants an answer scoped to that topic,
// not a raw count -- must NOT route to the generic card.
const topicQualified=[
  'What needs review related to security?',
  'Show unresolved questions about security',
  'What reviews are open on the automation topic?',
  'What needs my attention on the security review?',
];
for(const q of topicQualified){
  const intent=api.detectAskIntent(q);
  check(`topic-qualified phrasing is not routed: "${q}"`, !['pending','open','blockers'].includes(intent?.kind), JSON.stringify(intent));
}

// "What changed?" and "Show current project state" are deliberately left as
// normal Ask answers (History/Current State), not converted to a routing
// card in this pass -- those already render a synthesized, information-rich
// answer (context-app.js's 'history'/'status' kinds), and misrouting
// well-tested existing behavior carries more risk than the reviews/questions
// cases above, which had no comparable synthesized answer to lose.
check('"What changed?" is left as a normal answer, not a routing card', api.detectAskIntent('What changed?')?.kind!=='pending' && api.detectAskIntent('What changed?')?.kind!=='open' && api.detectAskIntent('What changed?')?.kind!=='blockers');

// The routing card's CTA sets window.__stateScrollAnchor and navigates to
// Open Items, which renderOpenItems() consumes to force-expand the target
// section. openItemSections.questions starts out `null` (not `false`), and
// Open Questions defaults to collapsed once there are more than 5 -- a
// force-expand that only fires on a truthy stored value (an earlier version
// of this fix) leaves `null` alone and the section stays collapsed.
context.window.__stateScrollAnchor='open-items-questions';
api.state.data.questions=Array.from({length:8},(_,i)=>({id:`q-anchor-test-${i}`,text:`Test question ${i}`,status:'open',blocking:false,origin:'test'}));
check('openItemSections.questions starts null (the default-collapse case)', api.state.openItemSections.questions===null);
api.renderOpenItems();
check('routing anchor force-expands Open Questions even from the null default', api.state.openItemSections.questions===false);
check('the scroll anchor is consumed after use', context.window.__stateScrollAnchor===undefined);
check('"Show current project state" is left as a normal answer, not a routing card', !['pending','open','blockers'].includes(api.detectAskIntent('Show current project state')?.kind));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
