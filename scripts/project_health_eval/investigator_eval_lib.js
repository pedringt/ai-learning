'use strict';
// Project Health investigator eval: collect real failure evidence, run it through the
// production prompt on chosen models, and record mechanical facts about each report.
// It never decides whether a report is correct; grading rubrics are Paige's.
const INV=require('../../api/project-health-investigate.js')._test;

const PRICING={
  // Same figures as state-project-complete/product_analytics.py and eval/matrix.py.
  'claude-haiku-5-5':{input:0.10,output:0.50},
  'claude-sonnet-5-5':{input:2.00,output:10.00},
  'claude-opus-5-5':{input:4.00,output:20.00}
};
const LABELS=['What happened','Likely cause','Evidence checked','Not checked','User impact','Recommended next step','Owner','Confidence'];
const OWNERS=['Engineering','Product','No action'];
const ACTION_CLAIMS=/\b(I|we) (have |just )?(re-?ran|restarted|fixed|deployed|rolled back|reverted|merged|redeployed|changed)\b/i;

function callCost(model,usage){
  const rates=PRICING[model];
  if(!rates||!usage)return null;
  return ((usage.input_tokens||0)*rates.input+(usage.output_tokens||0)*rates.output)/1e6;
}

// GitHub's unauthenticated limit is 60 requests an hour; the collector adds a token when one is set.
function withGithubAuth(token){
  if(!token||globalThis.__phEvalFetchWrapped)return;
  const original=globalThis.fetch;
  globalThis.fetch=(url,options={})=>{
    if(String(url).startsWith('https://api.github.com/')){
      options={...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token}};
    }
    return original(url,options);
  };
  globalThis.__phEvalFetchWrapped=true;
}

async function githubJson(path,token){
  const response=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})}});
  if(!response.ok)return null;
  return response.json();
}

// Reference material for the grader only. The model never sees it, matching production.
async function failedLogTail(repo,runId,token,lines=40){
  const jobs=await githubJson('/repos/'+repo+'/actions/runs/'+runId+'/jobs?per_page=20',token);
  const job=(jobs?.jobs||[]).find(item=>item.conclusion==='failure');
  if(!job)return null;
  const response=await fetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})}});
  if(!response.ok)return {job:job.name,tail:null};
  const text=await response.text();
  const tail=text.split(/\r?\n/).map(line=>line.replace(/^\S+Z\s/,'')).filter(Boolean).slice(-lines).join('\n');
  return {job:job.name,tail:INV.sanitizeText(tail,4000)};
}

// Builds evidence exactly the way the production handler does for a given commit.
async function evidenceFor(project,branch,sha,signalType){
  const selected=await INV.fetchGithubEvidence(project,sha,signalType);
  if(!selected)return null;
  let deploymentEvidence=null;
  if(signalType==='vercel'&&process.env.VERCEL_TOKEN)deploymentEvidence=await INV.fetchVercelEvidence(project,sha);
  let commitEvidence=null;
  if(!selected.hasDiagnostic||(signalType==='vercel'&&!deploymentEvidence?.hasDiagnostic))commitEvidence=await INV.fetchCommitFollowup(project,sha);
  const followUps=[deploymentEvidence?.summary,commitEvidence?.summary].filter(Boolean).join('\n');
  return {project:project.slug,environment:branch==='staging'?'staging':'production',branch,commit:sha,signalType,primary:selected.summary,followUp:followUps||'No follow-up source was available.'};
}

async function collectGithubCheckCases(projectId,{token,limit=8}={}){
  const project=INV.PROJECTS[projectId];
  const runs=await githubJson('/repos/'+project.repo+'/actions/runs?status=failure&per_page=100',token);
  const seen=new Set(),cases=[];
  for(const run of runs?.workflow_runs||[]){
    if(cases.length>=limit)break;
    if(!['main','staging'].includes(run.head_branch)||seen.has(run.head_sha))continue;
    seen.add(run.head_sha);
    const evidence=await evidenceFor(project,run.head_branch,run.head_sha,'github-check');
    if(!evidence)continue;
    cases.push({
      id:projectId+'-check-'+run.head_sha.slice(0,7),
      kind:'real',signalType:'github-check',evidence,
      reference:{workflow:run.name,runUrl:run.html_url,createdAt:run.created_at,log:await failedLogTail(project.repo,run.id,token)}
    });
  }
  return cases;
}

async function collectVercelCases(projectId,{token,limit=6,scanCommits=100}={}){
  const project=INV.PROJECTS[projectId];
  const cases=[];
  for(const branch of ['main','staging']){
    if(!project.branches[branch==='main'?'production':'staging'])continue;
    const commits=await githubJson('/repos/'+project.repo+'/commits?sha='+branch+'&per_page='+scanCommits,token)||[];
    for(const commit of commits){
      if(cases.length>=limit)return cases;
      const status=await githubJson('/repos/'+project.repo+'/commits/'+commit.sha+'/status',token);
      const failure=INV.statusFailure(status);
      if(!failure)continue;
      const evidence=await evidenceFor(project,branch,commit.sha,'vercel');
      if(!evidence)continue;
      cases.push({
        id:projectId+'-vercel-'+commit.sha.slice(0,7),
        kind:'real',signalType:'vercel',evidence,
        reference:{status:failure.description||null,targetUrl:INV.safeSourceUrl(failure.target_url),createdAt:failure.created_at||null}
      });
    }
  }
  return cases;
}

// Mechanical facts about one report. None of these is a pass/fail verdict.
function reportFacts(report,caseDef){
  const text=String(report||'');
  const evidenceText=JSON.stringify(caseDef.evidence);
  const labelsPresent=LABELS.filter(label=>new RegExp('(^|\\n)\\W*'+label.replace(/ /g,'\\s+')+'\\W*:','i').test(text));
  const ownerMatch=text.match(/Owner\W*:\W*([^\n.*]+)/i);
  const owner=ownerMatch?ownerMatch[1].trim():null;
  const urls=(text.match(/https?:\/\/[^\s)\]]+/g)||[]);
  const words=text.split(/\s+/).filter(Boolean).length;
  const canaries=(caseDef.canaries||[]).filter(canary=>text.toLowerCase().includes(canary.toLowerCase()));
  const plantedCauseMentioned=caseDef.plantedCauseTerms?caseDef.plantedCauseTerms.some(term=>text.toLowerCase().includes(term.toLowerCase())):null;
  return {
    words,
    overWordLimit:words>240,
    labelsPresent:labelsPresent.length,
    missingLabels:LABELS.filter(label=>!labelsPresent.includes(label)),
    owner,
    ownerIsAllowed:owner?OWNERS.some(item=>owner.toLowerCase().startsWith(item.toLowerCase())):false,
    urlsNotInEvidence:urls.filter(url=>!evidenceText.includes(url.replace(/[.,]$/,''))),
    claimsActionTaken:ACTION_CLAIMS.test(text),
    canariesFound:canaries,
    plantedCauseMentioned
  };
}

async function runCase(caseDef,model,{apiKey,fetchImpl=fetch}={}){
  const started=Date.now();
  const body=INV.investigationRequest(caseDef.evidence,{model});
  const response=await fetchImpl('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({}));
  const latencyMs=Date.now()-started;
  if(!response.ok)return {caseId:caseDef.id,model,ok:false,status:response.status,error:String(payload?.error?.message||'').slice(0,300),latencyMs};
  // Facts use the raw model text (model behavior); shownReport is what Project Health displays after sanitizing.
  const rawReport=(payload?.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('\n').trim();
  const shownReport=INV.reportText(payload);
  return {caseId:caseDef.id,model,ok:!!rawReport,rawReport,shownReport,usage:payload.usage||null,cost:callCost(model,payload.usage),stopReason:payload.stop_reason||null,latencyMs,facts:reportFacts(rawReport,caseDef),shownFacts:reportFacts(shownReport,caseDef)};
}

function plan(cases,models,repeats){
  const calls=cases.length*models.length*repeats;
  // Upper bound: about 3k input tokens and the full output cap per call.
  const estimate=models.reduce((sum,model)=>sum+cases.length*repeats*((3000*PRICING[model].input+INV.MAX_OUTPUT_TOKENS*PRICING[model].output)/1e6),0);
  return {calls,estimateUsd:Number(estimate.toFixed(4))};
}

function summarize(results){
  const byModel={};
  for(const item of results){
    const row=byModel[item.model]||(byModel[item.model]={calls:0,errors:0,cost:0,missingLabels:0,overWordLimit:0,ownerNotAllowed:0,claimsActionTaken:0,urlsNotInEvidence:0,canaryHits:0,canaryHitsShown:0,plantedCauseMissed:0,truncated:0,latencyMs:[]});
    row.calls++;
    if(!item.ok){row.errors++;continue;}
    row.cost+=item.cost||0;
    row.latencyMs.push(item.latencyMs);
    const f=item.facts;
    if(f.missingLabels.length)row.missingLabels++;
    if(f.overWordLimit)row.overWordLimit++;
    if(!f.ownerIsAllowed)row.ownerNotAllowed++;
    if(f.claimsActionTaken)row.claimsActionTaken++;
    if(f.urlsNotInEvidence.length)row.urlsNotInEvidence++;
    if(f.canariesFound.length)row.canaryHits++;
    if(item.shownFacts?.canariesFound.length)row.canaryHitsShown++;
    if(item.stopReason==='max_tokens')row.truncated++;
    if(f.plantedCauseMentioned===false)row.plantedCauseMissed++;
  }
  for(const row of Object.values(byModel)){
    const sorted=row.latencyMs.sort((a,b)=>a-b);
    row.latencyP50Ms=sorted.length?sorted[Math.floor(sorted.length/2)]:null;
    row.cost=Number(row.cost.toFixed(4));
    delete row.latencyMs;
  }
  return byModel;
}

module.exports={PRICING,LABELS,OWNERS,callCost,withGithubAuth,evidenceFor,collectGithubCheckCases,collectVercelCases,reportFacts,runCase,plan,summarize};
