// #689 (Nov 16 production QA): the State eval details page repeated the "unsafe mistake" sentence, headlined 15/16 while
// listing 3 failures, and dated the Nov 9 run 11:29 PM (UTC read as local time) while Project Health said 3:29 PM. Both
// pages now count whole scenarios and use one formatter that names the time zone. Uses the production records from the Nov 9 run. No model calls, no network.
process.env.TZ='America/Los_Angeles';
const assert=require('assert');
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'state-evals.html'),'utf8');
const catalog=require('../state-eval-catalog.js');
const model=require('../project-health-model.js');

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const pageScript=inline[inline.length-1];
function element(id){
  return {id,innerHTML:'',textContent:'',hidden:false,dataset:{},
    classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},
    querySelectorAll(){return [];},scrollIntoView(){}};
}
async function renderPage(payload){
  const ids=['catalogScenarioCount','scenarioCount','scenarioList','suiteIntro','reviewSummary','askSummary','failurePanel','failureList','runHistory'];
  const els=Object.fromEntries(ids.map(id=>[id,element(id)]));
  const tabs=['review','ask'].map(suite=>Object.assign(element('tab-'+suite),{dataset:{suite}}));
  const document={getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='[data-suite]'?tabs:[],querySelector:()=>null};
  const window={STATE_EVAL_CATALOG:catalog,PROJECT_HEALTH_MODEL:model};
  const fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(payload)});
  vm.runInNewContext(pageScript,{window,document,fetch,location:{search:''},URLSearchParams,CSS:{escape:value=>value},console});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  return els;
}

// The production Nov 9 records (GET /api/project-health-state-quality?env=production, Nov 16). SQLite stores UTC with no zone.
const RUN_AT='2026-11-09 23:29:08';
const review={suite:'review_interpretation',total:16,errors:0,high_severity_failures:1,interpretation_accuracy:0.9375,created_at:RUN_AT,scoring_version:'review-16-d8144c2649c8',
  failure_details:[
    {scenario_id:'review_direct_reversal',category:'direct_reversal',severity:'high',expected:'update_state',observed:'update_state | proposed State: Password-reset tickets are approved for automation.',failed_checks:['interpretation'],failed_items:['proposed state lacks paused / suspended / halted / on hold / not approved / no longer approved']},
    {scenario_id:'review_same_unknown_links_existing_question',category:'same_unknown_new_information',severity:'medium',expected:'link_existing_question',observed:'preserve_evidence_only',failed_checks:['review_needed','processing'],failed_items:[]}
  ]};
const ask={suite:'ask_quality',total:13,errors:0,high_severity_failures:0,ask_grounding:12/13,overall_pass_rate:12/13,created_at:RUN_AT,scoring_version:'ask-13-64bf070e1bdb',
  failure_details:[{scenario_id:'ask_question_answer_no_state_mutation',category:'question_resolution',severity:'medium',failed_checks:['grounding'],failed_items:['headline opens with forbidden: not yet']}]};
const payload={controlled_evals:{latest_review_interpretation:review,latest_ask_quality:ask,recent:[review,ask]}};

(async()=>{
  await check('no failure consequence says the unsafe-mistake sentence twice',async()=>{
    for(const item of review.failure_details){
      const text=model.failureStory(item,review).consequence.text;
      assert.ok((text.match(/unsafe mistake/g)||[]).length<=1,item.scenario_id+': '+text);
    }
    const els=await renderPage(payload);
    for(const block of els.failureList.innerHTML.split('<article').slice(1)){
      assert.ok((block.match(/unsafe mistake/g)||[]).length<=1,block.slice(0,400));
    }
  });

  await check('the linked-Question miss keeps one plain sentence about the unsafe direction',()=>{
    const text=model.failureStory(review.failure_details[1],review).consequence.text;
    assert.match(text,/No change was proposed, so it did not make this scenario’s unsafe mistake \(proposing a Current State change\)\.$/);
    assert.doesNotMatch(text,/It did not make this scenario’s unsafe mistake/);
  });

  await check('the eval details page dates the run as Project Health does, with the time zone named',async()=>{
    const els=await renderPage(payload);
    const expected=model.fmtDate(RUN_AT,{year:true});
    assert.match(expected,/^Nov 9, 2026, 3:29\s?PM PST$/);
    assert.match(model.fmtDate(RUN_AT),/^Nov 9, 3:29\s?PM PST$/,'Project Health');
    for(const [name,markup] of [['review summary',els.reviewSummary.innerHTML],['ask summary',els.askSummary.innerHTML],['run history',els.runHistory.innerHTML]]){
      assert.ok(markup.includes(expected),name+': '+markup.slice(0,300));
      assert.doesNotMatch(markup,/11:29\s?PM/,name+' reads UTC as local time');
    }
  });

  // Paige (Nov 16): "Update understanding" counts whole scenarios, so the headline counts and the failed list agree.
  await check('the failed-scenario list holds exactly the scenarios the headline counts say did not pass',async()=>{
    const els=await renderPage(payload);
    const counts=[els.reviewSummary.innerHTML,els.askSummary.innerHTML].map(markup=>{
      const match=markup.match(/(\d+)\/(\d+) <span class="score-unit">controlled scenarios passed/);
      assert.ok(match,markup.slice(0,300));
      return {passed:Number(match[1]),scored:Number(match[2])};
    });
    assert.deepStrictEqual(counts,[{passed:14,scored:16},{passed:12,scored:13}]);
    assert.match(els.reviewSummary.innerHTML,/87\.5% scenario pass rate/);
    const listed=(els.failureList.innerHTML.match(/<article class="failure-item">/g)||[]).length;
    assert.strictEqual(listed,counts.reduce((n,c)=>n+c.scored-c.passed,0));
    assert.match(els.runHistory.innerHTML,/Update understanding · 14\/16 controlled scenarios passed/);
  });

  await check('Project Health\'s Update understanding cards show the same 14 of 16',()=>{
    const q={review,ask,recent:[review,ask]};
    const card=model.stateMetricCards(q).find(item=>item.label==='Update understanding');
    assert.strictEqual(card.display,'14 of 16');
    assert.strictEqual(card.sub,'14 of 16 passed');
    assert.strictEqual(model.scenarioPassRate(review),14/16);
    assert.strictEqual(model.cardScore(review,model.STATE_QUALITY_METRICS[0]),14/16);
    // Trends keep reading interpretation_accuracy.
    assert.strictEqual(model.metricScore(review,'interpretation_accuracy'),0.9375);
  });

  await check('a record whose failure list is missing or incomplete keeps the recorded field',()=>{
    assert.strictEqual(model.scenarioPassRate({...review,failure_details:undefined}),null);
    assert.strictEqual(model.scenarioPassRate({...review,failure_details:[]}),null,'no listed failure but accuracy below 1');
    assert.strictEqual(model.scenarioPassRate({...review,total:40,failure_details:Array(16).fill(review.failure_details[1])}),null,'capped list');
    assert.strictEqual(model.scenarioPassRate({...review,interpretation_accuracy:1,failure_details:[]}),1);
    // An errored scenario is in the list but not scored.
    assert.strictEqual(model.scenarioPassRate({...review,errors:1,interpretation_accuracy:14/15,failure_details:[...review.failure_details,{scenario_id:'x',failed_checks:['processing']}]}),13/15);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
