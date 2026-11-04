// Nov 3 staging review: after a 504, Project Health showed "Couldn't load" beside "AI evals have not been recorded yet"
// and recommended reviewing a "quality miss". Unavailable evidence is not a finding: a failed Quality refresh with no
// previously loaded runs describes the unavailable check, a saved empty response is history only, and "quality miss"
// appears only when a scenario actually failed.
const assert=require('assert');
const M=require('../project-health-model.js');

let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

const STATE=M.PROJECTS.find(project=>project.id==='state');
const FETCHED='2026-11-03T18:00:00.000Z';
const failed504=[{label:'Quality',reason:'HTTP 504',status:504}];
const empty={resolvedReviews:0,review:null,ask:null,recent:[]};
const IDS=Array.from({length:16},(_,i)=>'review_'+i);
const passingReview={suite:'review_interpretation',total:16,scenario_ids:IDS,high_severity_failures:0,interpretation_accuracy:1,failure_details:[],created_at:'2026-11-02 22:50:28'};
const missedReview={...passingReview,interpretation_accuracy:0.9375,failure_details:[{scenario_id:'review_0',severity:'medium',failed_checks:['interpretation']}]};
function data(overrides){return {...M.emptyProjectData(STATE),...overrides};}
const MISS='Review the quality miss and decide whether it represents product behavior or eval noise.';
const RESTORE='Restore the missing checks before assessing project health.';

check('successful empty response: "not recorded yet" stays, and the next step is to run the evals, not review a miss',()=>{
  const d=data({quality:empty,qualityCheckedAt:FETCHED});
  assert.strictEqual(M.qualityAttention(d.quality,d).title,'AI evals have not been recorded yet');
  assert.strictEqual(M.operationalNextDecision(d),'Run the controlled AI evals to get a quality result.');
  assert.strictEqual(M.qualityProvenance(d).status,'none');
});

check('first-load failure: the check is unavailable, with no conclusion about recorded, passed or failed evals',()=>{
  const d=data({quality:undefined,failures:failed504});
  const q=M.qualityAttention(d.quality,d);
  assert.strictEqual(q.title,'AI eval results couldn’t be loaded');
  assert.strictEqual(q.kind,'unknown');
  assert.match(q.detail,/can’t say whether evals have been recorded, passed or failed/);
  assert.strictEqual(M.operationalNextDecision(d),RESTORE);
  const provenance=M.qualityProvenance(d);
  assert.strictEqual(provenance.status,'unavailable');
  assert.doesNotMatch(provenance.detail,/last successful fetch/);
  assert.deepStrictEqual(M.productOpenItems({...d,fresh:true}),[],'an unavailable check is not an open quality item');
});

check('saved empty response, then a failed refresh: the empty result is history only and drives no assessment',()=>{
  const d=data({quality:empty,qualityCheckedAt:FETCHED,failures:failed504});
  const q=M.qualityAttention(d.quality,d);
  assert.strictEqual(q.title,'AI eval results couldn’t be loaded');
  assert.doesNotMatch(q.title+' '+q.detail,/not been recorded/);
  assert.strictEqual(M.operationalNextDecision(d),RESTORE);
  assert.notStrictEqual(M.operationalNextDecision(d),MISS);
  assert.strictEqual(M.projectQualityLabel(d),'AI eval results couldn’t be loaded');
  const provenance=M.qualityProvenance(d);
  assert.strictEqual(provenance.status,'unavailable');
  assert.match(provenance.detail,/The last successful fetch, at .+, had no recorded runs; that may have changed since\./);
});

check('saved results, then a failed refresh: the results stay assessed, marked as previously loaded with the fetch time',()=>{
  const d=data({quality:{...empty,review:passingReview},qualityCheckedAt:FETCHED,failures:failed504});
  assert.notStrictEqual(M.qualityAttention(d.quality,d).title,'AI eval results couldn’t be loaded');
  const provenance=M.qualityProvenance(d);
  assert.strictEqual(provenance.status,'stale');
  assert.match(provenance.detail,/showing previously loaded data, recorded .+ · last fetched at /);
  const notice=M.retainedNotice(d,['Quality'],{hasData:true,loadedAt:d.qualityCheckedAt});
  assert.match(notice.text,/^Couldn’t refresh · showing previously loaded data · last fetched at /);
});

check('"quality miss" appears only when a scenario actually failed',()=>{
  const missed=data({quality:{...empty,review:missedReview,ask:null},qualityCheckedAt:FETCHED});
  assert.strictEqual(M.qualityAttention(missed.quality,missed).scenarioMiss,true);
  assert.strictEqual(M.operationalNextDecision(missed),MISS);
  const unmeasured=data({quality:{...empty,review:passingReview},qualityCheckedAt:FETCHED});
  assert.notStrictEqual(M.operationalNextDecision(unmeasured),MISS,'unmeasured signals are not a miss');
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
