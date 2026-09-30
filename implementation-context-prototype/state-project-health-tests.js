// Project Health combined-branch regression coverage.
const assert=require('assert');
const fs=require('fs');
const H=require('../project-health.js');
const RUN_API=require('../api/project-health-run.js')._test;

assert.deepStrictEqual(H.PROJECTS.map(p=>p.id),['state','tastemake','narc']);
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-git-staging-cairn10.vercel.app',search:''}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-b19hocddc-cairn10.vercel.app',search:''}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.contextswitch.tech',search:'?env=staging'}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.authenticignorance.site'}}),'production');
const priorToken=process.env.GITHUB_TOKEN;
const priorCost=process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;
process.env.GITHUB_TOKEN='test-token';
process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='<$0.25 per full run';
const publicRunInfo=RUN_API.runInfo('state');
assert.strictEqual(publicRunInfo.configured,true);
assert.strictEqual(publicRunInfo.can_run_here,true);
assert.match(publicRunInfo.protection,/Public run/);
assert.strictEqual(RUN_API.RUN_COOLDOWN_MS,10*60*1000);
if(priorToken==null)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=priorToken;
if(priorCost==null)delete process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;else process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE=priorCost;
assert.strictEqual(
  H.commitTitle('Merge pull request #284 from pedringt/project-health-streaming-refresh\n\nMake Project Health load progressively and cache safely'),
  'Make Project Health load progressively and cache safely'
);
assert.strictEqual(H.commitTitle('Show PR titles on project cards\n\nAdditional details'), 'Show PR titles on project cards');

assert.deepStrictEqual(
  H.vercelFromStatus({statuses:[{context:'Vercel – app',state:'success'}]}).kind,
  'good'
);
assert.strictEqual(
  H.vercelFromStatus({statuses:[{context:'Vercel – app',state:'failure'}]}).kind,
  'bad'
);
assert.strictEqual(
  H.vercelFromStatus({statuses:[]}).kind,
  'unknown'
);

assert.strictEqual(H.analyticsConnectionValue({analytics:{available:true,visitors:1}}),'Connected');
assert.strictEqual(H.analyticsConnectionValue({analytics:{configured:true,available:false,status:403}}),'Access denied');
assert.strictEqual(H.analyticsConnectionValue({analytics:{configured:true,available:false,status:404}}),'Dataset unavailable');
const analyticsDeniedGaps=H.setupGaps({
  project:H.PROJECTS[0],
  platform:{analytics:{configured:true,available:false,status:403}},
  activity:{available:true,runtime:{available:false,status:403}},
  pending:new Set(),
  runInfo:null
});
assert.match(analyticsDeniedGaps.find(item=>item.label==='Usage analytics').detail,/token/i);
assert.match(analyticsDeniedGaps.find(item=>item.label==='Runtime error visibility').detail,/token/i);

const healthy=H.normalizeQuality({
  live_review_quality:{resolved_reviews:4,material_edit_rate:.25},
  controlled_evals:{
    latest_review_interpretation:{interpretation_accuracy:1,high_severity_failures:0,failed_cases:0},
    latest_ask_quality:{ask_grounding:1,authority_accuracy:1,overall_pass_rate:1,high_severity_failures:0,failed_cases:0}
  }
});
assert.strictEqual(H.qualityAttention(healthy).kind,'good');

const severe=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{interpretation_accuracy:.875,high_severity_failures:1,failed_cases:1},
    latest_ask_quality:{ask_grounding:1,authority_accuracy:1,overall_pass_rate:1,high_severity_failures:0}
  }
});
assert.strictEqual(H.qualityAttention(severe).kind,'bad');

const mediumOnly=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{
      suite:'review_interpretation',interpretation_accuracy:.75,high_severity_failures:0,total:8,created_at:'2026-09-30 00:45:46',
      failure_details:[
        {scenario_id:'review_question_answer_only',severity:'medium',expected:'answer_question',observed:'answer_question_and_update_state',failed_checks:['interpretation']},
        {scenario_id:'review_unknown_not_false',severity:'medium',expected:'preserve_evidence_only',observed:'open_question',failed_checks:['review_needed','interpretation']}
      ]
    },
    latest_ask_quality:{suite:'ask_quality',overall_pass_rate:1,ask_grounding:1,high_severity_failures:0,total:8,created_at:'2026-09-30 00:45:46'},
    recent:[
      {suite:'review_interpretation',interpretation_accuracy:.75,high_severity_failures:0,total:8,created_at:'2026-09-30 00:45:46'},
      {suite:'review_interpretation',interpretation_accuracy:.625,high_severity_failures:2,total:8,created_at:'2026-09-30 00:35:03'}
    ]
  }
});
assert.strictEqual(H.qualityAttention(mediumOnly).kind,'warn');
const mediumInvestigation=H.qualityInvestigation({project:H.PROJECTS[0],quality:mediumOnly});
assert.match(mediumInvestigation.report,/75%/);
assert.match(mediumInvestigation.report,/0 high-impact failures/);
assert.match(mediumInvestigation.report,/improved 12\.5 points/);
assert.match(mediumInvestigation.report,/workflow noise rather than false truth/);

const detailedSevere=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{
      suite:'review_interpretation',interpretation_accuracy:.875,high_severity_failures:1,created_at:'2026-09-30T01:00:00Z',
      failure_details:[{scenario_id:'review_direct_reversal',category:'direct_reversal',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['interpretation']}]
    },
    latest_ask_quality:{suite:'ask_quality',overall_pass_rate:1,ask_grounding:1,high_severity_failures:0}
  }
});
const qualityInvestigation=H.qualityInvestigation({project:H.PROJECTS[0],quality:detailedSevere});
assert.strictEqual(qualityInvestigation.qualityInvestigation,true);
assert.match(qualityInvestigation.report,/review_direct_reversal/);
assert.match(qualityInvestigation.report,/Product \+ Engineering/);

const legacyQualityInvestigation=H.qualityInvestigation({project:H.PROJECTS[0],quality:severe});
assert.match(legacyQualityInvestigation.report,/older run/);

const staleRecordedQuality=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{
      suite:'review_interpretation',interpretation_accuracy:.923076923,high_severity_failures:1,total:13,created_at:'2026-09-29 19:26:17',
      failure_details:[{scenario_id:'review_partial_question_answer',severity:'high',expected:'update_state',observed:'update_state_and_open_question',failed_checks:['interpretation']}]
    },
    latest_ask_quality:{
      suite:'ask_quality',overall_pass_rate:.9,ask_grounding:1,authority_accuracy:.9,high_severity_failures:1,total:10,created_at:'2026-09-29 19:26:18',
      failure_details:[{scenario_id:'ask_conflicting_evidence',severity:'high',expected:'preserve authority',observed:'Failed checks: authority',failed_checks:['authority']}]
    }
  }
});
assert.strictEqual(H.stateEvalContractStale(staleRecordedQuality),true);
assert.strictEqual(H.qualityAttention(staleRecordedQuality).kind,'warn');
const staleInvestigation=H.qualityInvestigation({project:H.PROJECTS[0],quality:staleRecordedQuality});
assert.strictEqual(staleInvestigation.staleEvalContract,true);
assert.match(staleInvestigation.report,/eval contract changed/i);
const staleHandoff=H.projectHandoff({
  ...H.emptyProjectData(H.PROJECTS[0]),
  fresh:true,
  quality:staleRecordedQuality,
  delivery:{sha:'abc',message:'Latest release',updatedAt:'2026-09-30T01:00:00Z',vercel:{kind:'good'}},
  platform:null
});
assert.match(staleHandoff.handoffText,/Needs rerun/);
assert.doesNotMatch(staleHandoff.handoffText,/A serious AI quality check failed/);

const behaviorStaleQuality=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{suite:'review_interpretation',interpretation_accuracy:.9,high_severity_failures:1,total:10,created_at:'2026-09-30 01:10:00'},
    latest_ask_quality:{suite:'ask_quality',overall_pass_rate:.9,ask_grounding:1,high_severity_failures:1,total:10,created_at:'2026-09-30 01:10:01'}
  }
});
behaviorStaleQuality.behaviorUpdatedAt='2026-09-30T02:00:00Z';
assert.strictEqual(H.stateEvalContractStale(behaviorStaleQuality),false);
assert.strictEqual(H.stateEvalBehaviorStale(behaviorStaleQuality),true);
assert.strictEqual(H.stateEvalResultsStale(behaviorStaleQuality),true);
assert.match(H.qualityAttention(behaviorStaleQuality).detail,/behavior these checks measure changed/i);
const behaviorStaleInvestigation=H.qualityInvestigation({project:H.PROJECTS[0],quality:behaviorStaleQuality});
assert.strictEqual(behaviorStaleInvestigation.staleEvalBehavior,true);
assert.match(behaviorStaleInvestigation.report,/old scores no longer describe the current product/i);

const duplicateCheckQuality=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{suite:'review_interpretation',interpretation_accuracy:1,high_severity_failures:0,total:13,created_at:'2026-09-30 01:10:00'},
    latest_ask_quality:{
      suite:'ask_quality',overall_pass_rate:.9,ask_grounding:1,authority_accuracy:.9,high_severity_failures:1,total:10,created_at:'2026-09-30 01:10:01',
      failure_details:[{scenario_id:'ask_conflicting_evidence',severity:'high',expected:'preserve authority',observed:'Failed checks: authority',failed_checks:['authority']}]
    }
  }
});
const duplicateCheckReport=H.qualityInvestigation({project:H.PROJECTS[0],quality:duplicateCheckQuality}).report;
assert.strictEqual((duplicateCheckReport.match(/Failed checks: authority/g)||[]).length,1);

assert.strictEqual(H.evalRunComplete(mediumOnly,{suite:'review',baselineReview:'2026-09-29 03:28:03',baselineAsk:null}),true);
assert.strictEqual(H.evalRunComplete(mediumOnly,{suite:'all',baselineReview:'2026-09-29 03:28:03',baselineAsk:'2026-09-29 16:09:10'}),true);
assert.strictEqual(H.evalRunComplete(mediumOnly,{suite:'all',baselineReview:'2026-09-30 00:45:46',baselineAsk:'2026-09-30 00:45:46'}),false);

assert.strictEqual(
  H.deliveryAttention({vercel:{kind:'good'}}).kind,
  'good'
);
assert.strictEqual(
  H.infrastructureAttention({render:{configured:true,environments:{production:{ok:true},staging:{ok:false}}}}),
  null
);
assert.strictEqual(
  H.infrastructureAttention({render:{configured:true,environments:{production:{ok:false},staging:{ok:true}}}}).kind,
  'bad'
);
assert.strictEqual(H.productionRuntime({delivery:{vercel:{kind:'bad'}}}).kind,'available');
assert.match(H.productionRuntime({delivery:{vercel:{kind:'bad'}}}).detail,/previous production version remains live/i);
assert.strictEqual(H.productionRuntime({platform:{render:{environments:{production:{ok:true}}}},delivery:{vercel:{kind:'bad'}}}).kind,'good');
assert.match(H.operationalNextDecision({
  project:H.PROJECTS[0],
  delivery:{vercel:{kind:'bad'}},
  quality:null,
  externalQuality:null,
  activity:{available:false},
  platform:null,
  openPullRequests:[]
}),/retry the failed release|supersede/i);
const failureClass=H.qualityFailureClassSummary(H.normalizeQuality({controlled_evals:{
  latest_review_interpretation:{high_severity_failures:2,failure_details:[
    {category:'authority_conflict',severity:'high'},
    {category:'partial_question_answer',severity:'high'}
  ]},
  latest_ask_quality:{high_severity_failures:1,failure_details:[{category:'conflict',severity:'high'}]}
}}));
assert.strictEqual(failureClass.count,3);
assert.ok(failureClass.classes.includes('authority conflict'));
const groupedTimeline=H.activityTimelineItems({
  project:{id:'state'},
  delivery:null,
  quality:null,
  externalQuality:null,
  activity:{available:true,deployments:{recent_failures:[
    {id:'a',created_at:100,recovered:true,recovered_at:300,message:'A failed'},
    {id:'b',created_at:200,recovered:true,recovered_at:300,message:'B failed'}
  ]},runtime:{issues:[]}},
  openPullRequests:[],
  investigationHistory:[]
});
assert.ok(groupedTimeline.some(item=>item.title==='Deployment recovered ×2'&&item.type==='Incident / recovery'));
assert.strictEqual(
  H.overallAttention({delivery:{vercel:{kind:'good'}},quality:severe,externalQuality:null,platform:null}).kind,
  'bad'
);

const tastemakeQuality={
  project:'tastemake',
  ci:{conclusion:'success'},
  attention:[{kind:'good',title:'Latest recorded Tastemake checks look healthy',detail:'ok'}]
};
assert.strictEqual(H.externalQualityAttention(tastemakeQuality).kind,'good');
assert.strictEqual(
  H.projectQualityLabel({project:{id:'tastemake'},externalQuality:tastemakeQuality}),
  'Recommendation checks healthy'
);

const narcQuality={
  project:'narc',
  recorded:{recorded_all_suites_green:true,full_playtest_pending:true},
  attention:[{kind:'warn',title:'Full first-run playtest still pending',detail:'pending'}]
};
assert.strictEqual(
  H.projectQualityLabel({project:{id:'narc'},externalQuality:narcQuality}),
  'Automated checks pass · playtest open'
);
assert.strictEqual(
  H.overallAttention({delivery:{vercel:{kind:'good'}},quality:null,externalQuality:narcQuality,platform:null}).kind,
  'warn'
);

const quiet=H.attentionItems({
  delivery:{vercel:{kind:'good'}},
  quality:healthy,
  externalQuality:null,
  platform:null
});
assert.strictEqual(quiet.length,1);
assert.strictEqual(quiet[0].kind,'good');
assert.match(quiet[0].title,/Nothing needs action/);

const mixed=H.attentionItems({
  delivery:{vercel:{kind:'good'}},
  quality:null,
  externalQuality:narcQuality,
  platform:null
});
assert.strictEqual(mixed.length,1);
assert.strictEqual(mixed[0].kind,'warn');
assert.match(mixed[0].title,/playtest/i);

assert.strictEqual(
  H.progressText(0,3,['State','Tastemake','NARC']),
  'Refreshing 0 of 3 projects… State, Tastemake, NARC still checking.'
);
assert.strictEqual(
  H.progressText(2,3,['State']),
  'Refreshing 2 of 3 projects… State still checking.'
);
assert.strictEqual(H.progressText(3,3,[]),'Finishing refresh…');

const blank=H.emptyProjectData(H.PROJECTS[0]);
assert.strictEqual(blank.project.id,'state');
assert.ok(blank.pending instanceof Set);
assert.strictEqual(blank.pending.size,0);
assert.deepStrictEqual(blank.errors,[]);
assert.strictEqual(blank.fresh,false);
const narcBlank=H.emptyProjectData(H.PROJECTS[2]);
assert.strictEqual(H.projectStatus({...narcBlank,delivery:{vercel:{kind:'good'}},externalQuality:narcQuality,fresh:true}).label,'Watch');

const pendingOnly=H.emptyProjectData(H.PROJECTS[0]);
pendingOnly.pending.add('Delivery');
assert.strictEqual(H.overallAttention(pendingOnly).kind,'unknown');

const mergedPlatform=H.mergePlatform(
  {render:{configured:true,environments:{production:{ok:true}}}},
  {render:{configured:true,environments:{staging:{ok:false}}}}
);
assert.strictEqual(mergedPlatform.render.environments.production.ok,true);
assert.strictEqual(mergedPlatform.render.environments.staging.ok,false);
const mergedAiPlatform=H.mergePlatform({}, {aiTelemetry:{configured:true,available:true,response_speed:{sample_size:2,p50_ms:1200,p95_ms:2400},cost:{estimated_usd:0.01}}});
assert.strictEqual(mergedAiPlatform.aiTelemetry.response_speed.p50_ms,1200);

const serialized=H.serializeProjectData({
  ...blank,
  delivery:{sha:'abc123'},
  pending:new Set(['Delivery'])
});
assert.strictEqual(serialized.projectId,'state');
assert.strictEqual(serialized.delivery.sha,'abc123');
assert.strictEqual(Object.prototype.hasOwnProperty.call(serialized,'pending'),false);

assert.strictEqual(H.changedSinceVisit({project:{quality:null},lastVisit:{deliverySha:'old',quality:{},analyticsAvailable:null,openPullRequests:0},delivery:{sha:'new'},platform:{},openPullRequests:[],checkedAt:'2026-09-30T01:00:00Z'}),true);
assert.strictEqual(H.changedSinceVisit({project:{quality:null},lastVisit:{deliverySha:'same',quality:{},analyticsAvailable:null,openPullRequests:0},delivery:{sha:'same'},platform:{},openPullRequests:[],checkedAt:'2026-09-30T01:00:00Z'}),false);
assert.match(H.freshnessMeta('2026-09-30T01:00:00Z','2026-09-30T01:00:00Z',9999).label,/Updated|May be stale/);
assert.strictEqual(H.trendText(12.5),'↑ 12.5% vs previous 30 days');
assert.strictEqual(H.trendText(-4),'↓ 4% vs previous 30 days');

const reviewItems=H.activityReviewItems({
  project:{id:'state',name:'State'},
  activity:{
    available:true,
    deployments:{recent_failures:[{id:'dpl_bad',message:'Build failed',created_at:100,recovered:true,recovered_at:200,url:'https://vercel.com/example'}]},
    runtime:{issues:[{key:'/api/ask|boom',path:'/api/ask',message:'boom',status:500,count:3,last_seen:300,source_url:'https://vercel.com/example'}]}
  }
});
assert.strictEqual(reviewItems.length,2);
assert.strictEqual(reviewItems[0].kind,'runtime');
assert.strictEqual(reviewItems[1].resolved,true);
assert.strictEqual(reviewItems[0].owner,'Engineering');
assert.match(reviewItems[0].impact,/Users may be seeing errors/);
assert.strictEqual(reviewItems[1].owner,'No action');
const activeDeployItem=H.activityReviewItems({
  project:{id:'state',name:'State'},
  activity:{available:true,deployments:{recent_failures:[{id:'dpl_live',message:'Build failed',created_at:500,recovered:false}]},runtime:{issues:[]}}
})[0];
assert.match(activeDeployItem.title,/Release blocked/);
assert.match(activeDeployItem.impact,/previous production version/i);

const safeQuality=H.safeExternalQualitySnapshot({
  project:'tastemake',
  endpoint:{rule_checks:{passed:2,total:2},grounding_findings:[{detail:'private-ish detail'}],failing_fixtures:['x']}
});
assert.strictEqual(safeQuality.endpoint.rule_checks.passed,2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'grounding_findings'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'failing_fixtures'),false);


const healthHtml=fs.readFileSync(require.resolve('../project-health.html'),'utf8');
assert.match(healthHtml,/Product health triage/);
assert.match(healthHtml,/Spot problems, understand what they mean for users/);
assert.match(healthHtml,/How Project Health works/);
assert.match(healthHtml,/Role & attribution/);
assert.match(healthHtml,/id="projectCheckButton"/);
assert.match(healthHtml,/id="drawerCopyHandoffButton"/);
assert.match(healthHtml,/id="changesPanel"/);
assert.match(healthHtml,/id="investigationDrawer"[^>]*hidden/);
assert.match(healthHtml,/investigation-drawer\[hidden\].*display:none!important/);
assert.match(healthHtml,/drawer-copy\[hidden\].*display:none!important/);
assert.match(healthHtml,/id="projectActionMenu"/);
assert.match(healthHtml,/Project links ▾/);
assert.doesNotMatch(healthHtml,/>More<\/summary>/);
assert.match(healthHtml,/delivery-split/);
assert.match(healthHtml,/activity-type/);
assert.doesNotMatch(healthHtml,/id="prepareHandoffButton"/);
assert.match(healthHtml,/productFocusPanel/);
assert.doesNotMatch(healthHtml,/See a bounded investigation/);
assert.doesNotMatch(healthHtml,/id="investigationDemo"/);
assert.match(H.PROJECTS[0].focus,/without giving AI authority/);
assert.ok(H.PROJECTS[1].evidence.includes('Recommendation breadth'));
assert.match(H.PROJECTS[1].nextDecision,/canonical store/);
assert.match(H.PROJECTS[2].nextDecision,/first-play flow/);
assert.match(H.PROJECTS[0].description,/Human-reviewed project truth system/);
assert.deepStrictEqual(H.PROJECTS[0].releasePaths,['implementation-context-prototype','state-project-complete']);
assert.ok(H.PROJECTS[0].releaseIgnore.test('Project Health dashboard update'));
assert.ok(H.PROJECTS[0].releaseIgnore.test('Align prompt assertions after final compaction'));
assert.ok(H.PROJECTS[0].evalBehaviorPaths.includes('state-project-complete/question_review_prompt.py'));
assert.strictEqual(H.infrastructureAttention({render:{configured:true,environments:{production:{ok:true}}}}),null);

const unopenedState={...H.emptyProjectData(H.PROJECTS[0]),fresh:true,quality:H.normalizeQuality({controlled_evals:{latest_review_interpretation:null,latest_ask_quality:null}})};
assert.strictEqual(H.productOpenItems(unopenedState).length,1);
assert.strictEqual(H.projectStatus(unopenedState).label,'Watch');
assert.strictEqual(H.releaseReadiness({...unopenedState,delivery:{vercel:{kind:'good'}}}).label,'Watch');
assert.ok(H.setupGaps({...unopenedState,platform:{analytics:{configured:false,available:false},neon:{configured:false,available:false}},runInfo:{configured:false}}).some(item=>item.label==='AI cost'));
const stateWithAi={...unopenedState,platform:{analytics:{configured:true,available:true},neon:{configured:true,available:true},aiTelemetry:{configured:true,available:true,cost:{partial:true}}},runInfo:{configured:true}};
assert.ok(!H.setupGaps(stateWithAi).some(item=>item.label==='AI response speed'));
assert.ok(H.setupGaps(stateWithAi).some(item=>item.label==='AI cost coverage'));

const handoff=H.projectHandoff({
  ...stateWithAi,
  delivery:{sha:'abc1234',message:'Ship handoff feature',updatedAt:'2026-09-29T10:00:00Z',vercel:{kind:'good'}}
});
assert.strictEqual(handoff.handoff,true);
assert.match(handoff.handoffText,/State project handoff/);
assert.match(handoff.handoffText,/Next decision/);
assert.match(handoff.handoffText,/No immediate product decision|Rerun the AI quality checks|Review the quality miss|Review the high-impact failure class/);
const narcWithNoAi={...H.emptyProjectData(H.PROJECTS[2]),fresh:true,platform:{analytics:{configured:true,available:true},aiTelemetry:{configured:false,not_applicable:true}}};
assert.ok(!H.setupGaps(narcWithNoAi).some(item=>/^AI /.test(item.label)));


const quick=H.quickProjectCheck({
  project:{id:'state',quality:'state'},
  delivery:{vercel:{kind:'good',label:'Vercel deploy healthy'}},
  externalQuality:null,
  quality:healthy,
  activity:{runtime:{issues:[]}},
  platform:{render:{environments:{production:{ok:true}}}}
});
assert.strictEqual(quick.quickCheck,true);
assert.strictEqual(quick.title,'No immediate issue found');
assert.ok(quick.checks.some(item=>item.label==='Production deployment'&&item.value==='Healthy'));
assert.ok(quick.checks.some(item=>item.label==='Production backend'&&item.value==='Healthy'));

const quickHandoff=H.projectHandoff({
  ...H.emptyProjectData(H.PROJECTS[0]),
  fresh:true,
  quality:healthy,
  delivery:{sha:'abc',message:'State release',updatedAt:'2026-09-30T01:00:00Z',vercel:{kind:'good'}},
  investigation:quick
});
assert.match(quickHandoff.handoffText,/No immediate issue found/);
assert.match(quickHandoff.handoffText,/Production deployment: Healthy/);

const evalDetailsHtml=fs.readFileSync(require.resolve('../state-evals.html'),'utf8');
assert.match(evalDetailsHtml,/State eval details/);
assert.match(evalDetailsHtml,/23 controlled scenarios/);
assert.match(evalDetailsHtml,/Update understanding/);
assert.match(evalDetailsHtml,/Answer quality/);
assert.match(evalDetailsHtml,/Synthetic controlled scenarios/);
const runApiSource=fs.readFileSync(require.resolve('../api/project-health-run.js'),'utf8');
assert.match(runApiSource,/already running/);
assert.match(runApiSource,/RUN_COOLDOWN_MS/);
assert.doesNotMatch(runApiSource,/can only be started from the protected Project Health preview/);
const projectHealthSource=fs.readFileSync(require.resolve('../project-health.js'),'utf8');
assert.match(projectHealthSource,/View eval details/);
assert.match(projectHealthSource,/data-attention-action="ai-quality"/);
assert.match(projectHealthSource,/drawerCopyHandoffButton/);
assert.match(projectHealthSource,/Changed since last visit/);
assert.match(projectHealthSource,/Previous investigations/);
assert.match(projectHealthSource,/commits\?sha=/);
assert.match(projectHealthSource,/project\.releasePaths/);
assert.match(projectHealthSource,/View AI results/);
assert.match(projectHealthSource,/setActiveTab\('ai-quality'\)/);
assert.doesNotMatch(projectHealthSource,/ai-learning-git-staging-cairn10\.vercel\.app\/project-health/);
assert.doesNotMatch(projectHealthSource,/control:'investigate'/);
assert.match(projectHealthSource,/AI checks are running/);
assert.match(projectHealthSource,/Starting AI checks/);
assert.doesNotMatch(projectHealthSource,/control:'evals'/);
assert.match(projectHealthSource,/checks automatically/);
assert.match(projectHealthSource,/project-switcher-item/);
assert.match(projectHealthSource,/data-summary-filter/);
assert.match(projectHealthSource,/unreviewedIncidents/);
assert.doesNotMatch(projectHealthSource,/Recent check details/);
assert.match(projectHealthSource,/stateEvalBehaviorStale/);
assert.match(projectHealthSource,/activityTimelineItems/);
assert.match(projectHealthSource,/Deployment recovered.*×/);
assert.match(projectHealthSource,/No previous 30-day period to compare yet/);
assert.match(projectHealthSource,/Release pipeline/);
assert.match(projectHealthSource,/Data available/);
assert.match(projectHealthSource,/operationalNextDecision/);

const workflowText=fs.readFileSync(require.resolve('../.github/workflows/question-review-live.yml'),'utf8');
assert.match(workflowText,/suite:/);
assert.match(workflowText,/record_environment:/);
assert.match(workflowText,/run_quality_evals\.py/);

console.log('Project Health shell tests passed');
