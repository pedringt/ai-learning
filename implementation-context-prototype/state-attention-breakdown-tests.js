// Regression coverage for a real bug found in live testing (2026-09-07):
// Workspace's "Needs your attention" breakdown line said "N blocking
// questions" using the full uncapped blockers count, while the attention
// list underneath only ever renders up to 2 rows total (reviews claim
// those slots first) -- so the heading could claim 3 blocking questions
// while showing 0 or 1. Fixed in workspaceAttentionHtml() (context-app.js)
// to describe exactly what's rendered, with an explicit "+N more in Open
// Items" note when items are truncated, instead of a silent mismatch.
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

function countOccurrences(html,className){
  return (html.match(new RegExp(`class="attention-item [^"]*${className}`,'g'))||[]).length;
}

// 3 open blocking questions, 0 reviews: only 2 slots exist total, so only 2
// blocker rows can render even though all 3 are genuinely blocking.
api.state.data.reviews=[];
api.state.data.questions=[
  {id:'q-1',status:'open',blocking:true,text:'Blocker one',blocks:'launch'},
  {id:'q-2',status:'open',blocking:true,text:'Blocker two',blocks:'launch'},
  {id:'q-3',status:'open',blocking:true,text:'Blocker three',blocks:'launch'},
];
api.state.result=null;
api.renderOverview();
let html=stub.innerHTML;
const renderedBlockers=countOccurrences(html,'blocker');
check('at most 2 attention rows render even with 3 blocking questions', renderedBlockers<=2, `rendered ${renderedBlockers}`);
const claimedCount=(html.match(/(\d+) blocking question/)||[])[1];
check('the breakdown text never claims more blocking questions than are actually rendered as rows',
  claimedCount===null || Number(claimedCount)<=renderedBlockers,
  `claimed ${claimedCount}, rendered ${renderedBlockers}`);
check('a "+N more" note appears when items are truncated', html.includes('more in Open Items'), html);

// 2 reviews + 1 blocker: reviews claim both slots, so the blocker gets
// pushed out entirely -- the breakdown must not claim "1 blocking question"
// while zero blocker rows render.
api.state.data.reviews=[
  {id:'r-1',status:'pending',summary:'Review one'},
  {id:'r-2',status:'pending',summary:'Review two'},
];
api.state.data.questions=[
  {id:'q-1',status:'open',blocking:true,text:'Blocker one',blocks:'launch'},
];
api.renderOverview();
html=stub.innerHTML;
const renderedBlockers2=countOccurrences(html,'blocker');
check('reviews claiming both slots means zero blocker rows render', renderedBlockers2===0, `rendered ${renderedBlockers2}`);
check('the breakdown does not claim a blocking question exists with nothing shown for it',
  !/\d+ blocking question/.test(html) || renderedBlockers2>0);
check('the truncation note covers the hidden blocker in this case too', html.includes('more in Open Items'), html);

// 1 review, 1 blocker, both fit -- no truncation, no "+N more" note needed.
api.state.data.reviews=[{id:'r-1',status:'pending',summary:'Review one'}];
api.state.data.questions=[{id:'q-1',status:'open',blocking:true,text:'Blocker one',blocks:'launch'}];
api.renderOverview();
html=stub.innerHTML;
check('everything that fits renders without a truncation note', !html.includes('more in Open Items'), html);
check('the single blocking question is both counted and rendered as a row', /1 blocking question/.test(html) && countOccurrences(html,'blocker')===1);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
