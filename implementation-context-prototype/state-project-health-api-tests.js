const assert=require('assert');

const platform=require('../api/project-health-platform.js')._test;
const runApi=require('../api/project-health-run.js')._test;

assert.deepStrictEqual(Object.keys(platform.PROJECTS),['state','tastemake','narc']);
assert.strictEqual(platform.PROJECTS.state.vercelProjectId,'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl');
assert.strictEqual(platform.PROJECTS.tastemake.vercelProjectId,'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu');
assert.strictEqual(platform.PROJECTS.narc.vercelProjectId,'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H');

assert.deepStrictEqual(
  platform.safeRenderHealth({ok:true,status:200,latency_ms:88,payload:{build:'abcdef123',status:'ok'}}),
  {ok:true,status:200,latency_ms:88,build:'abcdef123',service_status:'ok',error:null}
);

const saved={
  GITHUB_TOKEN:process.env.GITHUB_TOKEN,
  PROJECT_HEALTH_RUN_KEY:process.env.PROJECT_HEALTH_RUN_KEY,
  PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE:process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE
};
delete process.env.GITHUB_TOKEN;
delete process.env.PROJECT_HEALTH_RUN_KEY;
delete process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;
assert.strictEqual(runApi.runInfo('state').configured,false);
assert.strictEqual(runApi.runInfo('state').minimum_controlled_cases,16);
assert.strictEqual(runApi.runInfo('tastemake'),null);

process.env.GITHUB_TOKEN='test-token';
process.env.PROJECT_HEALTH_RUN_KEY='test-key';
process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='$0.10-$0.25';
const ready=runApi.runInfo('state');
assert.strictEqual(ready.configured,true);
assert.strictEqual(ready.estimated_cost,'$0.10-$0.25');

for(const [key,value] of Object.entries(saved)){
  if(value===undefined) delete process.env[key];
  else process.env[key]=value;
}

console.log('Project Health API tests passed');
