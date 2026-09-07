// Regression coverage for a P1 finding from live staging QA (2026-09-07):
// Workspace gave Ask the most prominent placement, with the decisions
// actually waiting on the user (Needs your attention) appearing below it --
// making State read as an AI question box rather than a project-state
// command center. renderOverview() must put attention above Ask on the
// fresh landing view.
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

// Fresh Workspace landing (no active Ask result): attention must render
// before the Ask panel in document order.
api.state.result=null;
api.renderOverview();
const html=stub.innerHTML;
const attentionIndex=html.indexOf('workspace-attention');
const askPanelIndex=html.indexOf('class="ask-panel');
check('workspace-attention renders on the landing view', attentionIndex!==-1, html.slice(0,120));
check('ask-panel renders on the landing view', askPanelIndex!==-1);
check('Needs your attention appears before the Ask panel in document order',
  attentionIndex!==-1 && askPanelIndex!==-1 && attentionIndex<askPanelIndex,
  `attention@${attentionIndex} askPanel@${askPanelIndex}`);

// Once an Ask result is on screen, attention stays hidden -- unchanged
// behavior, just confirming the reorder didn't disturb it.
api.state.result={liveAsk:{headline:'An answer'}};
api.state.resultQuery='some question';
api.renderOverview();
check('attention is hidden while an Ask result is showing', !stub.innerHTML.includes('workspace-attention'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
