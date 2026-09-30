const RUNS={
  state:{
    repo:'pedringt/ai-learning',
    workflow:'question-review-live.yml',
    ref:'staging',
    label:'State AI quality checks',
    paid_model_calls:true,
    minimum_controlled_cases:10,
    costEstimateEnv:'PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE',
    note:'Runs controlled checks for update understanding, answer quality, or both. Aggregate results can be recorded back into the selected Project Health environment.'
  }
};

function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}');}catch(_){return {};}
}

function isProtectedEnvironment(){
  return String(process.env.VERCEL_ENV||'development').toLowerCase()!=='production';
}

function runInfo(projectId){
  const run=RUNS[projectId];
  if(!run) return null;
  const costEstimate=String(process.env[run.costEstimateEnv]||'').trim();
  return {
    configured:!!(process.env.GITHUB_TOKEN&&costEstimate),
    can_run_here:isProtectedEnvironment(),
    protection:isProtectedEnvironment()?'Protected preview + paid-run confirmation':'Protected preview required',
    project:projectId,
    label:run.label,
    ref:run.ref,
    paid_model_calls:run.paid_model_calls,
    minimum_controlled_cases:run.minimum_controlled_cases,
    estimated_cost:costEstimate||null,
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

  if(!info.can_run_here){
    res.status(403).json({detail:'Paid AI quality checks can only be started from the protected Project Health preview.'});
    return;
  }

  if(!info.configured){
    res.status(503).json({detail:'Dashboard-run credentials and cost estimate are not configured yet.'});
    return;
  }

  if(body.confirm_paid_model_calls!==true || body.estimated_cost!==info.estimated_cost){
    res.status(400).json({detail:'Paid model-call confirmation for the displayed cost estimate is required before starting this workflow.'});
    return;
  }
  const suite=['all','review','ask'].includes(String(body.suite||'all'))?String(body.suite||'all'):'all';
  const recordEnvironment=String(body.record_environment||'production')==='staging'?'staging':'production';

  const response=await fetch(
    'https://api.github.com/repos/'+run.repo+'/actions/workflows/'+encodeURIComponent(run.workflow)+'/dispatches',
    {
      method:'POST',
      headers:{
        Authorization:'Bearer '+process.env.GITHUB_TOKEN,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json'
      },
      body:JSON.stringify({ref:run.ref,inputs:{suite,record_environment:recordEnvironment}})
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
    ref:run.ref,
    estimated_cost:info.estimated_cost,
    suite,
    record_environment:recordEnvironment,
    actions_url:'https://github.com/'+run.repo+'/actions'
  });
};

module.exports._test={RUNS,runInfo,isProtectedEnvironment};