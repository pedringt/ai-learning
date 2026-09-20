// Regression coverage for #239: Ask's "What should I know?" starter (job meeting_prep) visibly grew while
// streaming and then shrank when the final answer replaced it.
//
// Cause: the backend's _normalize_meeting_prep merges repeated sections, de-duplicates records, keeps at
// most 4 sections and caps items per section, but renderStream() drew every headline/summary/title/text/
// detail field in the raw JSON stream. For meeting_prep the stream now shows the headline and summary (the
// normalizer never changes them) and holds the sections back for the final answer. Other jobs are unchanged.
//
// This drives the real renderStream() from context-ask.js over every prefix of a realistic answer-first
// stream (the schema emits job, headline, summary, sections, in that order).
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});
const context={window:{STATE_API:stubApi},console,setTimeout,clearTimeout,performance:{now:()=>0}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),context);
const ASK=context.window.STATE_ASK;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const count=(html,needle)=>(html.match(new RegExp(needle,'g'))||[]).length;
const item=(text,id)=>({text,record_type:'state',record_id:id,detail:null});
function streamOf(job,sections){
  return JSON.stringify({answer:{
    job,headline:'What to know before the meeting',
    summary:'Two decisions are open and the launch date is settled.',
    sections,source_ids:[],uncertainty_ids:[],suggested_refinements:[]
  },selection:{job,state_ids:[],review_ids:[]}});
}

// More than the backend keeps: the same kind twice (merged into one section) and five 'established' items where
// the cap is three, so the final answer keeps 4 of these 6 items in 2 sections.
const overfull=[
  {kind:'established',title:'Useful context',items:[item('Launch is October 15.','s1'),item('Morgan owns readiness.','s2'),item('Budget is $180,000.','s3')]},
  {kind:'established',title:'More context',items:[item('Import depends on the export API.','s4'),item('Beta has 20 customers.','s5')]},
  {kind:'needs_review',title:'Decisions needed',items:[item('Approve the vendor change.','r1')]},
];

const meetingPrep=streamOf('meeting_prep',overfull);

// Every prefix of the stream, so a "grows then shrinks" flicker anywhere would show up.
let sawHeadline=false,sawSummary=false,itemsEver=0,titlesEver=0,detailsEver=0,threw=null;
for(let n=1;n<=meetingPrep.length;n++){
  let html;
  try{html=ASK.renderStream(meetingPrep.slice(0,n));}catch(e){threw=e;break;}
  if(html.includes('<h2>What to know'))sawHeadline=true;
  if(html.includes('Two decisions are open'))sawSummary=true;
  itemsEver=Math.max(itemsEver,count(html,'class="ask-stream-item"'));
  titlesEver=Math.max(titlesEver,count(html,'ask-stream-section-title'));
  detailsEver=Math.max(detailsEver,count(html,'class="ask-stream-detail"'));
}
check('renderStream never throws on any prefix of a meeting_prep stream',threw===null,String(threw));
check('meeting_prep still streams its headline',sawHeadline);
check('meeting_prep still streams its summary',sawSummary);
check('meeting_prep never draws section items while streaming (the final answer caps and merges them)',itemsEver===0,`max items drawn: ${itemsEver}`);
check('meeting_prep never draws section titles while streaming',titlesEver===0,`max titles drawn: ${titlesEver}`);
check('meeting_prep never draws item details while streaming',detailsEver===0,`max details drawn: ${detailsEver}`);

// The held-back state is explained, not blank, once the headline is in.
const afterSummary=meetingPrep.slice(0,meetingPrep.indexOf('"sections"'));
const explained=ASK.renderStream(afterSummary);
check('while sections are held back the draft says so (ask-stream-finalizing note)',explained.includes('ask-stream-finalizing'),explained.slice(0,300));
check('the note appears only once there is a headline to show, not on the empty loading state',!ASK.renderStream('').includes('ask-stream-finalizing'));

// Before the job value is complete nothing can be decided yet; it must not throw or draw stale items.
const early=ASK.renderStream('{"answer":{"job":"meeting_pr');
check('a partially streamed job value renders the normal grounded-loading state',early.includes('ask-live-loading'),early.slice(0,200));

// Other jobs keep streaming their sections exactly as before (no other job has a shrinking normalizer).
const currentFact=streamOf('current_fact',overfull);
let otherItems=0,otherTitles=0;
for(let n=1;n<=currentFact.length;n++){
  const html=ASK.renderStream(currentFact.slice(0,n));
  otherItems=Math.max(otherItems,count(html,'class="ask-stream-item"'));
  otherTitles=Math.max(otherTitles,count(html,'ask-stream-section-title'));
}
check('other jobs still stream every section item',otherItems===6,`items: ${otherItems}`);
check('other jobs still stream section titles',otherTitles===3,`titles: ${otherTitles}`);
check('other jobs do not get the held-back note',!ASK.renderStream(currentFact.slice(0,currentFact.indexOf('"sections"'))).includes('ask-stream-finalizing'));

// Whitespace variants of the job field still match.
const spaced=meetingPrep.replace('"job":"meeting_prep"','"job" : "meeting_prep"');
check('meeting_prep is detected with spaces around the colon',!ASK.renderStream(spaced.slice(0,spaced.length)).includes('ask-stream-item'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
