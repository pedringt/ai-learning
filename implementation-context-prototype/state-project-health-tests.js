// Project Health combined-branch regression coverage.
const assert=require('assert');
const fs=require('fs');
const H=require('../project-health.js');
const RUN_API=require('../api/project-health-run.js')._test;

assert.deepStrictEqual(H.PROJECTS.map(p=>p.id),['state','tastemake','narc']);
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-git-staging-cairn10.vercel.app',search:''}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-b19hocddc-cairn10.vercel.app',search:''}}),'production');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.contextswitch.tech',search:'?env=staging'}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.authenticignorance.site'}}),'production');
const priorToken=process.env.GITHUB_TOKEN;
const priorCost=process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE;
process.env.GITHUB_TOKEN='test-token';
process.env.PROJECT_HEALTH_RUN_COST_ESTIMATE_STATE='<$0.25 per full run';
const publicRunInfo=RUN_API.runInfo('state');
assert.strictEqual(publicRunInfo.configured,true);
assert.strictEqual(publicRunInfo.can_run_here,false);
assert.match(publicRunInfo.protection,/Owner-only/);
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
assert.match(analyticsDeniedGaps.find(item=>item.label==='Site analytics').detail,/token/i);
assert.match(analyticsDeniedGaps.find(item=>item.label==='Runtime error visibility').detail,/token/i);
const partialRuntimeGaps=H.setupGaps({
  project:H.PROJECTS[0],
  platform:{analytics:{configured:true,available:true},neon:{configured:true,available:true},aiTelemetry:{configured:true,available:true}},
  activity:{available:true,runtime:{available:true,coverage:'partial',issues:[]}},
  pending:new Set(),
  runInfo:{configured:true}
});
assert.match(partialRuntimeGaps.find(item=>item.label==='Runtime error visibility').detail,/incomplete/i);
assert.strictEqual(
  H.neonConnectionDetail({configured:true,available:true,primary_branch:'production',primary_branch_state:'archived'}),
  'Neon · production · idle storage; resumes automatically'
);

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
const severeStateOpen=H.productOpenItems({project:H.PROJECTS[0],quality:severe,fresh:true,pending:new Set()});
assert.strictEqual(severeStateOpen[0].action,'review-ai-evals');
assert.match(severeStateOpen[0].nextAction,/Review the failed scenario evidence/);

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
assert.match(mediumInvestigation.report,/Current AI eval failures/);
assert.match(mediumInvestigation.report,/Overall AI eval status/);

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
assert.match(qualityInvestigation.report,/Investigation scope/);

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
assert.match(behaviorStaleInvestigation.report,/recorded failures are historical and should not be treated as current product failures/i);

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
assert.strictEqual((duplicateCheckReport.match(/ask_conflicting_evidence/g)||[]).length,1);
const targetedConflict=H.qualityInvestigation({project:H.PROJECTS[0],quality:duplicateCheckQuality},'ask_conflicting_evidence');
assert.match(targetedConflict.report,/ask_conflicting_evidence/);
assert.doesNotMatch(targetedConflict.report,/review_direct_reversal/);
const currentTwoFailureQuality=H.normalizeQuality({
  controlled_evals:{
    latest_review_interpretation:{
      suite:'review_interpretation',interpretation_accuracy:.923076923,high_severity_failures:1,total:13,created_at:'2026-09-30 20:00:00',
      failure_details:[{scenario_id:'review_new_evidence_over_pending_review',category:'supersedes_pending_review',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['review_needed','interpretation','processing']}]
    },
    latest_ask_quality:{
      suite:'ask_quality',overall_pass_rate:.9,ask_grounding:1,authority_accuracy:1,high_severity_failures:1,total:10,created_at:'2026-09-30 20:00:01',
      model_identifier:'claude-haiku-4-5-20251001',build:'765dfe4a03117acabf357604f6d7a924c9824750',
      failure_details:[{scenario_id:'ask_known_outcome_unknown_reason',category:'outcome_vs_reason',severity:'high',expected:'Grounded answer that preserves uncertainty, open items, and decision authority.',observed:'Failed checks: uncertainty',failed_checks:['uncertainty']}]
    },
    recent:[
      {suite:'ask_quality',overall_pass_rate:1,ask_grounding:1,authority_accuracy:1,high_severity_failures:0,total:10,created_at:'2026-09-30 19:00:00'}
    ]
  }
});
const targetedUnknownReason=H.qualityInvestigation({project:H.PROJECTS[0],quality:currentTwoFailureQuality},'ask_known_outcome_unknown_reason');
assert.match(targetedUnknownReason.report,/Investigation scope\nAnswer quality · ask_known_outcome_unknown_reason/);
assert.match(targetedUnknownReason.report,/reason for the pause was not established/i);
assert.match(targetedUnknownReason.report,/mistake an inferred explanation for maintained project truth/i);
assert.match(targetedUnknownReason.report,/Overall AI eval status/);
assert.match(targetedUnknownReason.report,/Answer quality: 90% · 1 high-impact failure/);
assert.doesNotMatch(targetedUnknownReason.report,/Current assessment/);
assert.strictEqual(targetedUnknownReason.nextCheckpoint,'After Answer quality is rerun.');
const targetedHandoff=H.projectHandoff({
  ...H.emptyProjectData(H.PROJECTS[0]),
  fresh:true,
  quality:currentTwoFailureQuality,
  delivery:{sha:'28f8caafc6025947f8bd45bae6f7e3ea09504dbd',message:'Compact Project Health cards',updatedAt:'2026-09-30T20:00:00Z',vercel:{kind:'good'}},
  investigation:targetedUnknownReason
});
assert.match(targetedHandoff.handoffText,/1 high-impact failure\nAnswer quality: 90% · 1 high-impact failure/);
assert.match(targetedHandoff.handoffText,/Next checkpoint\nAfter Answer quality is rerun/);
assert.doesNotMatch(targetedHandoff.handoffText,/Next decision/);
assert.doesNotMatch(targetedHandoff.handoffText,/28f8caa/);

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
const conflictDetail=H.qualityFailureClassSummary(H.normalizeQuality({controlled_evals:{
  latest_ask_quality:{high_severity_failures:1,failure_details:[{scenario_id:'ask_conflicting_evidence',category:'conflict',severity:'high',failed_checks:['uncertainty']}]}
}}));
assert.match(conflictDetail.details[0].title,/Conflicting evidence/);
assert.match(conflictDetail.details[0].why,/disputed project fact/i);
assert.strictEqual(H.failureCheckCount(H.normalizeQuality({controlled_evals:{
  latest_ask_quality:{high_severity_failures:1,failure_details:[{scenario_id:'ask_conflicting_evidence',severity:'high',failed_checks:['uncertainty']}]}
}}),'uncertainty'),1);
assert.strictEqual(H.externalQualityRunComplete({ci:{status:'completed',conclusion:'success',updated_at:'2026-09-30T18:00:00Z'}},{baselineUpdatedAt:'2026-09-30T17:00:00Z'}),true);
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
const groupedFailure=groupedTimeline.find(item=>item.title==='Deployment failure · 2 attempts');
assert.ok(groupedFailure);
assert.strictEqual(groupedFailure.category,'releases');
assert.strictEqual(groupedFailure.attempts.length,2);
assert.ok(groupedTimeline.some(item=>item.title==='Deployment recovered · 2 attempts'&&item.category==='releases'));
assert.strictEqual(groupedFailure.userImpact.status,'No confirmed impact');

const regressionData={
  ...H.emptyProjectData(H.PROJECTS[0]),
  fresh:true,
  quality:{
    ...healthy,
    recent:[
      {suite:'review_interpretation',overall_pass_rate:.8,created_at:'2026-09-30T20:00:00Z'},
      {suite:'review_interpretation',overall_pass_rate:1,created_at:'2026-09-30T19:00:00Z'},
      {suite:'ask_quality',overall_pass_rate:1,created_at:'2026-09-30T20:00:00Z'},
      {suite:'ask_quality',overall_pass_rate:1,created_at:'2026-09-30T19:00:00Z'}
    ]
  },
  delivery:{vercel:{kind:'good'}},
  activity:{available:true,deployments:{recent_failures:[]},runtime:{available:true,issues:[]}},
  platform:{analytics:{configured:true,available:true},neon:{configured:true,available:true},aiTelemetry:{configured:true,available:true}},
  runInfo:{configured:true}
};
const regression=H.regressionSignal(regressionData);
assert.strictEqual(regression.kind,'warn');
assert.match(regression.title,/regressed 20 points/);
const releaseRisk=H.releaseRiskChecklist(regressionData);
assert.ok(releaseRisk.some(item=>item.label==='Product quality'));
assert.ok(releaseRisk.some(item=>item.label==='Observability'&&item.status==='Healthy'));
assert.deepStrictEqual(H.healthConsistencyIssues(regressionData),[]);

const blindSpotRisk=H.releaseRiskChecklist({
  ...regressionData,
  platform:{analytics:{configured:false,available:false},neon:{configured:false,available:false},aiTelemetry:{configured:false,available:false}},
  activity:{available:true,deployments:{recent_failures:[]},runtime:{available:false,status:403,issues:[]}}
});
assert.ok(blindSpotRisk.some(item=>item.label==='Observability'&&item.status==='Watch'));

const annotatedTimeline=H.activityTimelineItems({
  project:{id:'state'},
  delivery:{updatedAt:'2026-09-30T20:00:00Z',message:'Ship decision support',sha:'abcdef1'},
  quality:null,
  externalQuality:null,
  activity:{available:false},
  openPullRequests:[],
  investigationHistory:[],
  productNotes:[{type:'decision',text:'Treat this as product behavior, not eval noise.',createdAt:'2026-09-30T19:00:00Z'}]
});
const decisionEvent=annotatedTimeline.find(item=>item.category==='decisions');
assert.ok(decisionEvent);
assert.match(decisionEvent.followup,/Next evidence: Production release/);
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
const usageChanges=H.meaningfulChanges({
  project:{quality:null},
  lastVisit:{deliverySha:'same',deliveryKind:'good',quality:{},analyticsAvailable:true,analyticsPageviews:10,openPullRequests:0,savedAt:'2026-09-29T01:00:00Z'},
  delivery:{sha:'same',vercel:{kind:'good'}},
  platform:{analytics:{available:true,pageviews:12}},
  openPullRequests:[],
  checkedAt:'2026-09-30T01:00:00Z',
  detailCheckedAt:'2026-09-30T01:00:00Z'
});
assert.strictEqual(usageChanges.find(item=>item.title==='Site analytics changed').section,undefined);
const analyticsAvailabilityChanges=H.meaningfulChanges({
  project:{quality:null},
  lastVisit:{deliverySha:'same',deliveryKind:'good',quality:{},analyticsAvailable:false,analyticsPageviews:null,openPullRequests:0,savedAt:'2026-09-29T01:00:00Z'},
  delivery:{sha:'same',vercel:{kind:'good'}},
  platform:{analytics:{available:true,pageviews:12}},
  openPullRequests:[],
  checkedAt:'2026-09-30T01:00:00Z',
  detailCheckedAt:'2026-09-30T01:00:00Z'
});
assert.strictEqual(analyticsAvailabilityChanges.find(item=>item.title==='Site analytics availability changed').section,'systemsDetails');
const releaseAndDeliveryChanges=H.meaningfulChanges({
  project:{quality:null},
  lastVisit:{deliverySha:'oldsha',deliveryKind:'bad',quality:{},analyticsAvailable:null,analyticsPageviews:null,openPullRequests:0,savedAt:'2026-09-29T01:00:00Z'},
  delivery:{sha:'20d0bd7abcdef',message:'Promote Project Health action destination cleanup',vercel:{kind:'good'},updatedAt:'2026-09-30T01:00:00Z'},
  platform:{},
  openPullRequests:[],
  checkedAt:'2026-09-30T01:00:00Z'
});
assert.strictEqual(releaseAndDeliveryChanges.find(item=>item.title==='New production release').detail,'Promote Project Health action destination cleanup');
assert.strictEqual(releaseAndDeliveryChanges.find(item=>item.title==='Delivery status improved').detail,'Needs attention → Healthy');
assert.doesNotMatch(releaseAndDeliveryChanges.find(item=>item.title==='New production release').detail,/20d0bd7/);
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
const previewOnlyDelivery={
  project:{id:'state',name:'State'},
  delivery:{vercel:{kind:'bad'},failedChecks:[]},
  activity:{available:true,deployments:{recent_failures:[]},runtime:{issues:[]}}
};
assert.strictEqual(H.deliveryAttentionForData(previewOnlyDelivery).kind,'good');
assert.match(H.deliveryAttentionForData(previewOnlyDelivery).title,/No active production release failure/);

const safeQuality=H.safeExternalQualitySnapshot({
  project:'tastemake',
  endpoint:{rule_checks:{passed:2,total:2},grounding_findings:[{detail:'private-ish detail'}],failing_fixtures:['x']}
});
assert.strictEqual(safeQuality.endpoint.rule_checks.passed,2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'grounding_findings'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'failing_fixtures'),false);


const renderConfig=fs.readFileSync(require.resolve('../render.yaml'),'utf8');
assert.match(renderConfig,/https:\/\/www\.contextswitch\.tech/);
assert.match(renderConfig,/https:\/\/state\.contextswitch\.tech/);
const stateVercelConfig=JSON.parse(fs.readFileSync(require.resolve('./vercel.json'),'utf8'));
assert.doesNotMatch(stateVercelConfig.ignoreCommand,/VERCEL_GIT_PREVIOUS_SHA/);
assert.match(stateVercelConfig.ignoreCommand,/git diff --quiet HEAD\^ HEAD -- \./);

const healthHtml=fs.readFileSync(require.resolve('../project-health.html'),'utf8');
assert.doesNotMatch(healthHtml,/Product health triage/);
assert.match(healthHtml,/Spot problems, understand what they mean for users/);
assert.match(healthHtml,/How Project Health works/);
assert.match(healthHtml,/Role &amp; attribution/);
assert.match(healthHtml,/id="projectCheckButton"/);
assert.match(healthHtml,/id="drawerCopyHandoffButton"/);
assert.match(healthHtml,/id="changesPanel"/);
assert.match(healthHtml,/id="investigationDrawer"[^>]*hidden/);
assert.match(healthHtml,/investigation-drawer\[hidden\].*display:none!important/);
assert.match(healthHtml,/drawer-copy\[hidden\].*display:none!important/);
assert.match(healthHtml,/id="projectActionMenu"/);
assert.match(healthHtml,/aria-label="More project options"/);
assert.match(healthHtml,/<dialog class="info-dialog" id="systemsDetails"/);
assert.match(healthHtml,/Systems &amp; connections/);
assert.match(healthHtml,/<dialog class="info-dialog" id="aboutProjectHealth"/);
assert.match(healthHtml,/About Project Health/);
assert.doesNotMatch(healthHtml,/<details class="about-dashboard">/);
assert.doesNotMatch(healthHtml,/<details class="systems-details"/);
assert.match(healthHtml,/data-tab="overview"/);
assert.match(healthHtml,/data-tab="ai-quality"/);
assert.match(healthHtml,/data-tab="releases"/);
assert.match(healthHtml,/data-tab="decision-support"/);
assert.doesNotMatch(healthHtml,/data-tab="usage"/);
assert.doesNotMatch(healthHtml,/data-tab="investigation"/);
assert.doesNotMatch(healthHtml,/data-tab="technical"/);
assert.doesNotMatch(healthHtml,/data-tab="activity"/);
assert.match(healthHtml,/id="deliveryPanel" data-tab-panel="releases"/);
assert.match(healthHtml,/id="mockDashboardOverview" data-tab-panel="overview"/);
assert.match(healthHtml,/id="productFocusPanel" data-tab-panel="decision-support"/);
assert.match(healthHtml,/id="decisionSupportPanel" data-tab-panel="decision-support"/);
assert.match(healthHtml,/id="analyticsPanel" hidden/);
assert.match(healthHtml,/id="overviewInvestigationPanel" hidden/);
assert.match(healthHtml,/id="overviewActivityPanel" hidden/);
assert.match(healthHtml,/id="attentionPanel" hidden/);
assert.match(healthHtml,/id="overviewHealthPanel" hidden/);
assert.match(healthHtml,/id="overviewQualitySummaryPanel" hidden/);
assert.match(healthHtml,/id="infrastructurePanel"/);
assert.doesNotMatch(healthHtml,/id="infrastructurePanel" data-tab-panel="overview"/);
assert.match(healthHtml,/id="projectLinksMenu"/);
assert.match(healthHtml,/\.button\[hidden\]\{display:none!important\}/);
assert.doesNotMatch(healthHtml,/>More<\/summary>/);
assert.match(healthHtml,/delivery-split/);
assert.match(healthHtml,/activity-type/);
assert.match(healthHtml,/id="decisionSupportPanel"/);
assert.match(healthHtml,/id="productNoteDialog"/);
assert.match(healthHtml,/Record a decision or change/);
assert.match(healthHtml,/:focus-visible/);
assert.match(healthHtml,/prefers-reduced-motion:reduce/);
assert.match(healthHtml,/incident-episode/);
assert.doesNotMatch(healthHtml,/id="prepareHandoffButton"/);
assert.match(healthHtml,/productFocusPanel/);
assert.doesNotMatch(healthHtml,/See a bounded investigation/);
assert.doesNotMatch(healthHtml,/id="investigationDemo"/);
assert.match(H.PROJECTS[0].focus,/without giving AI authority/);
assert.ok(H.PROJECTS[1].evidence.includes('Recommendation breadth'));
assert.match(H.PROJECTS[1].nextDecision,/canonical store/);
assert.match(H.PROJECTS[2].nextDecision,/first-play flow/);
assert.match(H.PROJECTS[0].description,/Human-reviewed project truth system/);
assert.strictEqual(H.PROJECTS[0].qualityLabel,'AI Evals');
assert.strictEqual(H.PROJECTS[1].qualityLabel,'Recommendation Quality');
assert.strictEqual(H.PROJECTS[2].qualityLabel,'Game Quality');
assert.match(H.PROJECTS[0].links.vercel,/vercel\.com/);
assert.match(H.PROJECTS[0].links.renderProduction,/dashboard\.render\.com/);
assert.match(H.PROJECTS[0].links.neon,/neon\.tech/);
assert.deepStrictEqual(H.PROJECTS[0].releasePaths,['implementation-context-prototype','state-project-complete']);
assert.ok(H.PROJECTS[0].releaseIgnore.test('Project Health dashboard update'));
assert.ok(H.PROJECTS[0].releaseIgnore.test('Align prompt assertions after final compaction'));
assert.ok(H.PROJECTS[0].evalBehaviorPaths.includes('state-project-complete/question_review_prompt.py'));
assert.strictEqual(H.infrastructureAttention({render:{configured:true,environments:{production:{ok:true}}}}),null);

const unopenedState={...H.emptyProjectData(H.PROJECTS[0]),fresh:true,quality:H.normalizeQuality({controlled_evals:{latest_review_interpretation:null,latest_ask_quality:null}})};
assert.strictEqual(H.productOpenItems(unopenedState).length,1);
assert.strictEqual(H.projectStatus(unopenedState).label,'Watch');
assert.strictEqual(H.releaseReadiness({...unopenedState,delivery:{vercel:{kind:'good'}}}).label,'Watch');
const healthyRelease=H.releaseReadiness({...unopenedState,quality:H.normalizeQuality({controlled_evals:{latest_review_interpretation:{overall_pass_rate:1,high_severity_failures:0,total:1},latest_ask_quality:{overall_pass_rate:1,high_severity_failures:0,total:1}}}),delivery:{vercel:{kind:'good'}}});
assert.strictEqual(healthyRelease.label,'Healthy');
assert.strictEqual(healthyRelease.kind,'good');
const blockedRelease=H.releaseReadiness({...unopenedState,activity:{available:true,deployments:{recent_failures:[{id:'release-fail',created_at:'2026-09-30T18:00:00Z',recovered:false,message:'failed'}]},runtime:{issues:[]}},delivery:{vercel:{kind:'bad'}}});
assert.strictEqual(blockedRelease.label,'Needs attention');
assert.strictEqual(blockedRelease.kind,'bad');
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
assert.match(handoff.handoffText,/No immediate product decision|Rerun the AI evals|Review the quality miss|Review the high-impact failure class/);
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
assert.match(evalDetailsHtml,/Failed scenarios/);
assert.match(evalDetailsHtml,/Run AI evals/);
assert.match(evalDetailsHtml,/Investigate this failure/);
const runApiSource=fs.readFileSync(require.resolve('../api/project-health-run.js'),'utf8');
assert.match(runApiSource,/already running/);
assert.match(runApiSource,/RUN_COOLDOWN_MS/);
assert.doesNotMatch(runApiSource,/can only be started from the protected Project Health preview/);
const projectHealthSource=fs.readFileSync(require.resolve('../project-health.js'),'utf8');
assert.match(projectHealthSource,/View full scenario catalog/);
assert.match(projectHealthSource,/data-attention-action="review-quality"/);
assert.match(projectHealthSource,/drawerCopyHandoffButton/);
assert.match(projectHealthSource,/Changed since last visit/);
assert.match(projectHealthSource,/Previous investigations/);
assert.match(projectHealthSource,/commits\?sha=/);
assert.match(projectHealthSource,/project\.releasePaths/);
assert.doesNotMatch(projectHealthSource,/View AI eval results/);
assert.match(projectHealthSource,/headerRunChecksButton\.hidden=!activeEvalRun/);
assert.match(projectHealthSource,/setActiveTab\('ai-quality'\)/);
assert.doesNotMatch(projectHealthSource,/ai-learning-git-staging-cairn10\.vercel\.app\/project-health/);
assert.doesNotMatch(projectHealthSource,/control:'investigate'/);
assert.match(projectHealthSource,/AI evals are running/);
assert.match(projectHealthSource,/Run a specific eval suite/);
assert.match(projectHealthSource,/Update understanding<\/strong><span>How State interprets new evidence/);
assert.match(projectHealthSource,/suite-action-run">Run →/);
assert.match(projectHealthSource,/deliveryAttentionForData\(data\)/);
assert.match(projectHealthSource,/on-demand-panel/);
assert.doesNotMatch(projectHealthSource,/Check update understanding/);
assert.doesNotMatch(projectHealthSource,/Check answer quality/);
assert.match(projectHealthSource,/Starting checks/);
assert.doesNotMatch(projectHealthSource,/control:'evals'/);
assert.match(projectHealthSource,/checks automatically/);
assert.match(projectHealthSource,/project-switcher-item/);
assert.match(projectHealthSource,/data-summary-filter/);
assert.match(projectHealthSource,/unreviewedIncidents/);
assert.doesNotMatch(projectHealthSource,/Recent check details/);
assert.match(projectHealthSource,/stateEvalBehaviorStale/);
assert.match(projectHealthSource,/activityTimelineItems/);
assert.match(projectHealthSource,/Deployment failure · '.+attempts/);
assert.match(projectHealthSource,/activityDayLabel/);
assert.match(projectHealthSource,/data-activity-filter/);
assert.match(projectHealthSource,/aria-pressed/);
assert.match(projectHealthSource,/aria-busy="true"/);
assert.match(projectHealthSource,/Show '.+attempts/);
assert.match(projectHealthSource,/No previous 30-day period to compare yet/);
assert.match(projectHealthSource,/Release pipeline/);
assert.doesNotMatch(projectHealthSource,/Attention needed/);
assert.match(projectHealthSource,/Needs attention/);
assert.match(projectHealthSource,/label:'Site analytics'/);
assert.match(projectHealthSource,/Site analytics changed/);
assert.match(projectHealthSource,/health-card-head/);
assert.match(projectHealthSource,/showFreshness=item\.fresh\?\.stale/);
assert.doesNotMatch(projectHealthSource,/health-chevron/);
assert.match(projectHealthSource,/Data available/);
assert.match(projectHealthSource,/System health/);
assert.match(projectHealthSource,/stateScenarioCard/);
assert.match(projectHealthSource,/scenarios passed/);
assert.match(projectHealthSource,/Open analytics ↗/);
assert.match(projectHealthSource,/data-open-about/);
assert.match(projectHealthSource,/operationalNextDecision/);
assert.match(projectHealthSource,/releaseRiskChecklist/);
assert.match(projectHealthSource,/regressionSignal/);
assert.match(projectHealthSource,/healthConsistencyIssues/);
assert.match(projectHealthSource,/Decision support/);
assert.match(projectHealthSource,/What we cannot confirm/);
assert.match(projectHealthSource,/Decision & change log/);
assert.match(projectHealthSource,/data-add-product-note/);
assert.match(projectHealthSource,/project-health-product-notes/);
assert.match(projectHealthSource,/Next evidence:/);
assert.match(projectHealthSource,/User impact:/);
assert.match(projectHealthSource,/Full AI eval details/);
assert.doesNotMatch(projectHealthSource,/Investigate this issue →/);
assert.match(projectHealthSource,/Review AI evals →/);
assert.match(projectHealthSource,/projectCheckButton\.textContent=data\.investigation\?\.loading\?'Investigating…':'Investigate'/);
assert.match(projectHealthSource,/projectCheckButton\.classList\.add\('primary'\)/);
assert.match(projectHealthSource,/PROJECTS\.length<=3/);
assert.doesNotMatch(projectHealthSource,/AI evals running…':'Run all AI evals/);
assert.doesNotMatch(projectHealthSource,/changes-zero[^>]*data-tab-target/);

const recurring=H.recurringFailureSignal({
  project:{quality:'state'},
  quality:{recent:[
    {suite:'ask_quality',failure_details:[{scenario_id:'ask_conflicting_evidence'}]},
    {suite:'ask_quality',failure_details:[{scenario_id:'ask_conflicting_evidence'}]}
  ]}
});
assert.strictEqual(recurring.kind,'warn');
assert.match(recurring.detail,/2 recent runs/);

const operational=H.operationalSignals({
  project:{id:'state',quality:'state'},
  quality:{resolvedReviews:4,materialEditRate:.25,recent:[]},
  platform:{aiTelemetry:{available:true,response_speed:{sample_size:12,p95_ms:2400}}}
});
assert.ok(operational.some(item=>item.label==='AI response speed'&&item.status==='Measured'));
assert.ok(operational.some(item=>item.label==='Human review burden'&&/25% materially edited/.test(item.detail)));
assert.ok(!operational.some(item=>item.label==='Agent workflow'));
assert.ok(H.setupGaps({project:{id:'state'},platform:{aiTelemetry:{available:true,cost:{partial:false}}},runInfo:{configured:true}}).some(item=>item.label==='Agent workflow telemetry'));

const operationalCompared=H.operationalSignals({
  project:{id:'state',quality:'state'},
  quality:{resolvedReviews:1,materialEditRate:0,recent:[]},
  platform:{aiTelemetry:{available:true,response_speed:{sample_size:10,p95_ms:8200}}},
  previousPlatform:{aiTelemetry:{available:true,response_speed:{sample_size:8,p95_ms:5700}}},
  investigationHistory:[{observedAt:new Date(Date.now()-2*24*60*60*1000).toISOString(),trigger:'AI eval failure · ask_conflicting_evidence',needsAttentionAtRun:true,resolvedAt:null}]
});
const speedChanged=operationalCompared.find(item=>item.label==='AI response speed');
assert.strictEqual(speedChanged.status,'Changed');
assert.match(speedChanged.detail,/last saved 5\.7 s/);
assert.match(speedChanged.detail,/2\.5 s slower/);
const openInvestigation=operationalCompared.find(item=>item.label==='Open investigation');
assert.strictEqual(openInvestigation.status,'Open');
assert.match(openInvestigation.detail,/no resolution recorded yet/);

const seeded=H.emptyProjectData(H.PROJECTS[0],{platform:{aiTelemetry:{available:true,response_speed:{p95_ms:5700}}}});
assert.strictEqual(seeded.previousPlatform.aiTelemetry.response_speed.p95_ms,5700);

const regressionWithBuilds=H.regressionSignal({
  project:{quality:'state'},
  quality:{recent:[
    {suite:'ask_quality',created_at:'2026-10-01T12:00:00Z',overall_pass_rate:.8,build:'abcdef123456'},
    {suite:'ask_quality',created_at:'2026-09-30T12:00:00Z',overall_pass_rate:1,build:'123456abcdef'}
  ]}
});
assert.strictEqual(regressionWithBuilds.kind,'warn');
assert.match(regressionWithBuilds.detail,/123456a → abcdef1/);

const operationalContext=H.operationalSignals({
  project:{id:'state',quality:'state'},
  quality:{
    resolvedReviews:0,
    review:{errors:1},
    ask:{errors:0},
    recent:[
      {suite:'review_interpretation',created_at:'2026-10-01T12:00:00Z',model_identifier:'claude-haiku-4-5-20251001'},
      {suite:'review_interpretation',created_at:'2026-09-30T12:00:00Z',model_identifier:'older-model'}
    ]
  },
  platform:{aiTelemetry:{available:true,response_speed:{sample_size:0}}}
});
assert.ok(operationalContext.some(item=>item.label==='Eval execution'&&item.status==='Watch'));
assert.ok(operationalContext.some(item=>item.label==='Eval context changed'&&item.status==='Context'));
assert.ok(!operationalContext.some(item=>item.label==='Human review burden'));
assert.ok(!operationalContext.some(item=>item.label==='AI response speed'));

const operationalDeployments=H.operationalSignals({
  project:{id:'tastemake',quality:'external'},
  activity:{lookback_days:7,deployments:{recent_failures:[
    {recovered:true},{recovered:true},{recovered:false}
  ]}},
  platform:{aiTelemetry:{available:true,response_speed:{sample_size:2,p95_ms:1200}}}
});
const deploymentPattern=operationalDeployments.find(item=>item.label==='Release attempts');
assert.strictEqual(deploymentPattern.status,'Pattern');
assert.match(deploymentPattern.detail,/3 failed production-target deployment attempts/);
assert.match(deploymentPattern.detail,/2 later recovered/);

const evalCoverageGaps=H.setupGaps({
  project:{id:'state'},
  delivery:{sha:'abcdef1234567890'},
  quality:{review:{build:'1234567abcdef'},ask:{build:'1234567abcdef'}},
  platform:{aiTelemetry:{available:true,cost:{partial:false},workflow:{available:true}},neon:{available:true}},
  runInfo:{configured:true}
});
assert.ok(evalCoverageGaps.some(item=>item.label==='Current release eval coverage'));

const splitEvalBuildGaps=H.setupGaps({
  project:{id:'state'},
  delivery:{sha:'abcdef1234567890'},
  quality:{review:{build:'1234567abcdef'},ask:{build:'7654321abcdef'}},
  platform:{aiTelemetry:{available:true,cost:{partial:false},workflow:{available:true}},neon:{available:true}},
  runInfo:{configured:true}
});
assert.ok(splitEvalBuildGaps.some(item=>item.label==='Eval build alignment'));

const evalContextDetails=H.operationalSignals({
  project:{id:'state',quality:'state'},
  quality:{recent:[
    {suite:'ask_quality',created_at:'2026-10-01T12:00:00Z',provider:'anthropic',model_identifier:'new-model',total:12},
    {suite:'ask_quality',created_at:'2026-09-30T12:00:00Z',provider:'openai',model_identifier:'old-model',total:10}
  ]},
  platform:{aiTelemetry:{available:true,response_speed:{sample_size:0}}}
}).find(item=>item.label==='Eval context changed');
assert.match(evalContextDetails.detail,/provider: openai → anthropic/);
assert.match(evalContextDetails.detail,/scenarios: 10 → 12/);

const workflowText=fs.readFileSync(require.resolve('../.github/workflows/question-review-live.yml'),'utf8');
assert.match(workflowText,/suite:/);
assert.match(workflowText,/record_environment:/);
assert.match(workflowText,/run_quality_evals\.py/);

console.log('Project Health shell tests passed');

// PR readiness refresh: evidence-first Project Health actions.
