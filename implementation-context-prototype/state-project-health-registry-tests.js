// #620: Project Health's serverless functions each carry their own project registry (Vercel ids, repos, branches,
// eval workflows), and the State API config exists twice (one per Vercel project root). Merging them would touch five
// production functions for little gain, so this fails as soon as the shared fields drift apart instead.
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const api=name=>require(path.join(root,'api',name))._test;
const model=require(path.join(root,'project-health-model.js')).PROJECTS;
const activity=api('project-health-activity.js').PROJECTS;
const investigate=api('project-health-investigate.js').PROJECTS;
const platform=api('project-health-platform.js').PROJECTS;
const github=api('project-health-github.js').PROJECTS;
const runs=api('project-health-run.js').RUNS;

let pass=0;
function check(name,fn){fn();pass++;console.log('ok',name);}
const ids=model.map(p=>p.id).sort();

check('every registry lists the same projects',()=>{
  for(const [name,registry] of Object.entries({activity,investigate,platform,github,runs}))
    assert.deepStrictEqual(Object.keys(registry).sort(),ids,name);
  const decisions=fs.readFileSync(path.join(root,'api','project-health-decisions.js'),'utf8');
  const listed=JSON.parse(decisions.match(/const PROJECTS=new Set\((\[[^\]]*\])\)/)[1].replace(/'/g,'"')).sort();
  assert.deepStrictEqual(listed,ids,'decisions');
});
check('Vercel project ids agree',()=>{
  for(const id of ids){
    const seen=new Set([activity[id].vercelProjectId,investigate[id].vercelProjectId,platform[id].vercelProjectId].filter(Boolean));
    assert.strictEqual(seen.size,1,id+': '+[...seen].join(', '));
  }
});
check('repos agree with the dashboard model',()=>{
  for(const p of model){
    assert.strictEqual(investigate[p.id].repo,p.repo,'investigate '+p.id);
    assert.strictEqual(runs[p.id].repo,p.repo,'run '+p.id);
    assert.strictEqual(github[p.id].repo,p.repo,'github '+p.id);
  }
});
check('production and staging branches agree',()=>{
  for(const p of model){
    assert.strictEqual(investigate[p.id].branches.production,p.branch,'investigate '+p.id);
    assert.strictEqual(runs[p.id].refs?.production||runs[p.id].ref,p.branch,'run '+p.id);
    if(p.stagingBranch){
      assert.strictEqual(investigate[p.id].branches.staging,p.stagingBranch,'investigate staging '+p.id);
      assert.strictEqual(runs[p.id].refs?.staging,p.stagingBranch,'run staging '+p.id);
    }
  }
});
check('both copies of api/state-config.js are identical',()=>{
  const portfolio=fs.readFileSync(path.join(root,'api','state-config.js'),'utf8');
  const state=fs.readFileSync(path.join(__dirname,'api','state-config.js'),'utf8');
  assert.strictEqual(state,portfolio,'implementation-context-prototype/api/state-config.js differs from api/state-config.js');
});
console.log(`\n${pass} passed, 0 failed`);
