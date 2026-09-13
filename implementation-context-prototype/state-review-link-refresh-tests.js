// Regression coverage for a live-QA finding (2026-09-12): Ask queries the
// backend fresh on every question, but Open Items only hydrates its local
// review list once (hydrateBackend()) -- so Ask can surface a "Review ->"
// link for a Review Open Items hasn't loaded into state.data.reviews yet.
// The click handler did a local-only lookup and silently no-op'd on a miss:
// no dialog, no error, indistinguishable from a broken button.
//
// refreshOpenReviews() gives a local-lookup miss one real chance to resolve
// by re-fetching the open-reviews list from the backend before giving up.
// This exercises that refresh function directly (mocking window.STATE_API),
// rather than the full click handler/dialog DOM, since the mechanism under
// test is the local-state merge, not the click wiring itself.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

const RAW_REVIEW={
  id:'r-not-yet-hydrated', review_type:'proposed_update', decision_question:'Does this change retention?',
  why_consequential:'Legal evidence proposes a new retention figure.', evidence_id:'ev-1', evidence_content:'Legal said 30 days.',
  affected_state_items:[], resolves_question_ids:[],
};
// A real STATE_API (truthy) makes context-app.js call hydrateBackend() once
// automatically on module load, which touches several other API methods
// this test doesn't care about. A Proxy answers anything not explicitly
// stubbed with a never-resolving promise (quietly ignored, since nothing
// awaits it) instead of throwing "not a function" and crashing module init.
const stubApi=new Proxy({
  async getReviews(status){ return {items: status==='open' ? [RAW_REVIEW] : []}; },
}, {
  get(target,prop){ return prop in target ? target[prop] : (()=>new Promise(()=>{})); },
});

const context={window:{STATE_API:stubApi},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

(async()=>{
  check('review is not yet in local state before refresh (simulating Ask surfacing it before Open Items hydrated)',
    !api.state.data.reviews.some(r=>r.id==='r-not-yet-hydrated'));

  await api.refreshOpenReviews();

  const found=api.state.data.reviews.find(r=>r.id==='r-not-yet-hydrated');
  check('refreshOpenReviews() pulls the review into local state on a miss', !!found, JSON.stringify(api.state.data.reviews.map(r=>r.id)));
  check('the refreshed review carries its review_type through mapApiReview', found?.reviewType==='proposed_update' || found?.review_type==='proposed_update', JSON.stringify(found));

  // A second refresh with an empty open-reviews response (e.g. the review
  // was accepted/rejected in the meantime) must prune it back out, not leave
  // a stale local copy -- same prune-then-upsert contract hydrateBackend()
  // itself relies on via replaceBackendOpenReviews.
  stubApi.getReviews=async()=>({items:[]});
  await api.refreshOpenReviews();
  check('a review no longer open is pruned from local state on the next refresh',
    !api.state.data.reviews.some(r=>r.id==='r-not-yet-hydrated'));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail) process.exit(1);
})();
