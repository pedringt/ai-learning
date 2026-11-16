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
const badge={textContent:'',hidden:true,setAttribute(){}};
const document={getElementById(id){return stub},querySelectorAll(sel){return String(sel).includes('#openItemsActionCount')?[badge]:[]},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
context.window.STATE_API=null;
for(const file of ['context-app-dialogs.js','context-app-navigation.js','context-app-hydration.js','context-app-review-actions.js','context-app.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
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

// #685 (prod QA, Nov 16): the Workspace said "10 items are waiting on you" while the Open Items badge said 11,
// because the Workspace left out the bundled DEC-026 re-check entry. Both must count the same things.
const flagged=(id,needsRecheck)=>({id,state:'current',projectArea:'workflow',areaName:'Scope',areaSortOrder:10,title:id,statement:id,needsRecheck});
function workspaceTotal(){api.renderOverview();const m=stub.innerHTML.match(/(\d+) items? (?:is|are) waiting on you/);return m?Number(m[1]):0;}
function navTotal(){api.updateNav();return Number(badge.textContent||0);}
const manyReviews=[1,2,3,4,5,6,7].map(i=>({id:`r-${i}`,status:'pending',summary:`Review ${i}`}));
const threeBlockers=[1,2,3].map(i=>({id:`q-${i}`,status:'open',blocking:true,text:`Blocker ${i}`,blocks:'launch'}));
for(const [label,reviews,questions,knowledge] of [
  ['Northstar shape: 7 Reviews, 2 items to re-check, 3 blockers',manyReviews,threeBlockers,[flagged('a',true),flagged('b',true),flagged('c',false)]],
  ['no re-check items',manyReviews,threeBlockers,[flagged('c',false)]],
  ['re-check only',[],[],[flagged('a',true)]],
  ['1 Review, re-check, 1 blocker',[manyReviews[0]],[threeBlockers[0]],[flagged('a',true)]],
]){
  api.state.data.reviews=reviews;api.state.data.questions=questions;api.state.data.knowledge=knowledge;
  const w=workspaceTotal(), n=navTotal();
  check(`Workspace count equals the Open Items badge (${label})`, w===n, `workspace ${w}, badge ${n}`);
}
api.state.data.reviews=manyReviews;api.state.data.questions=threeBlockers;api.state.data.knowledge=[flagged('a',true),flagged('b',true)];
check('Northstar shape counts 11, the re-check entry as one', workspaceTotal()===11, stub.innerHTML);
api.state.data.reviews=[];api.state.data.questions=[];api.state.data.knowledge=[flagged('a',true)];
api.renderOverview();html=stub.innerHTML;
check('a re-check alone is not "You\'re caught up"; it renders a row that opens the filtered Current State',
  !html.includes("You're caught up") && /class="attention-item recheck" data-action="open-recheck-items"/.test(html) && /1 item is waiting on you/.test(html), html);
api.state.data.reviews=[manyReviews[0]];api.state.data.questions=[threeBlockers[0]];api.state.data.knowledge=[flagged('a',true),flagged('b',true)];
api.renderOverview();html=stub.innerHTML;
check('the re-check row sits after the Reviews and before blocking questions, and the breakdown says so',
  html.indexOf('attention-item review')<html.indexOf('attention-item recheck') && !html.includes('attention-item blocker') && /1 review · 1 re-check · \+1 more in Open Items/.test(html), html);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
