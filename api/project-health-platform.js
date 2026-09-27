const TEAM_ID='team_UxrzvAczWhPiXlO3nvWPAu5b';

const PROJECTS={
  state:{
    vercelProjectId:'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_STATE',
    render:{
      production:'https://state-api-6waw.onrender.com/health',
      staging:'https://state-api-staging.onrender.com/health'
    }
  },
  tastemake:{
    vercelProjectId:'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_TASTEMAKE'
  },
  narc:{
    vercelProjectId:'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_NARC'
  }
};

async function timedJson(url,options={}){
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    return {ok:response.ok,status:response.status,payload,latency_ms:Date.now()-started};
  }catch(error){
    return {ok:false,status:null,payload:{},latency_ms:Date.now()-started,error:error?.name==='AbortError'?'timeout':'unavailable'};
  }finally{
    clearTimeout(timer);
  }
}

function safeRenderHealth(result){
  const p=result.payload||{};
  return {
    ok:!!result.ok,
    status:result.status,
    latency_ms:result.latency_ms,
    build:p.build||p.commit||p.version||null,
    service_status:p.status||p.state||null,
    error:result.error||null
  };
}

async function renderHealth(project){
  if(!project.render) return {configured:false};
  const entries=await Promise.all(Object.entries(project.render).map(async ([environment,url])=>{
    return [environment,safeRenderHealth(await timedJson(url,{headers:{Accept:'application/json'}}))];
  }));
  return {configured:true,environments:Object.fromEntries(entries)};
}

function isoDay(date){return date.toISOString().slice(0,10);}

async function vercelAnalytics(project){
  const token=process.env.VERCEL_TOKEN;
  if(!token) return {configured:false,reason:'VERCEL_TOKEN not configured'};
  const until=new Date();
  const since=new Date(until.getTime()-30*24*60*60*1000);
  const qs=new URLSearchParams({
    projectId:project.vercelProjectId,
    since:isoDay(since),
    until:isoDay(until),
    teamId:TEAM_ID
  });
  const result=await timedJson('https://api.vercel.com/v1/query/web-analytics/visits/count?'+qs.toString(),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  if(!result.ok){
    return {configured:true,available:false,status:result.status,error:result.error||result.payload?.error?.message||result.payload?.message||'Web Analytics unavailable'};
  }
  const data=result.payload?.data||{};
  return {
    configured:true,
    available:true,
    period_days:30,
    pageviews:Number.isFinite(Number(data.pageviews))?Number(data.pageviews):null,
    visitors:Number.isFinite(Number(data.visitors))?Number(data.visitors):null
  };
}

async function neonHealth(project){
  const token=process.env.NEON_API_KEY;
  const projectId=process.env[project.neonProjectEnv];
  if(!token||!projectId){
    return {configured:false,reason:!token?'NEON_API_KEY not configured':project.neonProjectEnv+' not configured'};
  }
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  const [projectResult,branchesResult]=await Promise.all([
    timedJson('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(projectId),{headers}),
    timedJson('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(projectId)+'/branches?limit=100',{headers})
  ]);
  if(!projectResult.ok){
    return {configured:true,available:false,status:projectResult.status,error:projectResult.error||projectResult.payload?.message||'Neon project unavailable'};
  }
  const record=projectResult.payload?.project||projectResult.payload||{};
  const branches=Array.isArray(branchesResult.payload?.branches)?branchesResult.payload.branches:[];
  const primary=branches.find(branch=>branch.primary||branch.default)||branches.find(branch=>branch.name==='main')||null;
  return {
    configured:true,
    available:true,
    name:record.name||null,
    region_id:record.region_id||record.region||null,
    updated_at:record.updated_at||null,
    branch_count:branches.length,
    primary_branch:primary?.name||null,
    primary_branch_state:primary?.current_state||primary?.state||null
  };
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({detail:'Method not allowed'});
    return;
  }
  const projectId=String(req.query?.project||'').toLowerCase();
  const project=PROJECTS[projectId];
  if(!project){
    res.status(400).json({detail:'Unknown project'});
    return;
  }
  const [render,analytics,neon]=await Promise.all([
    renderHealth(project),
    vercelAnalytics(project),
    neonHealth(project)
  ]);
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    project:projectId,
    render,
    neon,
    analytics,
    privacy:{
      content_included:false,
      analytics_scope:'aggregate Web Analytics counts only'
    }
  });
};

module.exports._test={safeRenderHealth,PROJECTS};