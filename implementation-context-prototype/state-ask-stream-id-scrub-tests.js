// #247: the streaming view must not draw a mangled fragment ("Demo-juniper-") where the model wrote a slug-style
// record id. Mirrors _DEMO_SLUG_ID in ask_service.py, which scrubs the finished answer.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});
const context={window:{STATE_API:stubApi},console,setTimeout,clearTimeout,performance:{now:()=>0}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),context);
const ASK=context.window.STATE_ASK;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const text=html=>[...html.matchAll(/class="ask-stream-item">([^<]*)</g)].map(m=>m[1]).concat([...html.matchAll(/class="ask-stream-detail">([^<]*)</g)].map(m=>m[1])).join(' | ');
const streamOf=(items)=>JSON.stringify({answer:{job:'catch_up',headline:'H',summary:'S',sections:[{kind:'other',title:'T',items}],source_ids:[],uncertainty_ids:[],suggested_refinements:[]}});
const item=(t,d)=>({text:t,record_type:'none',record_id:null,detail:d||null});

const juniper=text(ASK.renderStream(streamOf([item('Elevator booking is at risk.','Demo-juniper-review-elevator qualifies this risk.')])));
check('a Juniper slug id is removed whole, not left as "Demo-juniper-"',/qualifies this risk/.test(juniper)&&!/demo-juniper/i.test(juniper),juniper);

const northstar=text(ASK.renderStream(streamOf([item('Retention is blocked by demo-review-retention until security signs off.')])));
check('a Northstar slug id is removed whole, with no "demo-" remnant',/until security signs off/.test(northstar)&&!/demo-/i.test(northstar),northstar);

const history=text(ASK.renderStream(streamOf([item('See demo-history-data-boundary for the change.')])));
check('a demo history id is removed whole, with no "demo-" remnant',!/demo-|data-boundary/i.test(history),history);

const plain=text(ASK.renderStream(streamOf([item('Schedule a demo-day rehearsal for the Juniper demo project.')])));
check('ordinary text that mentions "demo" is left alone',/demo-day rehearsal for the Juniper demo project/.test(plain),plain);

const generated=text(ASK.renderStream(streamOf([item('Retention is confirmed (review_1) and k-data holds.')])));
check('the existing generated-id patterns still work',!/review_1|k-data/.test(generated),generated);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
