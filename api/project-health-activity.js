'use strict';

const TEAM_ID='team_UxrzvAczWhPiXlO3nvWPAu5b';
const TEAM_SLUG='cairn10';
const LOOKBACK_DAYS=7;
// Oct 19: Vercel's runtime-logs endpoint is a live tail with no time range, so it never returns past
// errors (every read here timed out with no rows). History needs Log Drains, which this plan lacks.
// Server errors are reported as not monitored rather than as a clean or partial scan.
const RUNTIME_NOT_MONITORED_NOTE='Not monitored: Vercel only streams live runtime logs, so past server errors cannot be read on this plan. Log Drains (Vercel Pro) would add history.';
const DEPLOYMENTS_TIMEOUT_MS=6500;
const PROJECTS={
  state:{vercelProjectId:'prj_zQtHJg96oM7Ol4qTapiwk1mV8iRl',slug:'state'},
  tastemake:{vercelProjectId:'prj_UWguNtKhGJkLr0X3jswk2rgBKLGu',slug:'tastemake'},
  narc:{vercelProjectId:'prj_SKJS8qSkSAiceK5qZ4GkcZEbI41H',slug:'narc'},
  'authority-lab':{vercelProjectId:'prj_DEsIbVajmdgFqxtVFeZLQsa6QJ69',slug:'authority-lab'}
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

function isIgnoredBuildSkip(item){
  if(String(item?.state||'').toUpperCase()!=='CANCELED')return false;
  const detail=String(item?.errorMessage||item?.errorCode||'');
  return /ignored build step|returned exit code 0/i.test(detail);
}

function summarizeDeployments(items){
  const deployments=(Array.isArray(items)?items:[])
    .filter(item=>String(item.target||'').toLowerCase()==='production')
    .sort((a,b)=>deploymentCreated(b)-deploymentCreated(a));
  const skipped=deployments.filter(isIgnoredBuildSkip);
  const meaningful=deployments.filter(item=>!isIgnoredBuildSkip(item));
  const failed=meaningful.filter(item=>['ERROR','CANCELED'].includes(String(item.state||'').toUpperCase()));
  const ready=meaningful.filter(item=>String(item.state||'').toUpperCase()==='READY');
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
    skipped:skipped.length,
    ready:ready.length,
    latest:meaningful[0]||null,
    recent_failures:recentFailures
  };
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
  const deploymentsResult=await timedJson('https://api.vercel.com/v7/deployments?'+qs,{headers,timeoutMs:DEPLOYMENTS_TIMEOUT_MS});
  if(!deploymentsResult.ok){
    return {configured:true,available:false,status:deploymentsResult.status,error:deploymentsResult.error||deploymentsResult.payload?.error?.message||'Deployment activity unavailable'};
  }
  const summary=summarizeDeployments(deploymentsResult.payload?.deployments);
  const latest=summary.latest;
  return {
    configured:true,
    available:true,
    lookback_days:LOOKBACK_DAYS,
    deployments:{
      total:summary.total,
      failed:summary.failed,
      skipped:summary.skipped,
      ready:summary.ready,
      recent_failures:summary.recent_failures,
      latest_state:String(latest?.state||'').toUpperCase()||null,
      latest_at:deploymentCreated(latest)||null
    },
    runtime:{available:false,coverage:'not_monitored',status:null,error:null,note:RUNTIME_NOT_MONITORED_NOTE,issues:[]},
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
      runtime_scope:'not monitored (no runtime log history on this Vercel plan)'
    }
  });
};

module.exports._test={PROJECTS,DEPLOYMENTS_TIMEOUT_MS,RUNTIME_NOT_MONITORED_NOTE,safeText,isIgnoredBuildSkip,summarizeDeployments};
