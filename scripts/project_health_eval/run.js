#!/usr/bin/env node
'use strict';
// Thin entry point. Usage:
//   node run.js collect                       (free: writes cases.json from real failures)
//   node run.js run --dry-run                 (free: prints the call count and estimate)
//   node run.js run                           (paid: needs ANTHROPIC_API_KEY)
// Models, repeats and the call cap come from config.json next to this file.
const fs=require('fs');
const path=require('path');
const lib=require('./investigator_eval_lib.js');
const planted=require('./planted_cases.js');

const dir=__dirname;
const outDir=process.env.PH_EVAL_OUT||path.join(dir,'out');
const config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));
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

async function run(){
  const realPath=path.join(dir,'cases.json');
  const real=fs.existsSync(realPath)?JSON.parse(fs.readFileSync(realPath,'utf8')):[];
  const cases=[...real,...planted];
  // logVariants: also run each real check case with job-log excerpts, fetched by the production function.
  if(config.logVariants){
    const INV=require('../../api/project-health-investigate.js')._test;
    const token=process.env.GITHUB_TOKEN||'';
    if(!token)throw new Error('logVariants needs GITHUB_TOKEN to read job logs');
    for(const item of real.filter(c=>c.signalType==='github-check')){
      const project=INV.PROJECTS[item.evidence.project==='ai-learning'?'state':item.evidence.project]||Object.values(INV.PROJECTS).find(p=>p.slug===item.evidence.project);
      const primary=JSON.parse(item.evidence.primary);
      for(const failure of primary.failedChecks.slice(0,2)){
        const log=await INV.fetchJobLog(project,failure.url,{token});
        failure.jobLog=log.available?log.excerpt:('Not available: '+log.reason);
      }
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
}

(mode==='collect'?collect():mode==='run'?run():Promise.reject(new Error('Use: collect | run [--dry-run]'))).catch(error=>{console.error(error.message);process.exit(1);});
