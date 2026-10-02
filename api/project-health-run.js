const RUNS={
  state:{
    repo:'pedringt/ai-learning',
    workflow:'question-review-live.yml',
    ref:'staging',
    label:'State AI evals',
    button_label:'Run AI evals',
    paid_model_calls:true,
    minimum_controlled_cases:10,
    suites:['all','review','ask'],
    costEstimateEnv:'PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE',
    note:'Runs controlled AI evals for update understanding, answer quality, or both. Aggregate results can be recorded back into the selected Project Health environment.'
  },
  tastemake:{
    repo:'pedringt/tastemake',
    workflow:'test.yml',
    ref:'main',
    label:'Tastemake recommendation checks',
    button_label:'Run recommendation checks',
    paid_model_calls:false,
    suites:['all'],
    note:'Runs Tastemake\'s existing automated QA suite, including its free deterministic recommendation eval and validator checks.'
  },
  narc:{
    repo:'pedringt/narc',
    workflow:'quality-checks.yml',
    ref:'main',
    label:'NARC game quality checks',
    button_label:'Run game checks',
    paid_model_calls:false,
    suites:['all'],
    note:'Runs NARC\'s core game regression, single-day engine, and desktop integration suites. The human first-run playtest remains a separate product-quality gate.'
  }
};

function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}');}catch(_){return {};}
}

const RUN_COOLDOWN_MS=10*60*1000;

function runInfo(projectId){
  const run=RUNS[projectId];
  if(!run) return null;
  const costEstimate=run.costEstimateEnv?String(process.env[run.costEstimateEnv]||'').trim():null;
  return {
    configured:!!(process.env.GITHUB_TOKEN&&(!run.paid_model_calls||costEstimate)),
    can_run_here:true,
    protection:run.paid_model_calls
      ?'Paid-model confirmation, one active run at a time, and a 10-minute cooldown'
      :'Public run with one active run at a time and a 10-minute cooldown',
    project:projectId,
    label:run.label,
    button_label:run.button_label,
    ref:run.ref,
    paid_model_calls:run.paid_model_calls,
    minimum_controlled_cases:run.minimum_controlled_cases||null,
    estimated_cost:costEstimate||null,
    suites:run.suites,
    note:run.note
  };
}

module.exports=async function handler(req,res){
  if(req.method==='GET'){
    const projectId=String(req.query?.project||'state').toLowerCase();
    const info=runInfo(projectId);
    if(!info){res.status(404).json({configured:false,detail:'No dashboard-run workflow is configured for this project yet.'});return;}
    res.setHeader('Cache-Control','no-store');
    res.status(200).json(info);
    return;
  }

  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    res.status(405).json({detail:'Method not allowed'});
    return;
  }

  const body=readBody(req);
  const projectId=String(body.project||'').toLowerCase();
  const run=RUNS[projectId];
  const info=runInfo(projectId);
  if(!run||!info){res.status(404).json({detail:'No runnable workflow is configured for this project yet.'});return;}

  if(!info.configured){
    res.status(503).json({detail:'Dashboard-run credentials'+(run.paid_model_calls?' and cost estimate':'')+' are not configured yet.'});
    return;
  }

  if(run.paid_model_calls&&(body.confirm_paid_model_calls!==true || body.estimated_cost!==info.estimated_cost)){
    res.status(400).json({detail:'Paid model-call confirmation for the displayed cost estimate is required before starting this workflow.'});
    return;
  }

  const requestedSuite=String(body.suite||'all');
  const suite=run.suites.includes(requestedSuite)?requestedSuite:'all';
  const recordEnvironment=String(body.record_environment||'production')==='staging'?'staging':'production';

  const githubHeaders={
    Authorization:'Bearer '+process.env.GITHUB_TOKEN,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'
  };
  const runsResponse=await fetch(
    'https://api.github.com/repos/'+run.repo+'/actions/workflows/'+encodeURIComponent(run.workflow)+'/runs?branch='+encodeURIComponent(run.ref)+'&per_page=10',
    {headers:githubHeaders}
  );
  if(!runsResponse.ok){
    const payload=await runsResponse.json().catch(()=>({}));
    res.status(runsResponse.status).json({detail:payload?.message||'Could not check recent quality runs'});
    return;
  }
  const recentPayload=await runsResponse.json().catch(()=>({workflow_runs:[]}));
  const workflowRuns=Array.isArray(recentPayload.workflow_runs)?recentPayload.workflow_runs:[];
  const active=workflowRuns.find(item=>['queued','in_progress','waiting','requested','pending'].includes(String(item.status||'').toLowerCase()));
  if(active){
    res.status(409).json({detail:'Quality checks are already running. Wait for the current run to finish before starting another one.',actions_url:active.html_url||null});
    return;
  }
  const latest=workflowRuns[0]||null;
  const latestStarted=latest?.created_at?new Date(latest.created_at).getTime():NaN;
  const elapsed=Number.isFinite(latestStarted)?Date.now()-latestStarted:Infinity;
  if(elapsed>=0&&elapsed<RUN_COOLDOWN_MS){
    const retryAfter=Math.max(1,Math.ceil((RUN_COOLDOWN_MS-elapsed)/1000));
    res.setHeader('Retry-After',String(retryAfter));
    res.status(429).json({detail:'Quality checks were started recently. Try again in about '+Math.ceil(retryAfter/60)+' minute'+(Math.ceil(retryAfter/60)===1?'':'s')+'.',retry_after_seconds:retryAfter});
    return;
  }

  const dispatchBody={ref:run.ref};
  if(projectId==='state') dispatchBody.inputs={suite,record_environment:recordEnvironment};
  const response=await fetch(
    'https://api.github.com/repos/'+run.repo+'/actions/workflows/'+encodeURIComponent(run.workflow)+'/dispatches',
    {
      method:'POST',
      headers:{...githubHeaders,'Content-Type':'application/json'},
      body:JSON.stringify(dispatchBody)
    }
  );

  if(!response.ok){
    const payload=await response.json().catch(()=>({}));
    res.status(response.status).json({detail:payload?.message||'GitHub workflow dispatch failed'});
    return;
  }

  res.setHeader('Cache-Control','no-store');
  res.status(202).json({
    started:true,
    project:projectId,
    label:run.label,
    button_label:run.button_label,
    ref:run.ref,
    paid_model_calls:run.paid_model_calls,
    estimated_cost:info.estimated_cost,
    suite,
    record_environment:projectId==='state'?recordEnvironment:null,
    actions_url:'https://github.com/'+run.repo+'/actions',
    baseline_updated_at:body.baseline_updated_at||null
  });
};

module.exports._test={RUNS,runInfo,RUN_COOLDOWN_MS};
