// Regression coverage for a staging finding (2026-09-13): new evidence about
// vendor retention created a second, differently-typed open Review instead
// of linking to the existing one via existing_review_id, and there was no
// way for a reviewer looking at either Review to notice the other existed.
// Per explicit product direction, software must not guess the two Reviews
// are "the same decision" and auto-merge them (see
// review_service.py's _related_open_review_refs) -- it only surfaces the
// structural fact that they share a State item or Question as a "Related
// open review" pointer for the human. This file covers the frontend half:
// mapApiReview() must carry the backend's related_open_reviews through, and
// reviewCard() must render it plainly, without treating it as an action.
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
const openItems=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// mapApiReview()
const backendReviewWithOneRelated={
  id:'demo-review-retention', review_type:'state_at_risk',
  decision_question:"Are the vendor's stated retention terms authoritative enough for pilot planning?",
  why_consequential:'x', proposals:[], affected_state_items:[],
  related_open_reviews:[{id:'r-new-proposed-update', review_type:'proposed_update', decision_question:'Should Current State reflect the confirmed 30-day retention terms?'}],
};
const mappedOneRelated=api.mapApiReview(backendReviewWithOneRelated,'');
check('mapApiReview carries related_open_reviews through as relatedOpenReviews',
  Array.isArray(mappedOneRelated.relatedOpenReviews) && mappedOneRelated.relatedOpenReviews.length===1,
  JSON.stringify(mappedOneRelated.relatedOpenReviews));
check('mapApiReview maps each related review to camelCase fields',
  mappedOneRelated.relatedOpenReviews[0].id==='r-new-proposed-update'
  && mappedOneRelated.relatedOpenReviews[0].reviewType==='proposed_update'
  && mappedOneRelated.relatedOpenReviews[0].decisionQuestion==='Should Current State reflect the confirmed 30-day retention terms?',
  JSON.stringify(mappedOneRelated.relatedOpenReviews[0]));

const backendReviewWithNoRelated={id:'r-solo', review_type:'state_at_risk', decision_question:'x', why_consequential:'x', proposals:[], affected_state_items:[]};
const mappedNoRelated=api.mapApiReview(backendReviewWithNoRelated,'');
check('mapApiReview defaults relatedOpenReviews to an empty array when the backend omits it',
  Array.isArray(mappedNoRelated.relatedOpenReviews) && mappedNoRelated.relatedOpenReviews.length===0,
  JSON.stringify(mappedNoRelated.relatedOpenReviews));

// reviewCard() rendering
const html=openItems.reviewCard(mappedOneRelated,true,false);
check('reviewCard shows a "Related open review" label for exactly one related review', html.includes('Related open review<') || html.includes('>Related open review<'), html);
check('reviewCard does not use the plural label for exactly one related review', !html.includes('Related open reviews'), html);
check('reviewCard shows the related review\'s decision question', html.includes('Should Current State reflect the confirmed 30-day retention terms?'), html);

const soloHtml=openItems.reviewCard(mappedNoRelated,true,false);
check('reviewCard renders no related-review block when there are none', !soloHtml.includes('Related open review'), soloHtml);

const backendReviewWithTwoRelated={
  ...backendReviewWithOneRelated,
  related_open_reviews:[
    {id:'r-a', review_type:'proposed_update', decision_question:'First related decision?'},
    {id:'r-b', review_type:'missing_understanding', decision_question:'Second related decision?'},
  ],
};
const mappedTwoRelated=api.mapApiReview(backendReviewWithTwoRelated,'');
const twoHtml=openItems.reviewCard(mappedTwoRelated,true,false);
check('reviewCard uses the plural label for more than one related review', twoHtml.includes('Related open reviews'), twoHtml);
check('reviewCard lists every related review\'s decision question', twoHtml.includes('First related decision?') && twoHtml.includes('Second related decision?'), twoHtml);

// XSS-safety: a related review's decision question is untrusted backend text.
const backendReviewWithUnsafeRelated={
  ...backendReviewWithOneRelated,
  related_open_reviews:[{id:'r-x', review_type:'proposed_update', decision_question:'<script>bad()</script>'}],
};
const unsafeHtml=openItems.reviewCard(api.mapApiReview(backendReviewWithUnsafeRelated,''),true,false);
check('reviewCard escapes a related review\'s decision question', !unsafeHtml.includes('<script>bad()</script>'), unsafeHtml);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
