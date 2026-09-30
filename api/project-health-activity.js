'use strict';

const TEAM_ID='team_UxrzvAczWhPiXlO3nvWPAu5b';
const TEAM_SLUG='cairn10';
const LOOKBACK_DAYS=7;
const MAX_RUNTIME_ROWS=250;
const PROJECTS={
  state:{vercelProjectId:'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl',slug:'state'},
  tastemake:{vercelProjectId:'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu',slug:'tastemake'},
  narc:{vercelProjectId:'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H',slug:'narc'}
};

async function timedJson(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs||6000));
  const fetchOptions={...options};delete fetchOptions.timeoutMs;
  try{
    const response=await fetch(url,{...fetchOptions,signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    return {ok:response.ok,status:response.status,payload};
  }catch(error){
    return {ok:false,status:null,payload:{},error:error?.name==='AbortError'?'timeout':'unavailable'};
  }finally{clearTimeout(timer);}
}

async function timedRuntimeText(url,options={}){
  const controller=new AbortController();
  const timeoutMs=Number(options.timeoutMs||4500);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const fetchOptions={...options};delete fetchOptions.timeoutMs;
  let response=null;
  let text='';
  try{
    response=await fetch(url,{...fetchOptions,signal:controller.signal});
    if(!response.ok){
      text=await response.text().catch(()=>'');
      return {ok:false,status:response.status,text,error:null};
    }
    if(!response.body?.getReader){
      text=await response.text();
      return {ok:true,status:response.status,text};
    }
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(value)text+=decoder.decode(value,{stream:true});
        if(text.split(/\r?\n/).length>MAX_RUNTIME_ROWS||text.length>250000){
          await reader.cancel().catch(()=>{});
          break;
        }
      }
      text+=decoder.decode();
    }catch(error){
      if(error?.name!=='AbortError')throw error;
      // Runtime logs are a stream. Reaching the bounded read timeout after the
      // connection succeeded still means the signal is available; keep whatever
      // rows arrived instead of reporting a false monitoring outage.
    }
    return {ok:true,status:response.status,text};
  }catch(error){
    if(response?.ok&&error?.name==='AbortError')return {ok:true,status:response.status,text};
    return {ok:false,status:response?.status||null,text,error:error?.name==='AbortError'?'timeout':'unavailable'};
  }finally{clearTimeout(timer);}
}

function safeText(value,max=220){
  return String(value||'')
    .replace(/\bBearer\s+[^\s]+/gi,'Bearer [REDACTED]')
    .replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+|vercel_[A-Za-z0-9_-]+|vcp_[A-Za-z0-9_-]+)\b/gi,'[REDACTED_TOKEN]')
    .replace(/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]')
    .replace(/https?:\/\/[^\s]+/g,'[URL]')
    .slice(0,max);
}

function deploymentCreated(item){
  const value=Number(item?.created||item?.createdAt||0);
  return Number.isFinite(value)?value:0;
}

function summarizeDeployments(items){
  const deployments=(Array.isArray(items)?items:[])
    .filter(item=>String(item.target||'production')==='production')
    .sort((a,b)=>deploymentCreated(b)-deploymentCreated(a));
  const failed=deployments.filter(item=>['ERROR','CANCELED'].includes(String(item.state||'').toUpperCase()));
  const ready=deployments.filter(item=>String(item.state||'').toUpperCase()==='READY');
  const recentFailures=failed.slice(0,5).map(item=>{
    const created=deploymentCreated(item);
    const recovery=ready.find(candidate=>deploymentCreated(candidate)>created);
    const uid=String(item.uid||item.id||'');
    return {
      id:uid,
      state:String(item.state||'ERROR').toUpperCase(),
      created_at:created||null,
      recovered:!!recovery,
      recovered_at:recovery?deploymentCreated(recovery):null,
      url:uid?'https://vercel.com/'+TEAM_SLUG+'/'+String(item.name||'project')+'/'+encodeURIComponent(uid):null,
      message:safeText(item.errorMessage||item.errorCode||'Deployment failed',180)
    };
  });
  return {
    total:deployments.length,
    failed:failed.length,
    ready:ready.length,
    latest:deployments[0]||null,
    recent_failures:recentFailures
  };
}

function parseRuntimeRows(text){
  if(!text)return[];
  const trimmed=text.trim();
  if(!trimmed)return[];
  try{
    const parsed=JSON.parse(trimmed);
    if(Array.isArray(parsed))return parsed.slice(0,MAX_RUNTIME_ROWS);
    if(parsed&&Array.isArray(parsed.logs))return parsed.logs.slice(0,MAX_RUNTIME_ROWS);
  }catch(_){}
  return trimmed.split(/\r?\n/).slice(0,MAX_RUNTIME_ROWS).map(line=>{
    try{return JSON.parse(line);}catch(_){return null;}
  }).filter(Boolean);
}

function runtimeIssues(rows,deploymentUrl){
  const grouped=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const level=String(row.level||'').toLowerCase();
    const status=Number(row.responseStatusCode||row.statusCode||0);
    if(!['error','fatal'].includes(level)&&!(status>=500))continue;
    const path=safeText(row.requestPath||row.path||'Unknown route',120);
    const message=safeText(row.message||row.text||('HTTP '+status),220);
    const key=(path+'|'+message).slice(0,360);
    const timestamp=Number(row.timestampInMs||row.timestamp||0);
    const current=grouped.get(key)||{
      key,
      path,
      message,
      level:level||'error',
      status:status||null,
      count:0,
      last_seen:null,
      source_url:deploymentUrl||null
    };
    current.count+=1;
    if(timestamp&&(!current.last_seen||timestamp>current.last_seen))current.last_seen=timestamp;
    grouped.set(key,current);
  }
  return Array.from(grouped.values())
    .sort((a,b)=>(b.last_seen||0)-(a.last_seen||0)||b.count-a.count)
    .slice(0,5);
}

async function loadActivity(project){
  const token=process.env.VERCEL_TOKEN;
  if(!token)return {configured:false,reason:'VERCEL_TOKEN not configured'};
  const headers={Authorization:'Bearer '+token,Accept:'application/json'};
  const since=Date.now()-LOOKBACK_DAYS*24*60*60*1000;
  const qs=new URLSearchParams({
    projectId:project.vercelProjectId,
    teamId:TEAM_ID,
    target:'production',
    since:String(since),
    limit:'25'
  });
  const deploymentsResult=await timedJson('https://api.vercel.com/v7/deployments?'+qs,{headers,timeoutMs:6500});
  if(!deploymentsResult.ok){
    return {configured:true,available:false,status:deploymentsResult.status,error:deploymentsResult.error||deploymentsResult.payload?.error?.message||'Deployment activity unavailable'};
  }
  const summary=summarizeDeployments(deploymentsResult.payload?.deployments);
  const latest=summary.latest;
  let runtime=[];
  let runtimeAvailable=false;
  let runtimeStatus=null;
  let runtimeError=null;
  if(latest&&String(latest.state||'').toUpperCase()==='READY'){
    const deploymentId=String(latest.uid||latest.id||'');
    const deploymentUrl=deploymentId?'https://vercel.com/'+TEAM_SLUG+'/'+project.slug+'/'+encodeURIComponent(deploymentId):null;
    if(deploymentId){
      const logQs=new URLSearchParams({teamId:TEAM_ID});
      let logs=await timedRuntimeText('https://api.vercel.com/v1/projects/'+encodeURIComponent(project.vercelProjectId)+'/deployments/'+encodeURIComponent(deploymentId)+'/runtime-logs?'+logQs,{
        headers:{Authorization:'Bearer '+token,Accept:'application/stream+json'},
        timeoutMs:4500
      });
      if(!logs.ok&&logs.error==='timeout'){
        logs=await timedRuntimeText('https://api.vercel.com/v1/projects/'+encodeURIComponent(project.vercelProjectId)+'/deployments/'+encodeURIComponent(deploymentId)+'/runtime-logs?'+logQs,{
          headers:{Authorization:'Bearer '+token,Accept:'application/stream+json'},
          timeoutMs:9000
        });
      }
      runtimeAvailable=logs.ok||logs.error==='timeout';
      runtimeStatus=logs.status;
      runtimeError=logs.ok?null:(logs.error==='timeout'?'bounded stream timed out before returning rows':(logs.error||safeText(logs.text,180)||'Runtime logs unavailable'));
      if(logs.ok)runtime=runtimeIssues(parseRuntimeRows(logs.text),deploymentUrl);
    }
  }
  return {
    configured:true,
    available:true,
    lookback_days:LOOKBACK_DAYS,
    deployments:{
      total:summary.total,
      failed:summary.failed,
      ready:summary.ready,
      recent_failures:summary.recent_failures,
      latest_state:String(latest?.state||'').toUpperCase()||null,
      latest_at:deploymentCreated(latest)||null
    },
    runtime:{
      available:runtimeAvailable,
      status:runtimeStatus,
      error:runtimeError,
      issues:runtime
    },
    observed_at:new Date().toISOString()
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
  const activity=await loadActivity(project);
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
  res.status(200).json({
    project:projectId,
    activity,
    privacy:{
      content_included:false,
      runtime_scope:'bounded error/fatal/5xx metadata from the latest production deployment'
    }
  });
};

module.exports._test={PROJECTS,safeText,summarizeDeployments,parseRuntimeRows,runtimeIssues,timedRuntimeText};
