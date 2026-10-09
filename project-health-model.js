(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.PROJECT_HEALTH_MODEL=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Project Health's data and pure analysis (#452): project list, environment rules, and the functions that
  // turn GitHub/Vercel/eval payloads into health signals. No DOM, no network, no mutable state.
  // The page (project-health.js) renders these; keep anything that touches the DOM or fetches out of here.


  const PROJECTS=[
    {
      id:'state',name:'State',description:'Human-reviewed project truth system with maintained Current State.',repo:'pedringt/ai-learning',branch:'main',stagingBranch:'staging',quality:'state',releasePaths:['implementation-context-prototype','state-project-complete'],releaseIgnore:/project health|dashboard|assertion/i,evalBehaviorPaths:['state-project-complete/question_review_prompt.py','state-project-complete/ask_service.py','state-project-complete/anthropic_provider.py'],
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
      id:'authority-lab',name:'Authority Lab',stageLabel:'In progress',noRuntimeAi:true,noQualitySource:true,description:'Prototype for deciding what an AI capability is allowed to do, based on evidence.',repo:'pedringt/authority-lab',branch:'main',
      focus:'Show authority as explicit, evidence-earned, conditional, reversible, and authorized by a named person.',
      evidence:['Lifecycle walkthrough','Authority decisions','Record history','Reversibility'],
      nextDecision:'Decide whether the Refund recommendation walkthrough is clear enough to add a second capability.',
      nextReview:'After the next full lifecycle walkthrough.',
      owner:'Product',
      qualityLabel:'Prototype Quality',
      links:{
        live:'https://authority-lab.vercel.app',
        vercel:'https://vercel.com/cairn10/authority-lab'
      }
    }
  ];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function shortSha(sha){return sha?String(sha).slice(0,7):'Unknown';}
  function commitTitle(message){
    const sections=String(message||'').split(/\r?\n\s*\r?\n/).map(section=>section.trim()).filter(Boolean);
    const first=sections[0]?.split(/\r?\n/)[0]?.trim()||'';
    if(/^Merge pull request #\d+ from /i.test(first)||/^Merge branch .+ into /i.test(first)){
      return sections[1]?.split(/\r?\n/)[0]?.trim()||'Change title unavailable';
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

  function deliveryHealth(branch,status,checkRuns){
    const commit=branch?.commit||{};
    const failedChecks=(Array.isArray(checkRuns?.check_runs)?checkRuns.check_runs:[])
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
  function highImpactText(value){const n=Number(value||0);return n+' high-impact failure'+(n===1?'':'s');}
  function modelDisplayName(value){
    const raw=String(value||'');
    if(raw==='claude-haiku-4-5-20251001')return'Claude Haiku 4.5';
    return raw||'Model unavailable';
  }
  function qualityAttention(q){
    if(!q) return {kind:'unknown',title:'Quality data is not available yet',detail:'Project Health could not load a recent quality result.'};
    const runs=[q.review,q.ask].filter(Boolean);
    if(!runs.length) return {kind:'warn',title:'AI evals have not been recorded yet',detail:'Run the controlled checks to see how State handles understanding, evidence, uncertainty, and decision authority.'};
    if(stateEvalResultsStale(q)) return {kind:'warn',title:'AI evals need to be rerun',detail:stateEvalStaleReason(q)+' Historical failures are not treated as current product failures.',nextAction:'Run the controlled AI evals again.',owner:'Product'};
    const severe=runs.reduce((n,r)=>n+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:severe+' high-impact AI scenario'+(severe===1?'':'s')+' need review',detail:'Most aggregate quality signals may still look healthy; review the specific failed scenario'+(severe===1?'':'s')+' before deciding whether product behavior or the eval contract should change.',nextAction:'Review the failed scenario evidence and decide whether product behavior or the eval contract is wrong.',owner:'Product'};
    if(runs.some(r=>{const score=evalScore(r);return Number(r.failed_cases||0)>0||(score!=null&&score<1);})) return {kind:'warn',title:'Some AI evals need a look',detail:'At least one controlled scenario did not behave as expected.',nextAction:'Review the scenario-level miss, then rerun the affected suite.',owner:'Product'};
    const missing=[];
    if(!q.review||evalScore(q.review)==null) missing.push('update understanding');
    if(!q.ask||(q.ask.ask_grounding??evalScore(q.ask))==null) missing.push('answer quality');
    if(q.ask?.authority_accuracy==null) missing.push('decision authority');
    if(q.ask?.uncertainty_accuracy==null) missing.push('uncertainty handling');
    if(missing.length) return {kind:'warn',title:'Some AI quality signals are not measured',detail:'Project Health cannot call State quality healthy while '+missing.join(', ')+' '+(missing.length===1?'is':'are')+' unmeasured.',nextAction:'Run or repair the missing controlled quality checks before treating the quality signal as healthy.',owner:'Product'};
    return {kind:'good',title:'AI evals are healthy',detail:'The latest recorded checks did not report a high-impact failure.'};
  }
  function deliveryAttention(d){
    if(!d) return {kind:'warn',title:'Delivery status is unavailable',detail:'Project Health could not confirm the latest release status.'};
    if(d.vercel.kind==='bad') return {kind:'bad',title:'The latest version did not deploy',detail:'The existing production version should still be available while engineering reviews the failed release.'};
    if(Array.isArray(d.failedChecks)&&d.failedChecks.length) return {kind:'bad',title:'A release check failed',detail:'An automated check failed before this change could be trusted.'};
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
  function productOpenItems(data){
    const items=[],pending=pendingSet(data);
    if(!data?.project||pending.has('Quality')) return items;
    if(data.project.quality==='state'){
      if(!data.quality&&!data.fresh)return items;
      const q=qualityAttention(data.quality);
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
  function allAttentionSignals(data){
    const pending=pendingSet(data),signals=[];
    if(data.delivery) signals.push(deliveryAttentionForData(data));
    else if(data.fresh&&!pending.has('Delivery')) signals.push(deliveryAttentionForData(data));
    if(data.quality) signals.push(qualityAttention(data.quality));
    const external=externalQualityAttention(data.externalQuality);if(external) signals.push(external);
    const infra=infrastructureAttention(data.platform);if(infra) signals.push(infra);
    return signals;
  }
  function overallAttention(data){
    const pending=pendingSet(data);
    if(['Delivery','Quality','Production backend'].some(label=>pending.has(label))) return {kind:'unknown',title:'Checking project health',detail:'Core signals are still loading.'};
    const liveIncidents=activityReviewItems(data).filter(item=>!item.resolved);
    if(liveIncidents.length) return {kind:'bad',title:liveIncidents[0].title,detail:liveIncidents[0].impact};
    let quality=productOpenItems(data);
    if(!data?.project&&data?.quality){
      const fallback=qualityAttention(data.quality);
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
    return {kind:'good',title:'Healthy',detail:'No current incident or product-quality action needs attention.'};
  }
  function projectStatus(data){
    const att=overallAttention(data);
    if(att.kind==='unknown') return {key:'checking',label:'Checking',kind:'unknown'};
    if(att.kind==='bad') return {key:'action',label:'Needs attention',kind:'bad'};
    if(att.kind==='warn') return {key:'watch',label:'Watch',kind:'warn'};
    return {key:'healthy',label:'Healthy',kind:'good'};
  }
  function attentionItems(data){
    const incidents=activityReviewItems(data).filter(item=>!item.resolved).map(item=>({kind:'bad',title:item.title,detail:item.impact,owner:item.owner}));
    if(incidents.length) return incidents;
    let open=productOpenItems(data);
    if(!data?.project&&data?.quality){
      const fallback=qualityAttention(data.quality);
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
      if(runtime.available===false){
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
    if(p.id==='state'&&!platform?.neon?.available) gaps.push({label:'Database health',detail:'Not connected or unavailable. This is a monitoring gap, not a product incident.'});
    if(p.id==='state'&&run&&!run.configured) gaps.push({label:'Run AI evals',detail:'Dashboard-run setup is incomplete.'});
    if(p.id==='state'&&data?.quality){
      const evalBuilds=[data.quality.review?.build,data.quality.ask?.build]
        .map(value=>String(value||'').trim())
        .filter(value=>/^[0-9a-f]{7,40}$/i.test(value));
      const uniqueBuilds=[...new Set(evalBuilds)];
      const releaseSha=String(data?.delivery?.sha||'').trim();
      if(uniqueBuilds.length>1){
        gaps.push({label:'Eval build alignment',detail:'The latest controlled eval suites were recorded against different builds ('+uniqueBuilds.map(shortSha).join(' and ')+').'});
      }else if(uniqueBuilds.length===1&&/^[0-9a-f]{7,40}$/i.test(releaseSha)&&uniqueBuilds[0]!==releaseSha){
        gaps.push({label:'Current release eval coverage',detail:'Latest controlled eval evidence is from build '+shortSha(uniqueBuilds[0])+', while the current scoped release is '+shortSha(releaseSha)+'.'});
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
    if(incidents.length||open.some(item=>item.kind==='bad')) return {kind:'bad',label:'Needs attention',detail:'Resolve the current high-impact issue before treating the next release as healthy.'};
    if(open.length) return {kind:'warn',label:'Watch',detail:'Delivery is healthy, but a product-quality check or human review is still open.'};
    if(deliveryAttentionForData(data).kind==='good') return {kind:'good',label:'Healthy',detail:'Delivery is healthy and there is no current high-impact quality issue.'};
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
        signals.push({kind:'available',label:'AI response speed',status:changed?'Changed':'Measured',detail:'p95 '+durationLabel(p95)+' across '+sample+' '+(sample===1?'recorded call':'recorded calls')+comparison+'.'});
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
    if(readiness.kind==='good'&&open.some(item=>item.kind==='bad'))issues.push('Release health is healthy while a high-impact product-quality issue is open.');
    if(readiness.kind==='good'&&activityReviewItems(data).some(item=>!item.resolved))issues.push('Release health is healthy while an unresolved incident is open.');
    return issues;
  }
  function releaseRiskChecklist(data){
    const quality=data?.project?.quality==='state'?qualityAttention(data.quality):externalQualityAttention(data.externalQuality);
    const incidents=activityReviewItems(data).filter(item=>!item.resolved);
    const gaps=setupGaps(data).filter(gap=>gap.label!=='Agent workflow telemetry');
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
    if(data?.project?.quality==='state'&&data.quality){
      const q=qualityAttention(data.quality);
      if(stateEvalResultsStale(data.quality))return 'Rerun the AI evals before changing State behavior or the eval.';
      if(q.kind==='bad')return 'Review the high-impact failure class before changing the prompt, product behavior, or eval.';
      if(q.kind==='warn')return 'Review the quality miss and decide whether it represents product behavior or eval noise.';
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
    return 'No immediate product decision is required. Continue the current goal until the next review.';
  }
  function failureCheckCount(q,check){
    const runs=[q?.review,q?.ask].filter(Boolean);
    return runs.flatMap(run=>Array.isArray(run?.failure_details)?run.failure_details:[])
      .filter(item=>String(item?.severity||'').toLowerCase()==='high')
      .filter(item=>(item?.failed_checks||[]).some(name=>String(name).toLowerCase()===String(check).toLowerCase())).length;
  }
  function failureExplanation(detail){
    const id=String(detail?.scenario_id||'');
    if(id==='ask_conflicting_evidence'){
      return {
        title:'Conflicting evidence was not handled cautiously enough',
        whatHappened:'State did not fully preserve the unresolved conflict between approved Current State and newer contradictory evidence in its answer.',
        expected:'Report the maintained truth, explicitly surface the unresolved conflict, and avoid treating the newer evidence as settled.',
        why:'A user could leave believing a disputed project fact is settled when it still needs human review.'
      };
    }
    if(id==='review_direct_reversal'){
      return {
        title:'Authoritative reversal was not applied correctly',
        whatHappened:'State did not interpret evidence that directly reversed an existing maintained fact the way the product contract expected.',
        expected:'Recognize the authoritative reversal and propose the corresponding Current State change for human review.',
        why:'Stale project truth could remain active after authoritative evidence changes it.'
      };
    }
    if(id==='ask_blocker_not_omitted'){
      return {
        title:'A consequential blocker was omitted from a readiness answer',
        whatHappened:'The answer did not surface a blocking open item that materially changes whether the project is ready.',
        expected:'Include the blocker and make the remaining uncertainty explicit.',
        why:'A user could make a launch decision without seeing a known blocking dependency.'
      };
    }
    if(id==='review_new_evidence_over_pending_review'){
      return {
        title:'New authoritative evidence did not supersede a stale pending proposal',
        whatHappened:'State preserved the new Finance correction as Evidence instead of proposing the corrected budget cap for human review.',
        expected:'Reuse the existing Review, propose the corrected $35,000 State change, and allow software to supersede the stale $50,000 pending proposal.',
        why:'A stale pending proposal can remain the apparent next change even after authoritative evidence has corrected it.'
      };
    }
    if(id==='ask_known_outcome_unknown_reason'){
      return {
        title:'Known outcome was answered without preserving an unknown reason',
        whatHappened:'State knew that the Northstar pilot was paused, but the answer did not clearly say that the reason for the pause was not established.',
        expected:'State the known pause and explicitly say the reason is unknown or not established unless a supplied record supports it.',
        why:'A user could mistake an inferred explanation for maintained project truth.'
      };
    }
    const category=String(detail?.category||detail?.scenario_id||'controlled behavior').replaceAll('_',' ').trim();
    return {
      title:category.charAt(0).toUpperCase()+category.slice(1)+' needs review',
      whatHappened:detail?.observed?String(detail.observed).replaceAll('_',' '):'Observed behavior differed from the controlled product expectation.',
      expected:detail?.expected?String(detail.expected).replaceAll('_',' '):'Follow the controlled product contract for this scenario.',
      why:evalFailureImpact(detail).replace(/^Risk:\s*/,'')
    };
  }
  function qualityFailureClassSummary(q){
    const runs=[{suite:'update understanding',run:q?.review},{suite:'answer quality',run:q?.ask}].filter(item=>item.run);
    const details=runs.flatMap(({suite,run})=>(Array.isArray(run?.failure_details)?run.failure_details:[]).map(item=>({...item,suite})));
    const high=details.filter(item=>String(item?.severity||'').toLowerCase()==='high');
    const names=[...new Set(high.map(item=>{
      const category=String(item?.category||item?.scenario_id||'').replaceAll('_',' ').trim();
      return category||'controlled behavior';
    }))];
    return {
      count:runs.reduce((n,item)=>n+Number(item.run?.high_severity_failures||0),0),
      classes:names.slice(0,3),
      details:high.map(item=>({...item,...failureExplanation(item)}))
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
        if(item.created_at)items.push({when:item.created_at,type:'Quality check',category:'quality',title:evalSuiteLabel(item)+' checked',detail:(evalScore(item)==null?'Score unavailable':percent(evalScore(item)))+' · '+Number(item.high_severity_failures||0)+' high-impact failures'});
      }
    }else if(p.id==='tastemake'&&externalQ?.ci?.updated_at){
      items.push({when:externalQ.ci.updated_at,type:'Quality check',category:'quality',title:'Recommendation quality checks updated',detail:externalQ.ci.conclusion==='success'?'Automated recommendation checks passed.':'Latest check result recorded.'});
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
      externalQuality:s.externalQuality||null,
      platform:s.platform||null,
      previousPlatform:s.platform||null,
      activity:s.activity||null,
      openPullRequests:Array.isArray(s.openPullRequests)?s.openPullRequests:[],
      runInfo:null,
      checkedAt:s.checkedAt||null,
      detailCheckedAt:s.detailCheckedAt||null,
      investigation:s.investigation||null,
      investigationHistory:Array.isArray(s.investigationHistory)?s.investigationHistory:[],
      productNotes:Array.isArray(s.productNotes)?s.productNotes:[],
      errors:[],
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
      staging:data.staging,
      quality:data.quality,
      qualityBehaviorUpdatedAt:data.qualityBehaviorUpdatedAt||null,
      externalQuality:safeExternalQualitySnapshot(data.externalQuality),
      platform:data.platform,
      activity:data.activity,
      openPullRequests:data.openPullRequests,
      runInfo:null,
      checkedAt:data.checkedAt,
      detailCheckedAt:data.detailCheckedAt,
      snapshotAt:new Date().toISOString()
    };
  }

  function hydrateProjectData(project,saved){
    return emptyProjectData(project,saved&&saved.projectId===project.id?saved:null);
  }
  function investigationHistorySummary(investigation){
    if(!investigation)return'Investigation completed';
    if(investigation.staleEvalResults||investigation.staleEvalContract||investigation.staleEvalBehavior)return'Quality result needs a fresh eval run';
    if(investigation.quickCheck)return investigation.title||'Quick project check completed';
    if(investigation.error)return 'Investigation failed: '+investigation.error;
    if(investigation.report){
      const first=String(investigation.report).split(/\n+/).map(line=>line.trim()).find(line=>line&&!/^(Current assessment|What failed|Why this matters|Recommended next action)$/i.test(line));
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
        .catch(e=>{data.errors.push(label+': '+e.message);})
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
    const contract=dateMs(STATE_EVAL_CONTRACT_UPDATED_AT);
    return runs.some(run=>{const when=dateMs(run.created_at);return Number.isFinite(when)&&when<contract;});
  }
  function stateEvalBehaviorStale(q){
    const runs=[q?.review,q?.ask].filter(Boolean);
    const changed=dateMs(q?.behaviorUpdatedAt);
    if(!runs.length||!Number.isFinite(changed))return false;
    return runs.some(run=>{const when=dateMs(run.created_at);return Number.isFinite(when)&&when<changed;});
  }
  function stateEvalResultsStale(q){return stateEvalContractStale(q)||stateEvalBehaviorStale(q);}
  function stateEvalStaleReason(q){
    if(stateEvalBehaviorStale(q))return'The State behavior these checks measure changed after the latest recorded run.';
    if(stateEvalContractStale(q))return'The eval contract changed after the latest recorded run.';
    return'';
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
      deliveryKind:saved.delivery?.vercel?.kind||null,
      quality:qualitySnapshot(pseudo),
      analyticsAvailable:saved.platform?.analytics?.available??null,
      analyticsPageviews:saved.platform?.analytics?.pageviews??null,
      openPullRequests:Array.isArray(saved.openPullRequests)?saved.openPullRequests.length:0
    };
  }
  function healthStateLabel(kind){
    return kind==='bad'?'Needs attention':kind==='warn'?'Watch':kind==='good'?'Healthy':kind==='available'?'Data available':'Unknown';
  }
  function meaningfulChanges(data){
    const before=data?.lastVisit;
    if(!before)return[];
    const items=[];
    if(before.deliverySha&&data.delivery?.sha&&before.deliverySha!==data.delivery.sha){
      items.push({title:'New production release',detail:commitTitle(data.delivery.message),observedAt:data.delivery.updatedAt||data.checkedAt,tab:'overview',section:'deliveryPanel'});
    }
    if(before.deliveryKind&&data.delivery?.vercel?.kind&&before.deliveryKind!==data.delivery.vercel.kind){
      const previousDelivery=before.deliveryKind||'unknown',currentDelivery=data.delivery.vercel.kind;
      const improved=currentDelivery==='good'&&previousDelivery!=='good';
      items.push({title:improved?'Delivery status improved':'Delivery status changed',detail:healthStateLabel(previousDelivery)+' → '+healthStateLabel(currentDelivery),observedAt:data.delivery.updatedAt||data.checkedAt,tab:'overview',section:'deliveryPanel'});
    }
    const currentQ=qualitySnapshot(data),oldQ=before.quality||{};
    if(currentQ.reviewAt&&oldQ.reviewAt&&String(currentQ.reviewAt)!==String(oldQ.reviewAt)){
      const delta=currentQ.reviewScore!=null&&oldQ.reviewScore!=null?Math.round((currentQ.reviewScore-oldQ.reviewScore)*1000)/10:null;
      items.push({title:'Update-understanding eval changed',detail:(delta==null?'New controlled run recorded':(delta>=0?'Improved ':'Declined ')+Math.abs(delta)+' points')+' · '+percent(currentQ.reviewScore),observedAt:currentQ.reviewAt,tab:'ai-quality'});
    }
    if(currentQ.askAt&&oldQ.askAt&&String(currentQ.askAt)!==String(oldQ.askAt)){
      const delta=currentQ.askScore!=null&&oldQ.askScore!=null?Math.round((currentQ.askScore-oldQ.askScore)*1000)/10:null;
      items.push({title:'Answer-quality eval changed',detail:(delta==null?'New controlled run recorded':(delta>=0?'Improved ':'Declined ')+Math.abs(delta)+' points')+' · '+percent(currentQ.askScore),observedAt:currentQ.askAt,tab:'ai-quality'});
    }
    if(currentQ.severe!=null&&oldQ.severe!=null&&currentQ.severe!==oldQ.severe){
      items.push({title:'High-impact quality failures changed',detail:oldQ.severe+' → '+currentQ.severe,observedAt:data.checkedAt,tab:'ai-quality'});
    }
    const analytics=data.platform?.analytics;
    if(before.analyticsAvailable!==null&&analytics&&before.analyticsAvailable!==analytics.available){
      items.push({title:'Site analytics availability changed',detail:(before.analyticsAvailable?'Available':'Unavailable')+' → '+(analytics.available?'Available':'Unavailable'),observedAt:data.detailCheckedAt||data.checkedAt,tab:'overview',section:'systemsDetails'});
    }
    if(analytics?.available&&before.analyticsPageviews!=null&&Number(analytics.pageviews)!==Number(before.analyticsPageviews)){
      const diff=Number(analytics.pageviews)-Number(before.analyticsPageviews);
      items.push({title:'Site analytics changed',detail:(diff>=0?'+':'')+diff+' page views in the current 30-day window',observedAt:data.detailCheckedAt||data.checkedAt,tab:'overview'});
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
  function analyticsLabel(platform){
    const a=platform?.analytics;
    if(a?.available) return (a.visitors??'—')+' visitors · 30d';
    return analyticsConnectionValue(platform);
  }
  function projectQualityLabel(data){
    if(data.project.quality==='state'){
      if(!data.quality) return 'Quality unavailable';
      const q=qualityAttention(data.quality);
      if(q.kind==='good') return 'AI evals healthy';
      if(q.kind==='bad') return 'AI evals need action';
      if(q.kind==='warn') return 'AI evals need a look';
      return q.title;
    }
    if(data.project.noQualitySource) return 'Not connected yet';
    const q=data.externalQuality;if(!q) return 'Quality unavailable';
    const top=externalQualityAttention(q);
    if(q.project==='tastemake'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'Recommendation checks healthy';
    if(q.project==='narc'&&q.recorded?.recorded_all_suites_green) return q.recorded.full_playtest_pending?'Automated checks pass · playtest open':'Game checks healthy';
    return top?.title||'Quality loaded';
  }
  function stageTag(project){return project.stageLabel?'<em class="stage-tag">'+esc(project.stageLabel)+'</em>':'';}
  function loadingCardMarkup(project,active){
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'" aria-busy="true">'+
      '<span class="project-switcher-main"><strong>'+esc(project.name)+'</strong>'+stageTag(project)+'<span>Checking project health…</span></span>'+
      '<span class="status-pill unknown">Checking</span></button>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),pending=pendingSet(data);
    const attention=overallAttention(data);
    const signal=pending.size
      ?'Checking project health…'
      :(status.kind==='good'?'No current product-quality action':attention.title);
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'">'+
      '<span class="project-switcher-main"><strong>'+esc(data.project.name)+'</strong>'+stageTag(data.project)+'<span>'+esc(signal||'No current issue')+'</span></span>'+
      '<span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span></button>';
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
  function evalTrend(recent,suite){
    const rows=(Array.isArray(recent)?recent:[]).filter(item=>item?.suite===suite);
    if(rows.length<2)return'No earlier run to compare yet';
    const a=evalScore(rows[0]),b=evalScore(rows[1]);
    if(a==null||b==null)return'No comparable score yet';
    const delta=Math.round((a-b)*1000)/10;
    if(Math.abs(delta)<0.1)return'Stable vs previous run';
    return (delta>0?'Up ':'Down ')+Math.abs(delta)+' points vs previous run';
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
        (note?'<span class="failure">'+esc(note)+'</span>':'<span class="healthy-note">No high-impact failures</span>')+
        (trend?'<span class="trend '+trendClass+'">'+esc(trend)+'</span>':'')+
        '<span class="score-secondary">'+esc(percent(score))+'</span>'+
      '</div></div>';
  }
  function scenarioPassLabel(run,score){
    const total=Number(run?.total||0),value=Number(score);
    if(!total||!Number.isFinite(value))return'';
    return Math.round(total*value)+' / '+total+' passed';
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
  function mockTrendValues(q,suite){
    return (Array.isArray(q?.recent)?q.recent:[]).filter(item=>item?.suite===suite).map(evalScore).filter(v=>v!=null);
  }
  function mockDelta(recent,suite){
    const rows=(Array.isArray(recent)?recent:[]).filter(item=>item?.suite===suite);
    if(rows.length<2)return {label:'—',cls:'flat'};
    const a=evalScore(rows[0]),b=evalScore(rows[1]);
    if(a==null||b==null)return {label:'—',cls:'flat'};
    const d=Math.round((a-b)*1000)/10;
    if(Math.abs(d)<0.1)return {label:'0',cls:'flat'};
    return {label:(d>0?'↑ ':'↓ ')+Math.abs(d)+'%',cls:d>0?'':'down'};
  }
  function investigationResultHtml(investigation){
    if(investigation?.handoff) return '<div class="investigation-result agent-result"><div class="agent-kicker">Handoff preview</div><strong>Project handoff ready to review</strong><pre>'+esc(investigation.handoffText||investigation.report||'')+'</pre><p class="footnote">Project Health assembled this from the currently loaded delivery, quality, investigation, and product-decision signals. Review it before sharing.</p></div>';
    if(investigation?.loading) return '<div class="investigation-result agent-result" role="status"><div class="agent-kicker">Read-only investigation agent</div><strong>Checking current health signals…</strong><p>Starting with current health signals and expanding only when the evidence points somewhere specific.</p></div>';
    if(investigation?.error) return '<div class="investigation-result agent-result" role="status"><div class="agent-kicker">Read-only investigation agent</div><strong>Investigation unavailable</strong><p>'+esc(investigation.error)+'</p></div>';
    if(investigation?.quickCheck){
      const checks=Array.isArray(investigation.checks)?investigation.checks:[];
      return '<div class="investigation-result agent-result"><div class="agent-kicker">Project check · deterministic fallback</div><strong>'+esc(investigation.title||'Quick project check complete')+'</strong><p>'+esc(investigation.summary||'No live failure was available, so Project Health checked the current project signals instead.')+'</p>'+
        '<div class="agent-check-list">'+checks.map(item=>'<div class="agent-check"><span>'+esc(item.label)+'</span><strong>'+esc(item.value)+'</strong></div>').join('')+'</div>'+
        '<p class="footnote">No AI model was called for this fallback. It uses the health data already loaded by Project Health.</p></div>';
    }
    if(!investigation?.report)return'';
    const label=investigation.qualityInvestigation?'AI quality investigation':'Read-only investigation agent';
    const title=investigation.qualityInvestigation?'Quality investigation · '+esc(fmtDate(investigation.observedAt)):'Agent investigation · '+esc(fmtDate(investigation.observedAt));
    return '<div class="investigation-result agent-result"><div class="agent-kicker">'+label+'</div><strong>'+title+'</strong><pre>'+esc(investigation.report)+'</pre>'+
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

  function progressText(done,total,pendingNames){
    if(done>=total) return 'Finishing refresh…';
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
    checks.push({label:'User-facing server errors',value:runtimeSignal?.available===false?'Runtime log signal unavailable':runtimeIssues.length?runtimeIssues.length+' signal'+(runtimeIssues.length===1?'':'s'):'None found in bounded check'});
    const render=data?.platform?.render?.environments?.production;
    if(render) checks.push({label:'Production backend',value:render.ok?'Healthy':'Unavailable'});
    const hasIssue=checks.some(item=>/needs action|failed|unavailable|signal/i.test(String(item.value||'')));
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
      overallLines.push('Update understanding: '+percent(score)+(passed!=null?' ('+passed+'/'+review.total+' scenarios)':'')+' · '+highImpactText(review.high_severity_failures));
    }
    if(ask)overallLines.push('Answer quality: '+percent(evalScore(ask))+' · '+highImpactText(ask.high_severity_failures));

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

    const failedLines=details.length?details.map(detail=>{
      const explanation=failureExplanation(detail);
      return '- '+detail.suiteLabel+' / '+detail.scenario_id+' ('+(detail.severity||'unknown')+'). '+explanation.whatHappened;
    }):['- Exact scenario metadata is unavailable for this older run, so Project Health can only report the suite-level result.'];

    const relevantRun=targeted?(targeted.suiteKey==='review'?review:ask):null;
    const previousRelevant=relevantRun?previousEvalRun(quality,relevantRun):null;
    const relevantScore=evalScore(relevantRun),previousScore=evalScore(previousRelevant);
    const changeLines=[];
    if(relevantRun&&previousRelevant&&relevantScore!=null&&previousScore!=null){
      const delta=Math.round((relevantScore-previousScore)*1000)/10;
      changeLines.push('- '+targeted.suiteLabel+' '+(delta>=0?'improved ':'declined ')+Math.abs(delta)+' points from '+percent(previousScore)+' to '+percent(relevantScore)+'.');
    }
    if(relevantRun&&previousRelevant&&Number(previousRelevant.high_severity_failures||0)!==Number(relevantRun.high_severity_failures||0)){
      changeLines.push('- '+targeted.suiteLabel+' high-impact failures changed from '+Number(previousRelevant.high_severity_failures||0)+' to '+Number(relevantRun.high_severity_failures||0)+'.');
    }

    const why=targeted
      ?failureExplanation(targeted).why
      :(details.length?'At least one current failure can affect maintained project truth or another high-impact behavior.':'The current miss is a quality/workflow issue rather than a production outage.');
    const nextStep=targeted
      ?'Review this scenario against the product contract. If the expected behavior is still correct, fix State behavior and rerun '+targeted.suiteLabel+'. If the observed behavior is acceptable, update the eval instead.'
      :details.length
        ?'Review each failed scenario against the product contract. Fix State behavior only where the contract is still right; update the eval where the observed behavior is acceptable. Then rerun the affected suite.'
        :'Inspect the affected suite and rerun after the next change so future failures record scenario-level evidence.';
    const nextCheckpoint=targeted?'After '+targeted.suiteLabel+' is rerun.':'After the affected eval suite is rerun.';
    const technical=[modelDisplayName((targeted?.suiteKey==='review'?review?.model_identifier:targeted?.suiteKey==='ask'?ask?.model_identifier:(review?.model_identifier||ask?.model_identifier))),shortSha((targeted?.suiteKey==='review'?review?.build:targeted?.suiteKey==='ask'?ask?.build:(review?.build||ask?.build)))].filter(Boolean).join(' · ');
    const report=[
      'Investigation scope',
      targeted?(targeted.suiteLabel+' · '+targeted.scenario_id):'Current AI eval failures',
      '',
      'What failed',
      failedLines.join('\n'),
      '',
      'Why this matters',
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
        :[data.quality.review,data.quality.ask].filter(Boolean).map(run=>evalSuiteLabel(run)+': '+percent(evalScore(run))+' · '+highImpactText(run.high_severity_failures)).join('\n'))
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

  return {PROJECTS,esc,shortSha,commitTitle,repoUrl,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,githubLink,changeUrl,commitLabel,htmlRow,linkedRow,githubApi,vercelFromStatus,deliveryHealth,normalizeQuality,percent,highImpactText,modelDisplayName,qualityAttention,deliveryAttention,deliveryAttentionForData,infrastructureAttention,externalQualityAttention,pendingSet,productOpenItems,allAttentionSignals,overallAttention,projectStatus,attentionItems,setupGaps,releaseReadiness,regressionSignal,recurringFailureSignal,operationalSignals,healthConsistencyIssues,releaseRiskChecklist,productionRuntime,operationalNextDecision,failureCheckCount,failureExplanation,qualityFailureClassSummary,activityTimelineItems,activityDayLabel,activityTimeRange,evalBehaviorBranch,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,investigationHistorySummary,makeRunner,STATE_EVAL_CONTRACT_UPDATED_AT,dateMs,fmtDate,relativeAge,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,freshnessMeta,qualitySnapshot,visitBaseline,healthStateLabel,meaningfulChanges,changedSinceVisit,trendText,activityReviewItems,row,metric,durationLabel,costLabel,attentionMarkup,neonConnectionDetail,infraCardLabel,analyticsConnectionValue,analyticsGapDetail,analyticsLabel,projectQualityLabel,stageTag,loadingCardMarkup,cardMarkup,evalSuiteLabel,evalScore,evalTrend,stateEvalCard,stateScenarioCard,scenarioPassLabel,stateEvalHistory,mockSparkline,mockTrendValues,mockDelta,investigationResultHtml,evalRunComplete,externalQualityRunComplete,evalFailureImpact,previousEvalRun,progressText,quickProjectCheck,qualityInvestigation,projectHandoff};
});
