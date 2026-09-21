// Regression coverage for #239 / #246: Ask's meeting_prep answer must not grow and then shrink while streaming.
//
// History: the backend reshapes a meeting_prep answer after the stream ends (_normalize_meeting_prep: merge repeated
// kinds, reorder, cap items, retitle), but the frontend drew every field live, so the draft grew and then shrank (#239).
// #239 hid the sections until the end, which felt like a stall. #246 fixed it at the source: the prompt now states the
// backend's final shape (generated from the same constants the normalizer uses), and a real-model A/B measured 83% of
// answers already in final shape (0% before), with order and titles never changing. So everything streams live again,
// and what matters here is the property that makes that safe: for an answer already in its final shape, whatever is
// drawn while streaming is exactly what the finished answer shows. The Python side (test_ask_meeting_prep_shape.py)
// keeps the prompt and the normalizer on one shape; this drives the real renderStream()/render() from context-ask.js.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});
const context={window:{STATE_API:stubApi},console,setTimeout,clearTimeout,performance:{now:()=>0}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),context);
const ASK=context.window.STATE_ASK;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const streamItems=html=>[...html.matchAll(/class="ask-stream-item">([^<]*)</g)].map(m=>m[1]);
const streamTitles=html=>[...html.matchAll(/class="ask-stream-section-title">([^<]*)</g)].map(m=>m[1]);
const finalItems=html=>[...html.matchAll(/class="ask-item-text">([^<]*)</g)].map(m=>m[1]);
const finalTitles=html=>[...html.matchAll(/<section class="ask-answer-section[^"]*"><h3>([^<]*)<\/h3>/g)].map(m=>m[1]);

const item=(text,id)=>({text,record_type:'state',record_id:id,detail:null});
const section=(kind,title,texts,start)=>({kind,title,items:texts.map((t,i)=>item(t,`rec-${start+i}`))});
function streamOf(job,sections){
  return JSON.stringify({answer:{
    job,headline:'What to know before the meeting',
    summary:'Two decisions are open and the launch date is settled.',
    sections,source_ids:[],uncertainty_ids:[],suggested_refinements:[]
  },selection:{job,state_ids:[],review_ids:[]}});
}
const payloadOf=(job,sections)=>({answer:JSON.parse(streamOf(job,sections)).answer});

// An answer in the backend's final shape: sections in its order, each within its cap, with its titles
// (needs_review 2, questions 4, established 3, recent_context 2; at most 4 sections). Mirrors MEETING_PREP_* in ask_contract.py.
const finalShape=[
  section('needs_review','Decisions needed',['Approve the vendor change.','Confirm the launch date.'],0),
  section('questions','Get these answered',['Who owns readiness?','Is legal review needed?','Which region first?','What is the budget cap?'],10),
  section('established','Useful context',['Launch is October 15.','Morgan owns readiness.','Budget is $180,000.'],20),
  section('recent_context','Recent context',['Vendor quote arrived.','Design freeze moved.'],30),
];
const totalItems=finalShape.reduce((n,s)=>n+s.items.length,0);

const raw=streamOf('meeting_prep',finalShape);

// Every prefix of the stream: nothing drawn is ever taken away, and nothing throws.
let threw=null,prev=0,shrank=false,maxItems=0,sawHeadline=false,sawSummary=false,heldBackNote=false;
for(let n=1;n<=raw.length;n++){
  let html;
  try{html=ASK.renderStream(raw.slice(0,n));}catch(e){threw=e;break;}
  const drawn=streamItems(html).length;
  if(drawn<prev)shrank=true;
  prev=drawn;maxItems=Math.max(maxItems,drawn);
  if(html.includes('<h2>What to know'))sawHeadline=true;
  if(html.includes('Two decisions are open'))sawSummary=true;
  if(html.includes('ask-stream-finalizing'))heldBackNote=true;
}
check('renderStream never throws on any prefix of a meeting_prep stream',threw===null,String(threw));
check('meeting_prep streams its headline and summary',sawHeadline&&sawSummary);
check('meeting_prep streams its section items live (they are not held back)',maxItems===totalItems,`max items drawn: ${maxItems} of ${totalItems}`);
check('the number of items drawn never goes down while streaming',!shrank);
check('there is no "held back" note any more',!heldBackNote);

// The property that makes live streaming safe: for a final-shape answer, the last streamed frame IS the finished answer.
const lastStream=ASK.renderStream(raw);
const finished=ASK.render(payloadOf('meeting_prep',finalShape));
check('the streamed items are exactly the finished answer\'s items, in the same order',
  JSON.stringify(streamItems(lastStream))===JSON.stringify(finalItems(finished)),
  `${JSON.stringify(streamItems(lastStream))} vs ${JSON.stringify(finalItems(finished))}`);
check('the streamed section titles are exactly the finished answer\'s titles, in the same order',
  JSON.stringify(streamTitles(lastStream))===JSON.stringify(finalTitles(finished)),
  `${JSON.stringify(streamTitles(lastStream))} vs ${JSON.stringify(finalTitles(finished))}`);
check('the finished answer shows every item of the final-shape answer',finalItems(finished).length===totalItems);

// Before the job value is complete nothing can be drawn yet; it must not throw or draw stale items.
const early=ASK.renderStream('{"answer":{"job":"meeting_pr');
check('a partially streamed job value renders the normal grounded-loading state',early.includes('ask-live-loading'),early.slice(0,200));

// meeting_prep is not special-cased: another job streams the same way.
const other=streamOf('current_fact',finalShape);
let otherItems=0;
for(let n=1;n<=other.length;n++)otherItems=Math.max(otherItems,streamItems(ASK.renderStream(other.slice(0,n))).length);
check('other jobs stream the same way (no special case for meeting_prep)',otherItems===totalItems,`items: ${otherItems}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
