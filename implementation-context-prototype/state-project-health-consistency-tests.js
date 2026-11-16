// Nov 15 review: views that disagreed about the same evidence. Timestamps, regression claims, stale State evals, the
// release label, the latency line and Authority Lab's analytics now tell one story. No model calls, no network.
// The timezone bug only shows outside UTC, so this suite runs as a Pacific-time viewer.
process.env.TZ='America/Los_Angeles';
const assert=require('assert');
const M=require('../project-health-model.js');
const H=require('../project-health.js');
const fs=require('fs');
const path=require('path');

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

// The production record from Nov 9: SQLite stores UTC with no zone marker.
const RUN_AT='2026-11-09 23:29:08';
const BUILD='42db6a9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PREVIOUS_BUILD='decc321bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const failure={scenario_id:'review_direct_reversal',category:'reversal',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['interpretation']};
const review=(overrides={})=>({suite:'review_interpretation',build:BUILD,total:16,errors:0,high_severity_failures:1,interpretation_accuracy:0.9375,overall_pass_rate:0.9375,created_at:RUN_AT,failure_details:[failure],...overrides});
const ask=(overrides={})=>({suite:'ask_quality',build:BUILD,total:13,errors:0,high_severity_failures:0,ask_grounding:1,uncertainty_accuracy:1,open_item_accuracy:1,authority_accuracy:1,overall_pass_rate:1,created_at:RUN_AT,failure_details:[],...overrides});
const previousReview=(overrides={})=>review({build:PREVIOUS_BUILD,high_severity_failures:0,interpretation_accuracy:1,overall_pass_rate:1,created_at:'2026-11-07 17:15:26',failure_details:[],...overrides});
const quality=(overrides={})=>({review:review(),ask:ask(),recent:[review(),previousReview(),ask()],resolvedReviews:0,...overrides});
// A State behavior commit after the run makes these results stale.
const staleQuality=(overrides={})=>quality({behaviorUpdatedAt:'2026-11-15T06:25:00Z',...overrides});
const stateData=(overrides={})=>({...M.emptyProjectData(M.PROJECTS[0]),fresh:true,...overrides});

(async()=>{
  // ---- Timestamps ----
  await check('a SQLite UTC time reads as UTC, with or without fractional seconds',()=>{
    assert.strictEqual(M.dateMs(RUN_AT),Date.parse('2026-11-09T23:29:08Z'));
    // The decision log writes microseconds; they are trimmed to milliseconds so every browser parses them.
    assert.strictEqual(M.dateMs('2026-11-09 23:29:08.123456'),Date.parse('2026-11-09T23:29:08.123Z'));
  });
  await check('the Releases timeline shows the same Pacific time as the quality details',()=>{
    assert.match(M.fmtDate(RUN_AT),/3:29\s?PM/);
    // #689: the time zone is named, and the eval details page (year:true) shows the same time.
    assert.match(M.fmtDate(RUN_AT),/^Nov 9, 3:29\s?PM PST$/);
    assert.match(M.fmtDate(RUN_AT,{year:true}),/^Nov 9, 2026, 3:29\s?PM PST$/);
    assert.match(M.activityTimeRange({when:RUN_AT}),/^3:29\s?PM$/);
    assert.match(M.activityTimeRange({when:RUN_AT,startWhen:RUN_AT,endWhen:'2026-11-09 23:45:00'}),/^3:29\s?PM–3:45\s?PM$/);
    assert.strictEqual(M.activityDayLabel('2026-11-10 02:00:00'),'Nov 9','02:00 UTC on Nov 10 is still Nov 9 in Pacific time');
  });

  // ---- Regression claims ----
  await check('runs the Overview calls "Not comparable" never read as a regression in Decision Support',()=>{
    const data=stateData({quality:quality()});
    assert.strictEqual(M.metricChange(data.quality.recent,'review_interpretation','interpretation_accuracy').status,'not-comparable');
    const signal=M.regressionSignal(data);
    assert.strictEqual(signal.kind,'unknown');
    assert.strictEqual(signal.title,'No comparable regression signal');
    assert.match(signal.detail,/Update understanding: the latest two runs are not comparable \(the run records don’t show which scenarios ran\)\./);
    assert.doesNotMatch(signal.title+signal.detail,/regressed|Comparable runs used builds/);
  });
  await check('a comparable drop is still reported, with its builds',()=>{
    const recent=[review({scoring_version:'sv1'}),previousReview({scoring_version:'sv1'})];
    const signal=M.regressionSignal(stateData({quality:quality({recent})}));
    assert.strictEqual(signal.kind,'warn');
    assert.strictEqual(signal.title,'Update understanding regressed 6.2 points');
    assert.match(signal.detail,/Comparable runs used builds decc321 → 42db6a9\./);
    assert.doesNotMatch(signal.detail,/Historical/);
  });
  await check('a comparable drop recorded before the latest behavior change is labelled historical',()=>{
    const recent=[review({scoring_version:'sv1'}),previousReview({scoring_version:'sv1'})];
    const signal=M.regressionSignal(stateData({quality:staleQuality({recent})}));
    assert.strictEqual(signal.kind,'warn');
    assert.match(signal.detail,/Historical: these runs predate the latest State behavior change\./);
  });

  // ---- Stale State evals ----
  await check('stale metric cards keep their scores but read as the previous run, in neutral colors',()=>{
    const fresh=M.stateMetricCards(quality());
    const stale=M.stateMetricCards(staleQuality());
    const freshReview=fresh.find(card=>card.label==='Update understanding');
    const staleReview=stale.find(card=>card.label==='Update understanding');
    assert.strictEqual(freshReview.kind,'bad');
    assert.strictEqual(staleReview.kind,'unknown');
    assert.strictEqual(staleReview.signal,'Previous run: '+freshReview.signal);
    assert.strictEqual(staleReview.display,freshReview.display,'the old score stays visible');
    assert.ok(stale.every(card=>card.score==null||card.kind==='unknown'));
  });
  await check('failures from a stale run carry one historical label with the run time',()=>{
    assert.strictEqual(M.staleFailureContext(stateData({quality:quality()})),null);
    const context=M.staleFailureContext(stateData({quality:staleQuality()}));
    assert.strictEqual(context.heading,'Failed in the previous run');
    assert.match(context.note,/^Historical: recorded Nov 9, 3:29\s?PM PST, before the latest State behavior change\. Not treated as a current product failure\.$/);
  });

  // ---- Operational signals and copy ----
  await check('the latency line shows the measurement without a per-browser "last saved" delta',()=>{
    const data=stateData({
      quality:quality(),
      platform:{aiTelemetry:{available:true,response_speed:{p95_ms:10800,sample_size:19}}},
      previousPlatform:{aiTelemetry:{response_speed:{p95_ms:9600}}}
    });
    const speed=M.operationalSignals(data).find(item=>item.label==='AI response speed');
    assert.strictEqual(speed.status,'Measured');
    assert.strictEqual(speed.detail,'p95 10.8 s across 19 recorded calls · within the 15 s target.');
  });
  await check('one monitoring gap "limits" what Project Health can confirm',()=>{
    const observability=items=>items.find(item=>item.label==='Observability');
    const tastemake=M.PROJECTS.find(item=>item.id==='tastemake');
    const one=observability(M.releaseRiskChecklist({...M.emptyProjectData(tastemake),fresh:true,platform:{analytics:{configured:false},aiTelemetry:{configured:true,available:true}}}));
    assert.match(one.detail,/^1 monitoring gap limits what/);
    const several=observability(M.releaseRiskChecklist(stateData({quality:quality()})));
    assert.match(several.detail,/^\d+ monitoring gaps limit what/);
  });
  await check('analytics that are not enabled say so instead of suggesting a retry',()=>{
    const analytics={configured:true,available:false,status:400,error:'Web Analytics is not enabled for this project',not_enabled:true};
    assert.strictEqual(M.analyticsConnectionValue({analytics}),'Not enabled');
    assert.match(M.analyticsGapDetail(analytics),/^Web Analytics not enabled\./);
    assert.doesNotMatch(M.analyticsGapDetail(analytics),/Try again/);
    assert.match(M.analyticsGapDetail({configured:true,available:false,status:400,error:'Web Analytics is not enabled for this project'}),/^Web Analytics not enabled\./,'a response from before the flag is recognized by its error');
    assert.match(M.analyticsGapDetail({configured:true,available:false,status:500}),/latest query failed\. Try again/,'a real failed query still offers a retry');
  });
  await check('the analytics API flags Vercel\'s "not enabled" answer',async()=>{
    const originalFetch=global.fetch,originalToken=process.env.VERCEL_TOKEN;
    process.env.VERCEL_TOKEN='test-token';
    global.fetch=async()=>({ok:false,status:400,json:async()=>({error:{code:'bad_request',message:'Web Analytics is not enabled for this project'}})});
    try{
      const handler=require('../api/project-health-platform.js');
      let body=null;
      const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(payload){body=payload;return this;}};
      await handler({method:'GET',query:{project:'authority-lab',signal:'analytics'}},res);
      assert.strictEqual(body.analytics.available,false);
      assert.strictEqual(body.analytics.not_enabled,true);
    }finally{
      global.fetch=originalFetch;
      if(originalToken==null)delete process.env.VERCEL_TOKEN;else process.env.VERCEL_TOKEN=originalToken;
    }
  });
  await check('the release label names a successful deployment, not product stability',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..','project-health.js'),'utf8');
    assert.match(source,/dKind==='good'\?'Deployment succeeded'/);
    assert.doesNotMatch(source,/'Stable'/);
  });

  // ---- Rendered Overview and drawer for stale State evals ----
  await check('the stale Overview shows old failures as the previous run, never as current failures',async()=>{
    const elements=new Map(),store=new Map();
    const stubElement=id=>({id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},style:{},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},setAttribute(){},getAttribute(){return null;},removeAttribute(){},
      addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
      appendChild(){},append(){},insertAdjacentHTML(){},scrollIntoView(){},focus(){},showModal(){},close(){},contains(){return false;}});
    const document={getElementById(id){if(!elements.has(id))elements.set(id,stubElement(id));return elements.get(id);},
      querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},removeEventListener(){},createElement(tag){return stubElement(tag);},body:stubElement('body'),hidden:true};
    const root={document,location:{hostname:'www.contextswitch.tech',search:'',pathname:'/project-health',href:'https://www.contextswitch.tech/project-health'},
      history:{replaceState(){},pushState(){}},
      localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
      navigator:{clipboard:{writeText:async()=>{}}},addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),
      setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},requestAnimationFrame:fn=>setTimeout(fn,0)};
    const r=review(),a=ask(),p=previousReview();
    const originalFetch=global.fetch;
    global.fetch=async url=>{
      const respond=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
      if(String(url).includes('/api/project-health-state-quality'))return respond(200,{live_review_quality:{resolved_reviews:0},controlled_evals:{latest_review_interpretation:r,latest_ask_quality:a,recent:[r,p,a]},privacy:{content_included:false}});
      if(String(url).includes('/api/project-health-github'))return respond(200,{evalBehavior:{ok:true,value:{updatedAt:'2026-11-15T06:25:00Z'}}});
      return respond(404,{detail:'not found'});
    };
    const waitFor=async(predicate,ms=4000)=>{const start=Date.now();while(Date.now()-start<ms){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,25));}return predicate();};
    try{
      await H.init(root);
      const overview=()=>elements.get('mockDashboardOverview').innerHTML;
      assert.ok(await waitFor(()=>/Failed in the previous run/.test(overview())),overview().slice(0,600));
      const html=overview();
      assert.match(html,/Historical: recorded Nov 9, 3:29\s?PM/);
      assert.match(html,/status-pill unknown">Failed in previous run</);
      assert.doesNotMatch(html,/status-pill bad">Failed</);
      assert.doesNotMatch(html,/<strong>What failed<\/strong>/);
      assert.match(html,/mock-kpi-grid is-previous/);
      assert.match(html,/Previous results · rerun needed · recorded Nov 9, 3:29\s?PM/);
      assert.match(html,/Previous run: 1 failure in a high-severity scenario/);
      assert.doesNotMatch(html,/mock-kpi-signal bad/);
    }finally{global.fetch=originalFetch;}
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
  process.exit(0);
})();
