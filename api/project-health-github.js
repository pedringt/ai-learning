// Project Health GitHub reads, batched per project (QA, Oct 10).
// The page used to call api.github.com directly from the browser: ~23 unauthenticated requests per load against
// GitHub's 60/hour per-IP limit, so a couple of reloads broke it. This function does the same reads server-side,
// authenticated with GITHUB_TOKEN when set, and returns one edge-cached response per project.
// Repos, branches, and paths come only from the project list in project-health-model.js; nothing from the
// request is used as a GitHub path except the project id and environment, which are both allowlisted.
const MODEL=require('../project-health-model.js');

const GITHUB_TIMEOUT_MS=5000;
const PROJECTS=Object.fromEntries(MODEL.PROJECTS.map(project=>[project.id,project]));

function githubHeaders(){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'project-health'};
  if(process.env.GITHUB_TOKEN) headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  return headers;
}

function makeGithubFetch(fetchImpl=fetch,headers=githubHeaders()){
  return async function githubJson(path){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),GITHUB_TIMEOUT_MS);
    try{
      const response=await fetchImpl(MODEL.githubApi(path),{headers,signal:controller.signal});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){
        const error=new Error(payload?.message||('GitHub request failed: '+response.status));
        error.status=response.status;
        throw error;
      }
      return payload;
    }catch(error){
      if(error?.name==='AbortError'){const timeout=new Error('GitHub request timed out');timeout.status=504;throw timeout;}
      throw error;
    }finally{clearTimeout(timer);}
  };
}

function commitDate(item){return MODEL.dateMs(item?.commit?.committer?.date||item?.commit?.author?.date)||0;}

// Same selection rules the browser used: the newest commit touching a release path, skipping ignored titles.
async function loadDelivery(gh,project,branchName){
  const repo=project.repo;
  const branch=await gh('/repos/'+repo+'/branches/'+encodeURIComponent(branchName));
  let selectedCommit=branch?.commit||null;
  if(Array.isArray(project.releasePaths)&&project.releasePaths.length){
    try{
      const groups=await Promise.all(project.releasePaths.map(path=>
        gh('/repos/'+repo+'/commits?sha='+encodeURIComponent(branchName)+'&path='+encodeURIComponent(path)+'&per_page=6').catch(()=>[])
      ));
      const candidates=groups.flat().filter(Boolean).filter((item,index,all)=>all.findIndex(other=>other?.sha===item?.sha)===index);
      candidates.sort((a,b)=>commitDate(b)-commitDate(a));
      selectedCommit=candidates.find(item=>!project.releaseIgnore?.test(String(item?.commit?.message||'')))||selectedCommit;
    }catch(_){}
  }else if(project.releasePath){
    try{
      const commits=await gh('/repos/'+repo+'/commits?sha='+encodeURIComponent(branchName)+'&path='+encodeURIComponent(project.releasePath)+'&per_page=1');
      if(Array.isArray(commits)&&commits[0]) selectedCommit=commits[0];
    }catch(_){}
  }
  const selectedSha=selectedCommit?.sha||branch?.commit?.sha||branchName;
  const [status,checkRuns]=await Promise.all([
    gh('/repos/'+repo+'/commits/'+encodeURIComponent(selectedSha)+'/status'),
    gh('/repos/'+repo+'/commits/'+encodeURIComponent(selectedSha)+'/check-runs?per_page=10').catch(()=>({check_runs:[]}))
  ]);
  return MODEL.deliveryHealth({name:branch?.name||branchName,commit:selectedCommit},status,checkRuns);
}

async function loadEvalBehavior(gh,project,environment){
  const paths=Array.isArray(project?.evalBehaviorPaths)?project.evalBehaviorPaths:[];
  if(!paths.length)return null;
  const branch=MODEL.evalBehaviorBranch(project,environment);
  const rows=await Promise.all(paths.map(path=>gh('/repos/'+project.repo+'/commits?sha='+encodeURIComponent(branch)+'&path='+encodeURIComponent(path)+'&per_page=1').catch(()=>[])));
  const commits=rows.flat().filter(Boolean).sort((a,b)=>commitDate(b)-commitDate(a));
  const latest=commits[0];
  return latest?{sha:latest.sha||null,updatedAt:latest.commit?.committer?.date||latest.commit?.author?.date||null}:null;
}

// Only the fields the page reads; PR bodies and file lists never leave this function.
function safePullRequest(pr){
  return {number:pr?.number??null,title:String(pr?.title||'').slice(0,200),html_url:/^https:\/\/github\.com\//.test(String(pr?.html_url||''))?pr.html_url:null,draft:!!pr?.draft,created_at:pr?.created_at||null,updated_at:pr?.updated_at||null};
}

async function loadOpenPullRequests(gh,project){
  try{
    const pulls=await gh('/repos/'+project.repo+'/pulls?state=open&per_page=5');
    if(!Array.isArray(pulls))return[];
    const releasePaths=Array.isArray(project.releasePaths)&&project.releasePaths.length?project.releasePaths:(project.releasePath?[project.releasePath]:[]);
    if(!releasePaths.length)return pulls.map(safePullRequest);
    const scoped=await Promise.all(pulls.map(async pr=>{
      if(project.releaseIgnore?.test(String(pr.title||'')))return null;
      try{
        const files=await gh('/repos/'+project.repo+'/pulls/'+encodeURIComponent(pr.number)+'/files?per_page=100');
        return Array.isArray(files)&&files.some(file=>releasePaths.some(path=>String(file.filename||'').startsWith(path+'/')))?pr:null;
      }catch(_){return null;}
    }));
    return scoped.filter(Boolean).map(safePullRequest);
  }catch(_){return[];}
}

function settle(promise){
  return promise.then(value=>({ok:true,value}),error=>({ok:false,status:Number(error?.status)||502,detail:String(error?.message||'GitHub request failed').slice(0,200)}));
}

async function githubSummary(projectId,environment,gh){
  const project=PROJECTS[projectId];
  if(!project)return null;
  const env=environment==='staging'?'staging':'production';
  const [delivery,staging,evalBehavior,openPullRequests]=await Promise.all([
    settle(loadDelivery(gh,project,project.branch)),
    project.stagingBranch?settle(loadDelivery(gh,project,project.stagingBranch)):Promise.resolve(null),
    settle(loadEvalBehavior(gh,project,env)),
    settle(loadOpenPullRequests(gh,project))
  ]);
  return {project:projectId,environment:env,delivery,staging,evalBehavior,openPullRequests};
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({detail:'Method not allowed'});
    return;
  }
  const projectId=String(req.query?.project||'').toLowerCase();
  const environment=String(req.query?.env||'production').toLowerCase()==='staging'?'staging':'production';
  if(!PROJECTS[projectId]){
    res.status(400).json({detail:'Unknown project'});
    return;
  }
  const payload=await githubSummary(projectId,environment,makeGithubFetch());
  const parts=[payload.delivery,payload.staging,payload.evalBehavior,payload.openPullRequests].filter(Boolean);
  // A failed part must not be pinned at the edge: the page shows it as "couldn't check" and offers a retry.
  res.setHeader('Cache-Control',parts.every(part=>part.ok)?'s-maxage=60, stale-while-revalidate=300':'no-store');
  res.status(200).json({...payload,authenticated:!!process.env.GITHUB_TOKEN});
};

module.exports._test={PROJECTS,makeGithubFetch,githubSummary,loadDelivery,loadEvalBehavior,loadOpenPullRequests,safePullRequest,GITHUB_TIMEOUT_MS};
