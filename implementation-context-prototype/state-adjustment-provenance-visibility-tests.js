// Deterministic coverage for the holistic-QA-pass follow-up (state.md
// #106/#109): a materially human-adjusted acceptance must be distinguishable
// from a plain acceptance in the History UI, and Ask's candidate context
// must carry enough provenance to answer "was this adjusted?" without ever
// treating the AI's original wording as an alternate current value.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []},focus(){}};
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
const BACKEND_SYNC=context.window.STATE_BACKEND_SYNC||context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// --- syncApiHistory: raw backend fields become the right frontend shape ----
const adjustedRaw={
  id:'h-adjusted', state_item_id:'k-launch', old_statement:'Old launch text.',
  new_statement:'Human-approved launch text.', changed_at:'2026-09-14 01:16:23',
  decision_question:'Should launch thresholds be set?', proposal_rationale:'Evidence says so',
  accepted_as_adjusted:1, ai_proposed_statement:'AI-original launch text.', evidence_items:[],
};
const plainRaw={
  id:'h-plain', state_item_id:'k-data', old_statement:'Old data text.',
  new_statement:'New data text.', changed_at:'2026-09-14 01:16:23',
  decision_question:'Should data terms update?', proposal_rationale:'Evidence says so',
  accepted_as_adjusted:0, ai_proposed_statement:'New data text.', evidence_items:[],
};
// The exposed wrapper (context-app.js's syncApiHistory(items)) assigns
// straight to state.data.history rather than returning the mapped array --
// matches its real call signature/shape, not BACKEND_SYNC's 3-arg version.
api.syncApiHistory([adjustedRaw, plainRaw]);
const synced=api.state.data.history;
const adjustedEntry=synced.find(h=>h.id==='h-adjusted');
const plainEntry=synced.find(h=>h.id==='h-plain');

check('adjusted transition gets the adjusted decision line',
  adjustedEntry.decision==='Human adjusted and accepted this change');
check('adjusted transition carries the AI-original text separately from the approved text',
  adjustedEntry.aiProposed==='AI-original launch text.' && adjustedEntry.after==='Human-approved launch text.');
check('plain transition keeps the ordinary decision line',
  plainEntry.decision==='Human accepted this change');
check('plain transition has no aiProposed value (nothing to distinguish)',
  plainEntry.aiProposed===null);

// --- historyEntry(): the rendered card shows the distinction -------------
const adjustedHtml=api.historyEntry(adjustedEntry, false);
check('adjusted entry HTML uses the adjusted decision line',
  adjustedHtml.includes('Human adjusted and accepted this change'));
check('adjusted entry HTML shows "State proposed" and "Human approved" labels',
  adjustedHtml.includes('<span>State proposed</span>') && adjustedHtml.includes('<span>Human approved</span>'));
check('adjusted entry HTML shows the AI original wording',
  adjustedHtml.includes('AI-original launch text.'));
check('adjusted entry HTML shows the human-approved wording as both Now and Human approved',
  (adjustedHtml.match(/Human-approved launch text\./g)||[]).length===2);
check('no elaborate diff viewer -- just two more labeled lines, not a new component',
  !/diff|<table/i.test(adjustedHtml));

const plainHtml=api.historyEntry(plainEntry, false);
check('plain entry HTML uses the ordinary decision line',
  plainHtml.includes('Human accepted this change') && !plainHtml.includes('adjusted and accepted'));
check('plain entry HTML has no State-proposed/Human-approved block at all',
  !plainHtml.includes('State proposed') && !plainHtml.includes('Human approved'));

console.log(`\n${pass} passed, ${fail} failed`); if(fail)process.exit(1);
