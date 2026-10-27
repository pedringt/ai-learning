// Project Health's decision and change log (Oct 27). Entries live in the State backend (project_health_decisions_api.py)
// because this dashboard has no database. Reads are public. Writes and removals pass Paige's admin key through in a
// header; the State API checks it against PROJECT_HEALTH_DECISION_KEY, so the key is never stored here.
// Production writes to the production State API; previews and staging write to the staging one, which re-seeds on deploy.
const STATE_API={production:'https://state-api-6waw.onrender.com',other:'https://state-api-staging.onrender.com'};
const PROJECTS=new Set(['state','tastemake','narc','authority-lab']);
const TYPES=new Set(['decision','change','experiment']);
const MAX_BODY_BYTES=4000;

function apiBase(env=process.env.VERCEL_ENV){return env==='production'?STATE_API.production:STATE_API.other;}
function readBody(req){
  if(req.body&&typeof req.body==='object') return Buffer.byteLength(JSON.stringify(req.body))<=MAX_BODY_BYTES?req.body:null;
  const raw=String(req.body||'');
  if(Buffer.byteLength(raw)>MAX_BODY_BYTES) return null;
  try{return JSON.parse(raw||'{}');}catch(_){return null;}
}
function safeEntry(value){
  if(!value||typeof value!=='object')return null;
  const id=String(value.id||''),type=String(value.type||''),text=String(value.text||''),createdAt=String(value.createdAt||'');
  if(!/^phdec_[0-9a-f]{16}$/.test(id)||!TYPES.has(type)||!text)return null;
  return {id,type,text:text.slice(0,1000),createdAt:createdAt.slice(0,40)};
}
async function forward(path,options,{fetchImpl=fetch,timeoutMs=9000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(apiBase()+path,{...options,signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    return {status:response.status,payload};
  }catch(error){
    return {status:error?.name==='AbortError'?504:502,payload:{detail:error?.name==='AbortError'?'The State API is still waking up. Try again in a minute.':'The State API is unavailable.'}};
  }finally{clearTimeout(timer);}
}

async function handler(req,res,deps={}){
  res.setHeader('Cache-Control','no-store');
  const key=String(req.headers?.['x-project-health-decision-key']||'').slice(0,200);
  if(req.method==='GET'){
    const project=String(req.query?.project||'');
    if(!PROJECTS.has(project))return res.status(400).json({detail:'Unknown project.'});
    const result=await forward('/api/project-health-decisions?project='+encodeURIComponent(project),{headers:{Accept:'application/json'}},deps);
    if(result.status!==200)return res.status(result.status).json({detail:result.payload?.detail||'The decision log could not be loaded.'});
    return res.status(200).json({project,entries:(Array.isArray(result.payload?.entries)?result.payload.entries:[]).map(safeEntry).filter(Boolean)});
  }
  if(req.method==='POST'){
    const body=readBody(req);
    if(!body)return res.status(400).json({detail:'Invalid or oversized request.'});
    const payload={project:String(body.project||''),type:String(body.type||'decision'),text:String(body.text||'').trim()};
    if(!PROJECTS.has(payload.project)||!TYPES.has(payload.type)||!payload.text||payload.text.length>1000)return res.status(400).json({detail:'Unsupported project, type, or text.'});
    if(!key)return res.status(401).json({detail:'Enter the decision log key to add an entry.'});
    const result=await forward('/api/project-health-decisions',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json','X-Project-Health-Decision-Key':key},body:JSON.stringify(payload)},deps);
    if(result.status!==201)return res.status(result.status).json({detail:result.payload?.detail||'The entry was not saved.'});
    return res.status(201).json(safeEntry(result.payload)||{});
  }
  if(req.method==='DELETE'){
    const id=String(req.query?.id||'');
    if(!/^phdec_[0-9a-f]{16}$/.test(id))return res.status(400).json({detail:'Unknown entry.'});
    if(!key)return res.status(401).json({detail:'Enter the decision log key to remove an entry.'});
    const result=await forward('/api/project-health-decisions/'+id,{method:'DELETE',headers:{Accept:'application/json','X-Project-Health-Decision-Key':key}},deps);
    return res.status(result.status).json(result.status===200?{status:'removed',id}:{detail:result.payload?.detail||'The entry was not removed.'});
  }
  res.setHeader('Allow','GET, POST, DELETE');
  return res.status(405).json({detail:'Method not allowed'});
}
module.exports=handler;
module.exports._test={apiBase,safeEntry,handler};
