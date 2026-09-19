const DEFAULT_STAGING_API='https://state-api-staging.onrender.com';

function projectHeaders(projectId){
  return projectId?{'X-State-Project-Id':projectId}:{};
}

async function fetchJson(fetchImpl,apiBase,path,projectId){
  const response=await fetchImpl(`${apiBase}${path}`,{headers:projectHeaders(projectId)});
  if(!response.ok){
    const text=await response.text().catch(()=>"");
    throw new Error(`State API ${path} failed with ${response.status}${text?`: ${text.slice(0,200)}`:""}`);
  }
  return response.json();
}

async function listProjects({fetchImpl=fetch,apiBase=DEFAULT_STAGING_API}={}){
  return fetchJson(fetchImpl,apiBase,'/api/projects');
}

async function collectDiagnostic({projectId,fetchImpl=fetch,apiBase=DEFAULT_STAGING_API}){
  if(!projectId) throw new Error('projectId is required');

  const [bootstrap,areas,resolvedQuestions,stoppedQuestions]=await Promise.all([
    fetchJson(fetchImpl,apiBase,'/api/bootstrap',projectId),
    fetchJson(fetchImpl,apiBase,'/api/project-areas',projectId),
    fetchJson(fetchImpl,apiBase,'/api/questions?status=resolved',projectId),
    fetchJson(fetchImpl,apiBase,'/api/questions?status=stopped',projectId),
  ]);

  const diagnostic={
    project:bootstrap.project,
    project_areas:areas.items||[],
    evidence:bootstrap.evidence||[],
    reviews:{
      open:bootstrap.open_reviews||[],
      resolved:bootstrap.resolved_reviews||[],
    },
    current_state:bootstrap.state||[],
    questions:{
      open:bootstrap.questions||[],
      resolved:resolvedQuestions.items||[],
      stopped:stoppedQuestions.items||[],
    },
    history:bootstrap.history||[],
    rules:bootstrap.rules||[],
  };

  diagnostic.counts={
    project_areas:diagnostic.project_areas.length,
    evidence:diagnostic.evidence.length,
    open_reviews:diagnostic.reviews.open.length,
    resolved_reviews:diagnostic.reviews.resolved.length,
    current_state:diagnostic.current_state.length,
    open_questions:diagnostic.questions.open.length,
    resolved_questions:diagnostic.questions.resolved.length,
    stopped_questions:diagnostic.questions.stopped.length,
    history:diagnostic.history.length,
    rules:diagnostic.rules.length,
  };

  return diagnostic;
}

async function handler(request,response){
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Content-Type','application/json; charset=utf-8');

  if(process.env.VERCEL_ENV==='production'){
    return response.status(404).json({error:'State diagnostics are unavailable in production.'});
  }
  if(request.method!=='GET'){
    response.setHeader('Allow','GET');
    return response.status(405).json({error:'Method not allowed.'});
  }

  const apiBase=(process.env.STATE_DIAGNOSTIC_API_BASE||DEFAULT_STAGING_API).replace(/\/$/,'');
  const projectId=(request.query&&request.query.project_id)||request.headers['x-state-project-id'];

  try{
    if(!projectId){
      const projects=await listProjects({apiBase});
      return response.status(200).json({
        message:'Pass ?project_id=<id> to inspect one staging project.',
        projects:projects.items||[],
        active:projects.active||null,
      });
    }
    const diagnostic=await collectDiagnostic({projectId,apiBase});
    return response.status(200).json(diagnostic);
  }catch(error){
    return response.status(502).json({error:'Could not load the staging project diagnostic.',detail:error.message});
  }
}

module.exports=handler;
module.exports.collectDiagnostic=collectDiagnostic;
module.exports.listProjects=listProjects;
module.exports.projectHeaders=projectHeaders;
