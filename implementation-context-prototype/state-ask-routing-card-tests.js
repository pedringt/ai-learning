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
];
for(const q of genericQuestions){
  const intent=api.detectAskIntent(q);
  check(`generic questions phrasing detected as "open": "${q}"`, intent?.kind==='open', JSON.stringify(intent));
  const html=api.intentAskHtml(intent);
  check(`"${q}" renders a routing card`, html.includes('ask-routing-card') && html.includes('data-anchor="open-items-questions"'), html.slice(0,120));
}

// A topic qualifier means the person wants an answer scoped to that topic,
// not a raw count -- must NOT route to the generic card.
const topicQualified=[
  'What needs review related to security?',
  'Show unresolved questions about security',
  'What reviews are open on the automation topic?',
];
for(const q of topicQualified){
  const intent=api.detectAskIntent(q);
  check(`topic-qualified phrasing is not routed: "${q}"`, intent?.kind!=='pending' && intent?.kind!=='open', JSON.stringify(intent));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
