// Project Health signal coverage (QA, Oct 10): a signal that failed to load must never roll up into "Healthy",
// and the page's GitHub reads go through one server-side function per project instead of api.github.com.
const assert=require('assert');
const M=require('../project-health-model.js');
const H=require('../project-health.js');
const GITHUB_API=require('../api/project-health-github.js');
const G=GITHUB_API._test;

const project=id=>M.PROJECTS.find(p=>p.id===id);
// No live project lacks a quality source since Authority Lab's tests were connected (Oct 17); a copy with the
// flag set keeps the "quality not measured" path covered.
const noQualityProject={...project('authority-lab'),noQualitySource:true};
const goodDelivery={branch:'main',sha:'abcdef1234567',vercel:{kind:'good',label:'Vercel deploy healthy'},failedChecks:[],updatedAt:'2026-10-10T00:00:00Z',message:'Ship'};
const healthyStateQuality={
  review:{interpretation_accuracy:1,high_severity_failures:0,failed_cases:0,created_at:'2026-10-09T00:00:00Z'},
  ask:{ask_grounding:1,authority_accuracy:1,uncertainty_accuracy:1,high_severity_failures:0,failed_cases:0,created_at:'2026-10-09T00:00:00Z'},
  recent:[],behaviorUpdatedAt:'2026-10-01T00:00:00Z'
};
function loaded(p,overrides={}){
  return {...M.emptyProjectData(p),delivery:goodDelivery,fresh:true,checkedAt:'2026-10-10T00:00:00Z',...overrides};
}

// --- failureReason: the user-facing reason names what went wrong.
assert.strictEqual(M.failureReason({name:'AbortError',message:'This operation was aborted'}),'request timed out');
assert.strictEqual(M.failureReason({message:'signal is aborted without reason'}),'request timed out');
assert.strictEqual(M.failureReason({status:404,message:'not found'}),'not found');
assert.strictEqual(M.failureReason({status:403}),'rate limited or denied');
assert.strictEqual(M.failureReason({status:504}),'server error 504');
assert.strictEqual(M.failureReason(new Error('boom')),'request failed');

// --- makeRunner records a structured failure next to the legacy error string.
(async()=>{
  const data=M.emptyProjectData(project('state'));
  const run=M.makeRunner(data);
  const abort=new Error('This operation was aborted');abort.name='AbortError';
  await run('Quality',Promise.reject(abort),()=>{});
  assert.deepStrictEqual(data.failures,[{label:'Quality',reason:'request timed out',status:null}]);
  assert.strictEqual(data.errors.length,1);
  assert.strictEqual(data.pending.size,0);
})().catch(error=>{console.error(error);process.exit(1);});

// --- Baselines: everything loaded and fine is Healthy; a signal absent by design is fine too.
const stateHealthy=loaded(project('state'),{quality:healthyStateQuality,qualityBehaviorUpdatedAt:'2026-10-01T00:00:00Z'});
assert.strictEqual(M.overallAttention(stateHealthy).kind,'good');
assert.strictEqual(M.projectStatus(stateHealthy).label,'Healthy');
const authorityByDesign=loaded(noQualityProject,{externalQuality:null});
assert.deepStrictEqual(M.uncheckedSignals(authorityByDesign),[]);
assert.ok(!project('authority-lab').noQualitySource&&project('authority-lab').noRunWorkflow);

// --- Cowork, Oct 11: a quality source missing by design is not a failure, but it is not hidden either.
// Delivery/runtime can be fine; the project never gets the plain "Healthy" headline, pill, or banner copy.
const authorityStatus=M.projectStatus(authorityByDesign);
assert.deepStrictEqual(authorityStatus,{key:'partial',label:'Healthy · quality not measured',shortLabel:'Not measured',kind:'good'});
assert.notStrictEqual(authorityStatus.label,'Healthy');
assert.ok(!['action','watch','incomplete'].includes(authorityStatus.key),'not counted in the attention, watch, or incomplete summary chips');
const authorityOverall=M.overallAttention(authorityByDesign);
assert.strictEqual(authorityOverall.kind,'good');
assert.ok(authorityOverall.qualityNotMeasured);
assert.notStrictEqual(authorityOverall.title,'Healthy');
assert.strictEqual(authorityOverall.detail,'No delivery or runtime problems. Quality checks aren\u2019t connected for this project.');
assert.ok(!authorityOverall.incomplete,'missing by design is not the failed-request "Incomplete" state');
const authoritySummary=M.healthySummary(authorityByDesign);
assert.strictEqual(authoritySummary.qualityNotMeasured,true);
assert.doesNotMatch(authoritySummary.headline,/Everything looks healthy/);
assert.strictEqual(authoritySummary.meta,'Not measured');
assert.match(M.releaseReadiness(authorityByDesign).detail,/quality is not measured/);
const authorityCard=M.cardMarkup(authorityByDesign,false);
assert.match(authorityCard,/<span aria-hidden="true">Not measured<\/span>/,'short pill fits on one line beside the name');
assert.match(authorityCard,/class="visually-hidden">Healthy · quality not measured</,'screen readers hear the full label');
assert.match(authorityCard,/title="Healthy · quality not measured"/);
assert.match(authorityCard,/No delivery or runtime problems/);
assert.doesNotMatch(authorityCard,/>Healthy<|No current product-quality action/);
// Visual pass, Oct 11: every switcher card (loaded or loading, with or without a stage tag) has the same two rows,
// so pills and detail lines line up across cards. Row 1: name + pill. Row 2: optional stage tag, then the detail.
function cardRows(html){
  const head=html.match(/^<button [^>]*><span class="project-switcher-head"><strong class="project-switcher-name">([^<]*)<\/strong>(<span class="status-pill [^"]*"[^>]*>.*?)<\/span><span class="project-switcher-detail">(.*)<\/span><\/button>$/);
  assert.ok(head,'card has head + detail rows: '+html);
  const detail=head[3].match(/^(<em class="stage-tag">([^<]*)<\/em>)?<span class="project-switcher-signal">([^<]*)<\/span>$/);
  assert.ok(detail,'detail row is an optional stage tag then one signal span: '+head[3]);
  return {name:head[1],pill:head[2],stage:detail[2]||null,signal:detail[3]};
}
const authorityRows=cardRows(authorityCard);
assert.deepStrictEqual([authorityRows.name,authorityRows.stage,authorityRows.signal],['Authority Lab','In progress','No delivery or runtime problems']);
assert.match(authorityRows.pill,/^<span class="status-pill partial" title="Healthy · quality not measured">/);
const stateRows=cardRows(M.cardMarkup(stateHealthy,true));
assert.strictEqual(stateRows.stage,null);
assert.strictEqual(stateRows.pill,'<span class="status-pill healthy">Healthy</span>');
for(const id of ['state','tastemake','narc','authority-lab']){
  const loading=M.loadingCardMarkup(project(id),id==='state');
  const rows=cardRows(loading);
  assert.strictEqual(rows.name,project(id).name);
  assert.strictEqual(rows.pill,'<span class="status-pill unknown">Checking</span>');
  assert.strictEqual(rows.signal,'Checking project health…');
  assert.strictEqual(rows.stage,project(id).stageLabel||null);
  assert.match(loading,/aria-busy="true"/);
  assert.doesNotMatch(loading,/project-switcher-main/,'old single-column layout is gone');
}
// State with real quality data still gets the plain healthy result.
assert.strictEqual(M.healthySummary(stateHealthy).headline,'Everything looks healthy right now.');
assert.deepStrictEqual(M.projectStatus(stateHealthy),{key:'healthy',label:'Healthy',kind:'good'});
assert.ok(!M.overallAttention(stateHealthy).qualityNotMeasured);
// A real problem still outranks "quality not measured".
const authorityBad=loaded(noQualityProject,{delivery:{...goodDelivery,vercel:{kind:'bad',label:'Vercel deploy failed'}}});
assert.strictEqual(M.projectStatus(authorityBad).key,'action');
// A failed request on a project with no quality source is still "Incomplete", not "quality not measured".
const authorityTimedOut=loaded(noQualityProject,{delivery:null,failures:[{label:'Delivery',reason:'request timed out'}]});
assert.strictEqual(M.projectStatus(authorityTimedOut).key,'incomplete');

// --- The QA repro: State's quality request timed out on first load, nothing seeded. Never "Healthy".
const stateTimedOut=loaded(project('state'),{quality:null,failures:[{label:'Quality',reason:'request timed out'}]});
const stateAttention=M.overallAttention(stateTimedOut);
assert.strictEqual(stateAttention.kind,'unknown');
assert.ok(stateAttention.incomplete);
assert.strictEqual(stateAttention.title,"Couldn't check: AI Evals (request timed out)");
assert.deepStrictEqual(M.projectStatus(stateTimedOut),{key:'incomplete',label:'Incomplete',kind:'unknown'});
const stateItems=M.attentionItems(stateTimedOut);
assert.ok(stateItems.every(item=>item.kind!=='good'),'no "Nothing needs action" item while a signal is missing');
assert.ok(stateItems.some(item=>item.incomplete));
assert.notStrictEqual(M.releaseReadiness(stateTimedOut).kind,'good');
assert.match(M.releaseReadiness(stateTimedOut).detail,/Couldn't check: AI Evals/);
const stateCard=M.cardMarkup(stateTimedOut,false);
assert.doesNotMatch(stateCard,/Healthy|No current product-quality action/);
assert.match(stateCard,/Couldn&#39;t check: AI Evals \(request timed out\)/);
assert.match(M.attentionMarkup(stateItems.find(item=>item.incomplete)),/data-retry-health/);
assert.match(M.quickProjectCheck(stateTimedOut).title,/something to review/);

// A stale snapshot value does not make a failed check "checked".
const seededButFailed=loaded(project('state'),{quality:healthyStateQuality,qualityBehaviorUpdatedAt:'2026-10-01T00:00:00Z',failures:[{label:'Quality',reason:'request timed out'}]});
assert.strictEqual(M.projectStatus(seededButFailed).key,'incomplete');

// --- A 404 for a signal the project is supposed to have is unknown, not "no signal".
const tastemake404=loaded(project('tastemake'),{externalQuality:null,failures:[{label:'Quality',reason:M.failureReason({status:404})}]});
assert.strictEqual(M.overallAttention(tastemake404).title,"Couldn't check: Recommendation Quality (not found)");
assert.notStrictEqual(M.projectStatus(tastemake404).kind,'good');

// --- Several missing signals are all named, once each.
const many=loaded(project('narc'),{delivery:null,failures:[{label:'Delivery',reason:'request timed out'},{label:'Activity',reason:'server error 502'},{label:'Delivery',reason:'request timed out'}]});
assert.strictEqual(M.overallAttention(many).title,"Couldn't check: Release pipeline (request timed out), Deployment activity (server error 502)");

// --- Cowork, Oct 11: paid actions explain themselves; the cooldown matches the run API. Visual pass, Oct 11: each note
// belongs to the button it describes (short helper text under it, full sentence as tooltip and screen-reader text).
const RUN_API=require('../api/project-health-run.js')._test;
assert.strictEqual(M.RUN_COOLDOWN_MINUTES*60*1000,RUN_API.RUN_COOLDOWN_MS,'note cooldown must match the API cooldown');
const paidRunInfo={configured:true,can_run_here:true,paid_model_calls:true,button_label:'Run AI evals',estimated_cost:'<$0.25 per full run'};
const runOnly=M.actionNotes({...stateHealthy,runInfo:paidRunInfo});
assert.deepStrictEqual(runOnly,{run:{short:'Paid AI calls · 1 run per 10 min',full:'Run AI evals makes a few small paid AI calls, is limited to one run every 10 minutes, and may update what this page shows.'},investigate:null},'a healthy project: only the run button is paid');
assert.deepStrictEqual(M.actionNotes({...stateHealthy,runInfo:{...paidRunInfo,configured:false}}),{run:null,investigate:null},'no note when the button is hidden');
assert.strictEqual(M.actionNotes(loaded(project('tastemake'),{runInfo:{configured:true,paid_model_calls:false}})).run,null,'a free GitHub workflow run is not described as paid');
assert.strictEqual(M.investigationUsesModel(authorityByDesign),false,'a healthy project investigation is a free local summary');
assert.deepStrictEqual(M.actionNotes(authorityByDesign),{run:null,investigate:null});
assert.strictEqual(M.investigationUsesModel(authorityBad),true);
assert.deepStrictEqual(M.actionNotes(authorityBad).investigate,{short:'Paid AI call · read-only',full:'Investigate makes a small paid AI call to summarize the failure evidence; it only reads and changes nothing.'});
const stateBadDelivery=loaded(project('state'),{quality:healthyStateQuality,qualityBehaviorUpdatedAt:'2026-10-01T00:00:00Z',delivery:{...goodDelivery,vercel:{kind:'bad',label:'Vercel deploy failed'}},runInfo:paidRunInfo});
const bothNotes=M.actionNotes(stateBadDelivery);
assert.ok(bothNotes.run&&bothNotes.investigate,'both buttons carry their own note when both are paid');
assert.doesNotMatch(bothNotes.investigate.full+bothNotes.investigate.short,/10 min|minutes/,'Investigate has no cooldown, so its note never mentions one');
for(const note of [runOnly.run,bothNotes.investigate]){
  assert.strictEqual((note.full.match(/[.!?](\s|$)/g)||[]).length,1,'one sentence: '+note.full);
  assert.ok(note.short.split(' · ').every(line=>line.length<=16),'each helper line fits under its button: '+note.short);
}

// --- Visual pass, Oct 11: while the run API would refuse a run, the button says when it is available again.
const T0=Date.parse('2026-10-11T12:00:00Z');
const at=ms=>new Date(T0-ms).toISOString();
assert.deepStrictEqual(M.runCooldown(at(3*60*1000),T0),{active:true,remainingMs:7*60*1000,minutes:7,label:'Available in 7 min'});
assert.strictEqual(M.runCooldown(at(3*60*1000+5000),T0).label,'Available in 7 min','partial minutes round up');
assert.strictEqual(M.runCooldown(at(0),T0).label,'Available in 10 min');
assert.strictEqual(M.runCooldown(at(10*60*1000-1000),T0).label,'Available in 1 min','never "0 min" while still cooling down');
assert.strictEqual(M.runCooldown(at(10*60*1000),T0).active,false,'re-enabled exactly at the API cooldown');
assert.strictEqual(M.runCooldown(at(-60*1000),T0).active,false,'a start in the future is ignored, like the API (elapsed >= 0)');
assert.strictEqual(M.runCooldown(null,T0).active,false);
assert.strictEqual(M.runCooldown('not a date',T0).label,'');
// Every 30 s check (the page ticks every 15 s) sees a label that never increases and ends enabled.
let previous=Infinity;
for(let t=0;t<=10*60*1000;t+=30*1000){
  const step=M.runCooldown(at(0),T0+t);
  if(step.active){assert.ok(step.minutes<=previous);previous=step.minutes;}
  else assert.strictEqual(t,10*60*1000);
}
// The latest known start wins: this browser's own dispatch, an active run, or a 429's retry_after_seconds.
assert.strictEqual(M.latestRunStart({runStartedAt:at(8*60*1000),qualityRun:{startedAt:at(2*60*1000)}}),at(2*60*1000));
assert.strictEqual(M.runCooldownFor({runStartedAt:at(2*60*1000)},T0).label,'Available in 8 min');
assert.strictEqual(M.runCooldownFor({},T0).active,false);
assert.strictEqual(M.cooldownStartFromRetryAfter(420,T0),at(3*60*1000),'429 with 7 min left means the run started 3 min ago');
assert.strictEqual(M.runCooldown(M.cooldownStartFromRetryAfter(420,T0),T0).label,'Available in 7 min');
assert.strictEqual(M.cooldownStartFromRetryAfter(undefined,T0),null);
assert.strictEqual(M.cooldownStartFromRetryAfter(99999,T0),at(0),'capped at the API cooldown');
// Oct 11: the run GET's last_run_started_at covers runs started by another visitor or browser.
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:at(3*60*1000)}},T0).label,'Available in 7 min');
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:at(3*60*1000)}},T0).active,true);
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:at(9*60*1000+30*1000)}},T0).label,'Available in 1 min');
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:at(10*60*1000)}},T0).active,false,'an old run elsewhere does not block');
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:null}},T0).active,false,'null (lookup failed) means unknown, not blocked');
assert.strictEqual(M.latestRunStart({runInfo:{last_run_started_at:at(6*60*1000)},runStartedAt:at(9*60*1000)}),at(6*60*1000),'a newer run elsewhere beats this browser\'s older start');
assert.strictEqual(M.latestRunStart({runInfo:{last_run_started_at:at(9*60*1000)},runStartedAt:at(1*60*1000)}),at(1*60*1000),'a newer local start beats a stale GET');
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:at(9*60*1000)},runStartedAt:M.cooldownStartFromRetryAfter(300,T0)},T0).label,'Available in 5 min','the 429 fallback still counts');
assert.strictEqual(M.runCooldownFor({runInfo:{last_run_started_at:'garbage'},runStartedAt:at(4*60*1000)},T0).label,'Available in 6 min');
assert.match(require('fs').readFileSync(require.resolve('../project-health.js'),'utf8'),/\/api\/project-health-run\?project='\+encodeURIComponent\(project\.id\)\+'&env='\+pageEnvironment\(root\)/,'the page asks for the cooldown of the ref its runs record to');

// --- Non-health controls and detail-only signals do not make a project incomplete.
const controlsOnly=loaded(project('tastemake'),{externalQuality:{attention:[{kind:'good',title:'Recommendation checks healthy'}]},failures:[{label:'Run controls',reason:'not found'},{label:'Analytics',reason:'request timed out'}]});
assert.strictEqual(M.projectStatus(controlsOnly).label,'Healthy');

// --- A retry in progress (label pending again) is "checking", not a stale failure.
const retrying=loaded(project('state'),{quality:null,failures:[{label:'Quality',reason:'request timed out'}]});
retrying.pending.add('Quality');
assert.deepStrictEqual(M.uncheckedSignals(retrying),[]);
assert.strictEqual(M.projectStatus(retrying).key,'checking');

// --- Known problems still outrank "incomplete", but the missing signal stays listed.
const badDelivery=loaded(project('narc'),{delivery:{...goodDelivery,vercel:{kind:'bad',label:'Vercel deploy failed'}},failures:[{label:'Quality',reason:'request timed out'}]});
assert.strictEqual(M.overallAttention(badDelivery).kind,'bad');
assert.ok(M.attentionItems(badDelivery).some(item=>item.incomplete));
const staleEvals=loaded(project('state'),{quality:{...healthyStateQuality,behaviorUpdatedAt:'2099-01-01T00:00:00Z'},failures:[{label:'Delivery',reason:'request timed out'}]});
assert.strictEqual(M.projectStatus(staleEvals).key,'watch');
assert.ok(M.attentionItems(staleEvals).some(item=>item.incomplete));

// --- Page loader: State's quality times out, Authority Lab never requests signals it has by design.
(async()=>{
  const originalFetch=global.fetch;
  const requested=[];
  const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
  global.fetch=async url=>{
    requested.push(String(url));
    if(/api\.github\.com/.test(url))throw new Error('browser must not call GitHub directly');
    if(url.startsWith('/api/project-health-github')){
      const okPart=value=>({ok:true,value});
      return json(200,{delivery:okPart(goodDelivery),staging:okPart(goodDelivery),evalBehavior:okPart({sha:'abc',updatedAt:'2026-10-01T00:00:00Z'}),openPullRequests:okPart([])});
    }
    if(url.startsWith('/api/project-health-state-quality')){const error=new Error('This operation was aborted');error.name='AbortError';throw error;}
    if(url.startsWith('/api/project-health-activity'))return json(200,{activity:null});
    if(url.startsWith('/api/project-health-platform'))return json(200,{render:{configured:true,environments:{production:{ok:true}}}});
    if(url.startsWith('/api/project-health-run'))return json(200,{configured:false});
    if(url.startsWith('/api/project-health-project-quality'))return json(404,{detail:'No external quality adapter for this project'});
    return json(404,{});
  };
  const root={location:{hostname:'www.contextswitch.tech',search:''}};
  try{
    const state=await H.loadProject(project('state'),root);
    assert.strictEqual(M.projectStatus(state).key,'incomplete');
    assert.match(M.overallAttention(state).title,/AI Evals \(request timed out\)/);
    assert.strictEqual(requested.filter(url=>url.startsWith('/api/project-health-github')).length,1,'one GitHub request per project');
    assert.ok(requested.some(url=>url==='/api/project-health-github?project=state&env=production'));

    requested.length=0;
    const authority=await H.loadProject(noQualityProject,root);
    assert.ok(!requested.some(url=>/project-health-(run|project-quality)/.test(url)),'by-design gaps are not requested');
    assert.strictEqual(M.projectStatus(authority).label,'Healthy · quality not measured');
    await H.loadProjectDetails(authority,root);
    assert.strictEqual(requested.filter(url=>url.startsWith('/api/project-health-github')).length,1,'details reuse the same GitHub response');

    // A tastemake 404 on its quality source is now a failure, not a silent "no data".
    const tastemake=await H.loadProject(project('tastemake'),root);
    assert.strictEqual(M.overallAttention(tastemake).title,"Couldn't check: Recommendation Quality (not found)");
  }finally{global.fetch=originalFetch;}
})().catch(error=>{console.error(error);process.exit(1);});

// --- Cowork, Oct 12: a slow deployment-activity call must not hold the core status (or the page's
// "Refreshing N of 4" count) back, and if it then fails the project is Incomplete, never Healthy.
(async()=>{
  const originalFetch=global.fetch;
  const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
  let releaseActivity;
  const activityGate=new Promise(resolve=>{releaseActivity=resolve;});
  global.fetch=async(url,options={})=>{
    if(url.startsWith('/api/project-health-github')){
      const okPart=value=>({ok:true,value});
      return json(200,{delivery:okPart(goodDelivery),staging:okPart(goodDelivery),evalBehavior:okPart({sha:'abc',updatedAt:'2026-10-01T00:00:00Z'}),openPullRequests:okPart([])});
    }
    if(url.startsWith('/api/project-health-activity')){
      await activityGate;
      const error=new Error('This operation was aborted');error.name='AbortError';throw error;
    }
    if(url.startsWith('/api/project-health-run'))return json(200,{configured:false});
    if(url.startsWith('/api/project-health-project-quality'))return json(200,{project:'tastemake',attention:[{kind:'good',title:'Recommendation checks pass'}]});
    return json(404,{});
  };
  const root={location:{hostname:'www.contextswitch.tech',search:''}};
  try{
    const seen=[];
    const loading=H.loadProject(project('tastemake'),root,partial=>{
      seen.push({known:M.coreStatusKnown(partial),activity:M.activityStillLoading(partial),status:M.projectStatus(partial).key,card:M.cardMarkup(partial,false)});
    });
    await new Promise(resolve=>setTimeout(resolve,30));
    const waiting=seen[seen.length-1];
    assert.strictEqual(waiting.known,true,'core status is known while deployment activity is still loading');
    assert.strictEqual(waiting.activity,true);
    assert.notStrictEqual(waiting.status,'checking','the pill does not sit at Checking for the activity detail');
    assert.match(waiting.card,/Checking deployment activity…/);
    releaseActivity();
    const done=await loading;
    assert.strictEqual(M.activityStillLoading(done),false);
    assert.strictEqual(M.projectStatus(done).key,'incomplete','a failed activity signal is never shown as Healthy');
    assert.match(M.overallAttention(done).title,/Deployment activity \(request timed out\)/);
  }finally{global.fetch=originalFetch;}
  // Progress counts projects whose core status is known and names the ones still waiting on activity.
  assert.strictEqual(M.coreStatusKnown({...M.emptyProjectData(project('state')),fresh:true,pending:new Set(['Activity'])}),true);
  assert.strictEqual(M.coreStatusKnown({...M.emptyProjectData(project('state')),fresh:true,pending:new Set(['Delivery','Activity'])}),false);
  assert.strictEqual(M.coreStatusKnown({...M.emptyProjectData(project('state')),fresh:false,pending:new Set()}),false,'a cached snapshot is not a known current status');
})().catch(error=>{console.error(error);process.exit(1);});

// --- Server-side GitHub function: allowlisted repos, token when set, cache headers.
(async()=>{
  assert.deepStrictEqual(Object.keys(G.PROJECTS),M.PROJECTS.map(p=>p.id));
  assert.strictEqual(await G.githubSummary('pedringt/other-repo','production',async()=>{throw new Error('unreachable');}),null);

  const paths=[];
  const fakeGh=async path=>{
    paths.push(path);
    if(/\/branches\//.test(path))return {name:'main',commit:{sha:'1111111aaaaaaa',commit:{message:'Tip',committer:{date:'2026-10-09T00:00:00Z'}}}};
    if(/\/commits\?sha=/.test(path))return [{sha:'2222222bbbbbbb',commit:{message:'Scoped release (#1)',committer:{date:'2026-10-08T00:00:00Z'}}}];
    if(/\/status$/.test(path))return {statuses:[{context:'Vercel – state',state:'success'}]};
    if(/\/check-runs/.test(path))return {check_runs:[]};
    if(/\/pulls\?state=open/.test(path))return [{number:7,title:'Open thing',html_url:'https://github.com/pedringt/ai-learning/pull/7',body:'secret body',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'}];
    if(/\/pulls\/7\/files/.test(path))return [{filename:'state-project-complete/app.py'}];
    return {};
  };
  const summary=await G.githubSummary('state','production',fakeGh);
  assert.ok(paths.every(path=>path.startsWith('/repos/pedringt/ai-learning/')),'only the configured repo is read');
  assert.ok(summary.delivery.ok&&summary.staging.ok&&summary.evalBehavior.ok&&summary.openPullRequests.ok);
  assert.strictEqual(summary.delivery.value.sha,'2222222bbbbbbb','scoped release commit, as the browser selected it');
  assert.strictEqual(summary.delivery.value.vercel.kind,'good');
  assert.deepStrictEqual(summary.openPullRequests.value,[{number:7,title:'Open thing',html_url:'https://github.com/pedringt/ai-learning/pull/7',draft:false,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'}]);
  assert.ok(paths.some(path=>path.includes('sha=main&path=state-project-complete%2Fask_service.py')),'production eval behavior reads main');
  paths.length=0;
  await G.githubSummary('state','staging',fakeGh);
  assert.ok(paths.some(path=>path.includes('sha=staging&path=state-project-complete%2Fask_service.py')),'staging eval behavior reads staging');

  const failing=await G.githubSummary('narc','production',async path=>{if(/\/branches\//.test(path)){const e=new Error('API rate limit exceeded');e.status=403;throw e;}return [];});
  assert.deepStrictEqual(failing.delivery,{ok:false,status:403,detail:'API rate limit exceeded'});
  assert.strictEqual(failing.staging,null);

  // Token is used when set, and omitted when absent.
  const priorToken=process.env.GITHUB_TOKEN;
  try{
    let seen=null;
    const capture=async(url,options)=>{seen={url,headers:options.headers};return {ok:true,status:200,json:async()=>({})};};
    process.env.GITHUB_TOKEN='test-token';
    await G.makeGithubFetch(capture,undefined)('/repos/pedringt/narc/branches/main');
    assert.strictEqual(seen.url,'https://api.github.com/repos/pedringt/narc/branches/main');
    assert.strictEqual(seen.headers.Authorization,'Bearer test-token');
    delete process.env.GITHUB_TOKEN;
    await G.makeGithubFetch(capture,undefined)('/repos/pedringt/narc/branches/main');
    assert.strictEqual(seen.headers.Authorization,undefined);
  }finally{if(priorToken==null)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=priorToken;}

  // Handler: unknown projects are refused; success is edge-cached; a failed part is not.
  function fakeRes(){const res={headers:{},statusCode:0,body:null};res.setHeader=(k,v)=>{res.headers[k]=v;};res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.body=body;return res;};return res;}
  const originalFetch=global.fetch;
  try{
    global.fetch=async()=>{throw new Error('unknown project must not reach GitHub');};
    const refused=fakeRes();
    await GITHUB_API({method:'GET',query:{project:'../../orgs/x'}},refused);
    assert.strictEqual(refused.statusCode,400);

    global.fetch=async url=>{
      const path=String(url).replace('https://api.github.com','');
      return {ok:true,status:200,json:async()=>fakeGh(path)};
    };
    const ok=fakeRes();
    await GITHUB_API({method:'GET',query:{project:'tastemake'}},ok);
    assert.strictEqual(ok.statusCode,200);
    assert.strictEqual(ok.headers['Cache-Control'],'s-maxage=60, stale-while-revalidate=300');
    assert.ok(ok.body.delivery.ok);

    global.fetch=async()=>({ok:false,status:403,json:async()=>({message:'API rate limit exceeded'})});
    const limited=fakeRes();
    await GITHUB_API({method:'GET',query:{project:'tastemake'}},limited);
    assert.strictEqual(limited.statusCode,200);
    assert.strictEqual(limited.headers['Cache-Control'],'no-store');
    assert.strictEqual(limited.body.delivery.ok,false);
  }finally{global.fetch=originalFetch;}
  console.log('Project Health signal coverage tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
