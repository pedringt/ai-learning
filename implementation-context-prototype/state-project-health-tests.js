const assert=require('assert');
const H=require('../project-health.js');

assert.deepStrictEqual(H.PROJECTS.map(p=>p.id),['state','tastemake','narc']);
assert.strictEqual(H.pageEnvironment({location:{hostname:'ai-learning-git-staging-cairn10.vercel.app'}}),'staging');
assert.strictEqual(H.pageEnvironment({location:{hostname:'www.authenticignorance.site'}}),'production');

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
  H.infrastructureAttention({render:{configured:true,environments:{production:{ok:true},staging:{ok:false}}}}).kind,
  'warn'
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
  'QA + eval rules healthy'
);

const narcQuality={
  project:'narc',
  recorded:{recorded_all_suites_green:true,full_playtest_pending:true},
  attention:[{kind:'warn',title:'Full first-run playtest still pending',detail:'pending'}]
};
assert.strictEqual(
  H.projectQualityLabel({project:{id:'narc'},externalQuality:narcQuality}),
  'Tests green · playtest pending'
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
assert.match(quiet[0].title,/Nothing urgent/);

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

const pendingOnly=H.emptyProjectData(H.PROJECTS[0]);
pendingOnly.pending.add('Delivery');
assert.strictEqual(H.overallAttention(pendingOnly).kind,'unknown');

const mergedPlatform=H.mergePlatform(
  {render:{configured:true,environments:{production:{ok:true}}}},
  {render:{configured:true,environments:{staging:{ok:false}}}}
);
assert.strictEqual(mergedPlatform.render.environments.production.ok,true);
assert.strictEqual(mergedPlatform.render.environments.staging.ok,false);

const serialized=H.serializeProjectData({
  ...blank,
  delivery:{sha:'abc123'},
  pending:new Set(['Delivery'])
});
assert.strictEqual(serialized.projectId,'state');
assert.strictEqual(serialized.delivery.sha,'abc123');
assert.strictEqual(Object.prototype.hasOwnProperty.call(serialized,'pending'),false);

const safeQuality=H.safeExternalQualitySnapshot({
  project:'tastemake',
  endpoint:{rule_checks:{passed:2,total:2},grounding_findings:[{detail:'private-ish detail'}],failing_fixtures:['x']}
});
assert.strictEqual(safeQuality.endpoint.rule_checks.passed,2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'grounding_findings'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(safeQuality.endpoint,'failing_fixtures'),false);

console.log('Project Health shell tests passed');