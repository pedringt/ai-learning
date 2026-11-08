'use strict';
// DEC-012 guards (Nov 8): Project Health's paid actions stay open to anyone, but each is rate-limited by a
// cooldown claim held in the State backend (project_health_usage_api.py), because Vercel functions share no
// memory and parallel requests can land on different instances. The leading underscore keeps this file a
// helper, not a function. Paige chose (Nov 8): if the claim store cannot be reached, the action is allowed.

const STATE_API={production:'https://state-api-6waw.onrender.com',other:'https://state-api-staging.onrender.com'};
function stateApiBase(env=process.env.VERCEL_ENV){return env==='production'?STATE_API.production:STATE_API.other;}

async function postJson(path,body,{fetchImpl,key,env,timeoutMs}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(stateApiBase(env)+path,{method:'POST',signal:controller.signal,
      headers:{'content-type':'application/json','X-Project-Health-Usage-Key':key},body:JSON.stringify(body)});
    return {status:response.status,payload:await response.json().catch(()=>({}))};
  }finally{clearTimeout(timer);}
}

// {allowed:true, token} when this request holds the cooldown; {allowed:false, retryAfterSeconds} when another
// request does; {allowed:true, token:null} when the guard could not be checked (no key, timeout, backend error).
async function claimAction(claimKey,ttlSeconds,{fetchImpl=fetch,key=process.env.PROJECT_HEALTH_USAGE_KEY,env=process.env.VERCEL_ENV,timeoutMs=3000}={}){
  if(!key)return {allowed:true,token:null};
  try{
    const {status,payload}=await postJson('/api/admin/project-health-claims',{claim_key:claimKey,ttl_seconds:ttlSeconds},{fetchImpl,key,env,timeoutMs});
    if(status===409)return {allowed:false,retryAfterSeconds:Math.max(1,Number(payload.retry_after_seconds)||ttlSeconds)};
    return {allowed:true,token:status===200&&payload.token?payload.token:null};
  }catch(_){return {allowed:true,token:null};}
}

// Give the cooldown back when the action it guarded failed, so a retry is not blocked. Best effort.
async function releaseAction(claimKey,token,{fetchImpl=fetch,key=process.env.PROJECT_HEALTH_USAGE_KEY,env=process.env.VERCEL_ENV,timeoutMs=2000}={}){
  if(!key||!token)return false;
  try{return (await postJson('/api/admin/project-health-claims/release',{claim_key:claimKey,token},{fetchImpl,key,env,timeoutMs})).payload?.released===true;}
  catch(_){return false;}
}

function claimKeyPart(value){return String(value||'').toLowerCase().replace(/[^a-z0-9._-]/g,'-').slice(0,60)||'none';}

module.exports={claimAction,releaseAction,claimKeyPart,stateApiBase,STATE_API};
