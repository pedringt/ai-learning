#!/usr/bin/env node
'use strict';
// Thin entry point. Usage:
//   node run.js collect                       (free: writes cases.json from real failures)
//   node run.js refresh-vercel                (free: rebuilds the frozen Vercel cases' evidence; needs VERCEL_TOKEN)
//   node run.js run --dry-run                 (free: prints the call count and estimate)
//   node run.js run                           (paid: needs ANTHROPIC_API_KEY)
// Models, repeats and the call cap come from config.json next to this file.
const fs=require('fs');
const path=require('path');
const lib=require('./investigator_eval_lib.js');
const planted=require('./planted_cases.js');

const dir=__dirname;
const outDir=process.env.PH_EVAL_OUT||path.join(dir,'out');
// PH_EVAL_CONFIG picks another config next to this file (the weekly schedule uses config.weekly.json).
const config=JSON.parse(fs.readFileSync(path.join(dir,process.env.PH_EVAL_CONFIG||'config.json'),'utf8'));
const [mode,...flags]=process.argv.slice(2);

async function collect(){
  const token=process.env.GITHUB_TOKEN||'';
  lib.withGithubAuth(token);
  const cases=[];
  for(const projectId of config.projects){
    const checks=await lib.collectGithubCheckCases(projectId,{token,limit:config.collect.checksPerProject});
    const deploys=await lib.collectVercelCases(projectId,{token,limit:config.collect.deploysPerProject});
    console.log(projectId+': '+checks.length+' check failures, '+deploys.length+' deploy failures');
    for(const item of [...checks,...deploys])if(!cases.some(existing=>existing.id===item.id))cases.push(item);
  }
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'cases.json'),JSON.stringify(cases,null,2));
  console.log('Wrote '+cases.length+' real cases.');
}

async function refreshVercel(){
  if(!process.env.VERCEL_TOKEN)throw new Error('refresh-vercel needs VERCEL_TOKEN');
  lib.withGithubAuth(process.env.GITHUB_TOKEN||'');
  const INV=require('../../api/project-health-investigate.js')._test;
  const cases=JSON.parse(fs.readFileSync(path.join(dir,'cases.json'),'utf8'));
  for(const item of cases.filter(c=>c.signalType==='vercel')){
    const project=Object.values(INV.PROJECTS).find(p=>p.slug===item.evidence.project);
    const evidence=project?await lib.evidenceFor(project,item.evidence.branch,item.evidence.commit,'vercel'):null;
    if(!evidence){console.log(item.id+': kept (no failed status found now)');continue;}
    const changed=JSON.stringify(evidence)!==JSON.stringify(item.evidence);
    item.evidence=evidence;
    console.log(item.id+': '+(changed?'refreshed':'unchanged')+' · '+(evidence.followUp.includes('No matching Vercel deployment')?'no deployment details':'deployment details found'));
  }
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'cases.json'),JSON.stringify(cases,null,2));
}

async function run(){
  const realPath=path.join(dir,'cases.json');
  const real=fs.existsSync(realPath)?JSON.parse(fs.readFileSync(realPath,'utf8')):[];
  const cases=[...real,...planted];
  // logVariants: also run each real check case with job-log excerpts, fetched by the production function.
  if(config.logVariants){
    const INV=require('../../api/project-health-investigate.js')._test;
    const token=process.env.GITHUB_TOKEN||'';
    const dryRun=flags.includes('--dry-run');
    if(!token&&!dryRun)throw new Error('logVariants needs GITHUB_TOKEN to read job logs');
    for(const item of real.filter(c=>c.signalType==='github-check')){
      const project=INV.PROJECTS[item.evidence.project==='ai-learning'?'state':item.evidence.project]||Object.values(INV.PROJECTS).find(p=>p.slug===item.evidence.project);
      const primary=JSON.parse(item.evidence.primary);
      for(const failure of dryRun?[]:primary.failedChecks.slice(0,2)){
        const log=await INV.fetchJobLog(project,failure.url,{token});
        failure.jobLog=log.available?log.excerpt:('Not available: '+log.reason);
      }
      const missing=primary.failedChecks.slice(0,2).filter(failure=>String(failure.jobLog||'').startsWith('Not available'));
      if(!dryRun&&missing.length)console.log(item.id+': job log not available: '+missing.map(failure=>failure.jobLog).join('; '));
      cases.push({...item,id:item.id+'+log',kind:'real+log',evidence:{...item.evidence,primary:JSON.stringify(primary)}});
    }
  }
  const estimate=lib.plan(cases,config.models,config.repeats);
  console.log(cases.length+' cases ('+real.length+' real, '+planted.length+' planted) × '+config.models.length+' models × '+config.repeats+' repeats = '+estimate.calls+' calls, at most about $'+estimate.estimateUsd);
  if(estimate.calls>config.maxCalls)throw new Error('Refusing: '+estimate.calls+' calls exceeds maxCalls '+config.maxCalls);
  if(flags.includes('--dry-run'))return;
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey)throw new Error('ANTHROPIC_API_KEY is not set');
  fs.mkdirSync(outDir,{recursive:true});
  const resultsPath=path.join(outDir,'results.jsonl');
  fs.writeFileSync(resultsPath,'');
  const results=[];
  const jobs=[];
  for(let repeat=1;repeat<=config.repeats;repeat++)for(const model of config.models)for(const caseDef of cases)jobs.push({repeat,model,caseDef});
  let next=0;
  async function worker(){
    while(next<jobs.length){
      const job=jobs[next++];
      const result={repeat:job.repeat,kind:job.caseDef.kind,...await lib.runCase(job.caseDef,job.model,{apiKey}).catch(error=>({caseId:job.caseDef.id,model:job.model,ok:false,error:String(error.message).slice(0,300)}))};
      results.push(result);
      // Saved as it goes so a timeout keeps what already ran.
      fs.appendFileSync(resultsPath,JSON.stringify(result)+'\n');
      if(results.length%25===0)console.log(results.length+'/'+jobs.length+' calls; spend so far $'+results.reduce((sum,item)=>sum+(item.cost||0),0).toFixed(4));
    }
  }
  await Promise.all(Array.from({length:config.concurrency||4},worker));
  const kinds=[...new Set(results.map(item=>item.kind))];
  const summary={all:lib.summarize(results),byKind:Object.fromEntries(kinds.map(kind=>[kind,lib.summarize(results.filter(item=>item.kind===kind))]))};
  fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  console.log(lib.accuracyMarkdown(summary.all));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lib.summaryMarkdown(summary,results));
  // failOn lists technical facts that fail the run (API errors, reports cut off at the cap). Report quality
  // facts (canaries, cause stated unknown) are recorded, never judged here: that rubric is Paige's.
  const failing=lib.failingFacts(summary.all,config.failOn||[]);
  if(failing.length){console.error('Failing: '+failing.join('; '));process.exitCode=1;}
}

(mode==='collect'?collect():mode==='refresh-vercel'?refreshVercel():mode==='run'?run():Promise.reject(new Error('Use: collect | refresh-vercel | run [--dry-run]'))).catch(error=>{console.error(error.message);process.exit(1);});
