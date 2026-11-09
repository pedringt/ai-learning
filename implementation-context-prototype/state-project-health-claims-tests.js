// DEC-012 guards (Nov 8): Project Health's paid actions take a cooldown claim in the State backend before they
// spend, so parallel requests cannot all get through. If the claim store cannot be reached, the action is allowed.
const assert=require('assert');
const path=require('path');
const {claimAction,releaseAction,claimKeyPart,stateApiBase}=require(path.join(__dirname,'..','api','_project-health-claims.js'));
const run=require(path.join(__dirname,'..','api','project-health-run.js'));
const investigate=require(path.join(__dirname,'..','api','project-health-investigate.js'));

const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});

(async()=>{
  // Helper outcomes.
  assert.deepStrictEqual(await claimAction('run:state:main',600,{key:'',fetchImpl:()=>{throw new Error('must not call');}}),{allowed:true,token:null},'no key: allowed, unguarded');
  assert.deepStrictEqual(await claimAction('run:state:main',600,{key:'k',fetchImpl:async()=>reply(200,{claimed:true,token:'t1'})}),{allowed:true,token:'t1'});
  assert.deepStrictEqual(await claimAction('run:state:main',600,{key:'k',fetchImpl:async()=>reply(409,{claimed:false,retry_after_seconds:420})}),{allowed:false,retryAfterSeconds:420});
  assert.deepStrictEqual(await claimAction('run:state:main',600,{key:'k',fetchImpl:async()=>reply(502,{})}),{allowed:true,token:null},'backend error: allowed (fail open)');
  assert.deepStrictEqual(await claimAction('run:state:main',600,{key:'k',fetchImpl:async()=>{throw new Error('timeout');}}),{allowed:true,token:null},'unreachable: allowed (fail open)');
  let sent=null;
  assert.strictEqual(await releaseAction('run:state:main','t1',{key:'k',env:'production',fetchImpl:async(url,options)=>{sent={url,body:JSON.parse(options.body),key:options.headers['X-Project-Health-Usage-Key']};return reply(200,{released:true});}}),true);
  assert.deepStrictEqual(sent,{url:'https://state-api-6waw.onrender.com/api/admin/project-health-claims/release',body:{claim_key:'run:state:main',token:'t1'},key:'k'});
  assert.strictEqual(stateApiBase('preview'),'https://state-api-staging.onrender.com','non-production deployments use the staging API');
  assert.strictEqual(claimKeyPart('Authority Lab/x'),'authority-lab-x');
  assert.strictEqual(investigate._test.INVESTIGATION_COOLDOWN_SECONDS,300,'Paige chose 5 minutes');

  // The eval run: when another request holds the claim, nothing is dispatched.
  const saved={token:process.env.GITHUB_TOKEN,key:process.env.PROJECT_HEALTH_USAGE_KEY,estimate:process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE};
  const realFetch=global.fetch;
  const handle=async claimStatus=>{
    const calls=[];
    global.fetch=async(url,options={})=>{
      calls.push(String(url));
      if(String(url).includes('/runs?branch='))return reply(200,{workflow_runs:[]});
      if(String(url).endsWith('/api/admin/project-health-claims'))return claimStatus===200?reply(200,{claimed:true,token:'t9'}):reply(409,{claimed:false,retry_after_seconds:540});
      if(String(url).endsWith('/claims/release'))return reply(200,{released:true});
      if(String(url).endsWith('/dispatches'))return reply(claimStatus===200?204:204,{});
      throw new Error('unexpected '+url);
    };
    const res={headers:{},code:null,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
    await run({method:'POST',body:{project:'state',confirm_paid_model_calls:true,estimated_cost:'$0.25',suite:'all',record_environment:'staging'}},res);
    return {res,calls};
  };
  try{
    process.env.GITHUB_TOKEN='gh';process.env.PROJECT_HEALTH_USAGE_KEY='k';process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='$0.25';
    const blocked=await handle(409);
    assert.strictEqual(blocked.res.code,429,'held claim: refused');
    assert.strictEqual(blocked.res.headers['Retry-After'],'540');
    assert.ok(!blocked.calls.some(u=>u.endsWith('/dispatches')),'held claim: nothing dispatched');
    const started=await handle(200);
    assert.strictEqual(started.res.code,202,'free claim: dispatched');
    assert.ok(started.calls.some(u=>u.endsWith('/dispatches')));
  }finally{
    global.fetch=realFetch;
    for(const [name,value] of [['GITHUB_TOKEN',saved.token],['PROJECT_HEALTH_USAGE_KEY',saved.key],['PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE',saved.estimate]]){
      if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
  }
  console.log('Project Health claim tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
