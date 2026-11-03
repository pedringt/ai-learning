// #596 / #597 (Nov 2 review): a failed controlled eval is explained from recorded and catalog data only, and the quality
// numbers say where they came from while a refresh runs, after it fails, and on a first visit. No model calls, no network.
const assert=require('assert');
const M=require('../project-health-model.js');
const H=require('../project-health.js');
const catalog=require('../state-eval-catalog.js');

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

const BUILD='b22a14e38ba69f30e82ed8da952efb8d3273ade3';
// The production record from Nov 2 (GET /api/project-health-state-quality), field for field.
const plannedFailure={scenario_id:'review_planned_action_not_stated_as_done',category:'planned_vs_completed',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['review_needed','interpretation']};
const review=(overrides={})=>({suite:'review_interpretation',build:BUILD,model_identifier:'claude-haiku-5-5',total:16,errors:0,high_severity_failures:1,interpretation_accuracy:0.9375,created_at:'2026-11-02 22:50:28',failure_details:[plannedFailure],...overrides});
const ask=(overrides={})=>({suite:'ask_quality',build:BUILD,model_identifier:'claude-haiku-5-5',total:13,errors:0,high_severity_failures:0,ask_grounding:1,uncertainty_accuracy:1,open_item_accuracy:1,authority_accuracy:1,overall_pass_rate:1,created_at:'2026-11-02 22:50:28',failure_details:[],...overrides});
const quality=(overrides={})=>({review:review(),ask:ask(),recent:[review(),ask()],resolvedReviews:0,...overrides});
const stateData=(overrides={})=>({...M.emptyProjectData(M.PROJECTS[0]),fresh:true,...overrides});

// A stub page like state-project-health-first-visit-tests.js: every API but State quality answers 404 at once.
function stubElement(id){
  return {
    id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    setAttribute(){},getAttribute(){return null;},removeAttribute(){},
    addEventListener(){},removeEventListener(){},
    querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
    appendChild(){},append(){},insertAdjacentHTML(){},scrollIntoView(){},focus(){},showModal(){},close(){},contains(){return false;}
  };
}
function stubRoot(snapshot){
  const elements=new Map(),store=new Map();
  if(snapshot)store.set('project-health-snapshot:production',JSON.stringify(snapshot));
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,stubElement(id));return elements.get(id);},
    querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(){},removeEventListener(){},createElement(tag){return stubElement(tag);},
    body:stubElement('body'),hidden:true
  };
  const timers=new Set();
  const root={
    document,
    location:{href:'https://www.contextswitch.tech/project-health',search:'',hostname:'www.contextswitch.tech'},
    history:{replaceState(){}},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
    navigator:{},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t);},
    setInterval:()=>0,
    alert(){},prompt(){},
    addEventListener(){},removeEventListener(){},
    requestAnimationFrame:()=>0
  };
  return {root,elements,store,cleanup:()=>{for(const t of timers)clearTimeout(t);timers.clear();}};
}
function stubFetch({quality}){
  return async url=>{
    const respond=({status,body})=>({ok:status>=200&&status<300,status,json:async()=>body});
    if(String(url).includes('/api/project-health-state-quality'))return respond(await quality());
    return respond({status:404,body:{detail:'not found'}});
  };
}
async function waitFor(predicate,ms=4000){
  const start=Date.now();
  while(Date.now()-start<ms){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,25));}
  return predicate();
}
function qualityPayload(){
  const r=review(),a=ask();
  return {live_review_quality:{resolved_reviews:0},controlled_evals:{latest_review_interpretation:r,latest_ask_quality:a,recent:[r,a]},privacy:{content_included:false}};
}
// A snapshot saved by an earlier visit: State's quality from the Nov 2 run.
function cachedSnapshot(){
  return {savedAt:new Date(Date.now()-3600000).toISOString(),projects:[{projectId:'state',quality:M.normalizeQuality(qualityPayload()),qualityCheckedAt:new Date(Date.now()-3600000).toISOString(),checkedAt:new Date(Date.now()-3600000).toISOString(),openPullRequests:[]}]};
}

(async()=>{
  // ---- #596: explanations ----
  await check('the Nov 2 failure reads Evidence, Observed, Expected, Consequence and Next step from grounded data',()=>{
    const story=M.failureStory(plannedFailure,review());
    const scenario=catalog.review.find(item=>item.id===plannedFailure.scenario_id);
    assert.strictEqual(story.title,'An agreed plan is not recorded as already done');
    assert.strictEqual(story.evidence.text,scenario.evidence,'the Evidence is the scenario\'s own text');
    assert.deepStrictEqual(story.evidence.setup,[{label:'Current State',text:scenario.current_state[0][1]}]);
    // Nov 2 refinement: the heading names this run's miss; the scenario's own name is the secondary label.
    assert.strictEqual(story.heading,'An agreed revision plan didn’t trigger a Review');
    assert.strictEqual(story.severityLabel,'Scenario severity: high');
    // Narrowed to what the record supports: review_needed failed on a scenario that needs one, so no Review was created.
    assert.strictEqual(story.observed.text,'No Review was created for this Evidence, so State proposed no Current State change, Question or at-risk flag.');
    assert.doesNotMatch(story.observed.text,/nobody would have been asked|did not recommend/,'no claim broader than the record');
    assert.strictEqual(story.observed.source,'From the run record.');
    assert.strictEqual(story.observed.excerpt,null,'no proposal was recorded, so none is shown');
    assert.strictEqual(story.expected.text,'State should propose a Current State change for a person to approve.','Expected is one line');
    assert.strictEqual(story.expected.source,'From the scenario catalog.');
    assert.ok(story.expected.details.some(line=>/^Also acceptable: flag the Current State fact as at risk; open a new Question/.test(line)),'alternatives move to details');
    assert.ok(story.expected.details.some(line=>/must not say “was revised”/.test(line)),'forbidden phrases move to details');
    assert.strictEqual(story.consequence.direction,'missed');
    assert.match(story.consequence.text,/^This run missed a needed Review: no change to Current State was put up for approval, so Current State still says “Evaluation uses the Q2 sample split/);
    assert.match(story.consequence.text,/did not make this scenario’s unsafe mistake \(overstating what the Evidence establishes\)/,'the miss is in the cautious direction (unsafe_if: overstatement)');
    assert.doesNotMatch(story.consequence.text,/high|impact|severity/i,'severity is not presented as this run\'s outcome');
    assert.doesNotMatch(story.nextStep,/\. /,'Next step is one sentence');
    assert.match(story.nextStep,/State or the contract/);
    assert.match(story.nextStep,/product decision/);
    assert.strictEqual(story.contractNote,scenario.rationale);
    assert.ok(story.gaps.some(gap=>/scorer’s exact reason is not recorded/.test(gap)));
    for(const text of [story.title,story.heading,story.observed.text,story.expected.text,story.consequence.text])
      assert.doesNotMatch(text,/review_planned_action_not_stated_as_done|preserve_evidence_only|update_state/,'no internal codes in the reading text: '+text);
    assert.deepStrictEqual([story.technical.scenarioId,story.technical.build,story.technical.runAt,story.technical.total],[plannedFailure.scenario_id,BUILD,'2026-11-02 22:50:28',16]);
    assert.strictEqual(story.technical.sourceUrl,'https://github.com/pedringt/ai-learning/blob/'+BUILD+'/state-project-complete/eval/review_interpretation_scenarios.py');
    assert.strictEqual(story.technical.pageUrl,'https://www.contextswitch.tech/state-evals?failure=review_planned_action_not_stated_as_done');
  });
  await check('a proposed change where the Evidence settles nothing is the unsafe direction, with the recorded excerpt',()=>{
    const story=M.failureStory({scenario_id:'review_same_unknown_links_existing_question',severity:'medium',expected:'link_existing_question',observed:'update_state | proposed State: Prompts and outputs are retained for 30 days.',failed_checks:['interpretation']},review());
    assert.strictEqual(story.consequence.direction,'unsafe');
    assert.match(story.consequence.text,/unsafe direction/);
    assert.deepStrictEqual(story.observed.excerpt,{text:'Prompts and outputs are retained for 30 days.',truncated:false});
  });
  await check('a cut-off excerpt is marked, and an acceptable outcome that failed on wording says so',()=>{
    const long='x'.repeat(180);
    const story=M.failureStory({scenario_id:'review_partial_question_answer',severity:'high',expected:'update_state',observed:'update_state | proposed State: '+long,failed_checks:['interpretation']},review());
    assert.strictEqual(story.observed.excerpt.truncated,true);
    assert.match(story.observed.text,/one this scenario accepts, so the miss was in the wording/);
    assert.strictEqual(story.consequence.direction,'possibly-unsafe');
  });
  await check('an unknown scenario shows the gap instead of inventing a setup',()=>{
    const story=M.failureStory({scenario_id:'review_not_in_catalog',severity:'high',expected:'update_state',observed:'open_question',failed_checks:['interpretation']},review());
    assert.strictEqual(story.evidence.text,null);
    assert.ok(story.gaps.some(gap=>/no entry for review_not_in_catalog/.test(gap)));
    assert.match(story.observed.text,/proposed a new Question/);
  });
  await check('every catalog scenario gets a failure heading from its recorded miss, never the intended behavior',()=>{
    for(const scenario of catalog.review){
      const allowed=scenario.allowed_actions?.length?scenario.allowed_actions:[scenario.expected_action];
      const wrong=['preserve_evidence_only','open_question','update_state'].find(code=>!allowed.includes(code));
      const failed=[!allowed.includes(wrong)?'interpretation':null,(wrong==='preserve_evidence_only')===!!scenario.review_needed?'review_needed':null].filter(Boolean);
      const story=M.failureStory({scenario_id:scenario.id,severity:scenario.severity,expected:scenario.expected_action,observed:wrong,failed_checks:failed},review());
      assert.notStrictEqual(story.heading,story.title,scenario.id+': the heading is not the scenario name');
      assert.doesNotMatch(story.heading,/_/,scenario.id+': no codes in the heading: '+story.heading);
      assert.ok(story.heading.length>10,scenario.id);
    }
    for(const scenario of catalog.ask){
      const story=M.failureStory({scenario_id:scenario.id,severity:scenario.severity,failed_checks:['required_facts','grounding']},ask());
      // Two Ask scenarios keep their pre-#596 hand-written headings when the recorded miss matches them.
      if(['ask_blocker_not_omitted','ask_conflicting_evidence'].includes(scenario.id))assert.notStrictEqual(story.heading,story.title);
      else assert.strictEqual(story.heading,'The answer to “'+scenario.question.replace(/[.;]$/,'')+'” did not include a fact this scenario requires');
    }
  });
  await check('headings follow the direction of the miss',()=>{
    const unneeded=M.failureStory({scenario_id:'review_non_authoritative_opinion',severity:'high',expected:'preserve_evidence_only',observed:'open_question',failed_checks:['review_needed','interpretation']},review());
    assert.strictEqual(unneeded.heading,'An engineer’s personal opinion about human review triggered a Review it doesn’t need');
    assert.match(unneeded.observed.text,/It created a Review, which this scenario does not need\./);
    const unsafe=M.failureStory({scenario_id:'review_ambiguity_opens_question',severity:'high',expected:'open_question',observed:'update_state',failed_checks:['interpretation']},review());
    assert.strictEqual(unsafe.heading,'Support’s unconfirmed report about billing drafts led to a proposed Current State change');
    const wording=M.failureStory({scenario_id:'review_partial_question_answer',severity:'high',expected:'update_state',observed:'update_state',failed_checks:['interpretation']},review());
    assert.strictEqual(wording.heading,'Security’s approval of Slack for two channels: the Review’s wording missed the contract');
    const errored=M.failureStory({scenario_id:'review_direct_reversal',severity:'high',expected:'update_state',observed:'error',failed_checks:['review_needed','interpretation','processing']},review());
    assert.strictEqual(errored.heading,'Security’s pause of password-reset automation could not be scored');
    assert.doesNotMatch(errored.observed.text,/No Review was created/,'an error says nothing about Reviews');
    const unknown=M.failureStory({scenario_id:'review_not_in_catalog',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['review_needed']},review());
    assert.doesNotMatch(unknown.observed.text,/No Review was created/,'without the catalog the Review requirement is unknown');
    assert.strictEqual(M.failureStory({...plannedFailure,severity:'medium'},review()).severityLabel,'Scenario severity: medium');
    assert.strictEqual(M.failureStory({scenario_id:'x_unknown',failed_checks:[]},null).severityLabel,'Scenario severity: unknown');
  });
  await check('an Ask failure names the failed checks and says the answer text is not recorded',()=>{
    const story=M.failureStory({scenario_id:'ask_unknown_stays_unknown',severity:'high',expected:'Grounded answer that preserves uncertainty, open items, and decision authority',observed:'Failed checks: uncertainty, open_item',failed_checks:['uncertainty','open_item']},ask());
    assert.strictEqual(story.evidence.lead,'Question asked');
    // Narrowed (Nov 2) to what the phrase-matching scorer checks: wording, not meaning.
    assert.match(story.observed.text,/did not use wording that marks something as unknown; it did not use wording that points to an open item/);
    assert.strictEqual(story.heading,'The answer to “What percentage of tickets will be fully autonomous?” did not use wording that marks something as unknown');
    assert.ok(story.gaps.some(gap=>/answer text is not recorded/.test(gap)));
    assert.match(story.consequence.text,/Ask is read-only/);
  });
  await check('a scenario-specific explanation is used only when the recorded miss is the one it describes',()=>{
    const matching=M.failureStory({scenario_id:'review_partial_reversal',severity:'high',expected:'update_state',observed:'preserve_evidence_only',failed_checks:['interpretation']},review());
    assert.match(matching.observed.text,/kept this as Evidence/);
    const different=M.failureStory({scenario_id:'review_partial_reversal',severity:'high',expected:'update_state',observed:'open_question',failed_checks:['interpretation']},review());
    assert.doesNotMatch(different.observed.text,/kept this as Evidence/,'the drafted text would misdescribe this run');
    assert.match(different.observed.text,/proposed a new Question/);
  });
  await check('the targeted investigation is built from recorded evidence and says so',()=>{
    const data=stateData({quality:{...quality(),contractUpdatedAt:'2026-10-30T00:00:00Z'}});
    const investigation=M.qualityInvestigation(data,plannedFailure.scenario_id);
    for(const heading of ['Evidence','Observed behavior','Expected behavior','Not recorded','Consequence','Recommended next action'])assert.match(investigation.report,new RegExp('\\n'+heading+'\\n'));
    assert.strictEqual(investigation.qualityInvestigation,true);
    assert.match(M.investigationResultHtml(investigation),/No extra model call was made/);
  });

  // ---- #597: provenance during refresh ----
  await check('cached results while refreshing are previous results with their recorded time',()=>{
    const data=stateData({quality:quality(),qualityCheckedAt:'2026-11-02T23:00:00Z'});
    data.pending.add('Quality');
    const p=M.qualityProvenance(data);
    assert.deepStrictEqual([p.status,p.previous,p.label],['refreshing',true,'Previous results']);
    assert.match(p.detail,/^Previous AI eval results, recorded .* · checking for newer results…$/);
    assert.doesNotMatch(p.detail,/just now/);
  });
  await check('a successful refresh shows current results',()=>{
    const p=M.qualityProvenance(stateData({quality:quality(),qualityCheckedAt:new Date().toISOString()}));
    assert.deepStrictEqual([p.status,p.previous],['current',false]);
    assert.match(p.label,/^Recorded /);
  });
  await check('a failed refresh keeps the previous results and says it failed',()=>{
    const data=stateData({quality:quality(),qualityCheckedAt:'2026-11-01T10:00:00Z'});
    data.failures.push({label:'Quality',reason:'server error 502',status:502});
    const p=M.qualityProvenance(data);
    assert.deepStrictEqual([p.status,p.previous],['stale',true]);
    assert.match(p.detail,/Couldn’t refresh the AI eval results \(server error 502\)\. Showing previous results, recorded .*; last loaded/);
    assert.strictEqual(M.stateMetricCards(data.quality)[0].display,'15 of 16','the previous numbers stay');
  });
  await check('a first visit shows no numbers while loading, and no fake zero when loading fails',()=>{
    const loading=M.hydrateProjectData(M.PROJECTS[0],null);
    assert.strictEqual(M.qualityProvenance(loading).status,'loading');
    const cards=M.stateMetricCards(loading.quality,'Loading…');
    assert.ok(cards.every(card=>card.score==null&&card.display==null&&card.kind==='unknown'&&card.signal==='Loading…'));
    const failed=stateData();
    failed.failures.push({label:'Quality',reason:'request timed out'});
    assert.strictEqual(M.qualityProvenance(failed).status,'unavailable');
    assert.notStrictEqual(M.qualityAttention(failed.quality).kind,'good');
  });
  await check('qualityCheckedAt survives the saved snapshot',()=>{
    const saved=M.serializeProjectData(stateData({quality:quality(),qualityCheckedAt:'2026-11-02T23:00:00Z'}));
    assert.strictEqual(M.hydrateProjectData(M.PROJECTS[0],saved).qualityCheckedAt,'2026-11-02T23:00:00Z');
  });

  // ---- #597 (Nov 2): refresh attempt versus recorded result ----
  await check('the status line describes the refresh attempt: refreshed, partly refreshed or failed, never "Updated just now"',()=>{
    const at='2026-11-02T23:10:00Z';
    const ok=M.refreshStatus([{project:{name:'State'},timings:{Delivery:1,Quality:1},failures:[]}],at);
    assert.deepStrictEqual([ok.kind,ok.title,ok.detail],['refreshed','Refreshed '+M.fmtDate(at),'']);
    const partial=M.refreshStatus([{project:{name:'State'},timings:{Delivery:1,Quality:1},failures:[{label:'Quality',reason:'server error 500'}]}],at);
    assert.strictEqual(partial.kind,'partial');
    assert.strictEqual(partial.title,'Partly refreshed '+M.fmtDate(at));
    assert.strictEqual(partial.detail,'Couldn’t refresh: State quality.');
    const failed=M.refreshStatus([{project:{name:'State'},timings:{Delivery:1,Quality:1},failures:[{label:'Delivery'},{label:'Quality'}]}],at);
    assert.deepStrictEqual([failed.kind,failed.title],['failed','Refresh failed '+M.fmtDate(at)]);
    for(const result of [ok,partial,failed])assert.doesNotMatch(result.title+result.detail,/Updated|just now/);
  });
  await check('a re-fetched or retained eval keeps its run time; the fetch time is never shown as the recorded time',()=>{
    const runAt='2026-11-02 22:50:28';
    const refetched=stateData({quality:quality(),qualityCheckedAt:new Date().toISOString(),checkedAt:new Date().toISOString()});
    assert.strictEqual(M.qualityProvenance(refetched).resultAt,runAt,'a successful re-fetch of the same run keeps the run time');
    assert.strictEqual(M.qualityProvenance(refetched).label,'Recorded '+M.fmtDate(runAt));
    const fresh=M.sectionFreshness(refetched,['Quality'],runAt,{noun:'Recorded',staleHours:100000});
    assert.match(fresh.label,/^Recorded /);
    const retained=stateData({quality:quality(),checkedAt:new Date().toISOString()});
    retained.failures.push({label:'Quality',reason:'server error 500'});
    const kept=M.sectionFreshness(retained,['Quality'],runAt,{noun:'Recorded'});
    assert.deepStrictEqual([kept.label,kept.stale,kept.retained],['Couldn’t refresh · showing retained data from '+M.fmtDate(runAt),true,true]);
    const nothing=M.sectionFreshness(retained,['Quality'],null,{hasData:false});
    assert.strictEqual(nothing.label,'Couldn’t refresh','no retained data is claimed when there is none');
    assert.strictEqual(M.sectionFreshness(stateData(),['Quality'],null,{noun:'Recorded'}).label,'Recorded time unknown','no time is invented');
    const p=M.qualityProvenance({...retained,qualityCheckedAt:null});
    assert.doesNotMatch(p.detail,/last loaded/,'without a recorded successful fetch, no last-loaded time is invented');
  });

  // ---- #597: counts, grammar, comparability ----
  await check('counts and percentage agree for 0, 1 and several failures, with singular/plural grammar',()=>{
    const cases=[[1,0,'16 of 16 passed','100%',null],[0.9375,1,'15 of 16 passed','93.8%','1 high-impact AI scenario needs review'],[0.8125,3,'13 of 16 passed','81.3%','3 high-impact AI scenarios need review']];
    for(const [score,severe,label,pct,title] of cases){
      const run=review({interpretation_accuracy:score,high_severity_failures:severe,failure_details:[]});
      assert.strictEqual(M.scenarioPassLabel(run,score),label);
      assert.strictEqual(M.percent(score),pct);
      const attention=M.qualityAttention({review:run,ask:ask(),recent:[]});
      if(title)assert.strictEqual(attention.title,title);else assert.strictEqual(attention.kind,'good');
    }
    const lower=M.stateMetricCards({review:review({interpretation_accuracy:0.875,high_severity_failures:0,failure_details:[]}),ask:ask(),recent:[]})[0];
    assert.strictEqual(lower.signal,'2 lower-impact misses');
    const unattributed=M.stateMetricCards({review:review({interpretation_accuracy:0.8125,high_severity_failures:3,failure_details:[]}),ask:ask(),recent:[]})[0];
    assert.deepStrictEqual([unattributed.signal,unattributed.kind],['3 high-impact failures','bad'],'high-impact failures without details are never called lower-impact');
    assert.strictEqual(M.scenarioPassLabel(review({errors:1}),14/15),'14 of 15 passed · 1 could not be scored','errored scenarios are not counted as passed or failed');
  });
  await check('the unique-scenario note uses the loaded totals and the catalog, never a fixed 29',()=>{
    const note=M.evalScenarioCountsNote(quality());
    assert.match(note,/^29 unique scenarios: 16 update-understanding cases and 13 Ask answers\./);
    assert.match(note,/each score the same 13 answers/);
    const authority=catalog.ask.filter(item=>item.should_distinguish_proposal_from_truth).length,uncertainty=catalog.ask.filter(item=>item.should_express_uncertainty).length;
    assert.match(note,new RegExp('Decision authority is tested in '+authority+' of them and uncertainty in '+uncertainty));
    const other=M.evalScenarioCountsNote({review:review({total:10}),ask:ask({total:8})});
    assert.match(other,/^18 unique scenarios: 10 update-understanding cases and 8 Ask answers\./);
    assert.doesNotMatch(other,/Decision authority is tested/,'a run on a different scenario set is not described from this catalog');
  });
  await check('a changed scenario set or contract suppresses the point change',()=>{
    const recent=[ask(),ask({total:12,created_at:'2026-10-27 23:02:24',build:'a05878c'})];
    assert.strictEqual(M.metricChange(recent,'ask_quality','ask_grounding').status,'not-comparable');
    assert.strictEqual(M.evalTrend(recent,'ask_quality','ask_grounding'),'Not comparable with the previous run: scenario set changed (12 → 13 cases)');
    assert.strictEqual(M.mockDelta(recent,'ask_quality','ask_grounding').label,'Not comparable');
    const sameSize=[review({interpretation_accuracy:0.9375}),review({interpretation_accuracy:0.8125,created_at:'2026-10-20 10:00:00'})];
    assert.strictEqual(M.metricChange(sameSize,'review_interpretation','interpretation_accuracy').status,'ok');
    const contractMoved=M.metricChange(sameSize,'review_interpretation','interpretation_accuracy','2026-10-25T00:00:00Z');
    assert.deepStrictEqual([contractMoved.status,contractMoved.reason],['not-comparable','contract']);
    const changes=M.meaningfulChanges({project:{quality:'state'},lastVisit:{deliverySha:'same',quality:{askAt:'2026-10-27 23:02:24',askScore:1,askTotal:12},analyticsAvailable:null,openPullRequests:0},delivery:{sha:'same'},quality:{ask:ask()},platform:{},openPullRequests:[],checkedAt:'2026-11-02T23:00:00Z'});
    const item=changes.find(change=>/Answer-quality/.test(change.title));
    assert.strictEqual(item.title,'Answer-quality eval re-run on a different test');
    assert.match(item.detail,/^Not comparable with your last visit: scenario set changed \(12 → 13 cases\)/);
    const investigation=M.qualityInvestigation(stateData({quality:{...quality(),recent:[review(),review({total:13,interpretation_accuracy:1,high_severity_failures:0,created_at:'2026-10-20 10:00:00'})]}}),plannedFailure.scenario_id);
    assert.match(investigation.report,/not comparable with the previous run: scenario set changed \(13 → 16 cases\)/);
    assert.doesNotMatch(investigation.report,/declined/);
  });

  // ---- #597: the page, end to end with stub fetches ----
  const realFetch=global.fetch;
  try{
    await check('cached → loading → success: previous results are marked until the refresh lands',async()=>{
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      const {root,elements,cleanup}=stubRoot(cachedSnapshot());
      global.fetch=stubFetch({quality:async()=>{await gate;return {status:200,body:qualityPayload()};}});
      try{
        const done=H.init(root);
        const panel=()=>elements.get('qualityPanel').innerHTML;
        assert.ok(await waitFor(()=>/Previous results · checking for newer ones/.test(panel())),'while loading: '+panel().slice(0,300));
        assert.match(panel(),/eval-results is-previous/);
        assert.match(panel(),/15 of 16 scenarios passed/,'previous numbers stay visible');
        assert.match(elements.get('mockDashboardOverview').innerHTML,/quality-provenance refreshing/);
        release();
        await done;
        assert.ok(await waitFor(()=>!/is-previous/.test(panel())),'after success the results are current');
        assert.match(panel(),/1 high-impact scenario needs review/);
        assert.match(panel(),/Recorded /);
        const health=elements.get('overviewHealthPanel').innerHTML;
        assert.match(health,/<strong>AI Evals<\/strong>[\s\S]*?signal-meta ">Recorded [^<]*<\/span>/,'the quality row shows when the eval ran, not a fetch time');
        assert.doesNotMatch(health,/Updated just now/);
        assert.doesNotMatch(elements.get('status').innerHTML,/State quality(?! behavior)/,'quality refreshed, so it is not listed');
      }finally{cleanup();}
    });
    await check('cached → failed: previous results stay, marked stale, and the status names what did not refresh',async()=>{
      const {root,elements,cleanup}=stubRoot(cachedSnapshot());
      global.fetch=stubFetch({quality:async()=>({status:500,body:{detail:'State quality API request failed'}})});
      try{
        await H.init(root);
        assert.ok(await waitFor(()=>/Previous results · couldn’t refresh/.test(elements.get('qualityPanel').innerHTML)),elements.get('qualityPanel').innerHTML.slice(0,300));
        const panel=elements.get('qualityPanel').innerHTML;
        assert.match(panel,/Couldn’t refresh the AI eval results \(server error 500\)/);
        assert.match(panel,/15 of 16 scenarios passed/);
        assert.match(panel,/eval-results is-previous/);
        assert.match(elements.get('mockDashboardOverview').innerHTML,/quality-provenance stale/);
        assert.match(elements.get('overviewHealthPanel').innerHTML,/Couldn’t refresh · showing retained data from /,'the Overview quality row says its data is retained');
        // Nov 2 timestamp fix: this expectation used to require "Updated just now" beside "Couldn’t refresh", the pairing
        // Paige flagged as misleading. The status line now describes the refresh attempt itself.
        assert.match(elements.get('status').innerHTML,/^<strong>Partly refreshed [^<]+<\/strong> · Couldn’t refresh: /);
        assert.doesNotMatch(elements.get('status').innerHTML,/Updated just now/);
      }finally{cleanup();}
    });
    await check('first load without a cache: no numbers while loading, an error (not "no evals") when it fails',async()=>{
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      const {root,elements,cleanup}=stubRoot(null);
      global.fetch=stubFetch({quality:async()=>{await gate;return {status:504,body:{detail:'State quality API is still waking up'}};}});
      try{
        const done=H.init(root);
        const panel=()=>elements.get('qualityPanel').innerHTML;
        assert.ok(await waitFor(()=>/Checking the latest recorded AI eval results/.test(panel())));
        const kpiValues=()=>[...elements.get('mockDashboardOverview').innerHTML.matchAll(/class="mock-kpi-value">([^<]*)</g)].map(match=>match[1]);
        assert.ok(kpiValues().length&&kpiValues().every(value=>value==='—'),'no score before results load: '+kpiValues());
        release();
        await done;
        assert.ok(await waitFor(()=>/Couldn’t load AI eval results/.test(panel())),panel().slice(0,300));
        assert.ok(kpiValues().every(value=>value==='—'),'no score after a failed first load: '+kpiValues());
        assert.doesNotMatch(panel(),/No recorded AI eval yet|AI evals are healthy|\d+ of \d+/);
      }finally{cleanup();}
    });
    await check('the AI Evals failure item puts identifiers in an expandable detail with working links',async()=>{
      const {root,elements,cleanup}=stubRoot(null);
      global.fetch=stubFetch({quality:async()=>({status:200,body:qualityPayload()})});
      try{
        await H.init(root);
        assert.ok(await waitFor(()=>/Failures requiring review/.test(elements.get('qualityPanel').innerHTML)));
        const panel=elements.get('qualityPanel').innerHTML;
        const visible=panel.split('<details class="failure-technical">')[0];
        for(const heading of ['Evidence','Observed behavior','Expected behavior','Consequence','Next step'])assert.match(panel,new RegExp('<strong>'+heading+'</strong>'));
        assert.doesNotMatch(visible.replace(/data-[a-z-]+="[^"]*"|id="[^"]*"/g,''),/review_planned_action_not_stated_as_done/,'the ID is not in the reading text');
        assert.match(panel,/<summary>Technical details<\/summary>[\s\S]*review_planned_action_not_stated_as_done/);
        assert.match(panel,/blob\/b22a14e38ba69f30e82ed8da952efb8d3273ade3\/state-project-complete\/eval\/review_interpretation_scenarios\.py/);
        assert.match(panel,/state-evals\?failure=review_planned_action_not_stated_as_done/);
        // Nov 2 refinement: severity is labelled as the scenario's, the heading names the miss, details start collapsed.
        assert.match(panel,/<span class="severity-chip high"[^>]*>Scenario severity: high<\/span>/);
        assert.doesNotMatch(panel,/High impact</);
        assert.match(panel,/<h4>An agreed revision plan didn’t trigger a Review<\/h4><p class="failure-scenario">Scenario: An agreed plan is not recorded as already done<\/p>/);
        assert.match(panel,/<details class="failure-contract"><summary>Contract details<\/summary>[\s\S]*Also acceptable[\s\S]*must not say[\s\S]*Contract note:/);
        const reading=panel.split('<details class="failure-contract">')[0];
        assert.doesNotMatch(reading,/Also acceptable|must not say|Contract note/,'contract rules are not in the visible text');
        assert.doesNotMatch(panel,/<details[^>]* open/,'details start collapsed');
        assert.match(panel,/Observed behavior<\/strong><div>[\s\S]*?From the run record\./);
        assert.match(panel,/Expected behavior<\/strong><div>[\s\S]*?From the scenario catalog\./);
        assert.match(panel,/<strong>Not recorded<\/strong>/);
        assert.match(panel,/No model was called/);
        assert.match(panel,/29 unique scenarios/);
      }finally{cleanup();}
    });
  }finally{global.fetch=realFetch;}

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
