// Regression coverage for a P1 finding from live staging QA (2026-09-07):
// a "Current State may be at risk" review shown first in Workspace's
// attention list could disappear from some Ask briefings, and reappear
// after "Make this shorter" -- i.e. summarization was changing which items
// were selected, not just their length.
//
// Root cause (two independent bugs, both fixed here):
// 1. Backend list_reviews() had no consequentiality ordering at all --
//    review_service.py now sorts state_at_risk reviews first (see that
//    file's own test coverage for the SQL-level behavior).
// 2. upsertBackendReview() defaulted to unshift(), which is correct for a
//    single just-created review (show it first) but silently REVERSES
//    order when called in a loop during hydration -- so even with #1 fixed
//    on the backend, Workspace's state.data.reviews ended up in the
//    opposite order from what the backend (and Ask, which fetches fresh)
//    returned. This file covers #2; the shared ordering itself is only
//    verifiable against a real database, not this DOM-less harness.
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

// Bulk hydration (toFront:false) must preserve backend order -- this is
// the exact loop shape hydrateBackend() uses.
api.state.data.reviews=[];
const backendOrder=[{id:'r-at-risk',status:'pending'},{id:'r-b',status:'pending'},{id:'r-c',status:'pending'}];
for(const raw of backendOrder){ api.upsertBackendReview(raw,{toFront:false}); }
check('bulk hydration preserves backend response order (does not reverse it)',
  api.state.data.reviews.map(r=>r.id).join(',')==='r-at-risk,r-b,r-c',
  api.state.data.reviews.map(r=>r.id).join(','));

// A single live insertion (e.g. right after submitting evidence) still
// defaults to toFront -- the newest review should still show first.
api.state.data.reviews=[{id:'r-existing',status:'pending'}];
api.upsertBackendReview({id:'r-new',status:'pending'});
check('a single new review still goes to the front by default (unchanged live-insertion UX)',
  api.state.data.reviews[0].id==='r-new');

// Updating an existing review (by id) must not change its position either
// way -- this was already correct, confirming the fix didn't disturb it.
api.state.data.reviews=[{id:'r-x',status:'pending',title:'old'},{id:'r-y',status:'pending'}];
api.upsertBackendReview({id:'r-x',status:'pending',title:'new'},{toFront:false});
check('updating an existing review in place does not move it',
  api.state.data.reviews.map(r=>r.id).join(',')==='r-x,r-y' && api.state.data.reviews[0].title==='new');

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
