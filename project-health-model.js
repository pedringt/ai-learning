(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.PROJECT_HEALTH_MODEL=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Project Health's data and pure analysis (#452): project list, environment rules, and the functions that
  // turn GitHub/Vercel/eval payloads into health signals. No DOM, no network, no mutable state.
  // The page (project-health.js) renders these; keep anything that touches the DOM or fetches out of here.
  // The controlled-eval scenario catalog (#596): required under Node, a global from state-eval-catalog.js in the page.
  const EVAL_CATALOG=(typeof module==='object'&&module.exports&&typeof require==='function')?(()=>{try{return require('./state-eval-catalog.js');}catch(_){return null;}})():null;

  const PROJECTS=[
    {
      id:'state',name:'State',evalCheckNames:['quality','walkthrough'],description:'Human-reviewed project truth system with maintained Current State.',repo:'pedringt/ai-learning',branch:'main',stagingBranch:'staging',quality:'state',releasePaths:['implementation-context-prototype','state-project-complete'],releaseIgnore:/project health|dashboard|assertion/i,// What the controlled evals measure (Oct 27 smoke test: #566 changed ask_authority_text.py, which the old three-file
      // list missed, and the dashboard called the Oct 26 scores current). These are the modules the eval harness runs,
      // traced from its imports and stopping at infrastructure; test_project_health_eval_paths.py fails if the trace and
      // this list drift apart. Contract paths are the scenarios and graders: a change there means the scores were
      // measured against a different test, not that State behaves differently.
      evalBehaviorPaths:['state-project-complete/question_review_prompt.py','state-project-complete/question_review_service.py','state-project-complete/review_service.py','state-project-complete/interpretation_trace.py','state-project-complete/interpretation_pipeline_integrated.py','state-project-complete/interpretation_runtime','state-project-complete/consequentiality_guidance.py','state-project-complete/extension_points.py','state-project-complete/ask_service.py','state-project-complete/ask_provider.py','state-project-complete/ask_authority_text.py','state-project-complete/ask_claims.py','state-project-complete/ask_assertions.py','state-project-complete/ask_drafts.py','state-project-complete/ask_display.py','state-project-complete/ask_contract.py','state-project-complete/ask_refinement_transforms.py','state-project-complete/anthropic_provider.py','state-project-complete/model_request_options.py','state-project-complete/provider_json.py','state-project-complete/provider_output_schema.py'],
      evalContractPaths:['state-project-complete/eval/quality_harness.py','state-project-complete/eval/ask_quality_scenarios.py','state-project-complete/eval/review_interpretation_scenarios.py','state-project-complete/eval/ask_grader.py'],
      // Paige, Oct 27: State's AI calls are judged against a 15 s p95; above it the speed signal reads Watch.
      responseTargetP95Ms:15000,
      focus:'Keep project truth trustworthy without giving AI authority to change Current State on its own.',
      evidence:['Understands updates','Answers stay grounded','Respects decision authority','Review burden'],
      nextDecision:'Expand failure investigation only if it stays useful without weakening human control.',
      nextReview:'After the next recorded AI quality check.',
      owner:'Product',
      qualityLabel:'AI Evals',
      links:{
        live:'https://state.contextswitch.tech',
        vercel:'https://vercel.com/cairn10/state',
        renderProduction:'https://dashboard.render.com/web/srv-dabogoajnfac73dp7h1g',
        neon:'https://console.neon.tech',
        quality:'https://www.contextswitch.tech/state-evals'
      }
    },
    {
      id:'tastemake',name:'Tastemake',description:'Taste-learning recommendation product built around preference discovery.',repo:'pedringt/tastemake',branch:'main',
      focus:'Improve recommendation variety without weakening relevance or grounding.',
      evidence:['Recommendation breadth','Irrelevant suggestions','Validator catches','Repeat engagement'],
      nextDecision:'Decide whether the canonical store improves recommendation quality enough to expand further.',
      nextReview:'After the next recommendation-quality pass.',
      owner:'Product',
      qualityLabel:'Recommendation Quality',
      links:{
        live:'https://tastemake.vercel.app',
        vercel:'https://vercel.com/cairn10/tastemake',
        neon:'https://console.neon.tech',
        quality:'https://github.com/pedringt/tastemake/actions/workflows/test.yml'
      }
    },
    {
      id:'narc',name:'NARC',stageLabel:'In progress',noRuntimeAi:true,description:'Workplace-surveillance satire game with branching consequences.',repo:'pedringt/narc',branch:'main',
      focus:'Make the first playthrough feel like a coherent workplace simulation rather than a stack of mechanics.',
      evidence:['First-run playtest','Branch consistency','Confusing choices','Replayable endings'],
      nextDecision:'Decide whether the first-play flow is clear enough before adding more branches and mechanics.',
      nextReview:'After the full first-run playtest.',
      owner:'Product',
      qualityLabel:'Game Quality',
      links:{
        live:'https://narc-opal.vercel.app',
        vercel:'https://vercel.com/cairn10/narc',
        quality:'https://github.com/pedringt/narc/actions/workflows/quality-checks.yml'
      }
    },
    {
      id:'authority-lab',name:'Authority Lab',stageLabel:'In progress',noRuntimeAi:true,unmeasuredQuality:['the full lifecycle walkthrough'],description:'Prototype for deciding what an AI capability is allowed to do, based on evidence.',repo:'pedringt/authority-lab',branch:'main',
      focus:'Show authority as explicit, evidence-earned, conditional, reversible, and authorized by a named person.',
      evidence:['Lifecycle walkthrough','Authority decisions','Record history','Reversibility'],
      nextDecision:'Decide whether the Refund recommendation walkthrough is clear enough to add a second capability.',
      nextReview:'After the next full lifecycle walkthrough.',
      owner:'Product',
      qualityLabel:'Prototype Quality',
      links:{
        live:'https://authority-lab.vercel.app',
        vercel:'https://vercel.com/cairn10/authority-lab',
        quality:'https://github.com/pedringt/authority-lab/actions/workflows/test.yml'
      }
    }
  ];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function shortSha(sha){return sha?String(sha).slice(0,7):'Unknown';}
  function commitTitle(message){
    const sections=String(message||'').split(/\r?\n\s*\r?\n/).map(section=>section.trim()).filter(Boolean);
    const first=sections[0]?.split(/\r?\n/)[0]?.trim()||'';
    if(/^Merge pull request #\d+ from /i.test(first)||/^Merge (remote-tracking branch |branch )?\S+ into \S+/i.test(first)){
      // A hand-written merge like "Merge ph-gap-count into staging (Observability gap count)" keeps
      // its readable part in the parentheses; branch names alone are not a release name.
      const described=first.match(/^Merge (?:remote-tracking branch |branch )?\S+ into \S+.*?\(([^()]+)\)$/i)?.[1]?.trim();
      return described||sections[1]?.split(/\r?\n/)[0]?.trim()||'Change title unavailable';
    }
    return first||'Change title unavailable';
  }
  function repoUrl(repo){return 'https://github.com/'+repo;}
  function githubCommitUrl(repo,sha){return /^[0-9a-f]{7,40}$/i.test(String(sha||''))?repoUrl(repo)+'/commit/'+encodeURIComponent(sha):null;}
  function pullRequestNumber(message){
    const first=String(message||'').split(/\r?\n/)[0]||'';
    const merge=first.match(/^Merge pull request #(\d+) from /i);
    const squash=first.match(/\(#(\d+)\)$/);
    return merge?.[1]||squash?.[1]||null;
  }
  function githubPullRequestUrl(repo,number){return /^\d+$/.test(String(number||''))?repoUrl(repo)+'/pull/'+number:null;}
  function githubLink(label,url){return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':esc(label);}
  function changeUrl(repo,delivery){return githubPullRequestUrl(repo,pullRequestNumber(delivery?.message))||githubCommitUrl(repo,delivery?.sha);}
  function commitLabel(repo,sha){return githubLink(shortSha(sha),githubCommitUrl(repo,sha));}
  function htmlRow(label,value){return '<div class="row"><span>'+esc(label)+'</span><span>'+value+'</span></div>';}
  function linkedRow(label,value,url){return htmlRow(label,githubLink(value,url));}
  function githubApi(path){return 'https://api.github.com'+path;}

  function vercelFromStatus(status){
    const statuses=Array.isArray(status?.statuses)?status.statuses:[];
    const matches=statuses.filter(item=>/vercel/i.test(String(item.context||'')));
    if(!matches.length) return {kind:'unknown',label:'No Vercel status found',contexts:[]};
    if(matches.some(item=>['failure','error'].includes(item.state))) return {kind:'bad',label:'Vercel deploy failed',contexts:matches};
    if(matches.some(item=>item.state==='pending')) return {kind:'warn',label:'Vercel deploy pending',contexts:matches};
    if(matches.every(item=>item.state==='success')) return {kind:'good',label:'Vercel deploy healthy',contexts:matches};
    return {kind:'unknown',label:'Vercel status unclear',contexts:matches};
  }

  // A check counts by its latest run only (a later green re-run clears an earlier failure), and a
  // project's eval jobs (evalCheckNames) are quality evidence shown elsewhere, never a release check.
  function currentCheckRuns(checkRuns,evalCheckNames=[]){
    const latest=new Map();
    for(const item of Array.isArray(checkRuns?.check_runs)?checkRuns.check_runs:[]){
      const name=String(item?.name||'');
      if(evalCheckNames.includes(name))continue;
      const when=Date.parse(item.completed_at||item.started_at||'')||0;
      const seen=latest.get(name);
      if(!seen||when>=seen.when)latest.set(name,{when,item});
    }
    return [...latest.values()].map(entry=>entry.item);
  }
  function deliveryHealth(branch,status,checkRuns,project){
    const commit=branch?.commit||{};
    const failedChecks=currentCheckRuns(checkRuns,project?.evalCheckNames)
      .filter(item=>['failure','timed_out','action_required','startup_failure'].includes(String(item.conclusion||'').toLowerCase()))
      .slice(0,10)
      .map(item=>({name:String(item.name||'Failed check').slice(0,120),conclusion:String(item.conclusion||'').slice(0,40),title:String(item.output?.title||'').slice(0,160),url:/^https:\/\/github\.com\//.test(String(item.html_url||item.details_url||''))?(item.html_url||item.details_url):null}));
    return {branch:branch?.name||'Unknown',sha:commit.sha||null,vercel:vercelFromStatus(status),failedChecks,updatedAt:commit.commit?.committer?.date||commit.commit?.author?.date||null,message:commit.commit?.message||''};
  }

  function normalizeQuality(payload){
    const live=payload?.live_review_quality||{},controlled=payload?.controlled_evals||{};
    return {resolvedReviews:Number(live.resolved_reviews||0),acceptedAsProposedRate:live.accepted_as_proposed_rate,materialEditRate:live.material_edit_rate,review:controlled.latest_review_interpretation||null,ask:controlled.latest_ask_quality||null,recent:Array.isArray(controlled.recent)?controlled.recent:[]};
  }
  function percent(v){return v==null||Number.isNaN(Number(v))?'Not measured':(Math.round(Number(v)*1000)/10)+'%';}
  // Severity belongs to the scenario, not to what this run's failure did (#596): "1 failure in a high-severity scenario".
  function highSeverityFailureText(value){const n=Number(value||0);return n===1?'1 failure in a high-severity scenario':n+' failures in high-severity scenarios';}
  function modelDisplayName(value){
    const raw=String(value||'');
    if(raw==='claude-haiku-4-5-20251001')return'Claude Haiku 4.5';
    if(raw==='claude-haiku-5-5')return'Claude Haiku 5.5';
    return raw||'Model unavailable';
  }
  // A failed Quality refresh with no previously loaded runs is unavailable evidence, not a finding (Paige, Nov 3): a saved
  // empty response is historical only and never reads as "no runs exist now". Previously loaded runs are still assessed.
  const QUALITY_UNAVAILABLE={kind:'unknown',unavailable:true,title:'AI eval results couldn’t be loaded',detail:'Project Health couldn’t reach State’s quality data, so it can’t say whether evals have been recorded, passed or failed.'};
  function qualityAttention(q,data){
    const runs=[q?.review,q?.ask].filter(Boolean);
    if(!runs.length&&signalRefreshFailure(data,['Quality'])) return QUALITY_UNAVAILABLE;
    if(!q) return {kind:'unknown',title:'Quality data is not available yet',detail:'Project Health could not load a recent quality result.'};
    if(!runs.length) return {kind:'warn',noRuns:true,title:'AI evals have not been recorded yet',detail:'Run the controlled checks to see how State handles understanding, evidence, uncertainty, and decision authority.'};
    if(stateEvalResultsStale(q)) return {kind:'warn',title:'AI evals need to be rerun',detail:stateEvalStaleReason(q)+' Historical failures are not treated as current product failures.',nextAction:'Run the controlled AI evals again.',owner:'Product'};
    const severe=runs.reduce((n,r)=>n+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:(severe===1?'1 failure in a high-severity AI scenario needs':severe+' failures in high-severity AI scenarios need')+' review',detail:'Most aggregate quality signals may still look healthy; review the specific failed scenario'+(severe===1?'':'s')+' before deciding whether product behavior or the eval contract should change.',nextAction:'Review the failed scenario evidence and decide whether product behavior or the eval contract is wrong.',owner:'Product'};
    if(runs.some(r=>{const score=evalScore(r);return Number(r.failed_cases||0)>0||(score!=null&&score<1);})) return {kind:'warn',scenarioMiss:true,title:'Some AI evals need a look',detail:'At least one controlled scenario did not behave as expected.',nextAction:'Review the scenario-level miss, then rerun the affected suite.',owner:'Product'};
    const missing=[];
    if(!q.review||evalScore(q.review)==null) missing.push('update understanding');
    if(!q.ask||(q.ask.ask_grounding??evalScore(q.ask))==null) missing.push('answer quality');
    if(q.ask?.authority_accuracy==null) missing.push('decision authority');
    if(q.ask?.uncertainty_accuracy==null) missing.push('uncertainty handling');
    if(missing.length) return {kind:'warn',title:'Some AI quality signals are not measured',detail:'Project Health cannot call State quality healthy while '+missing.join(', ')+' '+(missing.length===1?'is':'are')+' unmeasured.',nextAction:'Run or repair the missing controlled quality checks before treating the quality signal as healthy.',owner:'Product'};
    return {kind:'good',title:'AI evals are healthy',detail:'The latest recorded checks reported no failures in high-severity scenarios.'};
  }
  function deliveryAttention(d){
    if(!d) return {kind:'warn',title:'Delivery status is unavailable',detail:'Project Health could not confirm the latest release status.'};
    if(d.vercel.kind==='bad') return {kind:'bad',title:'The latest version did not deploy',detail:'The existing production version should still be available while engineering reviews the failed release.'};
    // The deploy and its checks are separate signals: a check can fail on a commit that deployed fine (Oct 20:
    // a staging Deep QA run on main's tip showed as "did not deploy" next to "Vercel deploy healthy").
    if(Array.isArray(d.failedChecks)&&d.failedChecks.length){
      const names=[...new Set(d.failedChecks.map(item=>item.name))];
      const deployed=d.vercel.kind==='good';
      return {kind:'bad',checkFailed:true,title:'A release check failed',detail:(deployed?'This change deployed, but ':'')+(names.length===1?'the "'+names[0]+'" check':names.length+' checks ('+names.join(', ')+')')+' failed on it. Rerun or explain '+(names.length===1?'that check':'those checks')+' before trusting the change.'};
    }
    if(d.vercel.kind==='warn') return {kind:'warn',title:'A deployment is still finishing',detail:'No action is needed unless it stays pending longer than expected.'};
    if(d.vercel.kind==='good') return {kind:'good',title:'Delivery is healthy',detail:'The latest release completed successfully.'};
    return {kind:'warn',title:'Deployment status is not connected',detail:'Project Health can see the latest change but cannot confirm its Vercel result.'};
  }
  function deliveryAttentionForData(data){
    const fallback=deliveryAttention(data?.delivery);
    const activity=data?.activity;
    if(!activity?.available) return fallback;
    const liveDeployment=activityReviewItems(data).find(item=>item.kind==='deployment'&&!item.resolved);
    if(liveDeployment) return {kind:'bad',title:liveDeployment.title,detail:liveDeployment.impact};
    if(fallback.kind==='bad'&&data?.delivery?.vercel?.kind==='bad'){
      return {
        kind:'good',
        title:'No active production release failure',
        detail:'The failed Vercel status belongs to a preview or superseded attempt. Current production deployment history has no unresolved release failure.'
      };
    }
    return fallback;
  }

  function infrastructureAttention(platform){
    const render=platform?.render;
    if(render?.configured){
      const production=render.environments?.production;
      if(production&&!production.ok) return {kind:'bad',title:'Production service is unavailable',detail:'Users may be affected because the production backend is not responding successfully.'};
    }
    const neon=platform?.neon;
    if(neon?.configured&&neon.available===false) return {kind:'warn',title:'Database health could not be checked',detail:'This is a monitoring gap unless there is another sign of user impact.'};
    return null;
  }
  function externalQualityAttention(q){
    if(!q) return null;
    const items=Array.isArray(q.attention)?q.attention:[];
    if(!items.length) return {kind:'unknown',title:'Quality status unavailable',detail:'No project-specific quality signal was returned.'};
    const priority={bad:3,warn:2,unknown:1,good:0};
    return [...items].sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  }
  function pendingSet(data){return data?.pending instanceof Set?data.pending:new Set();}
  // The signals a project's status pill is built from. Deployment activity and run controls are detail:
  // a project waiting only on them has a known core status (Cowork, Oct 12: one slow activity call held
  // the whole page at "Refreshing 0 of 4").
  const STATUS_SIGNALS=['Delivery','Quality','Production backend','Quality behavior'];
  function coreStatusKnown(data){
    if(!data?.fresh)return false;
    const pending=pendingSet(data);
    return !STATUS_SIGNALS.some(label=>pending.has(label));
  }
  function activityStillLoading(data){return pendingSet(data).has('Activity');}
  function productOpenItems(data){
    const items=[],pending=pendingSet(data);
    if(!data?.project||pending.has('Quality')) return items;
    if(data.project.quality==='state'){
      if(!data.quality&&!data.fresh)return items;
      const q=qualityAttention(data.quality,data);
      if(['bad','warn'].includes(q.kind)){
        const noRecordedRuns=![data.quality?.review,data.quality?.ask].filter(Boolean).length;
        const staleResults=stateEvalResultsStale(data.quality);
        items.push({...q,category:'quality',action:noRecordedRuns||staleResults?'run-ai-checks':'review-ai-evals',owner:q.owner||'Product',nextAction:q.nextAction||(noRecordedRuns||staleResults?'Run the controlled AI evals.':'Review the failed scenario evidence.')});
      }
    }else{
      if(!data.externalQuality&&!data.fresh)return items;
      const q=externalQualityAttention(data.externalQuality);
      if(q&&['bad','warn'].includes(q.kind)) items.push({...q,category:'quality',action:'review-quality',owner:'Product',nextAction:'Review the project-specific quality evidence.'});
    }
    return items;
  }
  // A signal that failed to load is unknown, never healthy (QA, Oct 10): a timeout or a 404 on a signal the
  // project is supposed to have must not roll up into "Healthy". Signals a project has no source for by design
  // (Authority Lab's quality checks and run controls) are never requested, so they never land here.
  const CORE_SIGNALS={
    Delivery:()=>'Release pipeline',
    Quality:project=>project?.qualityLabel||'Quality',
    'Production backend':()=>'Production backend',
    Activity:()=>'Deployment activity',
    'Quality behavior':()=>'AI eval freshness'
  };
  function failureReason(error){
    const status=Number(error?.status)||0;
    if(error?.name==='AbortError'||error?.name==='TimeoutError'||/abort|timed? ?out/i.test(String(error?.message||'')))return 'request timed out';
    if(status===404)return 'not found';
    if(status===403||status===429)return 'rate limited or denied';
    if(status>=500)return 'server error '+status;
    if(status)return 'request failed ('+status+')';
    return 'request failed';
  }
  function uncheckedSignals(data){
    const pending=pendingSet(data),seen=new Set(),out=[];
    for(const failure of Array.isArray(data?.failures)?data.failures:[]){
      const name=CORE_SIGNALS[failure?.label];
      if(!name||pending.has(failure.label)||seen.has(failure.label))continue;
      seen.add(failure.label);
      out.push({key:failure.label,label:name(data?.project),reason:failure.reason||'request failed'});
    }
    return out;
  }
  function incompleteAttention(unchecked){
    const list=unchecked.map(item=>item.label+' ('+item.reason+')').join(', ');
    return {kind:'unknown',incomplete:true,category:'incomplete',title:"Couldn't check: "+list,detail:'Project Health could not load '+(unchecked.length===1?'this signal':'these signals')+', so it cannot call this project healthy.',owner:'Project Health',nextAction:'Retry the check; if it keeps failing, the data source needs a look.',unchecked};
  }
  function allAttentionSignals(data){
    const pending=pendingSet(data),signals=[];
    if(data.delivery) signals.push(deliveryAttentionForData(data));
    else if(data.fresh&&!pending.has('Delivery')) signals.push(deliveryAttentionForData(data));
    if(data.quality) signals.push(qualityAttention(data.quality,data));
    const external=externalQualityAttention(data.externalQuality);if(external) signals.push(external);
    const infra=infrastructureAttention(data.platform);if(infra) signals.push(infra);
    return signals;
  }
  function overallAttention(data){
    const pending=pendingSet(data);
    if(STATUS_SIGNALS.some(label=>pending.has(label))) return {kind:'unknown',title:'Checking project health',detail:'Core signals are still loading.'};
    const liveIncidents=activityReviewItems(data).filter(item=>!item.resolved);
    if(liveIncidents.length) return {kind:'bad',title:liveIncidents[0].title,detail:liveIncidents[0].impact};
    let quality=productOpenItems(data);
    if(!data?.project&&data?.quality){
      const fallback=qualityAttention(data.quality,data);
      if(['bad','warn'].includes(fallback.kind)) quality=[fallback];
    }
    if(!data?.project&&data?.externalQuality){
      const fallback=externalQualityAttention(data.externalQuality);
      if(fallback&&['bad','warn'].includes(fallback.kind)) quality=[fallback];
    }
    if(quality.some(item=>item.kind==='bad')) return quality.find(item=>item.kind==='bad');
    if(quality.length) return quality[0];
    const delivery=deliveryAttentionForData(data);
    if(delivery.kind==='bad') return delivery;
    const infra=infrastructureAttention(data.platform);
    if(infra?.kind==='bad') return infra;
    const unchecked=uncheckedSignals(data);
    if(unchecked.length) return incompleteAttention(unchecked);
    if(qualityNotMeasured(data)) return {kind:'good',qualityNotMeasured:true,title:QUALITY_NOT_MEASURED_LABEL,detail:QUALITY_NOT_MEASURED_DETAIL};
    const unmeasured=unmeasuredQuality(data);
    if(unmeasured.length) return {kind:'good',qualityNotMeasured:true,partialQuality:true,title:PARTLY_MEASURED_LABEL,detail:'No delivery, runtime, or measured-quality problems. '+unmeasuredText(unmeasured)};
    return {kind:'good',title:'Healthy',detail:'No current incident or product-quality action needs attention.'};
  }
  // A project with no quality source by design (Authority Lab) can be fine on delivery and runtime, but Project Health
  // must not hide the missing signal (Cowork, Oct 11): it never gets the plain "Healthy" headline or pill. This is not
  // "Incomplete", which means a signal we do request failed to load.
  const QUALITY_NOT_MEASURED_LABEL='Healthy · quality not measured';
  const QUALITY_NOT_MEASURED_DETAIL='No delivery or runtime problems. Quality checks aren\u2019t connected for this project.';
  // Paige, Oct 27: plain "Healthy" needs the project's product quality to be measured. A project lists the quality areas
  // no check covers (unmeasuredQuality in PROJECTS); while any remain it reads "Healthy on what's measured". Platform
  // gaps such as server-error history stay under "What we cannot confirm" and do not block the label.
  const PARTLY_MEASURED_LABEL='Healthy on what\u2019s measured';
  function unmeasuredQuality(data){return Array.isArray(data?.project?.unmeasuredQuality)?data.project.unmeasuredQuality.filter(Boolean):[];}
  function unmeasuredText(list){return 'Not measured: '+list.join(', ')+'.';}
  // The header "Investigate" only calls the server-side model for a failed deployment or release check; every other
  // path is a local, free summary. Mirrors startProjectInvestigation in project-health.js.
  function investigationUsesModel(data){
    if(!data?.project)return false;
    const liveIncident=activityReviewItems(data).find(item=>!item.resolved);
    if(liveIncident?.kind==='deployment')return true;
    if(data.project.quality==='state'&&['bad','warn'].includes(qualityAttention(data.quality,data).kind))return false;
    return deliveryAttentionForData(data).kind==='bad';
  }
  // Cowork, Oct 11: any visitor can press these, so say plainly what they cost. Visual pass, Oct 11: each note sits
  // under the button it describes (short visible text, full sentence for the tooltip and screen readers) instead of
  // one sentence under the whole row. The cooldown matches RUN_COOLDOWN_MS in api/project-health-run.js (asserted in
  // tests); the investigate endpoint has no cooldown.
  const RUN_COOLDOWN_MINUTES=10;
  function actionNotes(data){
    const run=data?.runInfo;
    const runLabel=String(run?.button_label||'Run AI evals');
    const paidRun=!!(run?.configured&&run?.can_run_here!==false&&run?.paid_model_calls);
    const paidInvestigate=investigationUsesModel(data);
    return {
      run:paidRun?{short:'Paid AI calls · 1 run per '+RUN_COOLDOWN_MINUTES+' min',full:runLabel+' makes a few small paid AI calls, is limited to one run every '+RUN_COOLDOWN_MINUTES+' minutes, and may update what this page shows.'}:null,
      investigate:paidInvestigate?{short:'Paid AI call · read-only',full:'Investigate makes a small paid AI call to summarize the failure evidence; it only reads and changes nothing.'}:null
    };
  }
  // The run API refuses a new run within RUN_COOLDOWN_MINUTES of the latest one (elapsed >= 0 and < cooldown). The page
  // knows a run start from the run GET's last_run_started_at (the same GitHub lookup the POST cooldown uses, so runs
  // started by any visitor count), when this browser started it, or from a 429's retry_after_seconds. The latest wins.
  function runCooldown(startedAt,now=Date.now()){
    const cooldownMs=RUN_COOLDOWN_MINUTES*60*1000;
    const elapsed=now-dateMs(startedAt);
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=cooldownMs)return {active:false,remainingMs:0,minutes:0,label:''};
    const remainingMs=cooldownMs-elapsed;
    const minutes=Math.ceil(remainingMs/60000);
    return {active:true,remainingMs,minutes,label:'Available in '+minutes+' min'};
  }
  function latestRunStart(data){
    const starts=[data?.runInfo?.last_run_started_at,data?.runStartedAt,data?.qualityRun?.startedAt].filter(value=>Number.isFinite(dateMs(value)));
    return starts.sort((a,b)=>dateMs(b)-dateMs(a))[0]||null;
  }
  function runCooldownFor(data,now=Date.now()){return runCooldown(latestRunStart(data),now);}
  // A 429 says how long is left; turn it into the equivalent start time so one code path handles both.
  function cooldownStartFromRetryAfter(retryAfterSeconds,now=Date.now()){
    const seconds=Number(retryAfterSeconds);
    if(!Number.isFinite(seconds)||seconds<=0)return null;
    const remaining=Math.min(seconds*1000,RUN_COOLDOWN_MINUTES*60*1000);
    return new Date(now-(RUN_COOLDOWN_MINUTES*60*1000-remaining)).toISOString();
  }
  function qualityNotMeasured(data){return !!data?.project?.noQualitySource;}
  function healthySummary(data){
    const unmeasured=unmeasuredQuality(data);
    if(!qualityNotMeasured(data)&&unmeasured.length) return {qualityNotMeasured:true,partialQuality:true,headline:'Nothing needs action in what Project Health measures.',rowTitle:PARTLY_MEASURED_LABEL,rowDetail:unmeasuredText(unmeasured),meta:'Partly measured'};
    if(qualityNotMeasured(data)) return {qualityNotMeasured:true,headline:QUALITY_NOT_MEASURED_DETAIL,rowTitle:'Quality not measured',rowDetail:'Nothing needs action, but Project Health can only confirm delivery and runtime here.',meta:'Not measured'};
    return {qualityNotMeasured:false,headline:'Everything looks healthy right now.',rowTitle:'Nothing needs attention right now',rowDetail:'No current incident or product-quality action is open.',meta:'Healthy'};
  }
  function projectStatus(data){
    const att=overallAttention(data);
    if(att.incomplete) return {key:'incomplete',label:'Incomplete',kind:'unknown'};
    if(att.kind==='unknown') return {key:'checking',label:'Checking',kind:'unknown'};
    if(att.kind==='bad') return {key:'action',label:'Needs attention',kind:'bad'};
    if(att.kind==='warn') return {key:'watch',label:'Watch',kind:'warn'};
    if(att.partialQuality) return {key:'partial',label:PARTLY_MEASURED_LABEL,shortLabel:'Partly measured',kind:'good'};
    if(att.qualityNotMeasured) return {key:'partial',label:QUALITY_NOT_MEASURED_LABEL,shortLabel:'Not measured',kind:'good'};
    return {key:'healthy',label:'Healthy',kind:'good'};
  }
  function attentionItems(data){
    const items=openAttentionItems(data);
    const unchecked=uncheckedSignals(data);
    if(!unchecked.length||items.some(item=>item.title==='Still checking'))return items;
    const incomplete=incompleteAttention(unchecked);
    return items.length===1&&items[0].kind==='good'?[incomplete]:[...items,incomplete];
  }
  function openAttentionItems(data){
    const incidents=activityReviewItems(data).filter(item=>!item.resolved).map(item=>({kind:'bad',title:item.title,detail:item.impact,owner:item.owner}));
    if(incidents.length) return incidents;
    let open=productOpenItems(data);
    if(!data?.project&&data?.quality){
      const fallback=qualityAttention(data.quality,data);
      if(['bad','warn'].includes(fallback.kind)) open=[fallback];
    }
    if(!data?.project&&data?.externalQuality){
      const fallback=externalQualityAttention(data.externalQuality);
      if(fallback&&['bad','warn'].includes(fallback.kind)) open=[fallback];
    }
    if(open.length) return open;
    const delivery=deliveryAttentionForData(data);
    if(delivery.kind==='bad') return [{...delivery,category:'delivery',owner:'Engineering',nextAction:'Open the failed deployment/check evidence and identify the first actionable cause.'}];
    const infra=infrastructureAttention(data.platform);
    if(infra&&['bad','warn'].includes(infra.kind)) return [{...infra,category:'infrastructure',owner:'Engineering',nextAction:'Verify whether this is a real service problem or a monitoring/coverage gap.'}];
    const pending=pendingSet(data);
    if(pending.size) return [{kind:'unknown',title:'Still checking',detail:'Some connected signals are still loading.'}];
    return [{kind:'good',title:'Nothing needs action right now',detail:'No current incident, product-quality action, delivery failure, or infrastructure issue is open.'}];
  }
  function setupGaps(data){
    const gaps=[],p=data.project,platform=data.platform,run=data.runInfo,ai=platform?.aiTelemetry;
    if(platform?.analytics?.configured===false) gaps.push({label:'Site analytics',detail:analyticsGapDetail(platform.analytics)});
    else if(platform?.analytics?.configured&&!platform?.analytics?.available&&!pendingSet(data).has('Analytics')) gaps.push({label:'Site analytics',detail:analyticsGapDetail(platform.analytics)});
    if(data?.activity?.available&&data.activity?.runtime){
      const runtime=data.activity.runtime;
      if(runtime.coverage==='not_monitored'){
        gaps.push({label:'Server error monitoring',detail:'Not monitored. Vercel only streams live runtime logs, so past server errors cannot be read on this plan. Log Drains (Vercel Pro) would add history.'});
      }else if(runtime.available===false){
        const status=Number(runtime.status||0);
        const detail=[401,403].includes(status)
          ?'Project Health can read deployments, but its Vercel token cannot read runtime logs.'
          :status===404
            ?'The latest deployment does not expose runtime logs through the Vercel log endpoint.'
            :'Project Health could not read runtime logs for the latest deployment.';
        gaps.push({label:'Runtime error visibility',detail});
      }else if(runtime.coverage==='partial'){
        gaps.push({label:'Runtime error visibility',detail:'The bounded Vercel log stream did not return rows before timeout. Deployment health is still known, but this runtime error scan is incomplete.'});
      }
    }
    // State's production data is SQLite on the Render disk (#508), so there is no Neon project to read; say that rather than "not connected".
    if(p.id==='state'&&!platform?.neon?.available) gaps.push({label:'Database health',detail:'Not monitored. Production data is SQLite on the Render disk, and Project Health has no health check for it. This is a monitoring gap, not a product incident.'});
    if(p.id==='state'&&run&&!run.configured) gaps.push({label:'Run AI evals',detail:'Dashboard-run setup is incomplete.'});
    if(p.id==='state'&&data?.quality){
      const evalBuilds=[data.quality.review?.build,data.quality.ask?.build]
        .map(value=>String(value||'').trim())
        .filter(value=>/^[0-9a-f]{7,40}$/i.test(value));
      const uniqueBuilds=[...new Set(evalBuilds)];
      const releaseSha=String(data?.delivery?.sha||'').trim();
      if(uniqueBuilds.length>1){
        gaps.push({label:'Eval build alignment',detail:'The latest controlled eval suites were recorded against different builds ('+uniqueBuilds.map(shortSha).join(' and ')+').'});
      }else if(uniqueBuilds.length===1&&/^[0-9a-f]{7,40}$/i.test(releaseSha)&&uniqueBuilds[0]!==releaseSha&&!Number.isFinite(dateMs(data.quality.behaviorUpdatedAt))){
        gaps.push({label:'Current release eval coverage',detail:'Latest controlled eval evidence is from build '+shortSha(uniqueBuilds[0])+', while the current scoped release is '+shortSha(releaseSha)+', and Project Health could not check whether State\u2019s AI behavior changed in between.'});
      }
    }
    if(!p.noRuntimeAi&&!pendingSet(data).has('AI operations')&&!ai?.available){
      gaps.push({label:'AI cost',detail:'Estimated model spend is not available yet.'});
      gaps.push({label:'AI response speed',detail:'Observed model response speed is not available yet.'});
    }else if(p.id==='state'&&ai?.available&&ai.cost?.partial){
      gaps.push({label:'AI cost coverage',detail:'Some recorded model calls do not have known pricing, so they are excluded from the estimate.'});
    }
    if(p.id==='state'&&ai?.available&&!(ai.workflow?.available||ai.agent_workflow?.available)){
      gaps.push({label:'Agent workflow telemetry',detail:'Tool calls, retries, loops, fallbacks, and escalations are not emitted by the current State telemetry feed.'});
    }
    return gaps;
  }
  function releaseReadiness(data){
    const incidents=activityReviewItems(data).filter(item=>!item.resolved);
    const open=productOpenItems(data);
    if(incidents.length||open.some(item=>item.kind==='bad')) return {kind:'bad',label:'Needs attention',detail:'Resolve the issue that needs attention before treating the next release as healthy.'};
    if(open.length) return {kind:'warn',label:'Watch',detail:'Delivery is healthy, but a product-quality check or human review is still open.'};
    const unchecked=uncheckedSignals(data);
    if(unchecked.length) return {kind:'unknown',label:'Incomplete',detail:incompleteAttention(unchecked).title+'. Release health cannot be confirmed.'};
    if(deliveryAttentionForData(data).kind==='good'&&!qualityNotMeasured(data)&&unmeasuredQuality(data).length)
      return {kind:'good',label:PARTLY_MEASURED_LABEL,detail:'Delivery is healthy and no quality issue needs attention in what is measured. '+unmeasuredText(unmeasuredQuality(data))};
    if(deliveryAttentionForData(data).kind==='good') return qualityNotMeasured(data)
      ?{kind:'good',label:'Healthy',detail:'Delivery is healthy. Quality checks aren\u2019t connected for this project, so quality is not measured.'}
      :{kind:'good',label:'Healthy',detail:'Delivery is healthy and no quality issue needs attention.'};
    return {kind:'unknown',label:'Unknown',detail:'There is not enough current evidence to confirm release health.'};
  }
  function regressionSignal(data){
    if(data?.project?.quality!=='state'||!data?.quality)return {kind:'unknown',title:'No comparable regression signal yet',detail:'A previous controlled eval run is needed before Project Health can identify a quality regression.'};
    const rows=Array.isArray(data.quality.recent)?data.quality.recent:[];
    const candidates=[];
    for(const suite of ['review_interpretation','ask_quality']){
      const suiteRows=rows.filter(item=>item?.suite===suite).slice().sort((a,b)=>(dateMs(b?.created_at)||0)-(dateMs(a?.created_at)||0));
      if(suiteRows.length<2)continue;
      const latest=evalScore(suiteRows[0]),previous=evalScore(suiteRows[1]);
      if(latest==null||previous==null)continue;
      const delta=Math.round((latest-previous)*1000)/10;
      candidates.push({suite,delta,latest,when:suiteRows[0].created_at});
    }
    if(!candidates.length)return {kind:'unknown',title:'No comparable regression signal yet',detail:'A previous controlled eval run is needed before Project Health can identify a quality regression.'};
    candidates.sort((a,b)=>a.delta-b.delta);
    const worst=candidates[0];
    const label=worst.suite==='review_interpretation'?'Update understanding':'Answer quality';
    if(worst.delta<0){
      const suiteRows=rows.filter(item=>item?.suite===worst.suite).slice().sort((a,b)=>(dateMs(b?.created_at)||0)-(dateMs(a?.created_at)||0));
      const latestBuild=String(suiteRows[0]?.build||'').trim(),previousBuild=String(suiteRows[1]?.build||'').trim();
      const buildContext=latestBuild&&previousBuild&&latestBuild!==previousBuild
        ?' Comparable runs used builds '+shortSha(previousBuild)+' → '+shortSha(latestBuild)+'.'
        :'';
      return {kind:'warn',title:label+' regressed '+Math.abs(worst.delta)+' points',detail:'Review the changed scenario evidence and the release or product change that preceded this run.'+buildContext,when:worst.when};
    }
    return {kind:'good',title:'No recent eval regression detected',detail:'The latest comparable controlled eval runs are stable or improved.',when:worst.when};
  }
  function recurringFailureSignal(data){
    if(data?.project?.quality!=='state'||!data?.quality)return {kind:'unknown',label:'Recurring failures',status:'Not measured',detail:'Recurring scenario failures are only available for State controlled evals.'};
    const rows=(Array.isArray(data.quality.recent)?data.quality.recent:[]).slice(0,8);
    if(rows.length<2)return {kind:'unknown',label:'Recurring failures',status:'Not enough history',detail:'At least two recorded eval runs are needed to distinguish a one-off miss from a recurring pattern.'};
    const counts=new Map();
    for(const run of rows){
      const seen=new Set();
      for(const failure of (Array.isArray(run?.failure_details)?run.failure_details:[])){
        const id=String(failure?.scenario_id||'').trim();
        if(!id||seen.has(id))continue;
        seen.add(id);
        counts.set(id,(counts.get(id)||0)+1);
      }
    }
    const recurring=[...counts.entries()].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]);
    if(!recurring.length)return {kind:'good',label:'Recurring failures',status:'No pattern',detail:'No scenario failed in more than one of the recent recorded runs.'};
    const [scenario,count]=recurring[0];
    const explanation=failureExplanation({scenario_id:scenario});
    return {kind:'warn',label:'Recurring failures',status:'Watch',detail:(explanation?.title||scenario)+' · failed in '+count+' recent runs.'};
  }
  function operationalSignals(data){
    const signals=[];
    const ai=data?.platform?.aiTelemetry;
    if(data?.project?.quality==='state'){
      const recurring=recurringFailureSignal(data);
      if(recurring.kind!=='unknown')signals.push(recurring);
    }
    if(!data?.project?.noRuntimeAi){
      const speed=ai?.response_speed;
      const sample=Number(speed?.sample_size||0);
      const p95=Number(speed?.p95_ms);
      if(ai?.available&&sample>0&&Number.isFinite(p95)){
        const previousP95=Number(data?.previousPlatform?.aiTelemetry?.response_speed?.p95_ms);
        const hasPrevious=Number.isFinite(previousP95)&&previousP95>0;
        const delta=hasPrevious?p95-previousP95:null;
        const changed=hasPrevious&&Math.abs(delta)>=1;
        const comparison=changed
          ?' · last saved '+durationLabel(previousP95)+' ('+(delta>0?'+':'')+durationLabel(Math.abs(delta))+(delta<0?' faster':' slower')+')'
          :'';
        const target=Number(data?.project?.responseTargetP95Ms);
        const hasTarget=Number.isFinite(target)&&target>0;
        const overTarget=hasTarget&&p95>target;
        const targetText=hasTarget?(overTarget?' · above the '+durationLabel(target)+' target':' · within the '+durationLabel(target)+' target'):'';
        signals.push({kind:overTarget?'warn':'available',label:'AI response speed',status:overTarget?'Watch':changed?'Changed':'Measured',detail:'p95 '+durationLabel(p95)+' across '+sample+' '+(sample===1?'recorded call':'recorded calls')+targetText+comparison+'.'});
      }
    }
    if(data?.project?.quality==='state'){
      const resolved=Number(data?.quality?.resolvedReviews||0);
      if(resolved>0){
        const edit=data?.quality?.materialEditRate;
        const detail=edit==null
          ?resolved+' human-reviewed proposals resolved.'
          :resolved+' human-reviewed proposals resolved · '+percent(edit)+' materially edited.';
        signals.push({kind:'available',label:'Human review burden',status:'Observed',detail});
      }
      const workflow=ai?.workflow||ai?.agent_workflow;
      if(workflow?.available){
        const repeated=Number(workflow.repeated_tool_calls||0),retries=Number(workflow.retries||0),fallbacks=Number(workflow.fallbacks||0);
        const kind=repeated>0||retries>0?'warn':'available';
        signals.push({kind,label:'Agent workflow',status:kind==='warn'?'Watch':'Measured',detail:[repeated+' repeated tool calls',retries+' retries',fallbacks+' fallbacks'].join(' · ')});
      }
    }
    const deploymentFailures=Array.isArray(data?.activity?.deployments?.recent_failures)?data.activity.deployments.recent_failures:[];
    if(deploymentFailures.length>=2){
      const recovered=deploymentFailures.filter(item=>item?.recovered).length;
      const lookback=Number(data?.activity?.lookback_days||7);
      signals.push({
        kind:'warn',
        label:'Release attempts',
        status:'Pattern',
        detail:deploymentFailures.length+' failed production-target deployment attempts in the last '+lookback+' days'+(recovered?' · '+recovered+' later recovered':'')+'.'
      });
    }
    if(data?.project?.quality==='state'&&data?.quality){
      const latestRuns=[data.quality.review,data.quality.ask].filter(Boolean);
      const evalErrors=latestRuns.reduce((sum,run)=>sum+Number(run?.errors||0),0);
      if(evalErrors>0){
        signals.push({kind:'warn',label:'Eval execution',status:'Watch',detail:evalErrors+' eval execution error'+(evalErrors===1?'':'s')+' recorded in the latest controlled runs. Treat these separately from product-quality failures.'});
      }
      const recent=Array.isArray(data.quality.recent)?data.quality.recent:[];
      const contextChanges=[];
      for(const suite of ['review_interpretation','ask_quality']){
        const rows=recent.filter(item=>item?.suite===suite).slice().sort((a,b)=>(dateMs(b?.created_at)||0)-(dateMs(a?.created_at)||0));
        if(rows.length<2)continue;
        const label=suite==='review_interpretation'?'Update understanding':'Answer quality';
        const latestModel=String(rows[0]?.model_identifier||'').trim();
        const previousModel=String(rows[1]?.model_identifier||'').trim();
        if(latestModel&&previousModel&&latestModel!==previousModel){
          contextChanges.push(label+' model: '+modelDisplayName(previousModel)+' → '+modelDisplayName(latestModel));
        }
        const latestProvider=String(rows[0]?.provider||'').trim();
        const previousProvider=String(rows[1]?.provider||'').trim();
        if(latestProvider&&previousProvider&&latestProvider!==previousProvider){
          contextChanges.push(label+' provider: '+previousProvider+' → '+latestProvider);
        }
        const latestTotal=Number(rows[0]?.total),previousTotal=Number(rows[1]?.total);
        if(Number.isFinite(latestTotal)&&Number.isFinite(previousTotal)&&latestTotal!==previousTotal){
          contextChanges.push(label+' scenarios: '+previousTotal+' → '+latestTotal);
        }
      }
      if(contextChanges.length){
        signals.push({kind:'available',label:'Eval context changed',status:'Context',detail:contextChanges.join(' · ')+'.'});
      }
    }
    const unresolved=(Array.isArray(data?.investigationHistory)?data.investigationHistory:[])
      .filter(item=>item?.needsAttentionAtRun&&!item?.resolvedAt)
      .sort((a,b)=>(dateMs(b?.observedAt)||0)-(dateMs(a?.observedAt)||0))[0];
    if(unresolved){
      const age=relativeAge(unresolved.observedAt);
      signals.push({kind:'warn',label:'Open investigation',status:'Open',detail:(unresolved.trigger||'Project investigation')+' · opened '+age+' · no resolution recorded yet.'});
    }
    return signals;
  }

  function healthConsistencyIssues(data){
    const issues=[];
    const open=productOpenItems(data);
    const overall=overallAttention(data);
    const readiness=releaseReadiness(data);
    if(overall.kind==='good'&&open.some(item=>['bad','warn'].includes(item.kind)))issues.push('Overall health is healthy while product-quality work is still open.');
    if(readiness.kind==='good'&&open.some(item=>item.kind==='bad'))issues.push('Release health is healthy while a product-quality issue that needs attention is open.');
    if(readiness.kind==='good'&&activityReviewItems(data).some(item=>!item.resolved))issues.push('Release health is healthy while an unresolved incident is open.');
    return issues;
  }
  function releaseRiskChecklist(data){
    const quality=data?.project?.quality==='state'?qualityAttention(data.quality,data):externalQualityAttention(data.externalQuality);
    const incidents=activityReviewItems(data).filter(item=>!item.resolved);
    // Count every gap "What we cannot confirm" lists (Paige, Oct 27: the count left out agent telemetry and read 2 next to 3).
    const gaps=setupGaps(data);
    const delivery=deliveryAttentionForData(data);
    const stale=data?.project?.quality==='state'&&stateEvalResultsStale(data.quality);
    const qualityKind=stale?'warn':(quality?.kind||'unknown');
    const runtimeIncident=incidents.find(item=>item.kind==='runtime');
    const deploymentIncident=incidents.find(item=>item.kind==='deployment');
    const userImpact=runtimeIncident
      ?{kind:'unknown',label:'User impact',status:'Unknown',detail:'A runtime signal is open. Confirm whether users are affected before treating impact as known.'}
      :deploymentIncident
        ?{kind:'good',label:'User impact',status:'No confirmed impact',detail:'The failed release did not replace the previous production version.'}
        :{kind:'good',label:'User impact',status:'No active signal',detail:'No current user-facing incident signal is open.'};
    const consistency=healthConsistencyIssues(data);
    return [
      {kind:qualityKind,label:'Product quality',status:qualityKind==='bad'?'Needs attention':qualityKind==='warn'?'Watch':qualityKind==='good'?'Healthy':'Unknown',detail:stale?'The recorded State eval result is stale and should be rerun.':(quality?.title||'Quality evidence is not available yet.')},
      userImpact,
      {kind:gaps.length?'warn':'good',label:'Observability',status:gaps.length?'Watch':'Healthy',detail:gaps.length?gaps.length+' monitoring gap'+(gaps.length===1?'':'s')+' limit what Project Health can confirm.':'No known monitoring gap is limiting this health view.'},
      {kind:delivery?.kind||'unknown',label:'Delivery',status:delivery?.kind==='bad'?'Needs attention':delivery?.kind==='warn'?'Watch':delivery?.kind==='good'?'Healthy':'Unknown',detail:delivery?.title||'Delivery health is unavailable.'},
      ...(consistency.length?[{kind:'bad',label:'Dashboard consistency',status:'Needs attention',detail:consistency[0]}]:[])
    ];
  }

  function productionRuntime(data){
    const backend=data?.platform?.render?.environments?.production;
    if(backend) return backend.ok
      ?{kind:'good',label:'Healthy',detail:'Production is responding normally.'}
      :{kind:'bad',label:'Unavailable',detail:'The production backend is not responding successfully.'};
    const deliveryKind=data?.delivery?.vercel?.kind||'unknown';
    if(deliveryKind==='good')return {kind:'good',label:'Healthy',detail:'The latest production release is deployed.'};
    if(deliveryKind==='bad')return {kind:'available',label:'Production unaffected',detail:'The latest release did not deploy; the previous production version remains live.'};
    if(deliveryKind==='warn')return {kind:'available',label:'Current release live',detail:'A new deployment is still finishing; the existing production version remains live.'};
    return {kind:'unknown',label:'Unknown',detail:'Project Health cannot confirm the current production runtime.'};
  }
  function operationalNextDecision(data){
    const live=activityReviewItems(data).find(item=>!item.resolved);
    if(live?.kind==='runtime')return 'Confirm user impact from the runtime incident and decide whether engineering needs to intervene now.';
    if(live?.kind==='deployment')return 'Decide whether to retry the failed release or supersede it with the current branch.';
    if(data?.project?.quality==='state'){
      const q=qualityAttention(data.quality,data);
      if(q.unavailable)return 'Restore the missing checks before assessing project health.';
      if(data.quality&&stateEvalResultsStale(data.quality))return 'Rerun the AI evals before changing State behavior or the eval.';
      if(q.kind==='bad')return 'Review the failed high-severity scenarios before changing the prompt, product behavior, or eval.';
      // "Quality miss" only when a scenario actually failed; no runs or unmeasured signals are not a miss (Nov 3).
      if(q.scenarioMiss)return 'Review the quality miss and decide whether it represents product behavior or eval noise.';
      if(q.noRuns)return 'Run the controlled AI evals to get a quality result.';
      if(q.kind==='warn'&&q.nextAction)return q.nextAction;
    }else{
      const q=externalQualityAttention(data?.externalQuality);
      if(q?.kind==='bad')return 'Review the failing product-quality signal and decide whether the next change should address it.';
      if(q?.kind==='warn')return 'Decide whether the watched quality signal needs action before expanding scope.';
    }
    const delivery=deliveryAttentionForData(data);
    if(delivery.kind==='bad')return 'Decide whether to retry the failed release or supersede it with the current branch.';
    const infra=infrastructureAttention(data?.platform);
    if(infra?.kind==='bad')return 'Confirm user impact and assign the infrastructure response.';
    if(Array.isArray(data?.openPullRequests)&&data.openPullRequests.length)return 'Decide whether the current open work is ready for the next release.';
    // Missing data does not support carrying on unchanged (Paige, Nov 3): with no more specific finding, restore the checks.
    if(['Delivery','Quality','Activity','Production backend','Quality behavior'].some(label=>signalRefreshFailure(data,[label])))return 'Restore the missing checks before assessing project health.';
    return 'No immediate product decision is required. Continue the current goal until the next review.';
  }
  function failureCheckCount(q,check){
    const runs=[q?.review,q?.ask].filter(Boolean);
    return runs.flatMap(run=>Array.isArray(run?.failure_details)?run.failure_details:[])
      .filter(item=>String(item?.severity||'').toLowerCase()==='high')
      .filter(item=>(item?.failed_checks||[]).some(name=>String(name).toLowerCase()===String(check).toLowerCase())).length;
  }
  // Failed-eval explanations (#596). A run records only the scenario ID, the expected and observed outcome codes, a short
  // excerpt of any proposed State text and the names of the failed checks (eval/run_quality_evals.py _failure_details).
  // The scenario's setup and contract come from state-eval-catalog.js, generated from the scenario files and checked by
  // test_state_eval_catalog_export.py. Anything neither source holds is shown as a gap, never filled in.
  function evalCatalog(){return EVAL_CATALOG||globalThis.STATE_EVAL_CATALOG||null;}
  function evalScenario(id){
    const catalog=evalCatalog(),key=String(id||'');
    if(!catalog||!key)return null;
    for(const suite of ['review','ask']){
      const found=(Array.isArray(catalog[suite])?catalog[suite]:[]).find(item=>item?.id===key);
      if(found)return {...found,suite};
    }
    return null;
  }
  // Plain titles for the scenario catalog. The first 23 repeat the public State evals page; the six marked NEW (Nov 2)
  // were drafted for #596 and await Paige's review.
  const SCENARIO_TITLES={
    review_direct_reversal:'Direct reversal',
    review_question_answer_only:'Resolve a question without overstating the answer',
    review_question_and_state_change:'Answer a question and update State',
    review_ambiguity_opens_question:'Ambiguous evidence stays ambiguous',
    review_duplicate_confirmation:'Duplicate confirmation',
    review_unknown_not_false:'Known unknown stays quiet',
    review_non_authoritative_opinion:'Opinion is not authority',
    review_tentative_high_consequence:'High-consequence proposal is not a decision',
    review_partial_reversal:'Partial reversal keeps the unaffected scope',
    review_new_fact_with_downstream_question:'Decision plus downstream unknown',
    review_new_evidence_over_pending_review:'New evidence supersedes a pending proposal',
    review_authority_disagreement:'Authority beats opinion',
    review_partial_question_answer:'Partial answer does not resolve the broad question',
    review_same_unknown_links_existing_question:'Conflicting claims link to the existing Question', // NEW
    review_planned_action_not_stated_as_done:'An agreed plan is not recorded as already done', // NEW
    review_rationale_states_what_evidence_establishes:'The rationale says what the Evidence established', // NEW
    ask_current_over_stale:'Prefer current truth over stale history',
    ask_pending_review_not_truth:'Pending review is not approved truth',
    ask_unknown_stays_unknown:'Unknown stays unknown',
    ask_change_summary:'Summarize a change in the right direction',
    ask_false_premise:'Correct a false premise',
    ask_blocker_not_omitted:'Do not omit a consequential blocker',
    ask_conflicting_evidence:'Surface unresolved conflicting evidence',
    ask_question_answer_no_state_mutation:'Question resolution is not a State mutation',
    ask_superseded_pending_review:'Prefer the newest pending proposal',
    ask_known_outcome_unknown_reason:'Know what happened without inventing why',
    ask_source_words_not_demoted:'Report the source in its own words', // NEW
    ask_compound_question_keeps_governing_state:'Each part of a compound question keeps its governing State', // NEW
    ask_evidence_backed_approval_qualified:'Report an evidence-backed approval without denying it' // NEW
  };
  // What each Review scenario's Evidence is about, as the subject of a failure heading (#596 refinement, Nov 2). Drafted
  // from each scenario's Evidence text; all await Paige's review except the planned-action one, which follows her example.
  // Ask failures use the scenario's own question instead, so they need no entry here.
  const SCENARIO_SUBJECTS={
    review_direct_reversal:'Security’s pause of password-reset automation',
    review_question_answer_only:'Legal’s answer to the open contract question',
    review_question_and_state_change:'Leadership’s approval of Slack as an evidence source',
    review_ambiguity_opens_question:'Support’s unconfirmed report about billing drafts',
    review_duplicate_confirmation:'A repeat confirmation of password-reset automation',
    review_unknown_not_false:'A note that the autonomy target is still unknown',
    review_non_authoritative_opinion:'An engineer’s personal opinion about human review',
    review_tentative_high_consequence:'Leadership’s open question about removing human review',
    review_partial_reversal:'Security’s pause for privileged-account resets',
    review_new_fact_with_downstream_question:'The approved training requirement with no date yet',
    review_new_evidence_over_pending_review:'Finance’s corrected budget cap',
    review_authority_disagreement:'An engineer’s recommendation against the Security owner’s decision',
    review_partial_question_answer:'Security’s approval of Slack for two channels',
    review_same_unknown_links_existing_question:'Conflicting retention claims',
    review_planned_action_not_stated_as_done:'An agreed revision plan',
    review_rationale_states_what_evidence_establishes:'Finance’s confirmed $40,000 budget'
  };
  // Paige-approved Consequence text for a scenario whose run missed a needed Review (#596, Nov 3). It replaces the generic
  // sentence, which repeats the Evidence. No entry means the generic sentence.
  const MISSED_REVIEW_CONSEQUENCES={
    review_planned_action_not_stated_as_done:'This run missed a needed Review, so the agreed revision plan wasn’t proposed for approval. It did not incorrectly report the revision as completed.'
  };
  // The direction each scenario marks as unsafe (its unsafe_if), in words.
  const UNSAFE_DIRECTIONS={state_change:'proposing a Current State change',overstatement:'overstating what the Evidence establishes'};
  function humanize(value){const text=String(value||'').replaceAll('_',' ').trim();return text?text.charAt(0).toUpperCase()+text.slice(1):'';}
  function scenarioTitle(id,category){return SCENARIO_TITLES[String(id||'')]||humanize(category)||humanize(id)||'Controlled scenario';}
  // What each Review outcome code means, as an instruction (expected) and as a past-tense fact (observed).
  const REVIEW_OUTCOMES={
    update_state:['propose a Current State change for a person to approve','proposed a Current State change'],
    answer_question:['propose an answer to the open Question','proposed an answer to the open Question'],
    answer_question_and_update_state:['propose an answer to the open Question and a Current State change','proposed an answer to the open Question and a Current State change'],
    update_state_and_open_question:['propose a Current State change and open a new Question','proposed a Current State change and a new Question'],
    open_question:['open a new Question','proposed a new Question'],
    link_existing_question:['link the Evidence to the existing open Question','proposed linking the Evidence to the existing open Question'],
    state_at_risk:['flag the Current State fact as at risk','raised a Review flagging a Current State fact as at risk'],
    // The harness records this code whenever no Review proposes a change, Question, link or risk flag (quality_harness.py).
    preserve_evidence_only:['keep the update as Evidence only, with no Current State change or Question','proposed no Current State change, Question or at-risk flag'],
    error:['finish processing','failed before producing an outcome']
  };
  // Short forms for the one-line result: what was expected (a noun) and what State did (a verb phrase).
  const REVIEW_OUTCOME_SHORT={
    update_state:['a proposed Current State change','proposed a Current State change'],
    answer_question:['a proposed answer to the open Question','proposed an answer to the open Question'],
    answer_question_and_update_state:['an answer to the open Question plus a Current State change','proposed an answer and a Current State change'],
    update_state_and_open_question:['a Current State change plus a new Question','proposed a Current State change and a new Question'],
    open_question:['a new Question','proposed a new Question'],
    link_existing_question:['a link to the existing open Question','proposed a link to the existing open Question'],
    state_at_risk:['the fact flagged as at risk','flagged the fact as at risk'],
    preserve_evidence_only:['Evidence kept with no change','proposed nothing'],
    error:['a scored outcome','failed before producing an outcome']
  };
  function outcomeShort(code,tense){const entry=REVIEW_OUTCOME_SHORT[String(code||'').trim()];return entry?entry[tense==='observed'?1:0]:outcomeText(code,tense);}
  const STATE_CHANGE_OUTCOMES=new Set(['update_state','answer_question_and_update_state','update_state_and_open_question']);
  function outcomeText(code,tense){
    const entry=REVIEW_OUTCOMES[String(code||'').trim()];
    return entry?entry[tense==='observed'?1:0]:(code?String(code).replaceAll('_',' '):'');
  }
  // The recorded observed field is "<outcome code>" or "<outcome code> | proposed State: <up to 180 characters>", capped at 240.
  function parseReviewObserved(observed){
    const raw=String(observed||'');
    const marker=' | proposed State: ';
    const at=raw.indexOf(marker);
    const action=(at>=0?raw.slice(0,at):raw).trim();
    const proposal=at>=0?raw.slice(at+marker.length).trim():'';
    return {action,proposal,truncated:!!proposal&&(proposal.length>=180||raw.length>=240)};
  }
  // The Ask scorer matches phrases and signal words, so "failed" says what the wording lacked, not what the answer meant.
  const ASK_CHECKS={
    grounding:{failed:'missed a required fact or made a claim this scenario forbids',risk:'A reader of this answer could leave with a fact missing or a claim the record does not support.'},
    required_facts:{failed:'did not include a fact this scenario requires',risk:'A reader of this answer could miss part of what the record establishes.'},
    forbidden_claims:{failed:'made a claim this scenario forbids',risk:'A reader of this answer could take a claim the record does not support as project truth.'},
    uncertainty:{failed:'did not use wording that marks something as unknown',risk:'A reader of this answer could take an unknown as settled.'},
    open_item:{failed:'did not use wording that points to an open item',risk:'A reader of this answer may not learn that something is still open.'},
    authority:{failed:'did not use wording that separates a pending proposal from approved Current State',risk:'A reader of this answer could treat a proposal as a decision someone made.'}
  };
  const ASK_CHECK_ORDER=['forbidden_claims','authority','uncertainty','required_facts','open_item','grounding'];
  const quote=text=>'“'+String(text).trim().replace(/[.;]$/,'')+'”';
  // #639/#643: the recorded failed items name what was wrong from the scenario's own phrase lists. An invented number is
  // recorded only as the fact that one was invented: the model's answer is not stored (DATA_PRIVACY.md).
  function failedItemFindings(detail){
    // Each missing fact keeps all its accepted alternatives ("answered" or "resolved").
    const found={missing:[],asserted:[],invented:false,headlineLacks:[],headlineOpening:'',other:[]};
    for(const raw of (Array.isArray(detail?.failed_items)?detail.failed_items:[])){
      const item=String(raw||'').trim();
      if(/^missing required fact: /.test(item))found.missing.push(item.replace(/^missing required fact: /,'').split(' / '));
      else if(/^headline lacks: /.test(item))found.headlineLacks.push(item.replace(/^headline lacks: /,'').split(' / '));
      else if(/^headline opens with forbidden: /.test(item))found.headlineOpening=item.replace(/^headline opens with forbidden: /,'');
      else if(/^asserted forbidden claim: /.test(item))found.asserted.push(item.replace(/^asserted forbidden claim: /,''));
      else if(/^number not in any record/.test(item))found.invented=true;
      else if(item)found.other.push(item);
    }
    return found;
  }
  // "“answered” or “resolved”; “30 days”": alternatives joined with "or", separate facts with ";".
  const wordingList=groups=>groups.map(g=>g.length>1?g.slice(0,-1).map(quote).join(', ')+' or '+quote(g[g.length-1]):quote(g[0])).join('; ');
  function phraseList(items,limit=3){
    const list=(Array.isArray(items)?items:[]).map(item=>Array.isArray(item)?item.map(quote).join(' or '):quote(item));
    return list.slice(0,limit).join(', ')+(list.length>limit?' and '+(list.length-limit)+' more':'');
  }
  // Explanations written for specific scenarios before #596 (Oct 27 wording for review_tentative_high_consequence was
  // approved by Paige). Each describes one particular miss, so it is used only when the recorded result is that miss.
  const REVIEWED_EXPLANATIONS={
    ask_conflicting_evidence:{when:(action,checks)=>checks.length>0,headline:'Conflicting evidence was not handled cautiously enough',summary:'State did not fully preserve the unresolved conflict between approved Current State and newer contradictory evidence in its answer.',why:'A user could leave believing a disputed project fact is settled when it still needs human review.'},
    review_direct_reversal:{when:action=>!!action&&!STATE_CHANGE_OUTCOMES.has(action)&&action!=='error',headline:'Authoritative reversal was not applied correctly',summary:'State did not interpret evidence that directly reversed an existing maintained fact the way the product contract expected.',why:'Stale project truth could remain active after authoritative evidence changes it.'},
    ask_blocker_not_omitted:{when:(action,checks)=>checks.some(check=>['grounding','required_facts','open_item'].includes(check)),headline:'A consequential blocker was omitted from a readiness answer',summary:'The answer did not surface a blocking open item that materially changes whether the project is ready.',why:'A user could make a launch decision without seeing a known blocking dependency.'},
    review_new_evidence_over_pending_review:{when:action=>action==='preserve_evidence_only',headline:'New authoritative evidence did not supersede a stale pending proposal',summary:'State preserved the new Finance correction as Evidence instead of proposing the corrected budget cap for human review.',why:'A stale pending proposal can remain the apparent next change even after authoritative evidence has corrected it.'},
    review_tentative_high_consequence:{when:action=>action==='state_at_risk',headline:'An open leadership question was treated as a threat to Current State',summary:'Leadership only asked whether human review could be removed for low-risk cases. State flagged the human-review fact as at risk instead of opening a Question.',why:'Marking a fact at risk on an undecided question makes it look as if a decision is coming that nobody has made.'},
    review_partial_reversal:{when:action=>action==='preserve_evidence_only',headline:'A scoped reversal was not applied to Current State',summary:'Security paused password-reset automation for privileged accounts only. State kept this as Evidence and did not propose narrowing the maintained fact.',why:'Current State would keep saying automation is approved for every reset after Security paused part of it.'},
    ask_known_outcome_unknown_reason:{when:(action,checks)=>checks.includes('uncertainty'),headline:'Known outcome was answered without preserving an unknown reason',summary:'State knew that the Northstar pilot was paused, but the answer did not clearly say that the reason for the pause was not established.',why:'A user could mistake an inferred explanation for maintained project truth.'}
  };
  const SCENARIO_SOURCE_URL='https://github.com/pedringt/ai-learning/blob/';
  function scenarioSourceUrl(suite,build){
    const path=suite==='ask'?'state-project-complete/eval/ask_quality_scenarios.py':suite==='review'?'state-project-complete/eval/review_interpretation_scenarios.py':null;
    if(!path)return null;
    return SCENARIO_SOURCE_URL+(/^[0-9a-f]{7,40}$/i.test(String(build||''))?String(build):'main')+'/'+path;
  }
  function scenarioPageUrl(id){return 'https://www.contextswitch.tech/state-evals?failure='+encodeURIComponent(String(id||''));}
  function setupLines(scenario){
    const lines=[];
    for(const [,statement] of (scenario?.current_state||[]))lines.push({label:'Current State',text:statement});
    for(const text of (scenario?.open_questions||[]))lines.push({label:'Open Question',text});
    for(const text of (scenario?.pending_reviews||[]))lines.push({label:'Pending Review',text});
    for(const [before,after,when] of (scenario?.history||[]))lines.push({label:'History'+(when?' ('+when+')':''),text:before+' → '+after});
    for(const [text,answer] of (scenario?.closed_questions||[]))lines.push({label:'Resolved Question',text:text+' Answer: '+answer});
    for(const text of (Array.isArray(scenario?.evidence)?scenario.evidence:[]))lines.push({label:'Evidence',text});
    return lines;
  }
  // Evidence → Observed behavior → Expected behavior → Consequence → Next step, from recorded and catalog data only.
  // Observed and Consequence describe what this run did; severity is the scenario's, set in the catalog (#596, Nov 2).
  function failureStory(detail,run){
    const id=String(detail?.scenario_id||'');
    const scenario=evalScenario(id);
    const suite=scenario?.suite||(/^ask_/.test(id)||run?.suite==='ask_quality'?'ask':/^review_/.test(id)||run?.suite==='review_interpretation'?'review':null);
    const suiteLabel=suite==='ask'?'Answer quality':suite==='review'?'Update understanding':'AI eval';
    const checks=(Array.isArray(detail?.failed_checks)?detail.failed_checks:[]).map(item=>String(item).toLowerCase());
    const severity=String(detail?.severity||scenario?.severity||'unknown').toLowerCase();
    const recorded=suite==='review'?parseReviewObserved(detail?.observed):{action:'',proposal:'',truncated:false};
    const reviewed=REVIEWED_EXPLANATIONS[id];
    const findings=failedItemFindings(detail);
    const reviewedApplies=!!(reviewed&&reviewed.when(recorded.action,checks));
    const gaps=[];
    const FROM_RECORD='From the run record.',FROM_CATALOG='From the scenario catalog.';
    // Whether this run created a Review: the harness counts a Review as recommended when processing created one, and the
    // review_needed check compares that with the scenario. Unknown without the catalog entry or after an error.
    const reviewCreated=suite==='review'&&scenario&&recorded.action&&recorded.action!=='error'
      ?(checks.includes('review_needed')?!scenario.review_needed:!!scenario.review_needed):null;
    // Evidence: the scenario's synthetic setup.
    let evidence;
    if(scenario){
      evidence=suite==='review'
        ?{lead:'New Evidence',text:scenario.evidence,setup:setupLines({...scenario,evidence:[]}),source:'From the scenario catalog (synthetic test setup).'}
        :{lead:'Question asked',text:scenario.question,setup:setupLines(scenario),source:'From the scenario catalog (synthetic test setup).'};
    }else{
      evidence={lead:null,text:null,setup:[],source:null};
      gaps.push('This page’s scenario catalog has no entry for '+(id||'this scenario')+', so its setup cannot be shown. The run may have used a different scenario set.');
    }
    // Observed: what the run recorded, no broader than the record supports.
    const observedParts=[];
    let observedExcerpt=null,askPrimary=null;
    if(suite==='review'){
      if(recorded.action==='error')observedParts.push('Processing failed before producing an outcome.');
      else if(reviewCreated===false&&recorded.action==='preserve_evidence_only')observedParts.push('No Review was created for this Evidence, so State proposed no Current State change, Question or at-risk flag.');
      else if(recorded.action)observedParts.push('State '+outcomeText(recorded.action,'observed')+'.');
      if(checks.includes('review_needed')&&reviewCreated===true)observedParts.push('It created a Review, which this scenario does not need.');
      else if(checks.includes('review_needed')&&reviewCreated===false&&recorded.action!=='preserve_evidence_only')observedParts.push('No Review was created for this Evidence.');
      else if(checks.includes('review_needed')&&reviewCreated==null&&recorded.action!=='error')observedParts.push('The review-needed check failed.');
      if(checks.includes('processing')&&recorded.action!=='error')observedParts.push('Processing did not finish normally.');
      const allowed=scenario?(scenario.allowed_actions?.length?scenario.allowed_actions:[scenario.expected_action]):[];
      const wordingItems=findings.other.filter(item=>/^(proposed state (lacks|contains forbidden)|review prose contains forbidden|rationale lacks) /.test(item));
      if(recorded.action&&allowed.includes(recorded.action)&&checks.includes('interpretation')&&!wordingItems.length)observedParts.push('That outcome is one this scenario accepts, so the miss was in the wording: a required or forbidden phrase, or the rationale.');
      if(recorded.proposal)observedExcerpt={text:recorded.proposal,truncated:recorded.truncated};
      if(!recorded.action)gaps.push('No observed outcome was recorded for this failure.');
      // #639: the scorer's recorded reason, in words. Alternatives are any-one-of; forbidden phrases are named exactly.
      const anyOf=text=>text.split(', ').map(part=>part.split(' / ').map(quote).join(' or ')).join(', and ');
      for(const item of findings.other){
        if(/^proposed state lacks /.test(item))observedParts.push('The proposed change does not say '+anyOf(item.replace(/^proposed state lacks /,''))+'.');
        else if(/^proposed state contains forbidden /.test(item))observedParts.push('The proposed change says '+item.replace(/^proposed state contains forbidden /,'').split(', ').map(quote).join(' and ')+', which this scenario forbids.');
        else if(/^review prose contains forbidden /.test(item))observedParts.push('The Review’s wording says '+item.replace(/^review prose contains forbidden /,'').split(', ').map(quote).join(' and ')+', which this scenario forbids.');
        else if(/^rationale lacks /.test(item))observedParts.push('The rationale does not say '+anyOf(item.replace(/^rationale lacks /,''))+'.');
        else observedParts.push('The scorer recorded: '+item+'.');
      }
      if(!findings.other.length&&checks.includes('interpretation'))gaps.push('The scorer’s exact reason is not recorded, only which checks failed.');
      if(!recorded.proposal&&recorded.action&&STATE_CHANGE_OUTCOMES.has(recorded.action))gaps.push('The proposed State text was not recorded for this run.');
    }else if(suite==='ask'){
      const named=checks.filter(check=>ASK_CHECKS[check]);
      const failed=named.filter(check=>!(check==='grounding'&&(named.includes('required_facts')||named.includes('forbidden_claims'))));
      askPrimary=ASK_CHECK_ORDER.find(check=>failed.includes(check))||null;
      const specific=[];
      if(findings.asserted.length)specific.push('The answer said '+findings.asserted.map(quote).join(' and ')+', which this scenario forbids.');
      if(findings.invented)specific.push('The answer gave a number that appears in none of the supplied records.');
      if(findings.missing.length)specific.push('Expected wording not found in the answer: '+wordingList(findings.missing)+'.');
      if(findings.headlineLacks.length)specific.push('Expected wording not found in the headline: '+wordingList(findings.headlineLacks)+'.');
      if(findings.headlineOpening)specific.push('The headline opens with '+quote(findings.headlineOpening)+', an opening this scenario does not accept for its question.');
      // #640 review (Paige, Nov 7): these checks look for wording, so say what they show and no more.
      if(findings.missing.length||findings.headlineLacks.length)specific.push('This check looks for wording: missing wording does not by itself show the answer is wrong.');
      const rest=failed.filter(check=>!['grounding','required_facts','forbidden_claims'].includes(check)||!specific.length);
      if(specific.length)observedParts.push(...specific);
      if(rest.length)observedParts.push('The answer '+rest.map(check=>ASK_CHECKS[check].failed).join('; it ')+'.');
      else if(!specific.length&&detail?.observed)observedParts.push(String(detail.observed));
      if(!String(detail?.synthetic_answer_excerpt||'').trim())gaps.push('The answer text is not recorded, so its wording cannot be shown here.');
    }else if(detail?.observed){
      observedParts.push(String(detail.observed));
    }
    if(!observedParts.length)observedParts.push('No observed behavior was recorded for this failure.');
    // Expected: one line from the scenario's contract; the rest of the contract goes in details.
    let expectedLine='';
    const expectedDetails=[];
    const expectedCode=scenario?.expected_action||String(detail?.expected||'').trim();
    if(suite==='review'){
      if(expectedCode)expectedLine='State should '+outcomeText(expectedCode,'expected')+'.'+(scenario&&!scenario.review_needed?' No Review is needed.':'');
      const others=scenario?(scenario.allowed_actions||[]).filter(code=>code!==expectedCode):[];
      if(others.length)expectedDetails.push('Also acceptable: '+others.map(code=>outcomeText(code,'expected')).join('; ')+'.');
      if(scenario){
        if(scenario.review_needed)expectedDetails.push('A person should be asked to review it.');
        if(scenario.required_state_update_phrases?.length)expectedDetails.push('A proposed change must include '+phraseList(scenario.required_state_update_phrases)+'.');
        const forbidden=[...(scenario.forbidden_state_update_phrases||[]),...(scenario.forbidden_review_phrases||[])].filter((item,index,list)=>list.indexOf(item)===index);
        if(forbidden.length)expectedDetails.push('It must not say '+phraseList(forbidden)+'.');
        if(scenario.required_rationale_phrases?.length)expectedDetails.push('The rationale must include '+phraseList(scenario.required_rationale_phrases)+'.');
        if(scenario.must_preserve_uncertainty)expectedDetails.push('What is still uncertain stays uncertain.');
        if(scenario.unsafe_if&&UNSAFE_DIRECTIONS[scenario.unsafe_if])expectedDetails.push('Unsafe direction: '+UNSAFE_DIRECTIONS[scenario.unsafe_if]+'.');
      }
    }else if(suite==='ask'&&scenario){
      const wants=[];
      if(scenario.required_facts?.length)wants.push('include the required facts');
      if(scenario.forbidden_claims?.length)wants.push('avoid the forbidden claims');
      if(scenario.should_express_uncertainty)wants.push('say what is not established');
      if(scenario.should_reference_open_item)wants.push('point to the open item');
      if(scenario.should_distinguish_proposal_from_truth)wants.push('keep pending proposals apart from approved Current State');
      if(wants.length)expectedLine='The answer should '+(wants.length>1?wants.slice(0,-1).join(', ')+' and '+wants[wants.length-1]:wants[0])+'.';
      if(scenario.required_facts?.length)expectedDetails.push('Required facts: '+phraseList(scenario.required_facts,6)+'.');
      if(scenario.forbidden_claims?.length)expectedDetails.push('Forbidden claims: '+phraseList(scenario.forbidden_claims,6)+'.');
      if(scenario.forbid_unsupported_numbers)expectedDetails.push('No number that appears in none of the supplied records.');
    }else if(detail?.expected){
      expectedLine=String(detail.expected);
    }
    if(!expectedLine)expectedLine='The expected behavior for this scenario is not available here.';
    // Consequence: what this run did, from the record and the direction of the miss. Not the scenario's severity.
    let consequence,direction='unknown';
    const unsafeWords=UNSAFE_DIRECTIONS[scenario?.unsafe_if]||null;
    if(reviewedApplies){
      consequence=reviewed.why;direction='reviewed';
    }else if(suite==='review'&&scenario&&recorded.action){
      const statement=(scenario.current_state||[])[0]?.[1];
      const proposesChange=STATE_CHANGE_OUTCOMES.has(recorded.action);
      const expectsChange=STATE_CHANGE_OUTCOMES.has(scenario.expected_action);
      if(recorded.action==='error'){
        direction='error';
        consequence='This run could not score the scenario. It counts as a failure until it is rerun.';
      }else if(proposesChange&&scenario.unsafe_if==='state_change'){
        direction='unsafe';
        consequence='This run proposed a Current State change, which this scenario marks as the unsafe direction. If a reviewer approved it, Current State would change on Evidence the contract says should not change it.';
      }else if(proposesChange&&scenario.unsafe_if==='overstatement'){
        direction='possibly-unsafe';
        consequence='This run proposed a change, and this scenario’s unsafe direction is overstating what the Evidence establishes. The record does not show whether the wording overstated it; compare any recorded excerpt with the contract before deciding.';
      }else if(recorded.action==='preserve_evidence_only'&&(expectsChange||['open_question','link_existing_question','answer_question'].includes(scenario.expected_action))){
        direction='missed';
        const missing=expectsChange?'no change to Current State was put up for approval'+(statement?', so Current State still says '+quote(statement):'')+'.'
          :scenario.expected_action==='answer_question'?'no answer to the open Question was proposed, so the Question stays open.'
          :scenario.expected_action==='link_existing_question'?'the Evidence was not linked to the open Question.'
          :'no new Question was proposed.';
        consequence=(reviewCreated===false?'This run missed a needed Review: ':'This run’s Review proposed nothing: ')+missing;
        // With no Review there is no proposal, Review or rationale text, so nothing could overstate the Evidence.
        if(unsafeWords&&reviewCreated===false)consequence+=' It did not make this scenario’s unsafe mistake ('+unsafeWords+').';
        if(reviewCreated===false&&MISSED_REVIEW_CONSEQUENCES[id])consequence=MISSED_REVIEW_CONSEQUENCES[id];
        else if(unsafeWords&&scenario.unsafe_if==='state_change')consequence+=' No change was proposed, so it did not make this scenario’s unsafe mistake ('+unsafeWords+').';
      }else if(checks.includes('interpretation')&&(scenario.allowed_actions?.length?scenario.allowed_actions:[scenario.expected_action]).includes(recorded.action)&&findings.other.some(item=>/^proposed state (lacks|contains forbidden) /.test(item))){
        // #639: the right kind of change with the wrong content, named from the scorer's recorded reason.
        direction='wording';
        const lacks=findings.other.filter(item=>/^proposed state lacks /.test(item)).map(item=>item.replace(/^proposed state lacks /,''));
        const says=findings.other.filter(item=>/^proposed state contains forbidden /.test(item)).map(item=>item.replace(/^proposed state contains forbidden /,''));
        consequence='The proposed change '+[lacks.length?'does not say '+lacks.map(item=>quote(item.split(' / ')[0])).join(' or ')+' or an equivalent':'',says.length?'says '+says.map(quote).join(' and '):''].filter(Boolean).join(', and ')+
          '. If a reviewer approved it as written, Current State would not match what the Evidence established.';
      }else if(reviewCreated===true&&!scenario.review_needed){
        direction='routing';
        consequence='This run created a Review this scenario does not need, so a person would be asked to look at Evidence that needs no decision. Nothing changes in Current State without approval.';
      }else{
        direction='routing';
        consequence='This run’s Review asks a person to decide something different from what this scenario expects. Nothing changes in Current State without approval.'+
          (scenario.unsafe_if==='state_change'&&!proposesChange?' No change was proposed, so it did not make this scenario’s unsafe mistake ('+unsafeWords+').':
           scenario.unsafe_if==='overstatement'?' The record does not show whether its wording overstated the Evidence.':'');
      }
    }else if(suite==='ask'){
      direction=askPrimary||findings.asserted.length||findings.invented||findings.missing.length||findings.headlineLacks.length||findings.headlineOpening?'answer':'unknown';
      // The specific misleading implication when the record names it (#643); otherwise the check's general risk.
      const implications=[];
      if(findings.asserted.length)implications.push('A reader could believe '+findings.asserted.map(quote).join(' and ')+', which the record does not support.');
      if(findings.invented)implications.push('A reader could take an invented number as an agreed figure.');
      if(findings.missing.length)implications.push('If the answer does not convey '+wordingList(findings.missing)+', a reader would not learn what the record establishes.');
      if(findings.headlineLacks.length||findings.headlineOpening)implications.push('A reader who reads only the headline may take away a different status from the one the record shows.');
      consequence=implications.length?implications.join(' ')+' Ask is read-only, so project records are unchanged.'
        :askPrimary?ASK_CHECKS[askPrimary].risk+' Ask is read-only, so project records are unchanged.':'The recorded result does not say which answer check failed.';
    }else{
      consequence='The recorded result does not include enough detail to say what this run’s miss would change.';
    }
    // Heading: what this run did wrong, built from the recorded miss and the scenario's subject.
    const subject=SCENARIO_SUBJECTS[id]||'The Evidence';
    let heading;
    if(reviewedApplies)heading=reviewed.headline;
    else if(suite==='review'&&recorded.action){
      const allowed=scenario?(scenario.allowed_actions?.length?scenario.allowed_actions:[scenario.expected_action]):[];
      if(recorded.action==='error')heading=subject+' could not be scored';
      else if(reviewCreated===false&&scenario?.review_needed)heading=subject+' didn’t trigger a Review';
      else if(STATE_CHANGE_OUTCOMES.has(recorded.action)&&scenario?.unsafe_if==='state_change')heading=subject+' led to a proposed Current State change';
      else if(reviewCreated===true&&scenario&&!scenario.review_needed)heading=subject+' triggered a Review it doesn’t need';
      else if(allowed.includes(recorded.action)&&checks.includes('interpretation'))heading=subject+': the Review didn’t meet the expected wording requirements';
      else if(recorded.action==='preserve_evidence_only')heading=subject+': the Review proposed nothing';
      else heading=subject+': State '+outcomeShort(recorded.action,'observed')+', not '+(expectedCode?outcomeShort(expectedCode,'expected'):'the expected outcome');
    }else if(suite==='ask'&&askPrimary){
      heading=(scenario?.question?'The answer to '+quote(scenario.question):'The answer')+' '+ASK_CHECKS[askPrimary].failed;
    }else{
      // Not enough recorded to say how it failed: a neutral heading, never the scenario's own (success-sounding) name.
      const fallbackSubject=SCENARIO_SUBJECTS[id]||(suite==='ask'&&scenario?.question?'The answer to '+quote(scenario.question):'This scenario');
      heading=fallbackSubject+': failure details weren’t recorded';
    }
    const contractNote=scenario?.rationale||null;
    const nextStep='Decide which is wrong, State or the contract: fix State and rerun '+suiteLabel+', or record a product decision before changing the contract.';
    return {
      scenarioId:id,suite,suiteLabel,severity,
      severityLabel:'Scenario severity: '+(['high','medium','low'].includes(severity)?severity:'unknown'),
      title:scenarioTitle(id,detail?.category||scenario?.category),
      heading,
      evidence,
      observed:{text:reviewedApplies?reviewed.summary:observedParts.join(' '),recorded:reviewedApplies?observedParts.join(' '):null,excerpt:observedExcerpt,source:FROM_RECORD},
      // #643: model output from a synthetic test fixture, kept apart from the explanation above (DATA_PRIVACY.md).
      // Nov 7 (#640): a capability this release does not have: shown as failing, and as not counted by the gate.
      knownUnsupported:scenario?.known_unsupported||null,
      syntheticExcerpt:String(detail?.synthetic_answer_excerpt||'').trim()?{label:SYNTHETIC_EXCERPT_LABEL,text:String(detail.synthetic_answer_excerpt).trim()}:null,
      expected:{text:expectedLine,details:expectedDetails,source:scenario?FROM_CATALOG:FROM_RECORD},
      consequence:{text:consequence,direction},
      contractNote,
      nextStep,
      gaps,
      technical:{
        scenarioId:id,category:detail?.category||scenario?.category||null,severity,failedChecks:checks,
        expectedCode:detail?.expected??null,observedRaw:detail?.observed??null,failedItems:Array.isArray(detail?.failed_items)?detail.failed_items:[],
        build:run?.build||null,model:run?.model_identifier||null,runAt:run?.created_at||null,total:run?.total??null,
        sourceUrl:scenarioSourceUrl(suite,run?.build),pageUrl:scenarioPageUrl(id)
      }
    };
  }
  // The older {title, whatHappened, expected, why} shape, used by the investigation report and the Overview.
  function failureExplanation(detail,run){
    const story=failureStory(detail,run);
    return {
      title:story.heading,
      whatHappened:story.observed.text,
      expected:story.expected.text,
      why:story.consequence.text
    };
  }
  function qualityFailureClassSummary(q){
    const runs=[{suite:'update understanding',run:q?.review},{suite:'answer quality',run:q?.ask}].filter(item=>item.run);
    const details=runs.flatMap(({suite,run})=>(Array.isArray(run?.failure_details)?run.failure_details:[]).map(item=>({...item,suite,run})));
    const high=details.filter(item=>String(item?.severity||'').toLowerCase()==='high');
    const names=[...new Set(high.map(item=>{
      const category=String(item?.category||item?.scenario_id||'').replaceAll('_',' ').trim();
      return category||'controlled behavior';
    }))];
    return {
      count:runs.reduce((n,item)=>n+Number(item.run?.high_severity_failures||0),0),
      classes:names.slice(0,3),
      details:high.map(item=>{const {run,...rest}=item;return {...rest,...failureExplanation(item,run),story:failureStory(item,run)};})
    };
  }
  function activityTimelineItems(data){
    const p=data?.project||{},d=data?.delivery,q=data?.quality,externalQ=data?.externalQuality,activity=data?.activity;
    const items=[];
    if(d?.updatedAt)items.push({when:d.updatedAt,type:'Release',category:'releases',title:'Production release',detail:commitTitle(d.message)+' · '+shortSha(d.sha)});
    if(activity?.available){
      const dep=activity.deployments||{};
      const failures=(dep.recent_failures||[]).filter(item=>item.created_at).slice().sort((a,b)=>(dateMs(a.created_at)||0)-(dateMs(b.created_at)||0));
      const failureGroups=[];
      for(const failure of failures){
        const last=failureGroups[failureGroups.length-1];
        const near=last&&Math.abs((dateMs(failure.created_at)||0)-(dateMs(last.items[last.items.length-1].created_at)||0))<=5*60*1000;
        if(near)last.items.push(failure);
        else failureGroups.push({items:[failure]});
      }
      for(const group of failureGroups){
        const first=group.items[0],last=group.items[group.items.length-1],count=group.items.length;
        items.push({
          when:last.created_at,
          startWhen:first.created_at,
          endWhen:last.created_at,
          type:'Release incident',
          category:'releases',
          title:count>1?'Deployment failure · '+count+' attempts':'Deployment failure',
          detail:count>1?'A new release failed '+count+' times in a short window. Production stayed on the previous healthy release.':(first.message||'Production deployment failed'),
          userImpact:{status:'No confirmed impact',kind:'good',detail:'The previous production version remained available.'},
          attempts:group.items.map(item=>({when:item.created_at,detail:item.message||'Deployment failed'}))
        });
      }
      const recoveryGroups=new Map();
      for(const failure of dep.recent_failures||[]){
        if(failure.recovered&&failure.recovered_at){
          const key=String(failure.recovered_at);
          const current=recoveryGroups.get(key)||{when:failure.recovered_at,count:0};
          current.count+=1;
          recoveryGroups.set(key,current);
        }
      }
      for(const recovery of recoveryGroups.values()){
        items.push({
          when:recovery.when,
          type:'Release',
          category:'releases',
          title:'Deployment recovered'+(recovery.count>1?' · '+recovery.count+' attempts':''),
          detail:recovery.count>1?'A later healthy deployment superseded the failed release attempts.':'A later release restored a healthy production state.'
        });
      }
      for(const issue of activity.runtime?.issues||[]){
        if(issue.last_seen)items.push({when:issue.last_seen,type:'Release incident',category:'releases',title:'Runtime signal',detail:(issue.path||'Server route')+(issue.count?' · '+issue.count+' occurrences':''),userImpact:{status:'Unknown',kind:'unknown',detail:'Confirm whether this runtime signal affected users.'}});
      }
    }
    const prs=Array.isArray(data?.openPullRequests)?data.openPullRequests:[];
    for(const pr of prs.slice(0,4)){
      const when=pr.updated_at||pr.created_at;
      if(when)items.push({when,type:'Release',category:'releases',title:'Open PR · '+(pr.number?'#'+pr.number:'work in progress'),detail:String(pr.title||'Untitled')});
    }
    if(p.id==='state'&&Array.isArray(q?.recent)){
      for(const item of q.recent.slice(0,6)){
        if(item.created_at)items.push({when:item.created_at,type:'Quality check',category:'quality',title:evalSuiteLabel(item)+' checked',detail:(evalScore(item)==null?'Score unavailable':percent(evalScore(item)))+' · '+highSeverityFailureText(item.high_severity_failures)});
      }
    }else if(p.id==='tastemake'&&externalQ?.ci?.updated_at){
      items.push({when:externalQ.ci.updated_at,type:'Quality check',category:'quality',title:'Recommendation quality checks updated',detail:externalQ.ci.conclusion==='success'?'Automated recommendation checks passed.':'Latest check result recorded.'});
    }else if(p.id==='authority-lab'&&externalQ?.ci?.updated_at){
      items.push({when:externalQ.ci.updated_at,type:'Quality check',category:'quality',title:'Automated tests ran on main',detail:externalQ.ci.conclusion==='success'?'All test suites passed.':'Latest test result recorded.'});
    }else if(p.id==='narc'&&externalQ?.recorded?.updated_at){
      items.push({when:externalQ.recorded.updated_at,type:'Quality check',category:'quality',title:'Game quality record updated',detail:externalQ.recorded.full_playtest_pending?'Full first-run playtest still open.':'Latest recorded quality state.'});
    }
    for(const item of data?.investigationHistory||[]){
      items.push({when:item.observedAt,type:'Investigation',category:'investigations',title:item.trigger||'Project check',detail:(item.summary||'Investigation completed')+(item.resolvedAt?' · later resolved':'')});
      if(item.resolvedAt)items.push({when:item.resolvedAt,type:'Investigation',category:'investigations',title:'Investigated issue resolved',detail:item.trigger||'Project investigation'});
    }
    for(const note of data?.productNotes||[]){
      if(note?.createdAt&&note?.text)items.push({when:note.createdAt,type:note.type==='change'?'Change':note.type==='experiment'?'Experiment':'Decision',category:'decisions',title:note.type==='change'?'Product change recorded':note.type==='experiment'?'Experiment recorded':'Product decision recorded',detail:note.text});
    }
    const sorted=items.sort((a,b)=>(dateMs(b.when)||0)-(dateMs(a.when)||0));
    for(const item of sorted){
      if(!['investigations','decisions'].includes(item.category))continue;
      const after=sorted
        .filter(candidate=>['releases','quality'].includes(candidate.category)&&(dateMs(candidate.when)||0)>(dateMs(item.when)||0))
        .sort((a,b)=>(dateMs(a.when)||0)-(dateMs(b.when)||0))[0];
      if(after)item.followup='Next evidence: '+after.title+' · '+relativeAge(after.when);
    }
    return sorted;
  }
  function activityDayLabel(when){
    const date=new Date(when),now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
    const key=d=>[d.getFullYear(),d.getMonth(),d.getDate()].join('-');
    if(key(date)===key(now))return'Today';
    if(key(date)===key(yesterday))return'Yesterday';
    return date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:date.getFullYear()===now.getFullYear()?undefined:'numeric'});
  }
  function activityTimeRange(item){
    const opts={hour:'numeric',minute:'2-digit'};
    if(!item?.startWhen||!item?.endWhen||dateMs(item.startWhen)===dateMs(item.endWhen))return new Date(item?.when).toLocaleTimeString('en-US',opts);
    return new Date(item.startWhen).toLocaleTimeString('en-US',opts)+'–'+new Date(item.endWhen).toLocaleTimeString('en-US',opts);
  }
  function evalBehaviorBranch(project,environment='production'){
    return environment==='staging'?(project.stagingBranch||project.branch):project.branch;
  }

  function mergePlatform(current,fragment){
    const next={...(current||{})};
    if(fragment?.render){
      next.render={...(next.render||{}),...fragment.render,environments:{...(next.render?.environments||{}),...(fragment.render.environments||{})}};
    }
    if(Object.prototype.hasOwnProperty.call(fragment||{},'analytics')) next.analytics=fragment.analytics;
    if(Object.prototype.hasOwnProperty.call(fragment||{},'neon')) next.neon=fragment.neon;
    if(Object.prototype.hasOwnProperty.call(fragment||{},'aiTelemetry')) next.aiTelemetry=fragment.aiTelemetry;
    return next;
  }

  function emptyProjectData(project,seed){
    const s=seed||{};
    return {
      project,
      delivery:s.delivery||null,
      lastSeenSha:s.lastSeenSha||s.delivery?.sha||null,
      lastVisit:s.lastVisit||visitBaseline(s),
      staging:s.staging||null,
      quality:s.quality||null,
      qualityBehaviorUpdatedAt:s.qualityBehaviorUpdatedAt||null,
      qualityContractUpdatedAt:s.qualityContractUpdatedAt||null,
      qualityCheckedAt:s.qualityCheckedAt||null,
      externalQuality:s.externalQuality||null,
      platform:s.platform||null,
      previousPlatform:s.platform||null,
      activity:s.activity||null,
      deliveryLoadedAt:s.deliveryLoadedAt||null,
      activityLoadedAt:s.activityLoadedAt||null,
      analyticsLoadedAt:s.analyticsLoadedAt||null,
      openPullRequests:Array.isArray(s.openPullRequests)?s.openPullRequests:[],
      runInfo:null,
      checkedAt:s.checkedAt||null,
      detailCheckedAt:s.detailCheckedAt||null,
      investigation:s.investigation||null,
      investigationHistory:Array.isArray(s.investigationHistory)?s.investigationHistory:[],
      productNotes:Array.isArray(s.productNotes)?s.productNotes:[],
      productNotesStatus:s.productNotesStatus||null,
      decisionKeyKnown:!!s.decisionKeyKnown,
      errors:[],
      failures:[],
      pending:new Set(),
      timings:{},
      fresh:false,
      detailLoaded:false,
      detailLoading:false,
      qualityRun:s.qualityRun||null,
      qualityRunCompletedAt:s.qualityRunCompletedAt||null,
      snapshotAt:s.snapshotAt||null
    };
  }

  function safeExternalQualitySnapshot(value){
    if(!value)return null;
    const copy=JSON.parse(JSON.stringify(value));
    for(const key of ['baseline','endpoint']){
      if(copy[key]){
        delete copy[key].grounding_findings;
        delete copy[key].failing_fixtures;
      }
    }
    return copy;
  }

  function serializeProjectData(data){
    return {
      projectId:data.project.id,
      delivery:data.delivery,
      deliveryKnownKind:knownDeliveryKind(data.delivery?.vercel?.kind)||data.lastVisit?.deliveryKind||null,
      staging:data.staging,
      quality:data.quality,
      qualityBehaviorUpdatedAt:data.qualityBehaviorUpdatedAt||null,
      qualityContractUpdatedAt:data.qualityContractUpdatedAt||null,
      qualityCheckedAt:data.qualityCheckedAt||null,
      externalQuality:safeExternalQualitySnapshot(data.externalQuality),
      platform:data.platform,
      activity:data.activity,
      deliveryLoadedAt:data.deliveryLoadedAt||null,
      activityLoadedAt:data.activityLoadedAt||null,
      analyticsLoadedAt:data.analyticsLoadedAt||null,
      openPullRequests:data.openPullRequests,
      runInfo:null,
      checkedAt:data.checkedAt,
      detailCheckedAt:data.detailCheckedAt,
      snapshotAt:new Date().toISOString()
    };
  }

  // The page draws once before the first refresh starts. With no saved snapshot (first visit, private window, cleared
  // storage) the empty data would read as "Healthy" for that frame (Paige, Oct 30), so mark its core signals pending:
  // the project shows "Checking" until the first load lands.
  function initialPendingSignals(project){
    return ['Delivery','Quality',...(project?.id==='state'?['Production backend','Quality behavior']:[])];
  }
  function hydrateProjectData(project,saved){
    const match=saved&&saved.projectId===project.id?saved:null;
    const data=emptyProjectData(project,match);
    if(!match)initialPendingSignals(project).forEach(label=>data.pending.add(label));
    return data;
  }
  function investigationHistorySummary(investigation){
    if(!investigation)return'Investigation completed';
    if(investigation.staleEvalResults||investigation.staleEvalContract||investigation.staleEvalBehavior)return'Quality result needs a fresh eval run';
    if(investigation.quickCheck)return investigation.title||'Quick project check completed';
    if(investigation.error)return 'Investigation failed: '+investigation.error;
    if(investigation.report){
      const first=plainReportLine(investigation.report).split(/\n+/).map(line=>line.trim()).find(line=>line&&!/^(Investigation scope|Current assessment|What failed|Why this matters|Recommended next action)$/i.test(line));
      return first||'Investigation completed';
    }
    return'Investigation completed';
  }

  function makeRunner(data,onUpdate){
    const notify=()=>{if(typeof onUpdate==='function')onUpdate(data);};
    return (label,promise,apply)=>{
      const started=Date.now();
      data.pending.add(label);notify();
      return promise
        .then(value=>{apply(value);})
        .catch(e=>{
          data.errors.push(label+': '+e.message);
          if(!Array.isArray(data.failures))data.failures=[];
          data.failures.push({label,reason:failureReason(e),status:Number(e?.status)||null});
        })
        .finally(()=>{data.timings[label]=Date.now()-started;data.pending.delete(label);notify();});
    };
  }

  const STATE_EVAL_CONTRACT_UPDATED_AT='2026-09-30T00:30:24Z';
  function dateMs(value){
    if(value==null||value==='')return NaN;
    if(typeof value==='number')return value<1e12?value*1000:value;
    const raw=String(value);
    if(/^\d+$/.test(raw)){const n=Number(raw);return n<1e12?n*1000:n;}
    const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'Z':raw;
    return new Date(normalized).getTime();
  }
  function fmtDate(value){if(!value)return'Unknown';const d=new Date(Number.isNaN(dateMs(value))?value:dateMs(value));return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function relativeAge(value){
    if(!value)return'not checked yet';
    const time=dateMs(value);if(Number.isNaN(time))return'unknown';
    const minutes=Math.max(0,Math.round((Date.now()-time)/60000));
    if(minutes<1)return'just now';
    if(minutes<60)return minutes+'m ago';
    const hours=Math.round(minutes/60);if(hours<24)return hours+'h ago';
    return Math.round(hours/24)+'d ago';
  }
  function stateEvalContractStale(q){
    const runs=[q?.review,q?.ask].filter(Boolean);
    if(!runs.length)return false;
    // The later of the fixed contract date and the last commit to the eval contract files.
    const fetched=dateMs(q?.contractUpdatedAt);
    const contract=Math.max(dateMs(STATE_EVAL_CONTRACT_UPDATED_AT),Number.isFinite(fetched)?fetched:-Infinity);
    return runs.some(run=>{const when=dateMs(run.created_at);return Number.isFinite(when)&&when<contract;});
  }
  function stateEvalBehaviorStale(q){
    const runs=[q?.review,q?.ask].filter(Boolean);
    const changed=dateMs(q?.behaviorUpdatedAt);
    if(!runs.length||!Number.isFinite(changed))return false;
    return runs.some(run=>{const when=dateMs(run.created_at);return Number.isFinite(when)&&when<changed;});
  }
  // Which build the latest State evals ran on, and whether that still covers the live release (Oct 27 review). A release
  // that differs from the eval build is only a problem when State's AI behavior files changed after the run
  // (stateEvalBehaviorStale); a docs or styling release does not make the scores out of date.
  function evalCoverageNote(data){
    const q=data?.quality;
    const runs=[q?.review,q?.ask].filter(Boolean);
    if(data?.project?.quality!=='state'||!runs.length)return null;
    const builds=[...new Set(runs.map(run=>String(run?.build||'').trim()).filter(value=>/^[0-9a-f]{7,40}$/i.test(value)))];
    const latest=runs.map(run=>run?.created_at).filter(Boolean).sort().pop();
    const when=latest?fmtDate(latest):'an unknown time';
    const built=builds.length===1?'build '+shortSha(builds[0]):builds.length>1?'builds '+builds.map(shortSha).join(' and '):'an unrecorded build';
    if(stateEvalResultsStale(q))return {kind:'warn',text:'Evals ran on '+built+', '+when+'. '+stateEvalStaleReason(q)+' Rerun before trusting these scores.'};
    const release=String(data?.delivery?.sha||'').trim();
    const sameBuild=builds.length===1&&release&&builds[0]===release;
    if(sameBuild)return {kind:'good',text:'Evals ran on the live release ('+shortSha(release)+'), '+when+'.'};
    if(!Number.isFinite(dateMs(q?.behaviorUpdatedAt)))return {kind:'unknown',text:'Evals ran on '+built+', '+when+'. Project Health could not check whether State\u2019s AI behavior changed since.'};
    // Say what was checked, not more: the result is only as good as the watched file list.
    return {kind:'good',text:'Evals ran on '+built+', '+when+'. No changes found since then in the files that shape State\u2019s AI behavior or its evals, so the scores should still apply to the live release'+(release?' ('+shortSha(release)+')':'')+'.'};
  }
  function stateEvalResultsStale(q){return stateEvalContractStale(q)||stateEvalBehaviorStale(q);}
  function stateEvalStaleReason(q){
    if(stateEvalBehaviorStale(q))return'The State behavior these checks measure changed after the latest recorded run.';
    if(stateEvalContractStale(q))return'The eval contract changed after the latest recorded run.';
    return'';
  }
  // Where the quality numbers on screen came from (#597), shared by Overview and AI Evals so their labels agree.
  // resultAt is when the results were recorded (the eval run, or the CI run); confirmedAt is when this page last fetched
  // them successfully. A refresh in progress or a failed refresh keeps the previous results, labelled as previous.
  function qualityResultsAt(data){
    if(data?.project?.quality==='state')return [data?.quality?.review?.created_at,data?.quality?.ask?.created_at].filter(Boolean).sort((a,b)=>(dateMs(a)||0)-(dateMs(b)||0)).pop()||null;
    return data?.externalQuality?.ci?.updated_at||data?.externalQuality?.recorded?.updated_at||null;
  }
  function qualityProvenance(data){
    const state=data?.project?.quality==='state';
    const hasResults=state?!!(data?.quality&&(data.quality.review||data.quality.ask)):!!data?.externalQuality;
    const loading=pendingSet(data).has('Quality');
    const failure=(Array.isArray(data?.failures)?data.failures:[]).find(item=>item?.label==='Quality');
    const resultAt=hasResults?qualityResultsAt(data):null;
    const confirmedAt=data?.qualityCheckedAt||null;
    const what=state?'AI eval results':'quality results';
    const recorded=resultAt?'recorded '+fmtDate(resultAt):'recording time unknown';
    if(loading&&hasResults)return {status:'refreshing',previous:true,resultAt,confirmedAt,label:'Previous results',detail:'Previous '+what+', '+recorded+' \u00b7 checking for newer results\u2026'};
    if(loading)return {status:'loading',previous:false,resultAt:null,confirmedAt,label:'Checking\u2026',detail:'Loading the latest '+what+'\u2026'};
    const fetchedAt=confirmedAt&&Number.isFinite(dateMs(confirmedAt))?fmtDate(confirmedAt):null;
    if(failure&&hasResults)return {status:'stale',previous:true,resultAt,confirmedAt,label:'Previous results \u00b7 refresh failed',detail:'Couldn\u2019t refresh the '+what+' ('+failure.reason+') \u00b7 showing previously loaded data, '+recorded+(fetchedAt?' \u00b7 last fetched at '+fetchedAt:'')+'.'};
    // A saved empty response is history, not a current finding (Nov 3): it never reads as "no runs exist now".
    const savedEmpty=state&&data?.quality&&fetchedAt?' The last successful fetch, at '+fetchedAt+', had no recorded runs; that may have changed since.':'';
    if(failure)return {status:'unavailable',previous:false,resultAt:null,confirmedAt,label:'Couldn\u2019t load',detail:'Couldn\u2019t load the '+what+' ('+failure.reason+'). Nothing is shown rather than a guess.'+savedEmpty};
    if(!hasResults)return {status:'none',previous:false,resultAt:null,confirmedAt,label:'No results',detail:'No '+what+' are recorded yet.'};
    return {status:'current',previous:false,resultAt,confirmedAt,label:resultAt?'Recorded '+fmtDate(resultAt):'Recorded',detail:'Latest '+what+', '+recorded+'.'};
  }
  // #597 (Nov 2): the status line describes the refresh attempt (when the page tried and what failed), never when a
  // result was recorded. A section whose fetch failed keeps its retained data and says so; no success time is invented.
  function refreshStatus(items,attemptAt){
    const list=Array.isArray(items)?items:[];
    const failed=list.flatMap(item=>(Array.isArray(item?.failures)?item.failures:[]).map(failure=>(item.project?.name?item.project.name+' ':'')+String(failure.label||'').toLowerCase()));
    const attempted=list.reduce((n,item)=>n+Object.keys(item?.timings||{}).length,0);
    const when=fmtDate(attemptAt);
    const named=failed.slice(0,3).join(', ')+(failed.length>3?' and '+(failed.length-3)+' more':'');
    if(!failed.length)return {kind:'refreshed',title:'Refreshed '+when,detail:''};
    if(attempted&&failed.length>=attempted)return {kind:'failed',title:'Refresh failed '+when,detail:'Couldn’t refresh: '+named+'.'};
    return {kind:'partial',title:'Partly refreshed '+when,detail:'Couldn’t refresh: '+named+'.'};
  }
  function signalRefreshFailure(data,labels){
    const failures=Array.isArray(data?.failures)?data.failures:[];
    return failures.find(failure=>labels.includes(failure?.label))||null;
  }
  // Freshness for one Overview section: a failed fetch is named, and a result time is never replaced by the fetch time.
  // A section whose source failed this refresh (#597 follow-up, Nov 3): previously loaded data is marked as such, with the
  // time it was loaded only when that time was recorded; with nothing loaded before, the section is unavailable.
  function retainedNotice(data,labels,{hasData,loadedAt}={}){
    if(!signalRefreshFailure(data,labels))return null;
    return hasData
      ?{retained:true,text:'Couldn’t refresh · showing previously loaded data'+(loadedAt&&Number.isFinite(dateMs(loadedAt))?' · last fetched at '+fmtDate(loadedAt):'')}
      :{retained:false,text:'Couldn’t refresh · no previously loaded data'};
  }
  function sectionFreshness(data,labels,resultAt,{hasData=true,staleHours=24,noun='Updated',loadedAt=null}={}){
    const failure=signalRefreshFailure(data,labels);
    // Nov 3: one saved-data wording everywhere, with the last successful fetch time rather than an ambiguous "from".
    if(failure)return {label:hasData?'Couldn’t refresh · showing previously loaded data'+(loadedAt&&Number.isFinite(dateMs(loadedAt))?' · last fetched at '+fmtDate(loadedAt):''):'Couldn’t refresh',stale:true,retained:hasData};
    if(!resultAt)return {label:noun+' time unknown',stale:true};
    const meta=freshnessMeta(resultAt,null,staleHours);
    return noun==='Updated'?meta:{...meta,label:meta.stale?'May be stale · '+noun.toLowerCase()+' '+relativeAge(resultAt):noun+' '+relativeAge(resultAt)};
  }
  function freshnessMeta(value,fallback,staleHours=24){
    const ts=value||fallback;
    if(!ts)return {label:'Freshness unknown',stale:true};
    const ageMs=Math.max(0,Date.now()-dateMs(ts));
    if(!Number.isFinite(ageMs))return {label:'Freshness unknown',stale:true};
    const stale=ageMs>staleHours*60*60*1000;
    return {label:(stale?'May be stale · ':'Updated ')+relativeAge(ts),stale};
  }
  function qualitySnapshot(data){
    if(data?.project?.quality==='state'){
      const review=data.quality?.review,ask=data.quality?.ask;
      return {
        reviewAt:review?.created_at||null,
        askAt:ask?.created_at||null,
        reviewScore:evalScore(review),
        askScore:evalScore(ask),
        reviewTotal:review?.total??null,
        askTotal:ask?.total??null,
        // Saved so a later visit can apply the scenario-set rule (Nov 3); without them no visit comparison is possible.
        reviewScenarioIds:Array.isArray(review?.scenario_ids)?review.scenario_ids.map(String):null,
        askScenarioIds:Array.isArray(ask?.scenario_ids)?ask.scenario_ids.map(String):null,
        severe:Number(review?.high_severity_failures||0)+Number(ask?.high_severity_failures||0)
      };
    }
    const q=data?.externalQuality||{};
    return {updatedAt:q?.ci?.updated_at||q?.recorded?.updated_at||null,status:JSON.stringify(q?.attention||[])};
  }
  function visitBaseline(saved){
    if(!saved)return null;
    const projectId=saved.projectId||saved.project?.id||null;
    const pseudo={project:{quality:projectId==='state'?'state':null},quality:saved.quality,externalQuality:saved.externalQuality};
    return {
      savedAt:saved.snapshotAt||saved.checkedAt||null,
      deliverySha:saved.delivery?.sha||null,
      // The last known delivery state: a snapshot saved while delivery read "unknown" keeps the state
      // before it, so Healthy → Unknown → Needs attention still shows as Healthy → Needs attention.
      deliveryKind:knownDeliveryKind(saved.delivery?.vercel?.kind)||knownDeliveryKind(saved.deliveryKnownKind)||null,
      quality:qualitySnapshot(pseudo),
      analyticsAvailable:saved.platform?.analytics?.available??null,
      analyticsReceiving:analyticsReceiving(saved.platform?.analytics),
      openPullRequests:Array.isArray(saved.openPullRequests)?saved.openPullRequests.length:0
    };
  }
  function knownDeliveryKind(kind){return ['good','warn','bad'].includes(kind)?kind:null;}
  function healthStateLabel(kind){
    return kind==='bad'?'Needs attention':kind==='warn'?'Watch':kind==='good'?'Healthy':kind==='available'?'Data available':'Unknown';
  }
  // Score change in percentage points (one decimal), or null when either score is missing. A change that
  // rounds to zero is exactly 0, so it reads "Unchanged", never "Improved 0 points" (Cowork, Oct 12).
  function scoreDeltaPoints(current,previous){
    if(current==null||previous==null)return null;
    const delta=Math.round((Number(current)-Number(previous))*1000)/10;
    if(!Number.isFinite(delta))return null;
    return delta===0?0:delta;
  }
  function evalChangeDetail(delta,score){
    if(delta==null)return 'New controlled run recorded · '+percent(score);
    if(delta===0)return 'Unchanged at '+percent(score);
    return (delta>0?'Improved ':'Declined ')+Math.abs(delta)+' points to '+percent(score);
  }
  function meaningfulChanges(data){
    const before=data?.lastVisit;
    if(!before)return[];
    const items=[];
    if(before.deliverySha&&data.delivery?.sha&&before.deliverySha!==data.delivery.sha){
      items.push({title:'New production release',detail:commitTitle(data.delivery.message),observedAt:data.delivery.updatedAt||data.checkedAt,tab:'overview',section:'deliveryPanel'});
    }
    // Only a move between two known delivery states is a change. "Unknown" means the check could not
    // confirm a state (no Vercel status yet, a slow or failed load during a deploy restart), so
    // "Healthy → Unknown" and its "Unknown → Healthy" pair are never shown (Cowork, Oct 12). This runs at
    // render time against the saved baseline, so older snapshots holding "unknown" are filtered too.
    const previousKnown=knownDeliveryKind(before.deliveryKind),currentKnown=knownDeliveryKind(data.delivery?.vercel?.kind);
    if(previousKnown&&currentKnown&&previousKnown!==currentKnown){
      const previousDelivery=previousKnown,currentDelivery=currentKnown;
      const improved=currentDelivery==='good'&&previousDelivery!=='good';
      items.push({title:improved?'Delivery status improved':'Delivery status changed',detail:healthStateLabel(previousDelivery)+' → '+healthStateLabel(currentDelivery),observedAt:data.delivery.updatedAt||data.checkedAt,tab:'overview',section:'deliveryPanel'});
    }
    const currentQ=qualitySnapshot(data),oldQ=before.quality||{};
    // #597: a different scenario set or contract is a new baseline, not an improvement or decline.
    const visitComparison=(kind,name)=>{
      const comparison=runComparability({total:currentQ[kind+'Total'],scenario_ids:currentQ[kind+'ScenarioIds'],created_at:currentQ[kind+'At']},{total:oldQ[kind+'Total'],scenario_ids:oldQ[kind+'ScenarioIds'],created_at:oldQ[kind+'At']},data?.quality?.contractUpdatedAt);
      // A visit saved before Nov 3 has no scenario list: say that, rather than blaming the run records.
      const text=comparison.reason==='unrecorded'&&currentQ[kind+'ScenarioIds']&&!oldQ[kind+'ScenarioIds']?'your last visit didn\u2019t save which scenarios ran':comparison.text;
      if(!comparison.comparable)return {title:name+' eval '+(comparison.reason==='unrecorded'?'re-run':'re-run on a different test'),detail:'Not comparable with your last visit: '+text+' \u00b7 now '+percent(currentQ[kind+'Score'])};
      const delta=scoreDeltaPoints(currentQ[kind+'Score'],oldQ[kind+'Score']);
      return {title:name+' eval '+(delta===0?'re-run':'changed'),detail:evalChangeDetail(delta,currentQ[kind+'Score'])};
    };
    if(currentQ.reviewAt&&oldQ.reviewAt&&String(currentQ.reviewAt)!==String(oldQ.reviewAt)){
      items.push({...visitComparison('review','Update-understanding'),observedAt:currentQ.reviewAt,tab:'ai-quality'});
    }
    if(currentQ.askAt&&oldQ.askAt&&String(currentQ.askAt)!==String(oldQ.askAt)){
      items.push({...visitComparison('ask','Answer-quality'),observedAt:currentQ.askAt,tab:'ai-quality'});
    }
    if(currentQ.severe!=null&&oldQ.severe!=null&&currentQ.severe!==oldQ.severe){
      items.push({title:'Failures in high-severity scenarios changed',detail:oldQ.severe+' → '+currentQ.severe,observedAt:data.checkedAt,tab:'ai-quality'});
    }
    const analytics=data.platform?.analytics;
    if(before.analyticsAvailable!==null&&analytics&&before.analyticsAvailable!==analytics.available){
      items.push({title:'Site analytics availability changed',detail:(before.analyticsAvailable?'Available':'Unavailable')+' → '+(analytics.available?'Available':'Unavailable'),observedAt:data.detailCheckedAt||data.checkedAt,tab:'overview',section:'systemsDetails'});
    }
    const receivingNow=analyticsReceiving(analytics);
    if(analytics?.available&&before.analyticsReceiving!=null&&receivingNow!=null&&receivingNow!==before.analyticsReceiving){
      items.push({title:'Site analytics changed',detail:(before.analyticsReceiving?'Receiving page views':'No page views')+' → '+(receivingNow?'Receiving page views':'No page views')+' in the last 30 days',observedAt:data.detailCheckedAt||data.checkedAt,tab:'overview'});
    }
    const prCount=Array.isArray(data.openPullRequests)?data.openPullRequests.length:0;
    if(Number(before.openPullRequests||0)!==prCount){
      items.push({title:'Open work changed',detail:Number(before.openPullRequests||0)+' → '+prCount+' open pull requests',observedAt:data.detailCheckedAt||data.checkedAt,tab:'activity'});
    }
    return items.sort((a,b)=>(dateMs(b.observedAt)||0)-(dateMs(a.observedAt)||0));
  }
  function changedSinceVisit(data){return meaningfulChanges(data).length>0;}
  function trendText(value){
    if(value==null||Number.isNaN(Number(value)))return'No comparison yet';
    const n=Number(value);if(Math.abs(n)<0.1)return'About the same as the previous 30 days';
    return (n>0?'↑ ':'↓ ')+Math.abs(n)+'% vs previous 30 days';
  }
  function activityReviewItems(data){
    const activity=data?.activity;if(!activity?.available)return[];
    const items=[];
    for(const failure of activity.deployments?.recent_failures||[]){
      items.push({
        key:data.project.id+':deploy:'+failure.id,
        project:data.project.name,
        kind:'deployment',
        title:failure.recovered?'Deployment failed, then recovered':'Release blocked · production unaffected',
        detail:(failure.message||'Deployment failure')+(failure.recovered&&failure.recovered_at?' · recovered '+relativeAge(failure.recovered_at):''),
        impact:failure.recovered?'A later deployment recovered the failed release.':'The latest change did not deploy; the previous production version should remain available.',
        userImpact:{status:'No confirmed impact',kind:'good',detail:'The previous production version remained available.'},
        owner:failure.recovered?'No action':'Engineering',
        observedAt:failure.created_at,
        resolved:!!failure.recovered,
        url:failure.url||null
      });
    }
    for(const issue of activity.runtime?.issues||[]){
      items.push({
        key:data.project.id+':runtime:'+issue.key,
        project:data.project.name,
        kind:'runtime',
        title:(issue.status?('HTTP '+issue.status+' · '):'')+(issue.path||'Runtime error'),
        detail:(issue.count>1?issue.count+' occurrences · ':'')+(issue.message||'Runtime error'),
        impact:'Users may be seeing errors on this route; scope is unknown until the signal is investigated.',
        userImpact:{status:'Unknown',kind:'unknown',detail:'Confirm whether this runtime signal affected users.'},
        owner:'Engineering',
        observedAt:issue.last_seen,
        resolved:false,
        url:issue.source_url||null
      });
    }
    return items.sort((a,b)=>(b.observedAt||0)-(a.observedAt||0));
  }
  function row(label,value){return '<div class="row"><span>'+esc(label)+'</span><span>'+esc(value)+'</span></div>';}
  function metric(value,label){return '<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
  function durationLabel(ms){
    if(ms==null||Number.isNaN(Number(ms)))return'No calls yet';
    const value=Number(ms);
    return value<1000?Math.round(value)+' ms':(Math.round(value/100)/10)+' s';
  }
  function costLabel(value){
    if(value==null||Number.isNaN(Number(value)))return'Not measured';
    const amount=Number(value);
    if(amount===0)return'$0.00';
    if(amount<0.01)return'$'+amount.toFixed(4);
    return'$'+amount.toFixed(2);
  }
  function attentionMarkup(item){
    const meta=(item.owner||item.nextAction)?'<div class="attention-meta">'+(item.owner?'Owner: '+esc(item.owner):'')+(item.owner&&item.nextAction?' · ':'')+(item.nextAction?'Next: '+esc(item.nextAction):'')+'</div>':'';
    const content='<strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p>'+meta;
    if(item.category==='quality'&&['bad','warn'].includes(item.kind)){
      if(item.action==='run-ai-checks') return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-attention-action="run-ai-checks" aria-label="Run AI evals">'+content+'<span class="attention-action-label">Run AI evals →</span></button>';
      const isState=item.action==='review-ai-evals';
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-attention-action="review-quality" aria-label="'+esc(isState?'Review AI evals':'Review quality')+'">'+content+'<span class="attention-action-label">'+esc(isState?'Review AI evals →':'Review quality →')+'</span></button>';
    }
    if(item.category==='incomplete'){
      return '<button class="attention attention-action unknown" type="button" data-retry-health>'+content+'<span class="attention-action-label">Retry check →</span></button>';
    }
    if(item.category==='delivery'){
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-section-target="deliveryPanel">'+content+'<span class="attention-action-label">View delivery evidence →</span></button>';
    }
    if(item.category==='infrastructure'){
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-section-target="systemsDetails">'+content+'<span class="attention-action-label">View systems &amp; connections →</span></button>';
    }
    return '<div class="attention '+esc(item.kind||'')+'">'+content+'</div>';
  }

  function neonConnectionDetail(neon){
    if(!neon?.configured)return'Neon';
    const branch=neon.primary_branch||'primary';
    const state=String(neon.primary_branch_state||'').toLowerCase();
    if(state==='archived')return'Neon · '+branch+' · idle storage; resumes automatically';
    if(state)return'Neon · '+branch+' · '+state;
    return'Neon · '+branch;
  }

  function infraCardLabel(platform){
    const render=platform?.render;
    if(render?.configured){
      const production=render.environments?.production;
      const staging=render.environments?.staging;
      if(production&&!production.ok) return 'Production backend down';
      if(production?.ok&&staging&&!staging.ok) return 'Prod healthy · staging asleep?';
      if(production?.ok) return 'Backend healthy';
    }
    const neon=platform?.neon;
    if(neon?.configured&&neon.available) return 'Database connected';
    return 'No extra infra connected';
  }
  function analyticsConnectionValue(platform,pending=false){
    const a=platform?.analytics;
    if(pending)return'Checking…';
    if(a?.available)return'Connected';
    if(a?.configured&&[401,403].includes(Number(a.status)))return'Access denied';
    if(a?.configured&&Number(a.status)===404)return'Dataset unavailable';
    if(a?.configured)return'Temporarily unavailable';
    return'Not connected';
  }
  function analyticsGapDetail(analytics){
    const a=analytics||{};
    if(a.configured===false)return'Not connected yet. This limits trend and adoption context.';
    if([401,403].includes(Number(a.status)))return'Vercel rejected the dashboard token for this project. Update the token scope or permissions.';
    if(Number(a.status)===404)return'Vercel could not return this project’s Web Analytics dataset. Verify project access and analytics availability.';
    return'Vercel Web Analytics is connected, but the latest query failed. Try again before treating this as missing usage.';
  }
  // Cowork, Oct 11: show the signal, not the counts. The API now returns only receiving/recent booleans; an older
  // cached snapshot may still hold a count, which is reduced to the same boolean here and never displayed.
  function analyticsReceiving(analytics){
    if(!analytics?.available)return null;
    if(typeof analytics.receiving==='boolean')return analytics.receiving;
    const legacy=Number(analytics.pageviews);
    return analytics.pageviews!=null&&Number.isFinite(legacy)?legacy>0:null;
  }
  function analyticsSignal(analytics){
    const a=analytics||{};
    if(!a.available)return null;
    const receiving=analyticsReceiving(a),days=Number(a.recent_days)||7;
    if(receiving===false)return {kind:'warn',status:'Connected · no page views yet',detail:'No page views recorded in the last '+(Number(a.period_days)||30)+' days.'};
    const recency=a.recent===true?'Page views recorded in the last '+days+' days.'
      :a.recent===false?'No page views in the last '+days+' days.'
      :'Recent activity could not be checked.';
    if(receiving===true)return {kind:'good',status:'Connected · receiving page views',detail:recency};
    return {kind:'good',status:'Connected',detail:'Vercel Web Analytics is connected.'};
  }
  function analyticsLabel(platform){
    const signal=analyticsSignal(platform?.analytics);
    if(signal) return signal.status;
    return analyticsConnectionValue(platform);
  }
  // DEC-012's revisit trigger: what the open paid eval button has cost (an upper bound: every finished run, any trigger).
  function paidRunSpendText(spend){
    if(!spend)return '';
    const n=Number(spend.count||0);
    // Scope (Nov 3): GitHub workflow runs from every branch, trigger and record destination, not results in this environment.
    return 'Paid eval workflow runs in the last 30 days, all environments: '+n+(spend.cost_upper_usd!=null?' (at most $'+Number(spend.cost_upper_usd).toFixed(2)+' at the configured estimate)':'')+'. Counts every finished GitHub run from any branch or trigger, wherever it recorded results, so it can differ from the results shown here.';
  }
  function investigationSpendText(spend){
    if(!spend)return '';
    const n=Number(spend.calls||0);
    return 'AI investigations in the last 30 days (all projects): '+n+(n?' · about $'+Number(spend.estimated_usd||0).toFixed(n&&spend.estimated_usd<0.01?4:2):'')+(spend.unpriced_calls?' plus '+spend.unpriced_calls+' unpriced':'')+'.';
  }
  function projectQualityLabel(data){
    if(data.project.quality==='state'){
      if(!data.quality) return 'Quality unavailable';
      const q=qualityAttention(data.quality,data);
      if(q.kind==='good') return 'AI evals healthy';
      if(q.kind==='bad') return 'AI evals need action';
      if(q.kind==='warn') return 'AI evals need a look';
      return q.title;
    }
    if(data.project.noQualitySource) return 'Not connected yet';
    const q=data.externalQuality;if(!q) return 'Quality unavailable';
    const top=externalQualityAttention(q);
    if(q.project==='tastemake'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'Recommendation checks healthy';
    if(q.project==='authority-lab'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'Automated tests pass';
    if(q.project==='narc'&&q.recorded?.recorded_all_suites_green) return q.recorded.full_playtest_pending?'Automated checks pass · playtest open':'Game checks healthy';
    return top?.title||'Quality loaded';
  }
  // Project switcher cards (visual pass, Oct 11): every card has the same two rows so states line up across cards.
  // Row 1: name (one line) and status pill, centred on each other. Row 2: optional stage tag inline before the detail.
  function stageTag(project){return project.stageLabel?'<em class="stage-tag">'+esc(project.stageLabel)+'</em>':'';}
  function switcherCardInner(project,pill,detail){
    return '<span class="project-switcher-head"><strong class="project-switcher-name">'+esc(project.name)+'</strong>'+pill+'</span>'+
      '<span class="project-switcher-detail">'+stageTag(project)+'<span class="project-switcher-signal">'+esc(detail)+'</span></span>';
  }
  function loadingCardMarkup(project,active){
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'" aria-busy="true">'+
      switcherCardInner(project,'<span class="status-pill unknown">Checking</span>','Checking project health…')+'</button>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),pending=pendingSet(data);
    const attention=overallAttention(data);
    const signal=pending.size&&!coreStatusKnown(data)
      ?'Checking project health…'
      :status.kind==='good'&&activityStillLoading(data)
      ?'Checking deployment activity…'
      :(status.key==='partial'?(attention.partialQuality?unmeasuredText(unmeasuredQuality(data)):'No delivery or runtime problems'):status.kind==='good'?'No current product-quality action':attention.title);
    // A shortened pill keeps the full label as its tooltip and as the text screen readers hear.
    const pill=status.shortLabel
      ?'<span class="status-pill '+esc(status.key)+'" title="'+esc(status.label)+'"><span aria-hidden="true">'+esc(status.shortLabel)+'</span><span class="visually-hidden">'+esc(status.label)+'</span></span>'
      :'<span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span>';
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'">'+
      switcherCardInner(data.project,pill,signal||'No current issue')+'</button>';
  }
  function evalSuiteLabel(run){
    const suite=String(run?.suite||run?.eval_suite||'').toLowerCase();
    if(suite==='review_interpretation') return 'Understanding project updates';
    if(suite==='ask_quality') return 'Answer quality';
    return suite?String(suite).replaceAll('_',' '):'Quality check';
  }
  function evalScore(run){
    if(!run)return null;
    const value=run.overall_pass_rate??run.interpretation_accuracy??run.ask_grounding;
    return value==null?null:Number(value);
  }
  // State's four quality measurements (Oct 27 review): each card's score, failure count and change come from the same
  // field, so a card can never show one metric's score next to another's trend ("100%, down 10" on Answer quality).
  const STATE_QUALITY_METRICS=[
    {label:'Update understanding',run:'review',suite:'review_interpretation',field:'interpretation_accuracy',check:'interpretation',sub:'Interpreting new evidence'},
    {label:'Evidence grounding',run:'ask',suite:'ask_quality',field:'ask_grounding',check:'grounding',sub:'Answers stay on the record'},
    {label:'Decision authority',run:'ask',suite:'ask_quality',field:'authority_accuracy',check:'authority',sub:'Authority boundary scenarios'},
    {label:'Uncertainty handling',run:'ask',suite:'ask_quality',field:'uncertainty_accuracy',check:'uncertainty',sub:'Unknown-answer scenarios'}
  ];
  function metricScore(row,field){
    if(!row)return null;
    const value=field?row[field]:evalScore(row);
    return value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
  }
  // The latest two runs of a suite, newest first, compared on one field (or the suite's overall score).
  // Two runs of a suite are compared only when they scored the same number of scenarios under the same contract (#597):
  // a pass rate over 12 cases and one over 13 differ in what was tested, not only in how State did. The latest commit to
  // the contract files is all Project Health knows, so a change between the two runs is detected; a same-size swap of
  // scenarios with no contract commit cannot happen without one.
  // Two runs are comparable only when the record shows they ran the same scenarios against the same expected-behavior
  // contract (Paige, Nov 3). An equal count does not establish the same set, and current run records do not list their
  // scenarios, so without that list a comparison is omitted rather than guessed.
  // #639 (Nov 7): a run records its scoring version (a fingerprint of the scenarios and the scoring code). Runs recorded
  // before then have none and read as "legacy / version unknown"; no version is assigned to them after the fact.
  const LEGACY_SCORING_LABEL='legacy / version unknown';
  // Nov 7 (#640/#642): scenarios the Ask gate leaves out (known-unsupported capability, or observe-only). Totals still
  // count them; only gate eligibility does not. Read from the catalog, and only when it has as many scenarios as the
  // run scored, so a different scenario set is never described.
  function gateEligibility(run){
    const suite=run?.suite==='ask_quality'?'ask':run?.suite==='review_interpretation'?'review':null;
    const catalog=evalCatalog(),list=suite&&Array.isArray(catalog?.[suite])?catalog[suite]:[];
    const total=Number(run?.total||0);
    if(!suite||!total||list.length!==total)return null;
    const excluded=list.filter(item=>item?.known_unsupported||item?.observe_only).map(item=>({id:item.id,known:item.known_unsupported||'',observeOnly:!!item.observe_only}));
    if(!excluded.length)return null;
    const failedIds=new Set((Array.isArray(run?.failure_details)?run.failure_details:[]).map(d=>String(d?.scenario_id||'')));
    const excludedFailed=excluded.filter(item=>failedIds.has(item.id)).length;
    const eligible=total-excluded.length,eligibleFailed=failedIds.size-excludedFailed;
    return {eligible,eligibleFailed,eligiblePassed:Math.max(0,eligible-eligibleFailed),excluded,excludedFailed,
      text:'Release gate: '+Math.max(0,eligible-eligibleFailed)+' of '+eligible+' eligible scenarios passed; '+excluded.length+' not counted ('+
        excluded.map(item=>item.known?'known unsupported, '+(item.known.match(/#\d+/)||['held'])[0]:'observe-only').join('; ')+
        (excludedFailed?', '+excludedFailed+' failing':'')+').'};
  }
  const SYNTHETIC_EXCERPT_LABEL='Synthetic eval excerpt (model answer to a test fixture)';
  function scoringVersionLabel(run){const v=String(run?.scoring_version||'').trim();return v||LEGACY_SCORING_LABEL;}
  function runComparability(current,previous,contractChangedAt){
    const va=String(current?.scoring_version||'').trim(),vb=String(previous?.scoring_version||'').trim();
    if(va&&vb)return va===vb?{comparable:true,reason:null,text:''}:{comparable:false,reason:'scoring-version',text:'scored under a different scoring version'};
    if(va||vb)return {comparable:false,reason:'scoring-version',text:'one of the runs is '+LEGACY_SCORING_LABEL};
    const a=Number(current?.total),b=Number(previous?.total);
    if(Number.isFinite(a)&&Number.isFinite(b)&&a>0&&b>0&&a!==b)return {comparable:false,reason:'scenario-set',text:'scenario set changed ('+b+' \u2192 '+a+' cases)'};
    const idsA=Array.isArray(current?.scenario_ids)?[...new Set(current.scenario_ids.map(String))].sort():null;
    const idsB=Array.isArray(previous?.scenario_ids)?[...new Set(previous.scenario_ids.map(String))].sort():null;
    if(!idsA||!idsB)return {comparable:false,reason:'unrecorded',text:'the run records don\u2019t show which scenarios ran'};
    if(idsA.join('\n')!==idsB.join('\n'))return {comparable:false,reason:'scenario-set',text:'scenario set changed'};
    const fetched=dateMs(contractChangedAt);
    const changed=Math.max(dateMs(STATE_EVAL_CONTRACT_UPDATED_AT),Number.isFinite(fetched)?fetched:-Infinity);
    const before=dateMs(previous?.created_at),after=dateMs(current?.created_at);
    if(Number.isFinite(before)&&Number.isFinite(after)&&before<changed&&changed<=after)return {comparable:false,reason:'contract',text:'eval contract changed between the runs'};
    return {comparable:true,reason:null,text:''};
  }
  function metricChange(recent,suite,field,contractChangedAt){
    const rows=(Array.isArray(recent)?recent:[]).filter(item=>item?.suite===suite).slice().sort((a,b)=>(dateMs(b?.created_at)||0)-(dateMs(a?.created_at)||0));
    if(rows.length<2)return {status:'none'};
    const a=metricScore(rows[0],field),b=metricScore(rows[1],field);
    if(a==null||b==null)return {status:'incomparable'};
    const comparison=runComparability(rows[0],rows[1],contractChangedAt);
    if(!comparison.comparable)return {status:'not-comparable',reason:comparison.reason,text:comparison.text};
    return {status:'ok',points:Math.round((a-b)*1000)/10};
  }
  function evalTrend(recent,suite,field,contractChangedAt){
    const change=metricChange(recent,suite,field,contractChangedAt);
    if(change.status==='none')return'No earlier run to compare yet';
    if(change.status==='incomparable')return'No comparable score yet';
    if(change.status==='not-comparable')return'Not comparable with the previous run: '+change.text;
    if(Math.abs(change.points)<0.1)return'Stable vs previous run';
    return (change.points>0?'Up ':'Down ')+Math.abs(change.points)+' points vs previous run';
  }
  // The Overview's State cards: score, failures, change and trend all read the card's own field.
  function stateMetricCards(q,unknownSignal='Not measured'){
    return STATE_QUALITY_METRICS.map(m=>{
      const run=q?.[m.run],score=metricScore(run,m.field),severe=failureCheckCount(q,m.check);
      const kind=score==null?'unknown':severe?'bad':score<1?'warn':'good';
      const misses=scenarioCounts(run,score)?.failed;
      // An older run can record failures in high-severity scenarios without per-scenario details; never call those lower-severity.
      const unattributed=!severe&&Number(run?.high_severity_failures||0)>0&&!(Array.isArray(run?.failure_details)&&run.failure_details.length);
      if(unattributed&&score!=null&&score<1)return {label:m.label,score,kind:'bad',signal:m.run==='review'?highSeverityFailureText(run.high_severity_failures):'Failures in high-severity scenarios in this suite',sub:scenarioPassLabel(run,score),display:scenarioCountDisplay(run,score),percent:percent(score),delta:mockDelta(q?.recent,m.suite,m.field,q?.contractUpdatedAt),trend:mockTrendValues(q,m.suite,m.field)};
      const signal=score==null?unknownSignal:severe?highSeverityFailureText(severe):score<1?(misses?misses+' lower-impact miss'+(misses===1?'':'es'):'Lower-impact miss'):'0 failures';
      return {label:m.label,score,kind,signal,sub:score==null?m.sub:scenarioPassLabel(run,score),display:score==null?null:scenarioCountDisplay(run,score),percent:score==null?null:percent(score),delta:mockDelta(q?.recent,m.suite,m.field,q?.contractUpdatedAt),trend:mockTrendValues(q,m.suite,m.field)};
    });
  }
  function stateEvalCard(title,value,description,trend,note){
    return '<div class="eval-card compact"><strong>'+esc(title)+'</strong><div class="score">'+esc(value)+'</div><div class="eval-card-meta">'+
      (description?'<span>'+esc(description)+'</span>':'')+
      (note?'<span class="failure">'+esc(note)+'</span>':'')+
      (trend?'<span class="trend">'+esc(trend)+'</span>':'')+
      '</div></div>';
  }
  function stateScenarioCard(title,score,run,trend,note){
    const pass=scenarioPassLabel(run,score)||'Scenario count unavailable';
    const trendClass=/^Down /i.test(String(trend||''))?'down':/^Up /i.test(String(trend||''))?'up':'flat';
    return '<div class="eval-card compact state-scenario-card"><strong>'+esc(title)+'</strong>'+
      '<div class="scenario-result">'+esc(pass.replace(' passed',' scenarios passed'))+'</div>'+
      '<div class="eval-card-meta">'+
        (note?'<span class="failure">'+esc(note)+'</span>':'<span class="healthy-note">No failures in high-severity scenarios</span>')+
        (trend?'<span class="trend '+trendClass+'">'+esc(trend)+'</span>':'')+
        '<span class="score-secondary">'+esc(percent(score))+'</span>'+
      '</div></div>';
  }
  // "15 of 16 passed" (#597). Rates leave out scenarios that errored, so the count does too: passed of scored.
  function scenarioCounts(run,score){
    const total=Number(run?.total||0),errors=Math.max(0,Number(run?.errors||0)),value=Number(score);
    if(!total||score==null||!Number.isFinite(value))return null;
    const scored=Math.max(0,total-errors),passed=Math.round(scored*value);
    return {passed,scored,failed:scored-passed,errors,total};
  }
  function scenarioPassLabel(run,score){
    const counts=scenarioCounts(run,score);
    if(!counts)return'';
    return counts.passed+' of '+counts.scored+' passed'+(counts.errors?' · '+counts.errors+' could not be scored':'');
  }
  function scenarioCountDisplay(run,score){const counts=scenarioCounts(run,score);return counts?counts.passed+' of '+counts.scored:null;}
  // How the cards' denominators relate (#597): the answer cards share the same Ask answers, so the unique-case total is
  // the two suites' totals, not the sum of every card. Applicability comes from the scenario catalog, and only when the
  // catalog has as many Ask scenarios as the run scored, so a different scenario set is never described.
  function evalScenarioCountsNote(q){
    const reviewTotal=Number(q?.review?.total||0),askTotal=Number(q?.ask?.total||0);
    if(!reviewTotal&&!askTotal)return'';
    const parts=[];
    if(reviewTotal&&askTotal){
      parts.push((reviewTotal+askTotal)+' unique scenarios: '+reviewTotal+' update-understanding case'+(reviewTotal===1?'':'s')+' and '+askTotal+' Ask answer'+(askTotal===1?'':'s')+'.');
    }else if(reviewTotal){
      parts.push(reviewTotal+' update-understanding case'+(reviewTotal===1?'':'s')+'; no Ask results are recorded.');
    }else{
      parts.push(askTotal+' Ask answer'+(askTotal===1?'':'s')+'; no update-understanding results are recorded.');
    }
    if(askTotal){
      parts.push('Evidence grounding, decision authority and uncertainty handling each score the same '+askTotal+' answers, so those three cards do not add up to more cases.');
      const catalog=evalCatalog(),askScenarios=Array.isArray(catalog?.ask)?catalog.ask:[];
      if(askScenarios.length===askTotal){
        const authority=askScenarios.filter(item=>item.should_distinguish_proposal_from_truth).length;
        const uncertainty=askScenarios.filter(item=>item.should_express_uncertainty).length;
        parts.push('Decision authority is tested in '+authority+' of them and uncertainty in '+uncertainty+'; the other answers pass those checks automatically.');
      }
    }
    parts.push('These are controlled, synthetic scenarios; they do not measure live answers.');
    return parts.join(' ');
  }
  function stateEvalHistory(){return'';}
  function mockSparkline(values){
    const nums=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite).slice(0,8).reverse();
    if(nums.length<2)return'';
    const w=54,h=28,p=2,min=Math.min(...nums),max=Math.max(...nums),range=Math.max(.001,max-min);
    const pts=nums.map((v,i)=>{
      const x=p+(i*(w-p*2)/(nums.length-1));
      const y=h-p-((v-min)/range)*(h-p*2);
      return {x,y};
    });
    return '<div class="mock-sparkline"><svg viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+pts.map(pt=>pt.x.toFixed(1)+','+pt.y.toFixed(1)).join(' ')+'"></polyline>'+pts.map(pt=>'<circle cx="'+pt.x.toFixed(1)+'" cy="'+pt.y.toFixed(1)+'" r="1.6"></circle>').join('')+'</svg></div>';
  }
  // The trend line covers only the unbroken comparable history ending with the latest run; with fewer than two such
  // runs there is no line (Paige, Nov 3).
  function mockTrendValues(q,suite,field){
    const rows=(Array.isArray(q?.recent)?q.recent:[]).filter(item=>item?.suite===suite&&metricScore(item,field)!=null).slice().sort((a,b)=>(dateMs(b?.created_at)||0)-(dateMs(a?.created_at)||0));
    const comparable=rows.length?[rows[0]]:[];
    for(const row of rows.slice(1)){
      if(!runComparability(rows[0],row,q?.contractUpdatedAt).comparable)break;
      comparable.push(row);
    }
    return comparable.length>1?comparable.map(row=>metricScore(row,field)):[];
  }
  // A change in a pass rate is in percentage points, not percent (Oct 27 review).
  function mockDelta(recent,suite,field,contractChangedAt){
    const change=metricChange(recent,suite,field,contractChangedAt);
    if(change.status==='not-comparable')return {label:'Not comparable',cls:'flat',title:'Not comparable with the previous run: '+change.text};
    if(change.status!=='ok')return {label:'—',cls:'flat'};
    const d=change.points;
    if(Math.abs(d)<0.1)return {label:'0 pts',cls:'flat'};
    return {label:(d>0?'↑ ':'↓ ')+Math.abs(d)+' pts',cls:d>0?'':'down'};
  }
  // The investigation model writes **Label:** headings; show them as bold, not as asterisks (Oct 20).
  function reportHtml(text){return esc(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');}
  function plainReportLine(text){return String(text).replace(/\*\*([^*\n]+)\*\*/g,'$1');}
  function investigationResultHtml(investigation){
    if(investigation?.handoff) return '<div class="investigation-result agent-result"><div class="agent-kicker">Handoff preview</div><strong>Project handoff ready to review</strong><pre>'+esc(investigation.handoffText||investigation.report||'')+'</pre><p class="footnote">Project Health assembled this from the currently loaded delivery, quality, investigation, and product-decision signals. Review it before sharing.</p></div>';
    if(investigation?.loading) return '<div class="investigation-result agent-result" role="status"><div class="agent-kicker">Investigation</div><strong>Checking current health signals…</strong><p>Starting with current health signals and expanding only when the evidence points somewhere specific.</p></div>';
    if(investigation?.error) return '<div class="investigation-result agent-result" role="status"><div class="agent-kicker">Investigation</div><strong>Investigation unavailable</strong><p>'+esc(investigation.error)+'</p></div>';
    if(investigation?.quickCheck){
      const checks=Array.isArray(investigation.checks)?investigation.checks:[];
      return '<div class="investigation-result agent-result"><div class="agent-kicker">Project check · deterministic fallback</div><strong>'+esc(investigation.title||'Quick project check complete')+'</strong><p>'+esc(investigation.summary||'No live failure was available, so Project Health checked the current project signals instead.')+'</p>'+
        '<div class="agent-check-list">'+checks.map(item=>'<div class="agent-check"><span>'+esc(item.label)+'</span><strong>'+esc(item.value)+'</strong></div>').join('')+'</div>'+
        '<p class="footnote">No AI model was called for this fallback. It uses the health data already loaded by Project Health.</p></div>';
    }
    if(!investigation?.report)return'';
    // Say where a report came from (Oct 27 review): the quality investigation is assembled by rules from recorded eval
    // evidence; only the failure investigator calls a model, and its accuracy is not yet measured (DEC-011).
    const label=investigation.qualityInvestigation?'Quality investigation · built from recorded eval evidence':'AI investigation'+(investigation.model?' · '+esc(modelDisplayName(investigation.model)):'')+' · accuracy not yet measured';
    const title=investigation.qualityInvestigation?'Quality investigation · '+esc(fmtDate(investigation.observedAt)):'AI investigation · '+esc(fmtDate(investigation.observedAt));
    return '<div class="investigation-result agent-result"><div class="agent-kicker">'+label+'</div><strong>'+title+'</strong><pre>'+reportHtml(investigation.report)+'</pre>'+
      ((investigation.sources||[]).length?'<div class="investigation-sources"><strong>Evidence checked</strong> '+investigation.sources.map(source=>githubLink(esc(source.label),source.url)).join(' · ')+'</div>':'')+

      '<p class="footnote">'+(investigation.qualityInvestigation?'This investigation uses the recorded controlled-eval evidence already loaded by Project Health. No extra model call was made.':'The agent can inspect bounded evidence and draft a handoff. It cannot change code, configuration, or deployments.')+'</p></div>';
  }
  function evalRunComplete(quality,runState){
    if(!quality||!runState)return false;
    const changed=(run,baseline)=>!!run?.created_at&&String(run.created_at)!==String(baseline||'');
    if(runState.suite==='review')return changed(quality.review,runState.baselineReview);
    if(runState.suite==='ask')return changed(quality.ask,runState.baselineAsk);
    return changed(quality.review,runState.baselineReview)&&changed(quality.ask,runState.baselineAsk);
  }
  function externalQualityRunComplete(externalQuality,runState){
    if(!externalQuality||!runState)return false;
    const ci=externalQuality.ci;
    if(!ci?.updated_at||String(ci.updated_at)===String(runState.baselineUpdatedAt||''))return false;
    return String(ci.status||'').toLowerCase()==='completed'||!!ci.conclusion;
  }
  function evalFailureImpact(detail){
    const id=String(detail?.scenario_id||'');
    if(id==='review_direct_reversal')return 'Risk: stale Current State could remain active after authoritative evidence reverses it.';
    if(id==='review_question_answer_only')return 'Risk: the Question was handled, but the eval could not confirm that an optional State update stayed inside the evidence.';
    if(id==='review_unknown_not_false')return 'Risk: extra Review/Question burden for an uncertainty already represented in Current State; this is workflow noise rather than false truth.';
    if(id==='review_ambiguity_opens_question'&&String(detail?.observed||'').includes('state_at_risk'))return 'State flagged the maintained scope as at risk. That is an accepted ambiguity outcome and should not be treated as ignored evidence.';
    if(id==='review_ambiguity_opens_question')return 'Risk: ambiguous evidence was not surfaced through an accepted uncertainty path.';
    return 'Risk: controlled behavior differed from the product contract and needs scenario-level review.';
  }
  function previousEvalRun(quality,current){
    if(!current)return null;
    return (Array.isArray(quality?.recent)?quality.recent:[]).find(item=>item?.suite===current.suite&&String(item.created_at||'')!==String(current.created_at||''))||null;
  }

  // done = projects whose core status is known; activityNames = projects still waiting only on the
  // deployment-activity detail.
  function progressText(done,total,pendingNames,activityNames){
    const activity=Array.isArray(activityNames)&&activityNames.length?activityNames.join(', '):'';
    if(done>=total) return activity?'All '+total+' projects checked. Deployment activity still loading for '+activity+'.':'Finishing refresh…';
    const pending=Array.isArray(pendingNames)&&pendingNames.length?pendingNames.join(', '):'remaining projects';
    return 'Refreshing '+done+' of '+total+' projects… '+pending+' still checking.';
  }

  function quickProjectCheck(data){
    const checks=[];
    const delivery=data?.delivery;
    const runtimeSignal=data?.activity?.runtime;
    const runtimeIssues=Array.isArray(runtimeSignal?.issues)?runtimeSignal.issues:[];
    const quality=projectQualityLabel(data);
    checks.push({label:'Production deployment',value:delivery?.vercel?.kind==='good'?'Healthy':delivery?.vercel?.label||'Unknown'});
    checks.push({label:'Automated quality',value:quality||'Unknown'});
    checks.push({label:'User-facing server errors',value:runtimeSignal?.coverage==='not_monitored'?'Not monitored on this plan':runtimeSignal?.available===false?'Runtime log signal unavailable':runtimeIssues.length?runtimeIssues.length+' signal'+(runtimeIssues.length===1?'':'s'):'None found in bounded check'});
    const render=data?.platform?.render?.environments?.production;
    if(render) checks.push({label:'Production backend',value:render.ok?'Healthy':'Unavailable'});
    const unchecked=uncheckedSignals(data);
    if(unchecked.length) checks.push({label:'Not checked',value:"Couldn't load "+unchecked.map(item=>item.label+' ('+item.reason+')').join(', ')});
    const hasIssue=checks.some(item=>/needs action|failed|unavailable|signal|couldn't/i.test(String(item.value||'')));
    return {
      quickCheck:true,
      observedAt:new Date().toISOString(),
      title:hasIssue?'Quick check found something to review':'No immediate issue found',
      summary:hasIssue?'No live failure was selected, so Project Health ran its bounded project check and found a signal worth reviewing.':'No live failure was selected, so Project Health ran a bounded smoke check of the current delivery, quality, runtime, and backend signals.',
      checks
    };
  }

  function qualityInvestigation(data,scenarioId){
    const quality=data?.quality||{};
    const runs=[
      {label:'Update understanding',key:'review',run:quality.review},
      {label:'Answer quality',key:'ask',run:quality.ask}
    ].filter(item=>item.run);
    const affected=runs.filter(item=>{
      const score=evalScore(item.run);
      return Number(item.run?.high_severity_failures||0)>0||(score!=null&&score<1);
    });
    const allDetails=affected.flatMap(item=>(Array.isArray(item.run?.failure_details)?item.run.failure_details:[]).map(detail=>({...detail,suiteLabel:item.label,suiteKey:item.key})));
    const details=scenarioId?allDetails.filter(detail=>String(detail.scenario_id||'')===String(scenarioId)):allDetails;
    const targeted=scenarioId&&details.length?details[0]:null;
    const latestDate=runs.map(item=>item.run?.created_at).filter(Boolean).sort().pop()||new Date().toISOString();
    const review=quality.review,ask=quality.ask;
    const overallLines=[];
    if(review){
      const score=evalScore(review),passed=review?.total!=null&&score!=null?Math.round(Number(review.total)*score):null;
      overallLines.push('Update understanding: '+percent(score)+(passed!=null?' ('+passed+'/'+review.total+' scenarios)':'')+' · '+highSeverityFailureText(review.high_severity_failures));
    }
    if(ask)overallLines.push('Answer quality: '+percent(evalScore(ask))+' · '+highSeverityFailureText(ask.high_severity_failures));

    // Loading, empty and unavailable results are not a quality failure (Paige, Nov 3): say what is missing and what to do.
    if(!runs.length){
      const attention=qualityAttention(data?.quality,data);
      const nextStep=attention.unavailable?'Restore the missing checks before assessing project health.':'Run the controlled AI evals to get a quality result.';
      const report=['Current assessment',attention.title+'. '+attention.detail,'','Recommended next action',nextStep].join('\n');
      return {report,sources:[],observedAt:new Date().toISOString(),qualityInvestigation:true,noQualityResult:true,nextCheckpoint:attention.unavailable?'After the quality check loads.':'After the first controlled AI eval run is recorded.'};
    }

    if(stateEvalResultsStale(quality)){
      const report=[
        'Current assessment',
        stateEvalStaleReason(quality)+' The recorded failures are historical and should not be treated as current product failures.',
        '',
        'Historical result',
        overallLines.length?overallLines.map(line=>'- '+line).join('\n'):'- No historical aggregate result is available.',
        '',
        'Recommended next action',
        'Rerun the controlled AI evals. Use the new run as the current baseline before changing State behavior.',
        '',
        'Next checkpoint',
        'After the fresh AI eval run is recorded.'
      ].join('\n');
      return {
        report,
        sources:[{label:'State eval details',url:'https://www.contextswitch.tech/state-evals',observedAt:latestDate}],
        observedAt:latestDate,
        qualityInvestigation:true,
        staleEvalContract:stateEvalContractStale(quality),
        staleEvalBehavior:stateEvalBehaviorStale(quality),
        staleEvalResults:true,
        nextCheckpoint:'After the fresh AI eval run is recorded.'
      };
    }

    const runFor=detail=>detail?.suiteKey==='review'?review:detail?.suiteKey==='ask'?ask:null;
    const failedLines=details.length?details.map(detail=>{
      const story=failureStory(detail,runFor(detail));
      return '- '+detail.suiteLabel+' / '+detail.scenario_id+' (scenario severity: '+(detail.severity||'unknown')+'). '+story.heading+'.';
    }):['- Exact scenario metadata is unavailable for this older run, so Project Health can only report the suite-level result.'];
    // #596: a single failure is explained as Evidence → Observed → Expected → Consequence → Next step.
    const story=targeted?failureStory(targeted,runFor(targeted)):null;
    const storyLines=story?[
      '',
      'Evidence',
      story.evidence.text?story.evidence.lead+': '+story.evidence.text+story.evidence.setup.map(item=>'\n- '+item.label+': '+item.text).join(''):'Not available: the scenario setup is not in this page\u2019s catalog.',
      '',
      'Observed behavior',
      story.observed.text+(story.observed.recorded?'\nRecorded: '+story.observed.recorded:'')+(story.observed.excerpt?'\nProposed State (recorded excerpt'+(story.observed.excerpt.truncated?', cut off':'')+'): '+story.observed.excerpt.text:'')+(story.syntheticExcerpt?'\n'+story.syntheticExcerpt.label+': '+story.syntheticExcerpt.text:''),
      '',
      'Expected behavior',
      story.expected.text+story.expected.details.map(line=>'\n- '+line).join('')+(story.contractNote?'\nContract note: '+story.contractNote:''),
      ...(story.gaps.length?['','Not recorded',story.gaps.map(gap=>'- '+gap).join('\n')]:[])
    ]:[];

    const relevantRun=targeted?(targeted.suiteKey==='review'?review:ask):null;
    const previousRelevant=relevantRun?previousEvalRun(quality,relevantRun):null;
    const relevantScore=evalScore(relevantRun),previousScore=evalScore(previousRelevant);
    const changeLines=[];
    const relevantComparison=relevantRun&&previousRelevant?runComparability(relevantRun,previousRelevant,quality.contractUpdatedAt):{comparable:true};
    if(!relevantComparison.comparable){
      changeLines.push('- '+targeted.suiteLabel+' is not comparable with the previous run: '+relevantComparison.text+'. Treat this run as a new baseline.');
    }else if(relevantRun&&previousRelevant&&relevantScore!=null&&previousScore!=null){
      const delta=scoreDeltaPoints(relevantScore,previousScore);
      changeLines.push('- '+targeted.suiteLabel+' '+(delta===0?'unchanged at '+percent(relevantScore)+' since the previous run.':(delta>0?'improved ':'declined ')+Math.abs(delta)+' points from '+percent(previousScore)+' to '+percent(relevantScore)+'.'));
    }
    if(relevantComparison.comparable&&relevantRun&&previousRelevant&&Number(previousRelevant.high_severity_failures||0)!==Number(relevantRun.high_severity_failures||0)){
      changeLines.push('- '+targeted.suiteLabel+' failures in high-severity scenarios changed from '+Number(previousRelevant.high_severity_failures||0)+' to '+Number(relevantRun.high_severity_failures||0)+'.');
    }

    const why=targeted
      ?story.consequence.text
      :(details.length?'At least one current failure is in a high-severity scenario, which guards maintained project truth or another high-severity behavior.':affected.length?'The current miss is a quality/workflow issue rather than a production outage.':'No recorded scenario failed; some quality signals are not measured yet.');
    const nextStep=targeted
      ?story.nextStep
      :details.length
        ?'Review each failed scenario against the product contract. Fix State behavior only where the contract is still right; update the eval where the observed behavior is acceptable. Then rerun the affected suite.'
        :affected.length?'Inspect the affected suite and rerun after the next change so future failures record scenario-level evidence.'
        :(qualityAttention(quality,data).nextAction||'Run the controlled AI evals to get a quality result.');
    const nextCheckpoint=targeted?'After '+targeted.suiteLabel+' is rerun.':'After the affected eval suite is rerun.';
    const technical=[modelDisplayName((targeted?.suiteKey==='review'?review?.model_identifier:targeted?.suiteKey==='ask'?ask?.model_identifier:(review?.model_identifier||ask?.model_identifier))),shortSha((targeted?.suiteKey==='review'?review?.build:targeted?.suiteKey==='ask'?ask?.build:(review?.build||ask?.build)))].filter(Boolean).join(' · ');
    const report=[
      'Investigation scope',
      targeted?(targeted.suiteLabel+' · '+targeted.scenario_id):'Current AI eval failures',
      '',
      'What failed',
      targeted?'- '+story.heading+'. Scenario: '+story.title+' ('+story.severityLabel.toLowerCase()+').':failedLines.join('\n'),
      ...storyLines,
      '',
      targeted?'Consequence':'Why this matters',
      why,
      ...(changeLines.length?['','What changed since the previous run',changeLines.join('\n')]:[]),
      '',
      'Recommended next action',
      nextStep,
      '',
      'Overall AI eval status',
      overallLines.join('\n')||'No current controlled-eval result is available.',
      '',
      'Next checkpoint',
      nextCheckpoint,
      '',
      'Technical context',
      technical||'Model/build metadata unavailable'
    ].join('\n');
    return {
      report,
      sources:[{label:'State eval details',url:'https://www.contextswitch.tech/state-evals',observedAt:latestDate}],
      observedAt:latestDate,
      qualityInvestigation:true,
      scenarioId:targeted?.scenario_id||null,
      affectedSuite:targeted?.suiteLabel||null,
      nextCheckpoint
    };
  }

  function projectHandoff(data){
    const status=projectStatus(data);
    const notices=attentionItems(data).filter(item=>item.kind!=='good');
    const latestQuality=data?.project?.quality==='state'&&data.quality
      ?(stateEvalResultsStale(data.quality)
        ?'Needs rerun · '+stateEvalStaleReason(data.quality)+' Historical failures are not treated as current product failures.'
        :[data.quality.review,data.quality.ask].filter(Boolean).map(run=>evalSuiteLabel(run)+': '+percent(evalScore(run))+' · '+highSeverityFailureText(run.high_severity_failures)).join('\n'))
      :projectQualityLabel(data);
    const release=data?.delivery
      ?commitTitle(data.delivery.message)+' · '+fmtDate(data.delivery.updatedAt)
      :'Unavailable';
    const issueText=notices.length?notices.map(item=>'- '+item.title+': '+item.detail).join('\n'):'- Nothing currently needs action.';
    const investigation=data?.investigation;
    const prior=investigation?.qualityInvestigation&&data?.project?.quality==='state'&&stateEvalResultsStale(data.quality)
      ?'Historical AI-quality investigation from the previous State behavior. Rerun the checks before treating it as current.'
      :investigation?.handoff
        ?'The latest drawer state is already a handoff preview.'
        :investigation?.report
        ?investigation.report
        :investigation?.quickCheck
          ?[
              investigation.title||'Project check complete',
              investigation.summary||'',
              ...(Array.isArray(investigation.checks)?investigation.checks.map(item=>'- '+item.label+': '+item.value):[])
            ].filter(Boolean).join('\n')
          :investigation?.error
            ?'Investigation unavailable: '+investigation.error
            :'No focused investigation has been added to this handoff yet.';
    const hasActionableInvestigation=!!(investigation?.report||investigation?.quickCheck);
    const checkpoint=investigation?.qualityInvestigation
      ?(investigation.nextCheckpoint||'After the affected eval suite is rerun.')
      :data.project.nextReview;
    const handoffParts=[
      data.project.name+' project handoff',
      '',
      'Current status',
      status.label+' · '+(overallAttention(data).title||'No current issue'),
      '',
      'What needs attention',
      issueText,
      '',
      'Latest release',
      release,
      '',
      'Product quality',
      latestQuality||'Unavailable',
      '',
      'Latest investigation',
      prior
    ];
    if(!hasActionableInvestigation){
      handoffParts.push('','Next decision',operationalNextDecision(data));
    }
    handoffParts.push(
      '',
      'Next checkpoint',
      checkpoint,
      '',
      'Generated from Project Health. Review before sharing or acting on it.'
    );
    const handoffText=handoffParts.join('\n');
    return {
      handoff:true,
      handoffText,
      report:handoffText,
      observedAt:new Date().toISOString(),
      sources:[]
    };
  }

  return {PROJECTS,paidRunSpendText,investigationSpendText,currentCheckRuns,esc,shortSha,commitTitle,repoUrl,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,githubLink,changeUrl,commitLabel,htmlRow,linkedRow,githubApi,vercelFromStatus,deliveryHealth,normalizeQuality,percent,highSeverityFailureText,modelDisplayName,qualityAttention,deliveryAttention,deliveryAttentionForData,infrastructureAttention,externalQualityAttention,pendingSet,STATUS_SIGNALS,coreStatusKnown,activityStillLoading,productOpenItems,failureReason,uncheckedSignals,incompleteAttention,allAttentionSignals,overallAttention,projectStatus,qualityNotMeasured,unmeasuredQuality,PARTLY_MEASURED_LABEL,healthySummary,investigationUsesModel,actionNotes,RUN_COOLDOWN_MINUTES,runCooldown,latestRunStart,runCooldownFor,cooldownStartFromRetryAfter,attentionItems,setupGaps,releaseReadiness,regressionSignal,recurringFailureSignal,operationalSignals,healthConsistencyIssues,releaseRiskChecklist,productionRuntime,operationalNextDecision,failureCheckCount,failureExplanation,failureStory,evalScenario,scenarioTitle,SCENARIO_TITLES,parseReviewObserved,qualityFailureClassSummary,activityTimelineItems,activityDayLabel,activityTimeRange,evalBehaviorBranch,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,investigationHistorySummary,makeRunner,STATE_EVAL_CONTRACT_UPDATED_AT,dateMs,fmtDate,relativeAge,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,evalCoverageNote,freshnessMeta,qualitySnapshot,visitBaseline,knownDeliveryKind,healthStateLabel,scoreDeltaPoints,evalChangeDetail,meaningfulChanges,changedSinceVisit,trendText,activityReviewItems,row,metric,durationLabel,costLabel,attentionMarkup,neonConnectionDetail,infraCardLabel,analyticsConnectionValue,analyticsGapDetail,analyticsReceiving,analyticsSignal,analyticsLabel,projectQualityLabel,stageTag,loadingCardMarkup,cardMarkup,evalSuiteLabel,evalScore,evalTrend,STATE_QUALITY_METRICS,metricScore,metricChange,runComparability,gateEligibility,scoringVersionLabel,LEGACY_SCORING_LABEL,SYNTHETIC_EXCERPT_LABEL,failedItemFindings,stateMetricCards,stateEvalCard,stateScenarioCard,scenarioPassLabel,scenarioCounts,scenarioCountDisplay,evalScenarioCountsNote,qualityProvenance,qualityResultsAt,refreshStatus,signalRefreshFailure,sectionFreshness,retainedNotice,stateEvalHistory,mockSparkline,mockTrendValues,mockDelta,investigationResultHtml,evalRunComplete,externalQualityRunComplete,evalFailureImpact,previousEvalRun,progressText,quickProjectCheck,qualityInvestigation,projectHandoff};
});
