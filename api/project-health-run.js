const RUNS={
  state:{
    repo:'pedringt/ai-learning',
    workflow:'question-review-live.yml',
    ref:'staging',
    label:'State controlled Review + Ask checks',
    paid_model_calls:true,
    minimum_controlled_cases:16,
    note:'Runs 8 Review interpretation cases, 8 Ask quality cases, plus the existing live walkthrough job. Exact provider cost varies with model output and is not calculated here.'
  }
};

function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  try{return JSON.parse(req.body||'{}');}catch(_){return {};}
}

module.exports=async function handler(req,res){
  if(req.method==='GET'){
    const projectId=String(req.query?.project||'state').toLowerCase();
    const run=RUNS[projectId];
    if(!run){res.status(404).json({configured:false,detail:'No dashboard-run workflow is configured for this project yet.'});return;}
    res.setHeader('Cache-Control','no-store');
    res.status(200).json({
      configured:!!(process.env.GITHUB_TOKEN&&process.env.PROJECT_HEALTH_RUN_KEY),
      project:projectId,
      label:run.label,
      ref:run.ref,
      paid_model_calls:run.paid_model_calls,
      minimum_controlled_cases:run.minimum_controlled_cases,
      note:run.note
    });
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
  if(!run){res.status(404).json({detail:'No runnable workflow is configured for this project yet.'});return;}

  if(!process.env.GITHUB_TOKEN||!process.env.PROJECT_HEALTH_RUN_KEY){
    res.status(503).json({detail:'Dashboard-run credentials are not configured yet.'});
    return;
  }

  const supplied=String(req.headers['x-project-health-key']||'');
  if(!supplied||supplied!==process.env.PROJECT_HEALTH_RUN_KEY){
    res.status(401).json({detail:'Admin key required'});
    return;
  }

  if(body.confirm_paid_model_calls!==true){
    res.status(400).json({detail:'Paid model-call confirmation is required before starting this workflow.'});
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
    actions_url:'https://github.com/'+run.repo+'/actions'
  });
};

module.exports._test={RUNS};