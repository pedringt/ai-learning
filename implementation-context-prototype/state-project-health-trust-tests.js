// Oct 27 PM review: Project Health's numbers, labels and statuses must not contradict themselves.
// Covers one-metric cards, point deltas, eval coverage, "Healthy on what's measured", the 15 s p95 target,
// small samples, analytics loading, report provenance, and the server-stored decision log.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const H=require('../project-health.js');
const M=require('../project-health-model.js');
const decisions=require('../api/project-health-decisions.js')._test;

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

// The live payload shape from Oct 26: grounding stayed at 100% while the suite's overall score and uncertainty fell.
const ask=(overrides)=>({suite:'ask_quality',total:10,high_severity_failures:0,ask_grounding:1,uncertainty_accuracy:1,authority_accuracy:1,overall_pass_rate:1,failure_details:[],...overrides});
const review=(overrides)=>({suite:'review_interpretation',total:16,high_severity_failures:0,interpretation_accuracy:1,failure_details:[],...overrides});
const latestAsk=ask({build:'43904f306f705ea645820a1793ffffcf014b87f9',created_at:'2026-10-26 20:00:33',uncertainty_accuracy:0.9,overall_pass_rate:0.9,high_severity_failures:1,
  failure_details:[{scenario_id:'ask_known_outcome_unknown_reason',severity:'high',failed_checks:['uncertainty']}]});
const latestReview=review({build:'43904f306f705ea645820a1793ffffcf014b87f9',created_at:'2026-10-26 20:00:33',interpretation_accuracy:0.8125,high_severity_failures:2,
  failure_details:[{scenario_id:'review_tentative_high_consequence',severity:'high',failed_checks:['interpretation']},{scenario_id:'review_partial_reversal',severity:'high',failed_checks:['review_needed','interpretation']},{scenario_id:'review_unknown_not_false',severity:'medium',failed_checks:['interpretation']}]});
const q={review:latestReview,ask:latestAsk,recent:[
  latestReview,latestAsk,
  review({build:'7b90d65',created_at:'2026-10-20 20:00:00'}),
  ask({build:'7b90d65',created_at:'2026-10-20 20:00:00'})
]};

(async()=>{
  await check('each Overview card reads one field: grounding is 100%, unchanged, with no failures',()=>{
    const cards=M.stateMetricCards(q);
    assert.deepStrictEqual(cards.map(c=>c.label),['Update understanding','Evidence grounding','Decision authority','Uncertainty handling']);
    const grounding=cards.find(c=>c.label==='Evidence grounding');
    assert.strictEqual(grounding.score,1);
    assert.strictEqual(grounding.signal,'0 failures');
    assert.strictEqual(grounding.delta.label,'0 pts');
    const uncertainty=cards.find(c=>c.label==='Uncertainty handling');
    assert.strictEqual(uncertainty.score,0.9);
    assert.strictEqual(uncertainty.signal,'1 high-impact failure');
    assert.strictEqual(uncertainty.kind,'bad');
    assert.deepStrictEqual(uncertainty.delta,{label:'↓ 10 pts',cls:'down'});
    const understanding=cards.find(c=>c.label==='Update understanding');
    assert.strictEqual(understanding.signal,'2 high-impact failures');
    assert.strictEqual(understanding.sub,'13 / 16 passed');
    assert.deepStrictEqual(understanding.delta,{label:'↓ 18.7 pts',cls:'down'});
  });
  await check('the AI Evals tab trend for a metric compares that metric, not the suite',()=>{
    assert.strictEqual(M.evalTrend(q.recent,'ask_quality','ask_grounding'),'Stable vs previous run');
    assert.strictEqual(M.evalTrend(q.recent,'ask_quality','uncertainty_accuracy'),'Down 10 points vs previous run');
    assert.strictEqual(M.evalTrend(q.recent,'ask_quality'),'Down 10 points vs previous run','the suite overall still works without a field');
  });
  await check('a suite with no earlier run, or an earlier run without the field, shows no change',()=>{
    assert.strictEqual(M.mockDelta([latestAsk],'ask_quality','ask_grounding').label,'—');
    assert.strictEqual(M.mockDelta([latestAsk,ask({created_at:'2026-10-01',ask_grounding:null})],'ask_quality','ask_grounding').label,'—');
  });
  await check('eval coverage: a non-AI release after the eval keeps the scores current',()=>{
    const note=M.evalCoverageNote({project:{quality:'state'},quality:{...q,behaviorUpdatedAt:'2026-10-20T00:00:00Z'},delivery:{sha:'51da8e4000000000000000000000000000000000'}});
    assert.strictEqual(note.kind,'good');
    assert.match(note.text,/^Evals ran on build 43904f3, .*State’s AI behavior has not changed since, so the scores still apply to the live release \(51da8e4\)\.$/);
  });
  await check('eval coverage: an AI behavior change after the eval says to rerun',()=>{
    const note=M.evalCoverageNote({project:{quality:'state'},quality:{...q,behaviorUpdatedAt:'2026-10-27T09:00:00Z'},delivery:{sha:'51da8e4'}});
    assert.strictEqual(note.kind,'warn');
    assert.match(note.text,/changed after the latest recorded run\. Rerun before trusting these scores\./);
  });
  await check('eval coverage: same build, and unknown behavior history',()=>{
    assert.strictEqual(M.evalCoverageNote({project:{quality:'state'},quality:q,delivery:{sha:'43904f306f705ea645820a1793ffffcf014b87f9'}}).kind,'good');
    assert.strictEqual(M.evalCoverageNote({project:{quality:'state'},quality:q,delivery:{sha:'51da8e4'}}).kind,'unknown');
    assert.strictEqual(M.evalCoverageNote({project:{quality:'tastemake'},quality:q}),null);
  });
  await check('the release-vs-eval gap only appears when behavior history is unknown',()=>{
    const base={project:{id:'state'},delivery:{sha:'abcdef1234567890'},quality:{review:{build:'1234567abcdef'},ask:{build:'1234567abcdef'}},platform:{aiTelemetry:{available:true,cost:{partial:false},workflow:{available:true}},neon:{available:true}},runInfo:{configured:true}};
    assert.ok(M.setupGaps(base).some(gap=>gap.label==='Current release eval coverage'));
    assert.ok(!M.setupGaps({...base,quality:{...base.quality,behaviorUpdatedAt:'2026-10-20T00:00:00Z'}}).some(gap=>gap.label==='Current release eval coverage'));
  });

  const healthyAl={project:PROJECT('authority-lab'),fresh:true,pending:new Set(),delivery:{vercel:{kind:'good'}},externalQuality:{attention:[{kind:'good',title:'Tests passing'}]}};
  await check('Authority Lab reads "Healthy on what\'s measured" and names the walkthrough',()=>{
    const status=M.projectStatus(healthyAl);
    assert.deepStrictEqual([status.key,status.label,status.shortLabel,status.kind],['partial','Healthy on what’s measured','Partly measured','good']);
    assert.match(M.overallAttention(healthyAl).detail,/Not measured: the full lifecycle walkthrough\./);
    const ok=M.healthySummary(healthyAl);
    assert.strictEqual(ok.rowTitle,'Healthy on what’s measured');
    assert.strictEqual(ok.rowDetail,'Not measured: the full lifecycle walkthrough.');
    assert.strictEqual(M.releaseReadiness(healthyAl).label,'Healthy on what’s measured');
    assert.match(M.cardMarkup(healthyAl,false),/Not measured: the full lifecycle walkthrough\./);
  });
  await check('Tastemake, State and NARC declare no extra quality gaps (Paige, Oct 27)',()=>{
    for(const id of ['tastemake','state','narc'])assert.deepStrictEqual(M.unmeasuredQuality({project:PROJECT(id)}),[],id);
    assert.strictEqual(M.projectStatus({...healthyAl,project:PROJECT('tastemake')}).label,'Healthy');
  });
  await check('a real problem still outranks the partly-measured label',()=>{
    const broken={...healthyAl,externalQuality:{attention:[{kind:'bad',title:'Tests failing'}]}};
    assert.strictEqual(M.projectStatus(broken).label,'Needs attention');
  });

  const speed=p95=>M.operationalSignals({project:PROJECT('state'),platform:{aiTelemetry:{available:true,response_speed:{sample_size:11,p95_ms:p95}}}}).find(item=>item.label==='AI response speed');
  await check('State AI p95 above 15 s reads Watch; within it reads Measured',()=>{
    const over=speed(26300);
    assert.deepStrictEqual([over.kind,over.status],['warn','Watch']);
    assert.match(over.detail,/p95 26\.3 s across 11 recorded calls · above the 15 s target\./);
    const within=speed(9000);
    assert.deepStrictEqual([within.kind,within.status],['available','Measured']);
    assert.match(within.detail,/within the 15 s target/);
  });
  await check('projects without a target keep the plain measured signal',()=>{
    const signal=M.operationalSignals({project:{id:'tastemake'},platform:{aiTelemetry:{available:true,response_speed:{sample_size:4,p95_ms:30000}}}}).find(item=>item.label==='AI response speed');
    assert.deepStrictEqual([signal.kind,signal.status],['available','Measured']);
    assert.doesNotMatch(signal.detail,/target/);
  });

  await check('fewer than five checks show a count, not a percentage',()=>{
    assert.strictEqual(H.countDisplay(1,1),'1 / 1');
    assert.strictEqual(H.countDisplay(3,4),'3 / 4');
    assert.strictEqual(H.countDisplay(30,30),null);
    assert.strictEqual(H.countDisplay(null,null),null);
  });
  const page=fs.readFileSync(path.join(__dirname,'..','project-health.js'),'utf8');
  await check('the Observability count matches every gap listed under What we cannot confirm',()=>{
    const data={project:PROJECT('state'),fresh:true,pending:new Set(),delivery:{vercel:{kind:'good'}},quality:q,
      platform:{aiTelemetry:{available:true,cost:{partial:false}},neon:{available:false}},runInfo:{configured:true},
      activity:{available:true,runtime:{coverage:'not_monitored'}}};
    const gaps=M.setupGaps(data);
    assert.ok(gaps.some(gap=>gap.label==='Agent workflow telemetry'));
    const observability=M.releaseRiskChecklist(data).find(item=>item.label==='Observability');
    assert.match(observability.detail,new RegExp('^'+gaps.length+' monitoring gaps'));
    assert.doesNotMatch(page,/monitoringGaps\.slice\(/,'the list shows every gap the count includes');
  });
  await check('NARC pass/fail checks never render as 100% or 0%',()=>{
    assert.match(page,/label==='First-run playtest'\?\(score===1\?'Done':'Pending'\):\(score===1\?'Passing':'Failing'\)/);
  });
  await check('analytics says "checking" while loading and names a real failure otherwise',()=>{
    assert.doesNotMatch(page,/still loading or temporarily unavailable/);
    assert.match(page,/pending\.has\('Analytics'\)\?'Checking site analytics…'/);
  });

  await check('the rule-built Overview card says no AI was called',()=>{
    assert.doesNotMatch(page,/<h3>Latest investigation<\/h3>/);
    assert.match(page,/Assessment from current signals<\/h3><p class="mock-investigation-source">Built by rules from the signals on this page\. No AI model was called\./);
  });
  await check('report kickers say where a report came from',()=>{
    const quality=M.investigationResultHtml({report:'x',qualityInvestigation:true,observedAt:'2026-10-27T10:00:00Z'});
    assert.match(quality,/Quality investigation · built from recorded eval evidence/);
    assert.doesNotMatch(quality,/AI quality investigation/);
    const ai=M.investigationResultHtml({report:'x',model:'claude-haiku-5-5',observedAt:'2026-10-27T10:00:00Z'});
    assert.match(ai,/AI investigation · Claude Haiku 5\.5 · accuracy not yet measured/);
  });
  await check('the drafted failure explanations replace the generic text',()=>{
    for(const id of ['review_tentative_high_consequence','review_partial_reversal']){
      const detail=M.failureExplanation({scenario_id:id});
      assert.doesNotMatch(detail.why,/controlled behavior differed/);
      assert.doesNotMatch(detail.title,/needs review$/);
    }
  });

  await check('decision proxy: entries are filtered to the expected shape',()=>{
    assert.deepStrictEqual(decisions.safeEntry({id:'phdec_0123456789abcdef',type:'change',text:'t',createdAt:'2026-10-27 10:00:00.1',extra:'x'}),{id:'phdec_0123456789abcdef',type:'change',text:'t',createdAt:'2026-10-27 10:00:00.1'});
    assert.strictEqual(decisions.safeEntry({id:'other',type:'change',text:'t'}),null);
    assert.strictEqual(decisions.safeEntry({id:'phdec_0123456789abcdef',type:'rumour',text:'t'}),null);
    assert.strictEqual(decisions.apiBase('production'),'https://state-api-6waw.onrender.com');
    assert.strictEqual(decisions.apiBase('preview'),'https://state-api-staging.onrender.com');
  });
  const call=async(req,fetchImpl)=>{
    const res={code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
    await decisions.handler({headers:{},query:{},...req},res,{fetchImpl});
    return res;
  };
  await check('decision proxy: writes need a key and pass it through; reads do not',async()=>{
    const seen=[];
    const fetchImpl=async(url,options)=>{seen.push({url,options});return {status:url.includes('?project=')?200:201,json:async()=>url.includes('?project=')?{entries:[{id:'phdec_0123456789abcdef',type:'decision',text:'t',createdAt:'x'}]}:{id:'phdec_0123456789abcdef',type:'decision',text:'t',createdAt:'x'}};};
    const read=await call({method:'GET',query:{project:'state'}},fetchImpl);
    assert.strictEqual(read.code,200);
    assert.strictEqual(read.body.entries.length,1);
    assert.strictEqual(seen[0].options.headers['X-Project-Health-Decision-Key'],undefined);
    assert.strictEqual((await call({method:'POST',body:{project:'state',text:'t'}},fetchImpl)).code,401);
    const write=await call({method:'POST',headers:{'x-project-health-decision-key':'k'},body:{project:'state',type:'decision',text:'t'}},fetchImpl);
    assert.strictEqual(write.code,201);
    assert.strictEqual(seen.at(-1).options.headers['X-Project-Health-Decision-Key'],'k');
    assert.strictEqual((await call({method:'POST',headers:{'x-project-health-decision-key':'k'},body:{project:'northstar',text:'t'}},fetchImpl)).code,400);
    assert.strictEqual((await call({method:'DELETE',query:{id:'../admin'},headers:{'x-project-health-decision-key':'k'}},fetchImpl)).code,400);
    assert.strictEqual((await call({method:'PUT'},fetchImpl)).code,405);
  });
  await check('decision proxy: a rejected key is passed back, not hidden',async()=>{
    const res=await call({method:'POST',headers:{'x-project-health-decision-key':'bad'},body:{project:'state',text:'t'}},async()=>({status:403,json:async()=>({detail:'Invalid Project Health decision key'})}));
    assert.deepStrictEqual([res.code,res.body.detail],[403,'Invalid Project Health decision key']);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();

function PROJECT(id){return M.PROJECTS.find(project=>project.id===id);}
