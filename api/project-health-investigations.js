// Project Health's shared investigation records (DEC-025, Nov 15). Records live in the State backend
// (project_health_investigations_api.py) because this dashboard has no database. Reads are public. A browser can ask
// the backend to record a State AI-eval investigation, which the backend verifies and writes itself; browsers never send
// summary text. Outcomes pass Paige's decision-log key through in a header; the State API checks it, so the key is
// never stored here. Production uses the production State API; previews and staging use the staging one.
const {stateApiBase}=require('./_project-health-claims.js');
const PROJECTS=new Set(['state','tastemake','narc','authority-lab']);
const OUTCOMES=new Set(['awaiting_evidence','investigating','accepted_limitation','resolved']);
const MAX_BODY_BYTES=2000;

function readBody(req){
  if(req.body&&typeof req.body==='object') return Buffer.byteLength(JSON.stringify(req.body))<=MAX_BODY_BYTES?req.body:null;
  const raw=String(req.body||'');
  if(Buffer.byteLength(raw)>MAX_BODY_BYTES) return null;
  try{return JSON.parse(raw||'{}');}catch(_){return null;}
}
function safeRecord(value){
  if(!value||typeof value!=='object')return null;
  const id=String(value.id||'');
  if(!/^phinv_[0-9a-f]{16}$/.test(id)||!PROJECTS.has(String(value.project||'')))return null;
  const outcome=OUTCOMES.has(String(value.outcome||''))?String(value.outcome):null;
  return {
    id,project:String(value.project),trigger:String(value.trigger||'').slice(0,120),summary:String(value.summary||'').slice(0,300),
    evidence:(Array.isArray(value.evidence)?value.evidence:[]).map(item=>String(item||'').slice(0,80)).filter(Boolean).slice(0,8),
    outcome,outcomeNote:String(value.outcomeNote||'').slice(0,500),outcomeAt:value.outcomeAt?String(value.outcomeAt).slice(0,40):null,
    createdAt:String(value.createdAt||'').slice(0,40),lastSeenAt:String(value.lastSeenAt||'').slice(0,40)
  };
}
async function forward(path,options,{fetchImpl=fetch,timeoutMs=9000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(stateApiBase()+path,{...options,signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    return {status:response.status,payload};
  }catch(error){
    return {status:error?.name==='AbortError'?504:502,payload:{detail:error?.name==='AbortError'?'The State API is still waking up. Try again in a minute.':'The State API is unavailable.'}};
  }finally{clearTimeout(timer);}
}

async function handler(req,res,deps={}){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    const project=String(req.query?.project||'');
    if(!PROJECTS.has(project))return res.status(400).json({detail:'Unknown project.'});
    const result=await forward('/api/project-health-investigations?project='+encodeURIComponent(project),{headers:{Accept:'application/json'}},deps);
    if(result.status!==200)return res.status(result.status).json({detail:result.payload?.detail||'Investigation records could not be loaded.'});
    return res.status(200).json({project,records:(Array.isArray(result.payload?.records)?result.payload.records:[]).map(safeRecord).filter(Boolean)});
  }
  if(req.method==='POST'){
    const body=readBody(req);
    if(!body)return res.status(400).json({detail:'Invalid or oversized request.'});
    if(body.action==='state-eval'){
      const scenario=body.scenarioId==null?null:String(body.scenarioId);
      if(scenario!==null&&!/^[a-z0-9_]{1,80}$/.test(scenario))return res.status(400).json({detail:'Unknown scenario.'});
      const result=await forward('/api/project-health-investigations/state-eval',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json'},body:JSON.stringify(scenario?{scenario_id:scenario}:{})},deps);
      if(result.status!==200)return res.status(result.status).json({detail:result.payload?.detail||'The investigation was not recorded.'});
      return res.status(200).json({created:!!result.payload?.created,record:safeRecord(result.payload?.record)});
    }
    if(body.action==='outcome'){
      const id=String(body.id||''),outcome=String(body.outcome||''),note=String(body.note||'').trim();
      if(!/^phinv_[0-9a-f]{16}$/.test(id)||!OUTCOMES.has(outcome)||note.length>500)return res.status(400).json({detail:'Unsupported record, outcome, or note.'});
      const key=String(req.headers?.['x-project-health-decision-key']||'').slice(0,200);
      if(!key)return res.status(401).json({detail:'Enter the decision log key to record an outcome.'});
      const result=await forward('/api/project-health-investigations/'+id+'/outcome',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json','X-Project-Health-Decision-Key':key},body:JSON.stringify({outcome,note})},deps);
      if(result.status!==200)return res.status(result.status).json({detail:result.payload?.detail||'The outcome was not saved.'});
      return res.status(200).json(safeRecord(result.payload)||{});
    }
    return res.status(400).json({detail:'Unknown action.'});
  }
  res.setHeader('Allow','GET, POST');
  return res.status(405).json({detail:'Method not allowed'});
}
module.exports=handler;
module.exports._test={safeRecord,handler};
