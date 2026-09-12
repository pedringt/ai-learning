// Regression coverage for Workspace's layout hierarchy.
//
// P1 finding (2026-09-07 live staging QA): Workspace gave Ask the most
// prominent placement, with the decisions actually waiting on the user
// (Needs your attention) appearing below it -- making State read as an AI
// question box rather than a project-state command center.
//
// 2026-09-07 UX review batch: Ask's inline Workspace instance was removed
// entirely in favor of the global read-only Ask State drawer/launcher
// (context-product-polish.js) -- Workspace itself no longer renders Ask at
// all. Needs your attention stays full-width at the top; Recently Updated
// and the Project Status card sit below it in a two-column row.
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

// Fresh Workspace landing: attention must render before the below-grid
// (Recently Updated + Project Status) in document order, and Ask must not
// render inline in Workspace at all.
api.state.result=null;
api.renderOverview();
const html=stub.innerHTML;
const attentionIndex=html.indexOf('workspace-attention');
const gridIndex=html.indexOf('workspace-below-grid');
check('workspace-attention renders on the landing view', attentionIndex!==-1, html.slice(0,120));
check('workspace-below-grid (Recently Updated + Project Status) renders on the landing view', gridIndex!==-1);
check('Needs your attention appears before the below-grid in document order',
  attentionIndex!==-1 && gridIndex!==-1 && attentionIndex<gridIndex,
  `attention@${attentionIndex} grid@${gridIndex}`);
check('Workspace no longer renders an inline ask-panel', !html.includes('class="ask-panel'));

// Attention is rendered natively and stays authoritative regardless of the
// legacy state.result field -- the old "hide attention while Ask has a
// result" patchwork depended on an inline Ask flow that no longer exists.
api.state.result={liveAsk:{headline:'An answer'}};
api.state.resultQuery='some question';
api.renderOverview();
check('attention keeps rendering even if the legacy state.result field is set', stub.innerHTML.includes('workspace-attention'));

// Regression coverage for a logic-review finding (2026-09-07): the Current
// State card's open-questions row conflated "any open question" with
// "blocking progress" ("Waiting on a decision." / "Nothing blocking
// progress."), and labeled the Current State item count "N decisions
// recorded" even though Current State holds facts/constraints/scope/
// outcomes, not just decisions.
api.state.result=null;
// currentStateHtml() only renders real counts once state/questions/history
// backend sources report 'loaded' -- otherwise it shows '…'/"Loading…"
// placeholders. The assertions below check the loaded copy, so hydration
// must be marked complete first.
api.state.backendStatus.state='loaded';
api.state.backendStatus.questions='loaded';
api.state.backendStatus.history='loaded';

// Open questions exist, none are blocking -- must not claim anything is
// blocking progress.
api.state.data.questions=[
  {id:'q-1',status:'open',blocking:false,text:'Non-blocking question one'},
  {id:'q-2',status:'open',blocking:false,text:'Non-blocking question two'},
];
api.renderOverview();
let html2=stub.innerHTML;
check('open questions with none blocking says so explicitly', html2.includes('None are currently blocking progress.'));
check('open questions with none blocking does not say "Waiting on a decision"', !html2.includes('Waiting on a decision'));
check('the open-question count is shown', html2.includes('2 open questions'));

// Some open questions are blocking -- the count shown must be the blocking
// count, not the total open count.
api.state.data.questions=[
  {id:'q-1',status:'open',blocking:true,text:'Blocking question'},
  {id:'q-2',status:'open',blocking:false,text:'Non-blocking question'},
  {id:'q-3',status:'open',blocking:false,text:'Another non-blocking question'},
];
api.renderOverview();
html2=stub.innerHTML;
check('the blocking count (1), not the total open count (3), is what\'s reported as blocking',
  html2.includes('1 is currently blocking progress.'));
check('total open questions (3) is still the headline count', html2.includes('3 open questions'));

// Current State items are described as established understanding, not
// "decisions" -- Current State holds facts, constraints, scope, and
// outcomes, not only decisions.
check('Current State item count is not labeled "decisions recorded"', !html2.includes('decision') || !html2.includes('recorded'));
check('Current State item count uses "established" language instead', /\d+ established facts?/.test(html2), html2.match(/\d+ established[^<]*/)?.[0]);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
