// #707 (Paige, Nov 17: "Give them re-checks"): Project stage and Project outcome are Current State items, so when either
// needs a re-check the page lets you act on it where it is shown, and the re-check filter lists it. Before, they counted
// toward "N items need a re-check" (17) while only the area items (15) could be acted on.
const fs=require('fs'), vm=require('vm'), path=require('path');
const context={window:{},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'context-project-view.js'),'utf8'),context);
const VIEW=context.window.STATE_PROJECT_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const item=(id,title,area,flagged)=>({id,title,statement:`${title} statement.`,state:'current',projectArea:area,areaName:area==='general'?'General':'Scope',areaSortOrder:1,needsRecheck:flagged,lastConfirmed:'Jul 1, 2026'});
const knowledge=(stage,outcome,areaFlags)=>[item('k-stage','Project stage','general',stage),item('k-outcome','Project outcome','general',outcome),
  ...areaFlags.map((f,i)=>item(`k-${i}`,`Fact ${i}`,'scope',f))];
const render=(k,extra={})=>VIEW.render({backendState:'loaded',projectName:'Northstar',knowledge:k,history:[],pendingFor:()=>[],recheckDays:60,...extra});
const actionable=html=>(html.match(/data-action="state-still-true" data-state-id="[^"]+"/g)||[]).map(x=>x.split('data-state-id="')[1].slice(0,-1));
const count=html=>Number((html.match(/(\d+) items? needs? a re-check/)||[])[1]||0);

// The #707 reproduction: both flagged plus area items.
let k=knowledge(true,true,[true,true,false]);
let html=render(k);
check('the header count includes Stage and Outcome',count(html)===4,count(html));
check('Stage has its chip and Still true in the header',/data-state-id="k-stage"><dt>Stage<\/dt><dd>[^]*?recheck-chip[^]*?data-action="state-still-true" data-state-id="k-stage"/.test(html));
check('Outcome too',/data-state-id="k-outcome"><dt>Outcome<\/dt><dd>[^]*?data-action="state-still-true" data-state-id="k-outcome"/.test(html));
check('and a re-check question offer',html.includes('data-action="suggest-recheck-question" data-state-id="k-stage"'));

// The filtered view: the banner's number equals the rows you can act on.
html=render(k,{recheckOnly:true});
const banner=Number((html.match(/Showing the (\d+) items? that needs? a re-check/)||[])[1]);
const rows=(html.match(/class="recheck-record" data-state-id="[^"]+"/g)||[]).map(x=>x.split('data-state-id="')[1].slice(0,-1));
check('filter banner = rows listed',banner===4&&rows.length===4,JSON.stringify({banner,rows}));
check('Stage and Outcome are listed in their own group',html.includes('<h3>Stage and outcome</h3>')&&rows.includes('k-stage')&&rows.includes('k-outcome'));
check('every counted item can be acted on',['k-stage','k-outcome','k-0','k-1'].every(id=>actionable(html).includes(id)),JSON.stringify(actionable(html)));

// Only Stage flagged: no "No Current State yet" in the filter, and the count can reach zero from the page.
k=knowledge(true,false,[false]);
html=render(k,{recheckOnly:true});
check('only Stage flagged: listed, no empty state',html.includes('data-state-id="k-stage"')&&!html.includes('No Current State yet'),html.slice(0,200));
check('Outcome not flagged: no chip',!/data-state-id="k-outcome"><dt>Outcome<\/dt><dd>[^<]*<span class="recheck-chip"/.test(render(k)));

// Nothing flagged: the header shows the plain text, no actions.
html=render(knowledge(false,false,[false]));
check('nothing flagged: no re-check actions in the header',!/<dd>[^]*?state-still-true[^]*?<\/dl>/.test(html.split('<div class="project-outline">')[0]));

// Show dates: Stage and Outcome get a date, Still true and their interval like every other item.
html=render(knowledge(false,false,[false]),{showDates:true});
check('Show dates: Stage gets its date, Still true and interval',/data-state-id="k-stage"><dt>Stage[^]*?Confirmed Jul 1, 2026[^]*?state-still-true" data-state-id="k-stage"[^]*?set-item-recheck" data-state-id="k-stage"/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
