// Project Health signal coverage (QA, Oct 10): a signal that failed to load must never roll up into "Healthy",
// and the page's GitHub reads go through one server-side function per project instead of api.github.com.
const assert=require('assert');
const M=require('../project-health-model.js');
const H=require('../project-health.js');
const GITHUB_API=require('../api/project-health-github.js');
const G=GITHUB_API._test;

const project=id=>M.PROJECTS.find(p=>p.id===id);
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
const authorityByDesign=loaded(project('authority-lab'),{externalQuality:null});
assert.strictEqual(M.projectStatus(authorityByDesign).label,'Healthy','no quality source by design is not a failure');
assert.deepStrictEqual(M.uncheckedSignals(authorityByDesign),[]);
assert.ok(project('authority-lab').noQualitySource&&project('authority-lab').noRunWorkflow);

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
    const authority=await H.loadProject(project('authority-lab'),root);
    assert.ok(!requested.some(url=>/project-health-(run|project-quality)/.test(url)),'by-design gaps are not requested');
    assert.strictEqual(M.projectStatus(authority).label,'Healthy');
    await H.loadProjectDetails(authority,root);
    assert.strictEqual(requested.filter(url=>url.startsWith('/api/project-health-github')).length,1,'details reuse the same GitHub response');

    // A tastemake 404 on its quality source is now a failure, not a silent "no data".
    const tastemake=await H.loadProject(project('tastemake'),root);
    assert.strictEqual(M.overallAttention(tastemake).title,"Couldn't check: Recommendation Quality (not found)");
  }finally{global.fetch=originalFetch;}
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
