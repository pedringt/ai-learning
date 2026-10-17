const SOURCES={
  tastemake:{
    repo:'pedringt/tastemake',
    branch:'main',
    baseline:'scripts/evals/reports/baseline-latest.json',
    endpoint:'scripts/evals/reports/endpoint-latest.json',
    workflow:'test.yml'
  },
  narc:{
    repo:'pedringt/narc',
    branch:'main',
    handoff:'docs/HANDOFF.md',
    workflow:'quality-checks.yml'
  },
  'authority-lab':{
    repo:'pedringt/authority-lab',
    branch:'main',
    workflow:'test.yml'
  }
};

async function timedFetch(url,options={},timeoutMs=5000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }catch(error){
    if(error?.name==='AbortError') throw new Error('Quality source timed out');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function githubJson(path){
  const response=await timedFetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'context-switch-project-health'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload?.message||('GitHub request failed: '+response.status));
  return payload;
}

async function githubText(repo,path,ref){
  const response=await timedFetch('https://raw.githubusercontent.com/'+repo+'/'+encodeURIComponent(ref)+'/'+path,{headers:{'User-Agent':'context-switch-project-health'}});
  if(!response.ok) throw new Error('GitHub file request failed: '+response.status);
  return response.text();
}

function summarizeEval(report){
  const fixtures=Array.isArray(report?.fixtures)?report.fixtures:[];
  const scores=fixtures.flatMap(f=>Array.isArray(f.scores)?f.scores:[]);
  const rules=scores.filter(s=>s.kind==='rule'&&s.pass!==null&&s.pass!==undefined);
  const validity=scores.filter(s=>s.kind==='quality'&&s.name==='all proposals valid'&&s.pass!==null&&s.pass!==undefined);
  const grounding=scores.filter(s=>s.kind==='quality'&&s.name==='grounding coverage');
  const errors=fixtures.filter(f=>f.error).length;
  const self=Array.isArray(report?.selfTest)?report.selfTest:[];
  return {
    producer:report?.producer||null,
    contract:report?.contract||null,
    fixtures:fixtures.length,
    fixture_errors:errors,
    rule_checks:{passed:rules.filter(x=>x.pass===true).length,total:rules.length,failed:rules.filter(x=>x.pass===false).length},
    valid_fixture_outputs:{passed:validity.filter(x=>x.pass===true).length,total:validity.length,failed:validity.filter(x=>x.pass===false).length},
    grounding_checks:grounding.length,
    validator_self_test:{caught:self.filter(x=>x.caught===true).length,total:self.length,missed:self.filter(x=>x.caught!==true).length},
    failing_fixtures:fixtures.filter(f=>(f.scores||[]).some(s=>s.pass===false)).map(f=>f.id)
  };
}

function tastemakeAttention(baseline,endpoint,ci){
  const items=[];
  if(ci&&ci.conclusion&&ci.conclusion!=='success') items.push({kind:'bad',title:'Main QA is not green',detail:'The latest Tastemake GitHub test workflow concluded '+ci.conclusion+'.'});
  if(endpoint?.rule_checks?.failed>0) items.push({kind:'bad',title:'Live-endpoint eval has rule failures',detail:endpoint.rule_checks.failed+' rule check(s) failed in the committed endpoint report.'});
  if(endpoint?.validator_self_test?.missed>0) items.push({kind:'bad',title:'Validator self-test missed bad output',detail:endpoint.validator_self_test.missed+' deliberately bad case(s) were not caught.'});
  if(!items.length) items.push({kind:'good',title:'Latest recorded Tastemake checks look healthy',detail:'Current endpoint rules, validator defenses, and main automated checks are healthy. Baseline results remain visible as historical comparison evidence only.'});
  return items;
}

function parseNarcHandoff(text){
  const green=/all three test suites[\s\S]{0,120}green/i.test(text)||/all three suites still green/i.test(text);
  const playtest=/#70[^\n]{0,160}playtest/i.test(text)&&/(only real next step|in progress|playing it now)/i.test(text);
  const analyticsBlocked=/#88[^\n]{0,160}(blocked|stays blocked)/i.test(text);
  return {recorded_all_suites_green:green,full_playtest_pending:playtest,analytics_blocked_until_playtest:analyticsBlocked};
}

// node --test prints one summary block per suite run: "# tests N", "# pass N", ... in CI (TAP), "ℹ tests N" in a terminal.
// Authority Lab's CI job runs the app suite first and the agent suite second.
function parseNodeTestSummaries(text){
  const blocks=[];let current=null;
  for(const raw of String(text||'').split(/\r?\n/)){
    const match=raw.match(/(?:ℹ|#) (tests|pass|fail|skipped|cancelled|todo) (\d+)\s*$/);
    if(!match)continue;
    if(match[1]==='tests'){current={tests:Number(match[2])};blocks.push(current);}
    else if(current)current[match[1]]=Number(match[2]);
  }
  return blocks;
}

// Job logs need an authenticated request; without GITHUB_TOKEN the run's result alone is used.
async function jobTestCounts(repo,runId){
  if(!process.env.GITHUB_TOKEN)return null;
  try{
    const jobs=await githubJson('/repos/'+repo+'/actions/runs/'+runId+'/jobs?per_page=10');
    const job=(jobs.jobs||[]).find(item=>item.conclusion==='success')||(jobs.jobs||[])[0];
    if(!job)return null;
    const response=await timedFetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers:{Accept:'application/vnd.github+json','User-Agent':'context-switch-project-health',Authorization:'Bearer '+process.env.GITHUB_TOKEN}},6000);
    if(!response.ok)return null;
    const blocks=parseNodeTestSummaries(await response.text());
    return blocks.length?{job:String(job.name||'test').slice(0,80),blocks}:null;
  }catch(_){return null;}
}

async function authorityLab(){
  const source=SOURCES['authority-lab'];
  const runs=await githubJson('/repos/'+source.repo+'/actions/workflows/'+source.workflow+'/runs?branch='+source.branch+'&per_page=1');
  const latest=Array.isArray(runs.workflow_runs)?runs.workflow_runs[0]:null;
  const ci=latest?{status:latest.status,conclusion:latest.conclusion,updated_at:latest.updated_at,html_url:latest.html_url,head_sha:latest.head_sha}:null;
  const counts=latest?.id?await jobTestCounts(source.repo,latest.id):null;
  const [app,agent]=counts?.blocks||[];
  const suite=(block,name,detail)=>block?{name,detail,tests:block.tests,passed:block.pass??null,failed:block.fail??null}:{name,detail,tests:null,passed:null,failed:null};
  const suites=[
    suite(app,'App and store tests','Governance rules, records, authority changes and screens (npm test).'),
    suite(agent,'Agent tooling tests','The MCP agent tooling, which imports the same gate (npm test --prefix agent).')
  ];
  const attention=[];
  if(!ci)attention.push({kind:'warn',title:'No test run found',detail:'Project Health could not find a test workflow run on main.'});
  else if(ci.conclusion&&ci.conclusion!=='success')attention.push({kind:'bad',title:'Automated tests are not green',detail:'The latest Authority Lab test workflow on main concluded '+ci.conclusion+'.'});
  else if(ci.status!=='completed')attention.push({kind:'warn',title:'Tests are still running',detail:'The latest test run on main has not finished.'});
  if(!attention.length)attention.push({kind:'good',title:'Latest Authority Lab tests pass',detail:'The test workflow on main passed on Node 22 and 24.'});
  return {
    project:'authority-lab',
    ci,
    suites,
    attention,
    caveat:counts?'Counts come from the latest run\'s job log.':'Test counts were not available; the run\'s overall result is shown.'
  };
}

async function tastemake(){
  const source=SOURCES.tastemake;
  const [branch,baselineText,endpointText,runs]=await Promise.all([
    githubJson('/repos/'+source.repo+'/branches/'+source.branch),
    githubText(source.repo,source.baseline,source.branch),
    githubText(source.repo,source.endpoint,source.branch),
    githubJson('/repos/'+source.repo+'/actions/workflows/'+source.workflow+'/runs?branch='+source.branch+'&per_page=1')
  ]);
  const baseline=summarizeEval(JSON.parse(baselineText));
  const endpoint=summarizeEval(JSON.parse(endpointText));
  const latest=Array.isArray(runs.workflow_runs)?runs.workflow_runs[0]:null;
  const ci=latest?{status:latest.status,conclusion:latest.conclusion,updated_at:latest.updated_at,html_url:latest.html_url,head_sha:latest.head_sha}:null;
  return {
    project:'tastemake',
    source_commit:branch.commit?.sha||null,
    ci,
    baseline,
    endpoint,
    attention:tastemakeAttention(baseline,endpoint,ci),
    check_groups:[
      {name:'Recommendation grounding',detail:'Citations must point to real experienced evidence; intent is not treated as taste.'},
      {name:'Calibration + user authority',detail:'Confidence stays within evidence and explicit user corrections outrank inference.'},
      {name:'Cross-domain restraint',detail:'Taste patterns cannot generalize farther than the evidence supports.'},
      {name:'Validator defenses',detail:'Deliberately bad answers must be rejected for the right reason.'}
    ],
    caveat:'Committed eval reports are snapshots, not a new live eval run.'
  };
}

async function narc(){
  const source=SOURCES.narc;
  const [branch,handoffText,runs]=await Promise.all([
    githubJson('/repos/'+source.repo+'/branches/'+source.branch),
    githubText(source.repo,source.handoff,source.branch),
    githubJson('/repos/'+source.repo+'/actions/workflows/'+source.workflow+'/runs?branch='+source.branch+'&per_page=1').catch(()=>({workflow_runs:[]}))
  ]);
  const recorded=parseNarcHandoff(handoffText);
  const latest=Array.isArray(runs.workflow_runs)?runs.workflow_runs[0]:null;
  const ci=latest?{status:latest.status,conclusion:latest.conclusion,updated_at:latest.updated_at,html_url:latest.html_url,head_sha:latest.head_sha}:null;
  const attention=[];
  if(ci?.conclusion&&ci.conclusion!=='success') attention.push({kind:'bad',title:'Automated game checks are not green',detail:'The latest NARC quality workflow concluded '+ci.conclusion+'.'});
  if(!ci&&!recorded.recorded_all_suites_green) attention.push({kind:'warn',title:'No current recorded test verification found',detail:'Project Health could not confirm that all three deterministic suites are green.'});
  if(recorded.full_playtest_pending) attention.push({kind:'warn',title:'Full first-run playtest still pending',detail:'The code-level suites are recorded green, but the ~15-minute human playtest is still the next product-quality gate.'});
  if(!attention.length) attention.push({kind:'good',title:'Latest NARC quality checks look healthy',detail:'The automated game suites are green and no additional code-level quality issue is recorded.'});
  return {
    project:'narc',
    source_commit:branch.commit?.sha||null,
    ci,
    recorded:{...recorded,updated_at:ci?.updated_at||null},
    suites:[
      {name:'Core game regression',command:'node test.mjs',detail:'Broad authored-game rules, branches, consequences, endings, and regression cases.'},
      {name:'Single-day engine',command:'node test-day.mjs',detail:'Time, deadlines, NARC adaptation, coworker consequences, trust, and ending-state consistency.'},
      {name:'Desktop integration',command:'node test-desktop.mjs',detail:'Source-level desktop interaction and UI integration checks.'}
    ],
    attention,
    caveat:ci?'Latest GitHub Actions result plus the human playtest gate.':'No workflow result is available yet; the repo handoff is being used as fallback evidence.',
    analytics_blocked_until_playtest:recorded.analytics_blocked_until_playtest
  };
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.status(405).json({detail:'Method not allowed'});return;}
  const project=String(req.query?.project||'').toLowerCase();
  try{
    let payload;
    if(project==='tastemake') payload=await tastemake();
    else if(project==='narc') payload=await narc();
    else if(project==='authority-lab') payload=await authorityLab();
    else {res.status(404).json({detail:'No external quality adapter for this project'});return;}
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=1800');
    res.status(200).json(payload);
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    res.status(502).json({detail:error?.message||'Quality source unavailable'});
  }
};

module.exports._test={summarizeEval,tastemakeAttention,parseNarcHandoff,parseNodeTestSummaries,authorityLab};