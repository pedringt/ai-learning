// Regression coverage for two P2 findings from live staging QA (2026-09-07):
// History headlines were all the same generic "Current understanding
// updated" (hard to scan), and visible History copy could include internal
// record identifiers like "k-rollout" (an implementation detail that should
// never reach user-facing text).
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

// historyType(): specific headline when a topic name is known, generic
// fallback when it isn't (e.g. an orphaned or not-yet-loaded state item).
check('created transition with a topic produces "<topic> established"',
  api.historyType({transition_type:'created'},'Rollout sequence')==='Rollout sequence established');
check('retired transition with a topic produces "<topic> retired"',
  api.historyType({transition_type:'retired'},'Rollout sequence')==='Rollout sequence retired');
check('updated transition with a topic produces "<topic> updated"',
  api.historyType({transition_type:'updated'},'Rollout sequence')==='Rollout sequence updated');
check('no topic name falls back to the old generic headline (never crashes)',
  api.historyType({transition_type:'updated'},undefined)==='Current understanding updated');

// syncApiHistory(): end-to-end through the real hydration path, using a
// state_item_id whose topic (title) is already loaded in state.data.knowledge
// -- the normal case, since syncApiState runs before syncApiHistory during
// hydration.
api.state.data.knowledge.push({id:'k-rollout',title:'Rollout sequence',statement:'x',state:'current'});
api.syncApiHistory([{
  id:'h1', state_item_id:'k-rollout', transition_type:'updated',
  old_statement:'Old plan.', new_statement:'New plan.',
  decision_question:'Should Current State update k-rollout based on this reviewed evidence?',
  changed_at:'2026-09-01 00:00:00', evidence_items:[],
}]);
const entry=api.state.data.history.find(h=>h.id==='h1');
check('synced history entry gets the specific headline, not the generic one',
  entry.type==='Rollout sequence updated', entry.type);
check('synced history entry\'s reason has the internal id stripped',
  entry.reason && entry.reason.indexOf('k-rollout')===-1, entry.reason);
check('synced history entry\'s reason still reads as a sentence',
  entry.reason==='Should Current State update based on this reviewed evidence?', entry.reason);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
