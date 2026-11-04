// Nov 3 staging review, second pass: next steps on every surface, the decision log after a cold start, and the scope of
// the two eval counts. Renders the real page against stubbed fetches; no network and no model calls.
const assert=require('assert');
const H=require('../project-health.js');
const M=require('../project-health-model.js');

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

function stubElement(id){
  return {
    id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    setAttribute(){},getAttribute(){return null;},removeAttribute(){},
    addEventListener(){},removeEventListener(){},
    querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
    appendChild(){},append(){},insertAdjacentHTML(){},scrollIntoView(){},focus(){},showModal(){},close(){},contains(){return false;}
  };
}
function stubRoot(hostname){
  const elements=new Map(),store=new Map(),timers=new Set();
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,stubElement(id));return elements.get(id);},
    querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(){},removeEventListener(){},createElement(tag){return stubElement(tag);},
    body:stubElement('body'),hidden:true
  };
  const root={
    document,
    location:{href:'https://'+hostname+'/project-health',search:'',hostname},
    history:{replaceState(){}},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
    navigator:{},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t);},
    setInterval:()=>0,alert(){},prompt(){},addEventListener(){},removeEventListener(){},requestAnimationFrame:()=>0
  };
  document.defaultView=root;
  return {root,elements,cleanup:()=>{for(const t of timers)clearTimeout(t);timers.clear();}};
}
const respond=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
const EMPTY={live_review_quality:{resolved_reviews:0},controlled_evals:{latest_review_interpretation:null,latest_ask_quality:null,recent:[]},privacy:{content_included:false}};
async function waitFor(predicate,ms=4000){
  const start=Date.now();
  while(Date.now()-start<ms){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,25));}
  return predicate();
}
const allHtml=elements=>[...elements.values()].map(el=>el.innerHTML).join('\n');
const MISS=/quality miss/i;

(async()=>{
  const realFetch=global.fetch;
  try{
    await check('no recorded runs: no surface recommends reviewing a quality miss, and the next step is to run the evals',async()=>{
      const {root,elements,cleanup}=stubRoot('ai-learning-git-staging-cairn10.vercel.app');
      global.fetch=async url=>String(url).includes('/api/project-health-state-quality')?respond(200,EMPTY):respond(404,{detail:'not found'});
      try{
        await H.init(root);
        assert.ok(await waitFor(()=>/Run the controlled AI evals to get a quality result\./.test(allHtml(elements))),'next step shown');
        assert.doesNotMatch(allHtml(elements),MISS);
        assert.match(elements.get('productFocusPanel').innerHTML,/Run the controlled AI evals to get a quality result\./,'Overview product focus');
      }finally{cleanup();}
    });

    await check('the empty AI Evals state names its scope; on staging it says why results recorded elsewhere are not shown',async()=>{
      const {root,elements,cleanup}=stubRoot('ai-learning-git-staging-cairn10.vercel.app');
      global.fetch=async url=>String(url).includes('/api/project-health-state-quality')?respond(200,EMPTY):respond(404,{detail:'not found'});
      try{
        await H.init(root);
        assert.ok(await waitFor(()=>/No AI eval results recorded in this environment/.test(allHtml(elements))),'scoped empty state');
        assert.match(allHtml(elements),/Staging’s State backend starts empty after each deploy/);
        assert.doesNotMatch(allHtml(elements),/No recorded AI eval yet/);
      }finally{cleanup();}
    });

    await check('the paid-run count says it covers every environment and can differ from the results shown',()=>{
      assert.match(M.paidRunSpendText({count:75,cost_upper_usd:null}),/^Paid eval workflow runs in the last 30 days, all environments: 75\. .*can differ from the results shown here\.$/);
    });

    await check('the decision log retries once after a cold-start timeout and then shows its entries',async()=>{
      const {root,elements,cleanup}=stubRoot('www.contextswitch.tech');
      let decisionCalls=0;
      global.fetch=async url=>{
        if(String(url).includes('/api/project-health-decisions')){decisionCalls++;return decisionCalls<=4?respond(504,{detail:'The State API is still waking up. Try again in a minute.'}):respond(200,{entries:[{id:'phdec_0000000000000001',type:'decision',text:'Ship the refresh fixes',createdAt:'2026-11-03T18:00:00Z'}]});}
        if(String(url).includes('/api/project-health-state-quality'))return respond(200,EMPTY);
        return respond(404,{detail:'not found'});
      };
      try{
        await H.init(root);
        // Four projects time out once each, then succeed on the retry.
        assert.ok(await waitFor(()=>/Ship the refresh fixes/.test(allHtml(elements))),allHtml(elements).match(/decision log[^<]*/i)?.[0]||'no log text');
        assert.ok(decisionCalls>=5);
      }finally{cleanup();}
    });

    await check('a decision log that stays unavailable says so, never that it is empty',async()=>{
      const {root,elements,cleanup}=stubRoot('www.contextswitch.tech');
      global.fetch=async url=>{
        if(String(url).includes('/api/project-health-decisions'))return respond(504,{detail:'The State API is still waking up. Try again in a minute.'});
        if(String(url).includes('/api/project-health-state-quality'))return respond(200,EMPTY);
        return respond(404,{detail:'not found'});
      };
      try{
        await H.init(root);
        assert.ok(await waitFor(()=>/The decision log’s server didn’t respond in time/.test(allHtml(elements))),'timeout message');
        assert.doesNotMatch(allHtml(elements),/No product decisions or changes recorded yet/);
      }finally{cleanup();}
    });

    await check('the AI eval investigation does not invent a miss when there are no runs, or when the check is unavailable',()=>{
      const project=H.PROJECTS.find(p=>p.id==='state');
      const empty=M.qualityInvestigation({...M.emptyProjectData(project),quality:M.normalizeQuality(EMPTY)});
      assert.match(empty.report,/Recommended next action\nRun the controlled AI evals to get a quality result\./);
      assert.doesNotMatch(empty.report,/miss/i);
      const unavailable=M.qualityInvestigation({...M.emptyProjectData(project),quality:undefined,failures:[{label:'Quality',reason:'server error 504'}]});
      assert.match(unavailable.report,/AI eval results couldn’t be loaded/);
      assert.match(unavailable.report,/Restore the missing checks before assessing project health\./);
    });

    await check('a recorded finding still comes ahead of generic missing-check advice',()=>{
      const project=H.PROJECTS.find(p=>p.id==='state');
      const failing={suite:'review_interpretation',total:16,scenario_ids:Array.from({length:16},(_,i)=>'r'+i),high_severity_failures:1,interpretation_accuracy:0.9375,failure_details:[{scenario_id:'r0',severity:'high',failed_checks:['interpretation']}],created_at:'2026-11-02 22:50:28'};
      const data={...M.emptyProjectData(project),quality:{review:failing,ask:null,recent:[failing]},failures:[{label:'Delivery',reason:'server error 502'}]};
      assert.match(M.operationalNextDecision(data),/^Review the failed high-severity scenarios/);
    });
    await check('without recorded scenario IDs there is no trend line and no point change, even when counts match (Paige, Nov 3)',()=>{
      const run=(score,at)=>({suite:'review_interpretation',total:16,high_severity_failures:0,interpretation_accuracy:score,failure_details:[],created_at:at});
      const recent=[run(0.9375,'2026-11-02 10:00:00'),run(0.8125,'2026-10-27 10:00:00'),run(0.875,'2026-10-20 10:00:00')];
      const q={review:recent[0],ask:null,recent};
      assert.deepStrictEqual(M.mockTrendValues(q,'review_interpretation','interpretation_accuracy'),[],'no trend line');
      assert.strictEqual(M.mockSparkline(M.mockTrendValues(q,'review_interpretation','interpretation_accuracy')),'');
      const delta=M.mockDelta(recent,'review_interpretation','interpretation_accuracy');
      assert.strictEqual(delta.label,'Not comparable');
      assert.doesNotMatch(delta.label+' '+(delta.title||''),/\d+(\.\d+)? pts|points/);
      const project=H.PROJECTS.find(p=>p.id==='state');
      const before={...M.emptyProjectData(project),quality:{review:recent[1],ask:null,recent:recent.slice(1)}};
      const data={...M.emptyProjectData(project),quality:q,lastVisit:{...M.visitBaseline({projectId:'state',quality:before.quality,checkedAt:'2026-10-28T00:00:00Z'})}};
      const visit=M.meaningfulChanges(data).find(item=>/Update-understanding eval/.test(item.title));
      assert.ok(visit,'the re-run is listed');
      assert.doesNotMatch(visit.detail,/points|pts|↑|↓/,visit.detail);
      // With matching recorded scenario lists the change is shown.
      const ids=Array.from({length:16},(_,i)=>'r'+i);
      const withIds=recent.map(item=>({...item,scenario_ids:ids}));
      assert.strictEqual(M.mockTrendValues({review:withIds[0],recent:withIds},'review_interpretation','interpretation_accuracy').length,3);
      assert.match(M.mockDelta(withIds,'review_interpretation','interpretation_accuracy').label,/pts/);
    });
  }finally{global.fetch=realFetch;}

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
