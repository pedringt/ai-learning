// Nov 5 (staging QA): state-evals.html showed 23 scenarios (13 + 10) while it listed 29 (16 + 13), because the hero and
// tab labels were hardcoded and the #596 catalog merge added six newer scenarios. Every catalog count now comes from the
// assembled lists, and run counts read "1 high-impact failure" rather than "1 high-impact failures". No model calls, no network.
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
// Runs the page's own script against a stub page and the given quality payload, then returns the stub elements.
async function renderPage(payload){
  const ids=['catalogScenarioCount','scenarioCount','scenarioList','suiteIntro','reviewSummary','askSummary','failurePanel','failureList','runHistory'];
  const els=Object.fromEntries(ids.map(id=>[id,element(id)]));
  const tabs=['review','ask'].map(suite=>Object.assign(element('tab-'+suite),{dataset:{suite}}));
  const document={getElementById:id=>els[id]||null,querySelectorAll:selector=>selector==='[data-suite]'?tabs:[],querySelector:()=>null};
  const window={STATE_EVAL_CATALOG:catalog,PROJECT_HEALTH_MODEL:model};
  const fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(payload)});
  vm.runInNewContext(pageScript,{window,document,fetch,location:{search:''},URLSearchParams,CSS:{escape:value=>value},console});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  return {els,tabs};
}
const run=(suite,total,failures,extra={})=>({suite,total,high_severity_failures:failures,created_at:'2026-11-02T12:00:00Z',
  interpretation_accuracy:0.9375,overall_pass_rate:1,...extra});
const payload=(review,ask,recent)=>({controlled_evals:{latest_review_interpretation:review,latest_ask_quality:ask,recent}});

(async()=>{
  await check('the markup carries no hardcoded scenario counts',()=>{
    assert.doesNotMatch(html,/\d+ scenarios<\/span>/);
    assert.doesNotMatch(html,/(Update understanding|Answer quality) · \d+<\/button>/);
  });

  await check('hero, heading and tabs all match the assembled catalog',async()=>{
    const {els,tabs}=await renderPage(payload(null,null,[]));
    const review=catalog.review.length,ask=catalog.ask.length;
    assert.strictEqual(els.catalogScenarioCount.textContent,(review+ask)+' scenarios');
    assert.strictEqual(els.scenarioCount.textContent,(review+ask)+' scenarios');
    assert.strictEqual(tabs[0].textContent,'Update understanding · '+review);
    assert.strictEqual(tabs[1].textContent,'Answer quality · '+ask);
    assert.strictEqual((els.scenarioList.innerHTML.match(/<article class="scenario/g)||[]).length,review,'listed review scenarios');
  });

  await check('a single high-impact failure is singular; zero and several are plural',async()=>{
    const {els}=await renderPage(payload(run('review_interpretation',16,1),run('ask_quality',13,0),
      [run('review_interpretation',16,1),run('ask_quality',13,2),run('review_interpretation',1,0)]));
    // #643 (Nov 7): the count leads ("15/16 controlled scenarios passed"); the percentage follows as a scenario pass rate.
    assert.match(els.reviewSummary.innerHTML,/15\/16 <span class="score-unit">controlled scenarios passed<\/span>/);
    assert.match(els.reviewSummary.innerHTML,/93\.8% scenario pass rate, not production accuracy · 1 high-impact failure ·/);
    assert.match(els.askSummary.innerHTML,/13\/13 <span class="score-unit">controlled scenarios passed[\s\S]* · 0 high-impact failures ·/);
    assert.match(els.runHistory.innerHTML,/15\/16 controlled scenarios passed[\s\S]*· 1 high-impact failure ·/);
    assert.match(els.runHistory.innerHTML,/13\/13 controlled scenarios passed[\s\S]*· 2 high-impact failures ·/);
    assert.match(els.runHistory.innerHTML,/1\/1 controlled scenarios passed[\s\S]*· 0 high-impact failures ·/);
    assert.doesNotMatch(els.runHistory.innerHTML+els.reviewSummary.innerHTML,/\b1 high-impact failures/);
  });

  await check('each saved run keeps the scenario count it actually ran',async()=>{
    const {els}=await renderPage(payload(run('review_interpretation',13,0),null,[run('review_interpretation',13,0),run('review_interpretation',16,1)]));
    assert.match(els.reviewSummary.innerHTML,/\/13 <span/);
    assert.match(els.runHistory.innerHTML,/\/13 controlled scenarios passed[\s\S]*\/16 controlled scenarios passed/);
  });

  await check('a run with no recorded total still renders',async()=>{
    const {els}=await renderPage(payload(run('review_interpretation',null,0),null,[]));
    assert.match(els.reviewSummary.innerHTML,/Scenario count not recorded; 93\.8% is a scenario pass rate, not production accuracy · 0 high-impact failures/);
  });

  await check('#639: each run shows its scoring version, and older runs read legacy / version unknown',async()=>{
    const {els}=await renderPage(payload(run('review_interpretation',16,0,{scoring_version:'review-16-abc'}),null,
      [run('review_interpretation',16,0,{scoring_version:'review-16-abc'}),run('review_interpretation',16,0)]));
    assert.match(els.reviewSummary.innerHTML,/Scoring version: review-16-abc/);
    assert.match(els.runHistory.innerHTML,/scoring review-16-abc[\s\S]*scoring legacy \/ version unknown/);
  });

  await check('#643: a failure shows what the run got wrong and its consequence, not only which check fired',async()=>{
    const failure={scenario_id:'ask_unknown_stays_unknown',category:'uncertainty',severity:'high',failed_checks:['grounding'],failed_items:['number not in any record']};
    const {els}=await renderPage(payload(null,run('ask_quality',13,1,{overall_pass_rate:12/13,failure_details:[failure]}),[]));
    assert.match(els.failureList.innerHTML,/<strong>Observed:<\/strong> The answer gave a number that appears in none of the supplied records\./);
    assert.match(els.failureList.innerHTML,/<strong>Consequence:<\/strong> A reader could take an invented number as an agreed figure\./);
    assert.doesNotMatch(els.failureList.innerHTML,/Failed checks: /);
    const withExcerpt=await renderPage(payload(null,run('ask_quality',13,1,{overall_pass_rate:12/13,failure_details:[{...failure,synthetic_answer_excerpt:'Use 75% as the agreed target.'}]}),[]));
    assert.match(withExcerpt.els.failureList.innerHTML,/<p class="synthetic-excerpt"><strong>Synthetic eval excerpt \(model answer to a test fixture\):<\/strong> “Use 75% as the agreed target\.”<\/p>/);
  });

  await check('#640/#642: the total still counts the held scenario; gate eligibility is shown separately',async()=>{
    const held={scenario_id:'ask_question_answer_no_state_mutation',category:'question_resolution',severity:'medium',failed_checks:['grounding'],failed_items:['missing required fact: answered / resolved']};
    const {els}=await renderPage(payload(null,run('ask_quality',13,0,{overall_pass_rate:12/13,failure_details:[held]}),[]));
    assert.match(els.askSummary.innerHTML,/12\/13 <span class="score-unit">controlled scenarios passed/,'the headline score discloses the failure');
    assert.match(els.askSummary.innerHTML,/<p class="gate-eligibility">Release gate: 12 of 12 eligible scenarios passed; 1 not counted \(known unsupported, #640, 1 failing\)\.<\/p>/);
    assert.match(els.failureList.innerHTML,/<p class="known-unsupported"><strong>Known unsupported in this release, not counted by the release gate:<\/strong> #640: production Ask does not retrieve resolved Questions yet/);
    assert.strictEqual((els.failureList.innerHTML.match(/not counted by the release gate/g)||[]).length,1,'the phrase appears once');
    assert.match(els.failureList.innerHTML,/Expected wording not found in the answer: “answered” or “resolved”\./);
    const other={scenario_id:'ask_blocker_not_omitted',category:'important_omission',severity:'high',failed_checks:['uncertainty']};
    const both=await renderPage(payload(null,run('ask_quality',13,1,{overall_pass_rate:11/13,failure_details:[held,other]}),[]));
    assert.match(both.els.askSummary.innerHTML,/11\/13 <span[\s\S]*Release gate: 11 of 12 eligible scenarios passed/);
    assert.strictEqual((both.els.failureList.innerHTML.match(/class="known-unsupported"/g)||[]).length,1,'only the held scenario carries the note');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
