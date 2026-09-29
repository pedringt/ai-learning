// Project Health combined-branch regression coverage.
const assert=require('assert');
const fs=require('fs');
const H=require('../project-health.js');

assert.deepStrictEqual(H.PROJECTS.map(p=>p.id),['state','tastemake','narc']);
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-git-staging-cairn10.vercel.app'}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.authenticignorance.site'}}),'production');
const protectedUrl=new URL(H.protectedControlsUrl({project:{id:'state'}},{control:'evals',suite:'all'}));
assert.strictEqual(protectedUrl.hostname,'ai-learning-git-staging-cairn10.vercel.app');
assert.strictEqual(protectedUrl.searchParams.get('project'),'state');
assert.strictEqual(protectedUrl.searchParams.get('control'),'evals');
assert.strictEqual(protectedUrl.searchParams.get('suite'),'all');
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

assert.strictEqual(H.changedSinceVisit({lastSeenSha:'old',delivery:{sha:'new'}}),true);
assert.strictEqual(H.changedSinceVisit({lastSeenSha:'same',delivery:{sha:'same'}}),false);
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
assert.match(healthHtml,/productFocusPanel/);
assert.doesNotMatch(healthHtml,/See a bounded investigation/);
assert.doesNotMatch(healthHtml,/id="investigationDemo"/);
assert.match(H.PROJECTS[0].focus,/without giving AI authority/);
assert.ok(H.PROJECTS[1].evidence.includes('Recommendation breadth'));
assert.match(H.PROJECTS[1].nextDecision,/canonical store/);
assert.match(H.PROJECTS[2].nextDecision,/first-play flow/);
assert.match(H.PROJECTS[0].description,/Human-reviewed project truth system/);
assert.strictEqual(H.infrastructureAttention({render:{configured:true,environments:{production:{ok:true}}}}),null);

const unopenedState={...H.emptyProjectData(H.PROJECTS[0]),fresh:true,quality:H.normalizeQuality({controlled_evals:{latest_review_interpretation:null,latest_ask_quality:null}})};
assert.strictEqual(H.productOpenItems(unopenedState).length,1);
assert.strictEqual(H.projectStatus(unopenedState).label,'Watch');
assert.strictEqual(H.releaseReadiness({...unopenedState,delivery:{vercel:{kind:'good'}}}).label,'Watch');
assert.ok(H.setupGaps({...unopenedState,platform:{analytics:{configured:false,available:false},neon:{configured:false,available:false}},runInfo:{configured:false}}).some(item=>item.label==='AI cost'));
const stateWithAi={...unopenedState,platform:{analytics:{configured:true,available:true},neon:{configured:true,available:true},aiTelemetry:{configured:true,available:true,cost:{partial:true}}},runInfo:{configured:true}};
assert.ok(!H.setupGaps(stateWithAi).some(item=>item.label==='AI response speed'));
assert.ok(H.setupGaps(stateWithAi).some(item=>item.label==='AI cost coverage'));
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

const evalDetailsHtml=fs.readFileSync(require.resolve('../state-evals.html'),'utf8');
assert.match(evalDetailsHtml,/State eval details/);
assert.match(evalDetailsHtml,/16 controlled scenarios/);
assert.match(evalDetailsHtml,/Update understanding/);
assert.match(evalDetailsHtml,/Answer quality/);
assert.match(evalDetailsHtml,/Synthetic controlled scenarios/);
assert.match(fs.readFileSync(require.resolve('../project-health.js'),'utf8'),/View eval details/);

const workflowText=fs.readFileSync(require.resolve('../.github/workflows/question-review-live.yml'),'utf8');
assert.match(workflowText,/suite:/);
assert.match(workflowText,/record_environment:/);
assert.match(workflowText,/run_quality_evals\.py/);

console.log('Project Health shell tests passed');
