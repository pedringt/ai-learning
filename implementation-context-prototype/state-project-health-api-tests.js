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
assert.strictEqual(platform.percentDelta(120,100),20);
assert.strictEqual(platform.percentDelta(0,0),null);

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
