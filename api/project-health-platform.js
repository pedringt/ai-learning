const TEAM_ID='team_UxrzvAczWhPiXlO3nvWPAu5b';

const PROJECTS={
  state:{
    vercelProjectId:'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_STATE',
    aiTelemetry:{kind:'state',url:'https://state-api-6waw.onrender.com/api/admin/product-analytics'},
    render:{
      production:'https://state-api-6waw.onrender.com/health',
      staging:'https://state-api-staging.onrender.com/health'
    }
  },
  tastemake:{
    vercelProjectId:'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_TASTEMAKE',
    aiTelemetry:{kind:'tastemake',url:'https://tastemake.vercel.app/api/ai-metrics'}
  },
  narc:{
    vercelProjectId:'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H',
    neonProjectEnv:'PROJECT_HEALTH_NEON_PROJECT_NARC',
    aiTelemetry:{kind:'none'}
  }
};

async function timedJson(url,options={}){
  const started=Date.now();
  const controller=new AbortController();
  const timeoutMs=Number(options.timeoutMs||5000);
  const fetchOptions={...options};delete fetchOptions.timeoutMs;
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...fetchOptions,signal:controller.signal});
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

async function renderSignal(project,environment){
  const url=project.render?.[environment];
  if(!url) return {configured:false};
  const timeoutMs=environment==='staging'?3500:4000;
  const result=await timedJson(url,{headers:{Accept:'application/json'},timeoutMs});
  return {configured:true,environments:{[environment]:safeRenderHealth(result)}};
}

function isoDay(date){return date.toISOString().slice(0,10);}

async function analyticsWindow(project,token,since,until){
  const qs=new URLSearchParams({
    projectId:project.vercelProjectId,
    since:isoDay(since),
    until:isoDay(until),
    teamId:TEAM_ID
  });
  return timedJson('https://api.vercel.com/v1/query/web-analytics/visits/count?'+qs.toString(),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    timeoutMs:4500
  });
}

function numericCount(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function percentDelta(current,previous){
  if(current==null||previous==null||previous===0) return null;
  return Math.round(((current-previous)/previous)*1000)/10;
}

async function vercelAnalytics(project){
  const token=process.env.VERCEL_TOKEN;
  if(!token) return {configured:false,reason:'VERCEL_TOKEN not configured'};
  const until=new Date();
  const since=new Date(until.getTime()-30*24*60*60*1000);
  const previousUntil=new Date(since.getTime()-24*60*60*1000);
  const previousSince=new Date(previousUntil.getTime()-30*24*60*60*1000);
  const [currentResult,previousResult]=await Promise.all([
    analyticsWindow(project,token,since,until),
    analyticsWindow(project,token,previousSince,previousUntil)
  ]);
  if(!currentResult.ok){
    return {configured:true,available:false,status:currentResult.status,error:currentResult.error||currentResult.payload?.error?.message||currentResult.payload?.message||'Web Analytics unavailable'};
  }
  const current=currentResult.payload?.data||{};
  const previous=previousResult.ok?(previousResult.payload?.data||{}):{};
  const pageviews=numericCount(current.pageviews);
  const visitors=numericCount(current.visitors);
  const previousPageviews=numericCount(previous.pageviews);
  const previousVisitors=numericCount(previous.visitors);
  return {
    configured:true,
    available:true,
    period_days:30,
    pageviews,
    visitors,
    previous_pageviews:previousPageviews,
    previous_visitors:previousVisitors,
    pageviews_delta_pct:percentDelta(pageviews,previousPageviews),
    visitors_delta_pct:percentDelta(visitors,previousVisitors),
    comparison_available:previousResult.ok
  };
}

async function aiTelemetry(project){
  const config=project.aiTelemetry;
  if(!config||config.kind==='none'){
    return {configured:false,not_applicable:true,reason:'This product does not make runtime AI calls.'};
  }
  const result=await timedJson(config.url,{headers:{Accept:'application/json'},timeoutMs:6500});
  if(!result.ok){
    return {configured:true,available:false,status:result.status,error:result.error||result.payload?.detail||result.payload?.error||'AI telemetry unavailable'};
  }
  if(config.kind==='state'){
    const reliability=result.payload?.reliability||{};
    const speed=reliability.ask_latency_ms||{};
    const cost=reliability.model_cost||{};
    const tokens=reliability.token_usage||{};
    return {
      configured:true,
      available:true,
      period_days:30,
      response_speed:{
        scope:'user-facing Ask requests',
        sample_size:Number(speed.sample_size||0),
        p50_ms:numericCount(speed.p50),
        p95_ms:numericCount(speed.p95)
      },
      cost:{
        estimated_usd:cost.estimated_usd==null?null:Number(cost.estimated_usd),
        priced_calls:Number(cost.priced_calls||0),
        unpriced_calls:Number(cost.unpriced_calls||0),
        pricing_as_of:cost.pricing_as_of||null,
        scope:cost.scope||'recorded State model calls',
        partial:Number(cost.unpriced_calls||0)>0
      },
      tokens:{
        input:Number(tokens.input||0),
        output:Number(tokens.output||0),
        sample_size:Number(tokens.sample_size||0)
      },
      operations:reliability.model_calls_by_operation||{},
      last_call_at:null,
      note:Number(cost.unpriced_calls||0)>0
        ?'Response speed covers Ask. Cost includes recorded State model calls with known pricing; unpriced calls are excluded.'
        :'Response speed covers Ask. Cost includes recorded interpretation and Ask model calls.'
    };
  }
  const payload=result.payload||{};
  return {
    configured:payload.configured!==false,
    available:payload.available!==false,
    period_days:Number(payload.period_days||30),
    response_speed:{
      scope:'live recommendation model calls',
      sample_size:Number(payload.sample_count||0),
      p50_ms:numericCount(payload.latency_ms?.p50),
      p95_ms:numericCount(payload.latency_ms?.p95)
    },
    cost:{
      estimated_usd:payload.estimated_cost_usd==null?null:Number(payload.estimated_cost_usd),
      pricing_as_of:payload.pricing_as_of||null,
      scope:payload.scope||'live recommendation model calls',
      partial:false
    },
    tokens:payload.tokens||null,
    last_call_at:payload.last_call_at||null,
    note:'Metadata only. Recommendation content and user taste data are not included.'
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
    timedJson('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(projectId),{headers,timeoutMs:4500}),
    timedJson('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(projectId)+'/branches?limit=100',{headers,timeoutMs:4500})
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
  const signal=String(req.query?.signal||'production-render').toLowerCase();
  const project=PROJECTS[projectId];
  if(!project){
    res.status(400).json({detail:'Unknown project'});
    return;
  }

  let payload;
  if(signal==='production-render') payload={render:await renderSignal(project,'production')};
  else if(signal==='staging-render') payload={render:await renderSignal(project,'staging')};
  else if(signal==='analytics') payload={analytics:await vercelAnalytics(project)};
  else if(signal==='neon') payload={neon:await neonHealth(project)};
  else if(signal==='ai-telemetry') payload={aiTelemetry:await aiTelemetry(project)};
  else {
    res.status(400).json({detail:'Unknown platform signal'});
    return;
  }

  res.setHeader('Cache-Control',signal.includes('render')?'s-maxage=15, stale-while-revalidate=60':'s-maxage=120, stale-while-revalidate=600');
  res.status(200).json({
    project:projectId,
    signal,
    ...payload,
    privacy:{
      content_included:false,
      analytics_scope:'aggregate Web Analytics counts and metadata-only AI operations telemetry'
    }
  });
};

module.exports._test={safeRenderHealth,numericCount,percentDelta,PROJECTS};
