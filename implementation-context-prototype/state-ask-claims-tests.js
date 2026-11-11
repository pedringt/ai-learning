// #567: Ask's opening is claims with authority chips; the browser draws only claims and sections the server has
// checked, never the model's raw text; Copy keeps every chip. (Record-id scrubbing now happens on the server before
// anything is sent; test_ask_id_scrub.py and test_ask_claims.py cover it.)
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});
const context={window:{STATE_API:stubApi},console,setTimeout,clearTimeout,performance:{now:()=>0}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),context);
const ASK=context.window.STATE_ASK;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const WITHHELD="Part of this answer couldn&#39;t be checked against State&#39;s records and was left out.";
const claim=(text,label,basis)=>({text,label:label||null,basis:basis||'none',primary_record_id:null,supporting_record_ids:[]});

// Streaming draws nothing raw.
const raw=ASK.renderStream('{"selection":{"job":"current_fact"},"answer":{"claims":[{"text":"Budget approved at $95,000"');
check('a raw model string is never drawn; it shows the loading state',raw.includes('ask-live-loading')&&!raw.includes('95,000'),raw.slice(0,160));
check('nothing received yet shows the loading state',ASK.renderStream({claims:[],sections:[]},{counts:{reviews:2}}).includes('Grounded in 2 Reviews'));

const streamed=ASK.renderStream({claims:[
  {index:0,status:'shown',claim:claim('The pilot stays read-only.','Current State','current_state')},
  {index:1,status:'withheld'},
  {index:2,status:'shown',claim:claim('Nothing records an owner.')},
],sections:[]});
check('checked claims are drawn with their chips',streamed.includes('>Current State</span><span class="ask-claim-text">The pilot stays read-only.<'),streamed);
check('an unlabelled claim has no chip',/<li class="ask-claim"><span class="ask-claim-text">Nothing records an owner.</.test(streamed),streamed);
check('a withheld claim shows the fixed line, never text',streamed.includes(WITHHELD),streamed);

// The finished answer.
const answer={job:'current_fact',headline:'What State has on record',summary:'[Current State] The pilot stays read-only.',
  claims:[claim('The pilot stays read-only.','Current State','current_state')],withheld_claims:1,withheld_items:0,
  sections:[{kind:'needs_review',title:'Needs your review',items:[{text:'Record the budget?',record_type:'review',record_id:'r1',detail:null,wording:'record'}]}],
  source_ids:[],uncertainty_ids:[],suggested_refinements:[],suggested_question:null};
const html=ASK.render({answer,selection:{},timing:{}},null);
check('the finished answer shows claims instead of a summary paragraph',html.includes('class="ask-claims"')&&!html.includes('result-lede'),html);
check('the finished answer shows the withheld line',html.includes(WITHHELD));
const starter=ASK.render({answer:{job:'catch_up',headline:'Here is what matters right now.',summary:'2 Reviews need attention.',sections:[]}},null);
check('a software-written starter answer (no claims) still shows its summary',starter.includes('<p class="result-lede">2 Reviews need attention.</p>'),starter);

// Copy keeps every chip, in the same form as ask_display.displayed_lines.
const copied=ASK.portableText({answer},null).split('\n');
check('copied text labels claims and cards and keeps the withheld line',
  JSON.stringify(copied.slice(0,6))===JSON.stringify(['What State has on record','','[Current State] The pilot stays read-only.',"Part of this answer couldn't be checked against State's records and was left out.",'','Needs your review'])
  &&copied.includes('- [Needs review] Record the budget?'),JSON.stringify(copied));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
