const assert=require('assert');

const platform=require('../api/project-health-platform.js')._test;
const runApi=require('../api/project-health-run.js')._test;
const projectQuality=require('../api/project-health-project-quality.js')._test;
const activity=require('../api/project-health-activity.js')._test;
const stateQuality=require('../api/project-health-state-quality.js')._test;

assert.deepStrictEqual(Object.keys(platform.PROJECTS),['state','tastemake','narc','authority-lab']);
assert.strictEqual(platform.PROJECTS['authority-lab'].vercelProjectId,'prj_DEsIbVajmdgFqxtVFeZLQsa6QJ69');
assert.strictEqual(platform.PROJECTS['authority-lab'].aiTelemetry.kind,'none');
assert.strictEqual(platform.PROJECTS.state.vercelProjectId,'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl');
assert.strictEqual(platform.PROJECTS.tastemake.vercelProjectId,'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu');
assert.strictEqual(platform.PROJECTS.narc.vercelProjectId,'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H');
assert.strictEqual(platform.PROJECTS.state.aiTelemetry.kind,'state');
assert.match(platform.PROJECTS.state.aiTelemetry.url,/state-api-6waw/);
assert.strictEqual(platform.PROJECTS.tastemake.aiTelemetry.kind,'tastemake');
assert.match(platform.PROJECTS.tastemake.aiTelemetry.url,/tastemake\.vercel\.app/);
assert.strictEqual(platform.PROJECTS.narc.aiTelemetry.kind,'none');

assert.deepStrictEqual(
  platform.safeRenderHealth({ok:true,status:200,latency_ms:88,payload:{build:'abcdef123',status:'ok'}}),
  {ok:true,status:200,latency_ms:88,build:'abcdef123',service_status:'ok',error:null}
);

assert.strictEqual(platform.numericCount('12'),12);
// Cowork, Oct 11: the public analytics signal is connected/receiving/recent only, never raw counts.
assert.deepStrictEqual(
  platform.analyticsSignal({data:{pageviews:28,visitors:19}},{ok:true,payload:{data:{pageviews:4,visitors:3}}}),
  {configured:true,available:true,period_days:30,receiving:true,recent_days:7,recent:true}
);
assert.strictEqual(platform.analyticsSignal({data:{pageviews:0,visitors:0}},{ok:true,payload:{data:{pageviews:0}}}).receiving,false);
assert.strictEqual(platform.analyticsSignal({data:{pageviews:5}},{ok:false,status:500,payload:{}}).recent,null,'a failed recency query is unknown, not "no recent views"');
const platformFetchTest=(async()=>{
  const originalFetch=global.fetch,originalToken=process.env.VERCEL_TOKEN;
  process.env.VERCEL_TOKEN='test-token';
  const urls=[];
  global.fetch=async url=>{urls.push(String(url));return {ok:true,status:200,json:async()=>({data:{pageviews:28,visitors:19,devices:7}})};};
  try{
    const handler=require('../api/project-health-platform.js');
    let body=null;
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(payload){body=payload;return this;}};
    await handler({method:'GET',query:{project:'state',signal:'analytics'}},res);
    assert.strictEqual(res.code,200);
    const text=JSON.stringify(body);
    assert.doesNotMatch(text,/pageviews|visitors|"28"|:28\b|:19\b/,'no raw counts in the public JSON: '+text);
    assert.strictEqual(body.analytics.receiving,true);
    assert.strictEqual(body.analytics.recent,true);
    assert.match(body.privacy.analytics_scope,/no page-view or visitor counts/);
    assert.ok(urls.every(url=>url.startsWith('https://api.vercel.com/v1/query/web-analytics/visits/count?')));
  }finally{
    global.fetch=originalFetch;
    if(originalToken==null)delete process.env.VERCEL_TOKEN;else process.env.VERCEL_TOKEN=originalToken;
  }
})().catch(error=>{console.error(error);process.exit(1);});

// Oct 11: the run GET reports the newest workflow run's start (last_run_started_at) from the same lookup the POST
// cooldown uses, so the page can show "Available in N min" for runs started by any visitor.
// Runs after the platform test: both swap global.fetch, and overlapping swaps would restore the wrong fetch.
platformFetchTest.then(async()=>{
  const runHandler=require('../api/project-health-run.js');
  const fs=require('fs');
  const originalFetch=global.fetch;
  const savedEnv={GITHUB_TOKEN:process.env.GITHUB_TOKEN,COST:process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE};
  const call=async req=>{
    let body=null;
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(payload){body=payload;return this;}};
    await runHandler(req,res);
    return {res,body};
  };
  const threeMinAgo=new Date(Date.now()-3*60*1000).toISOString();
  try{
    process.env.GITHUB_TOKEN='test-token';
    process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='$0.10-$0.25';
    const urls=[],methods=[];
    global.fetch=async(url,options={})=>{
      urls.push(String(url));methods.push(options.method||'GET');
      return {ok:true,status:200,json:async()=>({workflow_runs:[{status:'completed',created_at:threeMinAgo},{status:'completed',created_at:'2026-10-01T00:00:00Z'}]})};
    };
    const got=await call({method:'GET',query:{project:'state'}});
    assert.strictEqual(got.res.code,200);
    assert.strictEqual(got.res.headers['Cache-Control'],'no-store','cooldown data must never be cached');
    assert.strictEqual(got.body.last_run_started_at,threeMinAgo);
    assert.strictEqual(got.body.last_run_ref,'main');
    assert.strictEqual(got.body.button_label,'Run AI evals','existing fields are kept');
    assert.strictEqual(got.body.configured,true);
    assert.deepStrictEqual(Object.keys(got.body).slice(0,Object.keys(runApi.runInfo('state')).length),Object.keys(runApi.runInfo('state')));
    assert.strictEqual(urls.length,1);
    assert.match(urls[0],/^https:\/\/api\.github\.com\/repos\/pedringt\/ai-learning\/actions\/workflows\/question-review-live\.yml\/runs\?branch=main&per_page=10$/);
    const getUrl=urls[0];

    const staging=await call({method:'GET',query:{project:'state',env:'staging'}});
    assert.strictEqual(staging.body.last_run_ref,'staging');
    assert.match(urls[1],/branch=staging/,'the staging page checks the staging ref, like a staging-recorded POST');

    // Same source: the POST cooldown reads the same URL and refuses with the matching remaining time.
    urls.length=0;methods.length=0;
    const posted=await call({method:'POST',body:{project:'state',suite:'all',record_environment:'production',confirm_paid_model_calls:true,estimated_cost:'$0.10-$0.25'}});
    assert.strictEqual(posted.res.code,429);
    assert.deepStrictEqual(methods,['GET'],'a cooled-down POST never dispatches');
    assert.strictEqual(urls[0],getUrl,'GET and POST cooldown use the same GitHub lookup');
    const remaining=posted.body.retry_after_seconds;
    assert.ok(remaining>=419&&remaining<=420,'3 minutes in leaves ~7 minutes: '+remaining);
    assert.strictEqual(runApi.latestRunStartedAt([{created_at:threeMinAgo}]),threeMinAgo);
    assert.strictEqual(runApi.latestRunStartedAt([]),null);
    assert.strictEqual(runApi.latestRunStartedAt([{created_at:'nope'}]),null);
    const runSource=fs.readFileSync(require.resolve('../api/project-health-run.js'),'utf8');
    assert.strictEqual((runSource.match(/\/runs\?branch=/g)||[]).length,1,'one GitHub run-lookup path, shared by GET and POST');
    assert.strictEqual((runSource.match(/fetchRecentRuns\(/g)||[]).length,3,'defined once, used by the POST and the GET helper');

    // Lookup failures are null, never a failed GET.
    global.fetch=async()=>({ok:false,status:403,json:async()=>({message:'rate limited'})});
    const refused=await call({method:'GET',query:{project:'state'}});
    assert.strictEqual(refused.res.code,200);
    assert.strictEqual(refused.body.last_run_started_at,null);
    assert.strictEqual(refused.body.label,'State AI evals');
    global.fetch=async()=>{throw new Error('network down');};
    const thrown=await call({method:'GET',query:{project:'tastemake'}});
    assert.strictEqual(thrown.res.code,200);
    assert.strictEqual(thrown.body.last_run_started_at,null);
    global.fetch=async()=>({ok:true,status:200,json:async()=>({workflow_runs:[]})});
    assert.strictEqual((await call({method:'GET',query:{project:'narc'}})).body.last_run_started_at,null,'no runs yet');
    delete process.env.GITHUB_TOKEN;
    let fetched=false;global.fetch=async()=>{fetched=true;throw new Error('should not fetch');};
    const noToken=await call({method:'GET',query:{project:'state'}});
    assert.strictEqual(noToken.res.code,200);
    assert.strictEqual(noToken.body.last_run_started_at,null);
    assert.strictEqual(fetched,false,'no token, no lookup');
    assert.strictEqual((await call({method:'GET',query:{project:'nope'}})).res.code,404);
  }finally{
    global.fetch=originalFetch;
    if(savedEnv.GITHUB_TOKEN==null)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=savedEnv.GITHUB_TOKEN;
    if(savedEnv.COST==null)delete process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;else process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE=savedEnv.COST;
  }
}).catch(error=>{console.error(error);process.exit(1);});

const deploymentSummary=activity.summarizeDeployments([
  {uid:'preview-cancel',name:'state',target:null,state:'CANCELED',created:400,errorMessage:'Preview canceled'},
  {uid:'ready-new',name:'state',target:'production',state:'READY',created:300},
  {uid:'bad-old',name:'state',target:'production',state:'ERROR',created:200,errorMessage:'Build failed'},
  {uid:'ready-old',name:'state',target:'production',state:'READY',created:100}
]);
assert.strictEqual(deploymentSummary.total,3);
assert.ok(!deploymentSummary.recent_failures.some(item=>item.id==='preview-cancel'));
assert.strictEqual(deploymentSummary.failed,1);
assert.strictEqual(deploymentSummary.recent_failures[0].recovered,true);

const skippedDeploymentSummary=activity.summarizeDeployments([
  {uid:'skip-new',name:'state',target:'production',state:'CANCELED',created:400,errorMessage:'The deployment was canceled because the Ignored Build Step command returned exit code 0.'},
  {uid:'ready-current',name:'state',target:'production',state:'READY',created:300},
  {uid:'bad-old',name:'state',target:'production',state:'ERROR',created:200,errorMessage:'Build failed'}
]);
assert.strictEqual(activity.isIgnoredBuildSkip(skippedDeploymentSummary.latest),false);
assert.strictEqual(skippedDeploymentSummary.skipped,1);
assert.strictEqual(skippedDeploymentSummary.failed,1);
assert.strictEqual(skippedDeploymentSummary.latest.uid,'ready-current');
assert.ok(!skippedDeploymentSummary.recent_failures.some(item=>item.id==='skip-new'));

const parsedRows=activity.parseRuntimeRows('{"level":"error","message":"boom","requestPath":"/api/ask","responseStatusCode":500,"timestampInMs":100}\n{"level":"info","message":"ok"}');
assert.strictEqual(parsedRows.length,2);
const runtimeIssues=activity.runtimeIssues(parsedRows,'https://vercel.com/example');
assert.strictEqual(runtimeIssues.length,1);
assert.strictEqual(runtimeIssues[0].path,'/api/ask');
assert.strictEqual(runtimeIssues[0].count,1);
assert.strictEqual(activity.safeText('ANTHROPIC_API_KEY=secret').includes('secret'),false);
assert.strictEqual(activity.safeText('vcp_supersecrettoken').includes('supersecrettoken'),false);

const safeFailure=stateQuality.safeFailureDetail({
  scenario_id:'review_direct_reversal',
  category:'direct_reversal',
  severity:'high',
  expected:'update_state',
  observed:'preserve_evidence_only',
  failed_checks:['interpretation'],
  raw_answer:'private model output'
});
assert.strictEqual(safeFailure.scenario_id,'review_direct_reversal');
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeFailure,'raw_answer'),false);
assert.deepStrictEqual(safeFailure.failed_checks,['interpretation']);

const saved={
  GITHUB_TOKEN:process.env.GITHUB_TOKEN,
  PROJECT_HEALTH_RUN_KEY:process.env.PROJECT_HEALTH_RUN_KEY,
  PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE:process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE,
  VERCEL_ENV:process.env.VERCEL_ENV
};
delete process.env.GITHUB_TOKEN;
delete process.env.PROJECT_HEALTH_RUN_KEY;
delete process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;
process.env.VERCEL_ENV='production';
assert.strictEqual(runApi.runInfo('state').configured,false);
assert.strictEqual(runApi.runInfo('state').minimum_controlled_cases,10);
assert.strictEqual(runApi.runInfo('state').ref,'main');
assert.deepStrictEqual(runApi.runInfo('state').refs,{production:'main',staging:'staging'});
assert.strictEqual(runApi.runRef(runApi.RUNS.state,'state','production'),'main');
assert.strictEqual(runApi.runRef(runApi.RUNS.state,'state','staging'),'staging');
assert.strictEqual(runApi.runRef(runApi.RUNS.tastemake,'tastemake','production'),'main');
assert.strictEqual(runApi.runInfo('state').can_run_here,true);
assert.strictEqual(runApi.runInfo('state').button_label,'Run AI evals');
assert.match(runApi.runInfo('state').protection,/Paid-model confirmation/);
assert.strictEqual(runApi.RUN_COOLDOWN_MS,10*60*1000);
assert.strictEqual(runApi.runInfo('tastemake').configured,false);
assert.strictEqual(runApi.runInfo('tastemake').paid_model_calls,false);
assert.strictEqual(runApi.runInfo('tastemake').button_label,'Run recommendation checks');
assert.strictEqual(runApi.runInfo('narc').button_label,'Run game checks');

process.env.GITHUB_TOKEN='test-token';
process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='$0.10-$0.25';
process.env.VERCEL_ENV='preview';
const ready=runApi.runInfo('state');
assert.strictEqual(ready.configured,true);
assert.strictEqual(ready.can_run_here,true);
assert.strictEqual(ready.estimated_cost,'$0.10-$0.25');
assert.strictEqual(runApi.runInfo('tastemake').configured,true);
assert.strictEqual(runApi.runInfo('narc').configured,true);

for(const [key,value] of Object.entries(saved)){
  if(value===undefined) delete process.env[key];
  else process.env[key]=value;
}

const evalSummary=projectQuality.summarizeEval({
  producer:'endpoint',
  contract:'2026-09-22',
  fixtures:[
    {id:'a',error:null,scores:[
      {kind:'rule',name:'grounded',pass:true},
      {kind:'quality',name:'all proposals valid',pass:true},
      {kind:'quality',name:'grounding coverage',pass:null,detail:'ok'}
    ]},
    {id:'b',error:null,scores:[
      {kind:'rule',name:'grounded',pass:false},
      {kind:'quality',name:'all proposals valid',pass:false}
    ]}
  ],
  selfTest:[{caught:true},{caught:false}]
});
assert.deepStrictEqual(evalSummary.rule_checks,{passed:1,total:2,failed:1});
assert.deepStrictEqual(evalSummary.valid_fixture_outputs,{passed:1,total:2,failed:1});
assert.deepStrictEqual(evalSummary.validator_self_test,{caught:1,total:2,missed:1});
assert.deepStrictEqual(evalSummary.failing_fixtures,['b']);

const attention=projectQuality.tastemakeAttention(
  {valid_fixture_outputs:{failed:2}},
  {rule_checks:{failed:0},validator_self_test:{missed:0}},
  {conclusion:'success'}
);
// Baseline fixture failures are historical comparison evidence, not a current warning (PR #422).
assert.strictEqual(attention.length,1);
assert.strictEqual(attention[0].kind,'good');
assert.doesNotMatch(attention[0].title,/Baseline still has/);
assert.match(attention[0].detail,/historical comparison/i);
// ...but real current problems still raise attention.
const ruleFailure=projectQuality.tastemakeAttention({valid_fixture_outputs:{failed:2}},{rule_checks:{failed:1},validator_self_test:{missed:0}},{conclusion:'success'});
assert.ok(ruleFailure.some(item=>item.kind==='bad'&&/rule failures/i.test(item.title)));
const validatorMiss=projectQuality.tastemakeAttention({valid_fixture_outputs:{failed:2}},{rule_checks:{failed:0},validator_self_test:{missed:1}},{conclusion:'success'});
assert.ok(validatorMiss.some(item=>item.kind==='bad'&&/Validator self-test/i.test(item.title)));
const ciNotGreen=projectQuality.tastemakeAttention({valid_fixture_outputs:{failed:2}},{rule_checks:{failed:0},validator_self_test:{missed:0}},{conclusion:'failure'});
assert.ok(ciNotGreen.some(item=>item.kind==='bad'&&/Main QA is not green/i.test(item.title)));

assert.deepStrictEqual(
  projectQuality.parseNarcHandoff('All three test suites are green on main as of this commit. The only real next step is #70 — a full ~15-minute playtest. #88 analytics stays blocked until then.'),
  {recorded_all_suites_green:true,full_playtest_pending:true,analytics_blocked_until_playtest:true}
);

console.log('Project Health API tests passed');

// Authority Lab: test counts come from node --test summaries in the CI job log (TAP "#" in CI, "ℹ" in a terminal).
{
  const q=require('../api/project-health-project-quality.js')._test;
  assert.deepStrictEqual(q.parseNodeTestSummaries('2026-10-16T20:39:50.98Z # tests 399\n2026-10-16T20:39:50.98Z # pass 399\n2026-10-16T20:39:50.98Z # fail 0\nnoise # tests skipped words\nℹ tests 46\nℹ pass 45\nℹ fail 1'),
    [{tests:399,pass:399,fail:0},{tests:46,pass:45,fail:1}]);
  assert.deepStrictEqual(q.parseNodeTestSummaries('no summary here'),[]);
}
