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
    handoff:'docs/HANDOFF.md'
  }
};

async function githubJson(path){
  const response=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'context-switch-project-health'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload?.message||('GitHub request failed: '+response.status));
  return payload;
}

async function githubText(repo,path,ref){
  const response=await fetch('https://raw.githubusercontent.com/'+repo+'/'+encodeURIComponent(ref)+'/'+path,{headers:{'User-Agent':'context-switch-project-health'}});
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
    grounding_findings:grounding.map((x,i)=>({fixture:fixtures[i]?.id||null,detail:x.detail||''})),
    validator_self_test:{caught:self.filter(x=>x.caught===true).length,total:self.length,missed:self.filter(x=>x.caught!==true).length},
    failing_fixtures:fixtures.filter(f=>(f.scores||[]).some(s=>s.pass===false)).map(f=>f.id)
  };
}

function tastemakeAttention(baseline,endpoint,ci){
  const items=[];
  if(ci&&ci.conclusion&&ci.conclusion!=='success') items.push({kind:'bad',title:'Main QA is not green',detail:'The latest Tastemake GitHub test workflow concluded '+ci.conclusion+'.'});
  if(endpoint?.rule_checks?.failed>0) items.push({kind:'bad',title:'Live-endpoint eval has rule failures',detail:endpoint.rule_checks.failed+' rule check(s) failed in the committed endpoint report.'});
  if(endpoint?.validator_self_test?.missed>0) items.push({kind:'bad',title:'Validator self-test missed bad output',detail:endpoint.validator_self_test.missed+' deliberately bad case(s) were not caught.'});
  if(baseline?.valid_fixture_outputs?.failed>0) items.push({kind:'warn',title:'Baseline still has known quality gaps',detail:baseline.valid_fixture_outputs.failed+' baseline fixture(s) rejected one or more proposed outputs; this is expected comparison evidence, not a production failure.'});
  if(!items.length) items.push({kind:'good',title:'Latest recorded Tastemake checks look healthy',detail:'No rule or validator-self-test failures are present in the committed eval reports.'});
  return items;
}

function parseNarcHandoff(text){
  const green=/all three test suites[\s\S]{0,120}green/i.test(text)||/all three suites still green/i.test(text);
  const playtest=/#70[^\n]{0,160}playtest/i.test(text)&&/(only real next step|in progress|playing it now)/i.test(text);
  const analyticsBlocked=/#88[^\n]{0,160}(blocked|stays blocked)/i.test(text);
  return {recorded_all_suites_green:green,full_playtest_pending:playtest,analytics_blocked_until_playtest:analyticsBlocked};
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
  const [branch,handoffText]=await Promise.all([
    githubJson('/repos/'+source.repo+'/branches/'+source.branch),
    githubText(source.repo,source.handoff,source.branch)
  ]);
  const recorded=parseNarcHandoff(handoffText);
  const attention=[];
  if(!recorded.recorded_all_suites_green) attention.push({kind:'warn',title:'No current recorded test verification found',detail:'Project Health could not confirm the handoff statement that all three deterministic suites are green.'});
  if(recorded.full_playtest_pending) attention.push({kind:'warn',title:'Full first-run playtest still pending',detail:'The code-level suites are recorded green, but the ~15-minute human playtest is still the next product-quality gate.'});
  if(!attention.length) attention.push({kind:'good',title:'Recorded NARC quality checks look healthy',detail:'The handoff records all three deterministic suites as green.'});
  return {
    project:'narc',
    source_commit:branch.commit?.sha||null,
    recorded,
    suites:[
      {name:'Core game regression',command:'node test.mjs',detail:'Broad authored-game rules, branches, consequences, endings, and regression cases.'},
      {name:'Single-day engine',command:'node test-day.mjs',detail:'Time, deadlines, NARC adaptation, coworker consequences, trust, and ending-state consistency.'},
      {name:'Desktop integration',command:'node test-desktop.mjs',detail:'Source-level desktop interaction and UI integration checks.'}
    ],
    attention,
    caveat:'NARC has no GitHub Actions workflow, so this is the latest recorded repo verification, not a live CI result.',
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
    else {res.status(404).json({detail:'No external quality adapter for this project'});return;}
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(payload);
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    res.status(502).json({detail:error?.message||'Quality source unavailable'});
  }
};

module.exports._test={summarizeEval,tastemakeAttention,parseNarcHandoff};