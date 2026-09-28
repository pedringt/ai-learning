const RUNS={
  state:{
    repo:'pedringt/ai-learning',
    workflow:'question-review-live.yml',
    ref:'staging',
    label:'State controlled Review + Ask checks',
    paid_model_calls:true,
    minimum_controlled_cases:16,
    costEstimateEnv:'PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE',
    note:'Runs 8 Review interpretation cases, 8 Ask quality cases, plus the existing live walkthrough job. The dashboard will not enable the run control until an explicit cost estimate is configured.'
  }
};

function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}');}catch(_){return {};}
}

function runInfo(projectId){
  const run=RUNS[projectId];
  if(!run) return null;
  const costEstimate=String(process.env[run.costEstimateEnv]||'').trim();
  return {
    configured:!!(process.env.GITHUB_TOKEN&&process.env.PROJECT_HEALTH_RUN_KEY&&costEstimate),
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
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=1800');
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
    res.status(503).json({detail:'Dashboard-run credentials and cost estimate are not configured yet.'});
    return;
  }

  const supplied=String(req.headers['x-project-health-key']||'');
  if(!supplied||supplied!==process.env.PROJECT_HEALTH_RUN_KEY){
    res.status(401).json({detail:'Admin key required'});
    return;
  }

  if(body.confirm_paid_model_calls!==true || body.estimated_cost!==info.estimated_cost){
    res.status(400).json({detail:'Paid model-call confirmation for the displayed cost estimate is required before starting this workflow.'});
    return;
  }

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
      body:JSON.stringify({ref:run.ref})
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
    actions_url:'https://github.com/'+run.repo+'/actions'
  });
};

module.exports._test={RUNS,runInfo};