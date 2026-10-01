(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){root.PROJECT_HEALTH=api;if(root.document) api.init(root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

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
        renderStaging:'https://dashboard.render.com/web/srv-dadloi8n74is73ajsg50',
        neon:'https://console.neon.tech',
        quality:'/state-evals'
      }
    },
    {
      id:'tastemake',name:'Tastemake',description:'Taste-learning recommendation prototype built around preference discovery.',repo:'pedringt/tastemake',branch:'main',
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
      id:'narc',name:'NARC',description:'Workplace-surveillance satire game with branching consequences.',repo:'pedringt/narc',branch:'main',
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
  function pageEnvironment(root){
    const host=String(root?.location?.hostname||'');
    const params=new URLSearchParams(String(root?.location?.search||''));
    const explicit=String(params.get('env')||'').toLowerCase();
    if(explicit==='staging'||explicit==='production')return explicit;
    if(/(^|[-.])staging([-.]|$)|-git-/i.test(host))return 'staging';
    if(/\.vercel\.app$/i.test(host)&&host!=='ai-learning.vercel.app')return 'staging';
    return 'production';
  }
  async function jsonFetch(url,options={}){
    const controller=new AbortController();const timeoutMs=Number(options.timeoutMs||10000);const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const fetchOptions={...options};delete fetchOptions.timeoutMs;
    try{
      const response=await fetch(url,{...fetchOptions,signal:controller.signal,headers:{Accept:'application/json',...(fetchOptions.headers||{})}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(payload?.detail||payload?.message||('Request failed: '+response.status));error.status=response.status;throw error;}
      return payload;
    }finally{clearTimeout(timer);}
  }

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
    if(data?.activity?.available&&data.activity?.runtime?.available===false){
      const status=Number(data.activity.runtime.status||0);
      const detail=[401,403].includes(status)
        ?'Project Health can read deployments, but its Vercel token cannot read runtime logs.'
        :status===404
          ?'The latest deployment does not expose runtime logs through the Vercel log endpoint.'
          :'Project Health could not read the bounded runtime-log stream for the latest deployment.';
      gaps.push({label:'Runtime error visibility',detail});
    }
    if(p.id==='state'&&!platform?.neon?.available) gaps.push({label:'Database health',detail:'Not connected or unavailable. This is a monitoring gap, not a product incident.'});
    if(p.id==='state'&&run&&!run.configured) gaps.push({label:'Run AI evals',detail:'Dashboard-run setup is incomplete.'});
    if(p.id!=='narc'&&!pendingSet(data).has('AI operations')&&!ai?.available){
      gaps.push({label:'AI cost',detail:'Estimated model spend is not available yet.'});
      gaps.push({label:'AI response speed',detail:'Observed model response speed is not available yet.'});
    }else if(p.id==='state'&&ai?.available&&ai.cost?.partial){
      gaps.push({label:'AI cost coverage',detail:'Some recorded model calls do not have known pricing, so they are excluded from the estimate.'});
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
    if(worst.delta<0)return {kind:'warn',title:label+' regressed '+Math.abs(worst.delta)+' points',detail:'Review the changed scenario evidence and the release or product change that preceded this run.',when:worst.when};
    return {kind:'good',title:'No recent eval regression detected',detail:'The latest comparable controlled eval runs are stable or improved.',when:worst.when};
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

  async function loadGitHubProject(project,branchName){
    const headers={Accept:'application/vnd.github+json'};
    const branch=await jsonFetch(githubApi('/repos/'+project.repo+'/branches/'+encodeURIComponent(branchName)),{headers,timeoutMs:6000});
    let selectedCommit=branch?.commit||null;
    if(Array.isArray(project.releasePaths)&&project.releasePaths.length){
      try{
        const groups=await Promise.all(project.releasePaths.map(path=>
          jsonFetch(githubApi('/repos/'+project.repo+'/commits?sha='+encodeURIComponent(branchName)+'&path='+encodeURIComponent(path)+'&per_page=6'),{headers,timeoutMs:6000}).catch(()=>[])
        ));
        const candidates=groups.flat().filter(Boolean).filter((item,index,all)=>all.findIndex(other=>other?.sha===item?.sha)===index);
        candidates.sort((a,b)=>(dateMs(b?.commit?.committer?.date||b?.commit?.author?.date)||0)-(dateMs(a?.commit?.committer?.date||a?.commit?.author?.date)||0));
        selectedCommit=candidates.find(item=>!project.releaseIgnore?.test(String(item?.commit?.message||'')))||selectedCommit;
      }catch(_){}
    }else if(project.releasePath){
      try{
        const commits=await jsonFetch(githubApi('/repos/'+project.repo+'/commits?sha='+encodeURIComponent(branchName)+'&path='+encodeURIComponent(project.releasePath)+'&per_page=1'),{headers,timeoutMs:6000});
        if(Array.isArray(commits)&&commits[0]) selectedCommit=commits[0];
      }catch(_){}
    }
    const selectedSha=selectedCommit?.sha||branch?.commit?.sha||branchName;
    const [status,checkRuns]=await Promise.all([
      jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+encodeURIComponent(selectedSha)+'/status'),{headers,timeoutMs:6000}),
      jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+encodeURIComponent(selectedSha)+'/check-runs?per_page=10'),{headers,timeoutMs:6000}).catch(()=>({check_runs:[]}))
    ]);
    return deliveryHealth({name:branch?.name||branchName,commit:selectedCommit},status,checkRuns);
  }
  async function loadStateQuality(root){return normalizeQuality(await jsonFetch('/api/project-health-state-quality?env='+pageEnvironment(root),{timeoutMs:7000}));}
  async function loadStateEvalBehavior(project){
    const paths=Array.isArray(project?.evalBehaviorPaths)?project.evalBehaviorPaths:[];
    if(!paths.length)return null;
    const headers={Accept:'application/vnd.github+json'};
    const behaviorBranch=project.stagingBranch||project.branch;
    const rows=await Promise.all(paths.map(path=>jsonFetch(githubApi('/repos/'+project.repo+'/commits?sha='+encodeURIComponent(behaviorBranch)+'&path='+encodeURIComponent(path)+'&per_page=1'),{headers,timeoutMs:6000}).catch(()=>[])));
    const commits=rows.flat().filter(Boolean);
    commits.sort((a,b)=>(dateMs(b?.commit?.committer?.date||b?.commit?.author?.date)||0)-(dateMs(a?.commit?.committer?.date||a?.commit?.author?.date)||0));
    const latest=commits[0];
    return latest?{sha:latest.sha||null,updatedAt:latest.commit?.committer?.date||latest.commit?.author?.date||null}:null;
  }
  async function loadPlatformSignal(project,signal){return await jsonFetch('/api/project-health-platform?project='+encodeURIComponent(project.id)+'&signal='+encodeURIComponent(signal),{timeoutMs:6500});}
  async function loadRunInfo(project){try{return await jsonFetch('/api/project-health-run?project='+encodeURIComponent(project.id),{timeoutMs:5000});}catch(error){if(error.status===404)return null;throw error;}}
  async function loadExternalQuality(project){try{return await jsonFetch('/api/project-health-project-quality?project='+encodeURIComponent(project.id),{timeoutMs:7000});}catch(error){if(error.status===404)return null;throw error;}}
  async function loadActivity(project){try{const payload=await jsonFetch('/api/project-health-activity?project='+encodeURIComponent(project.id),{timeoutMs:7500});return payload?.activity||null;}catch(error){if(error.status===404)return null;throw error;}}
  async function loadOpenPullRequests(project){
    try{
      const headers={Accept:'application/vnd.github+json'};
      const pulls=await jsonFetch(githubApi('/repos/'+project.repo+'/pulls?state=open&per_page=5'),{headers,timeoutMs:6000});
      if(!Array.isArray(pulls))return[];
      const releasePaths=Array.isArray(project.releasePaths)&&project.releasePaths.length?project.releasePaths:(project.releasePath?[project.releasePath]:[]);
      if(!releasePaths.length)return pulls;
      const scoped=await Promise.all(pulls.map(async pr=>{
        if(project.releaseIgnore?.test(String(pr.title||'')))return null;
        try{
          const files=await jsonFetch(githubApi('/repos/'+project.repo+'/pulls/'+encodeURIComponent(pr.number)+'/files?per_page=100'),{headers,timeoutMs:5000});
          return Array.isArray(files)&&files.some(file=>releasePaths.some(path=>String(file.filename||'').startsWith(path+'/')))?pr:null;
        }catch(_){return null;}
      }));
      return scoped.filter(Boolean);
    }catch(_){return[];}
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

  function snapshotKey(root){return 'project-health-snapshot:'+pageEnvironment(root);}
  function loadSnapshot(root){
    try{
      const raw=root.localStorage?.getItem(snapshotKey(root));if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed?.savedAt||!Array.isArray(parsed.projects))return null;
      if(Date.now()-new Date(parsed.savedAt).getTime()>30*24*60*60*1000)return null;
      return parsed;
    }catch(_){return null;}
  }
  function saveSnapshot(root,state){
    try{
      root.localStorage?.setItem(snapshotKey(root),JSON.stringify({savedAt:new Date().toISOString(),projects:state.map(serializeProjectData)}));
    }catch(_){}
  }

  function productNoteKey(root,projectId){return 'project-health-product-notes:'+pageEnvironment(root)+':'+projectId;}
  function loadProductNotes(root,projectId){
    try{
      const rows=JSON.parse(root.localStorage?.getItem(productNoteKey(root,projectId))||'[]');
      return Array.isArray(rows)?rows.slice(0,30):[];
    }catch(_){return[];}
  }
  function saveProductNotes(root,projectId,rows){
    try{root.localStorage?.setItem(productNoteKey(root,projectId),JSON.stringify((rows||[]).slice(0,30)));}catch(_){}
  }

  function investigationHistoryKey(root,projectId){return 'project-health-investigations:'+pageEnvironment(root)+':'+projectId;}
  function loadInvestigationHistory(root,projectId){
    try{
      const rows=JSON.parse(root.localStorage?.getItem(investigationHistoryKey(root,projectId))||'[]');
      return Array.isArray(rows)?rows.slice(0,20):[];
    }catch(_){return[];}
  }
  function saveInvestigationHistory(root,projectId,rows){
    try{root.localStorage?.setItem(investigationHistoryKey(root,projectId),JSON.stringify((rows||[]).slice(0,20)));}catch(_){}
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

  async function loadProject(project,root,onUpdate,seed){
    const data=emptyProjectData(project,seed);
    const run=makeRunner(data,onUpdate);
    const core=[
      run('Delivery',loadGitHubProject(project,project.branch),value=>{data.delivery=value;}),
      run('Activity',loadActivity(project),value=>{data.activity=value;}),
      run('Run controls',loadRunInfo(project),value=>{data.runInfo=value;})
    ];
    if(project.id==='state'){
      core.push(run('Production backend',loadPlatformSignal(project,'production-render'),value=>{data.platform=mergePlatform(data.platform,value);}));
      core.push(run('Quality behavior',loadStateEvalBehavior(project),value=>{data.qualityBehaviorUpdatedAt=value?.updatedAt||null;if(data.quality)data.quality.behaviorUpdatedAt=data.qualityBehaviorUpdatedAt;}));
    }
    const qualityTask=project.quality==='state'
      ? run('Quality',loadStateQuality(root),value=>{data.quality=value;if(data.qualityBehaviorUpdatedAt)data.quality.behaviorUpdatedAt=data.qualityBehaviorUpdatedAt;})
      : run('Quality',loadExternalQuality(project),value=>{data.externalQuality=value;});
    data.qualityPromise=qualityTask;
    await Promise.all(core);
    data.fresh=true;
    data.checkedAt=new Date().toISOString();
    if(typeof onUpdate==='function')onUpdate(data);
    return data;
  }

  async function loadProjectDetails(data,root,onUpdate){
    if(!data||data.detailLoaded||data.detailLoading)return data;
    data.detailLoading=true;
    const project=data.project,run=makeRunner(data,onUpdate);
    const tasks=[
      run('Analytics',loadPlatformSignal(project,'analytics'),value=>{data.platform=mergePlatform(data.platform,value);}),
      run('AI operations',loadPlatformSignal(project,'ai-telemetry'),value=>{data.platform=mergePlatform(data.platform,value);}),
      run('Neon',loadPlatformSignal(project,'neon'),value=>{data.platform=mergePlatform(data.platform,value);}),
      run('Open work',loadOpenPullRequests(project),value=>{data.openPullRequests=Array.isArray(value)?value:[];})
    ];
    if(project.id==='state'){
      tasks.push(
        run('Staging delivery',loadGitHubProject(project,project.stagingBranch),value=>{data.staging=value;}),
        run('Staging backend',loadPlatformSignal(project,'staging-render'),value=>{data.platform=mergePlatform(data.platform,value);})
      );
    }
    await Promise.all(tasks);
    data.detailLoaded=true;
    data.detailLoading=false;
    data.detailCheckedAt=new Date().toISOString();
    if(typeof onUpdate==='function')onUpdate(data);
    return data;
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
      items.push({title:'Site analytics changed',detail:(diff>=0?'+':'')+diff+' page views in the current 30-day window',observedAt:data.detailCheckedAt||data.checkedAt,tab:'overview',section:'analyticsPanel'});
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
    const q=data.externalQuality;if(!q) return 'Quality unavailable';
    const top=externalQualityAttention(q);
    if(q.project==='tastemake'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'Recommendation checks healthy';
    if(q.project==='narc'&&q.recorded?.recorded_all_suites_green) return q.recorded.full_playtest_pending?'Automated checks pass · playtest open':'Game checks healthy';
    return top?.title||'Quality loaded';
  }
  function loadingCardMarkup(project,active){
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'" aria-busy="true">'+
      '<span class="project-switcher-main"><strong>'+esc(project.name)+'</strong><span>Checking project health…</span></span>'+
      '<span class="status-pill unknown">Checking</span></button>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),pending=pendingSet(data);
    const signal=pending.size?'Checking project health…':overallAttention(data).title;
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'">'+
      '<span class="project-switcher-main"><strong>'+esc(data.project.name)+'</strong><span>'+esc(signal||'No current issue')+'</span></span>'+
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

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    const pending=pendingSet(data);
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    const repoLink=doc.getElementById('repoLink');
    if(repoLink)repoLink.href=repoUrl(p.repo);
    const liveProjectLink=doc.getElementById('liveProjectLink');
    if(liveProjectLink){
      const liveUrl=p.links?.live||'';
      liveProjectLink.hidden=!liveUrl;
      if(liveUrl)liveProjectLink.href=liveUrl;
    }
    const qualityTab=doc.querySelector?.('[data-tab="ai-quality"]');
    if(qualityTab)qualityTab.textContent=p.qualityLabel||'Quality';
    const linksMenu=doc.getElementById('projectLinksMenu');
    if(linksMenu){
      const links=[
        ['Live project',p.links?.live],
        ['GitHub repository',repoUrl(p.repo)],
        ['Vercel',p.links?.vercel],
        ['Render · production',p.links?.renderProduction],
        ['Render · staging',p.links?.renderStaging],
        ['Neon',p.links?.neon],
        [p.id==='state'?'Full AI eval details':p.id==='tastemake'?'Recommendation checks':'Game checks',p.links?.quality]
      ].filter(item=>item[1]);
      linksMenu.innerHTML='<button type="button" data-open-systems>Systems &amp; connections</button><button type="button" data-open-about>About Project Health</button>'+links.map(([label,url])=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>').join('');
    }
    const projectCheckButton=doc.getElementById('projectCheckButton');
    const headerRunChecksButton=doc.getElementById('headerRunChecksButton');
    const currentQuality=p.quality==='state'?qualityAttention(q):externalQualityAttention(externalQ);
    const noRecordedStateRuns=p.id==='state'&&![q?.review,q?.ask].filter(Boolean).length;
    const shouldRunChecksFirst=!!(run?.configured&&(p.id!=='state'||noRecordedStateRuns||stateEvalResultsStale(q)));
    const shouldInvestigateFirst=currentQuality?.kind==='bad'||deliveryAttentionForData(data).kind==='bad'||activityReviewItems(data).some(item=>!item.resolved);
    if(projectCheckButton){
      projectCheckButton.disabled=!!data.investigation?.loading;
      projectCheckButton.setAttribute('aria-busy',data.investigation?.loading?'true':'false');
      projectCheckButton.textContent=data.investigation?.loading?'Investigating…':'Investigate';
      projectCheckButton.classList.remove('primary');
      projectCheckButton.style.order='2';
    }
    if(headerRunChecksButton){
      const activeEvalRun=data.qualityRun;
      headerRunChecksButton.hidden=!activeEvalRun;
      headerRunChecksButton.disabled=true;
      headerRunChecksButton.textContent=activeEvalRun?'Running…':'';
      headerRunChecksButton.title=activeEvalRun?'Quality checks are running. Open Quality for details.':'';
      headerRunChecksButton.classList.remove('primary');
      headerRunChecksButton.style.order='2';
    }
    const investigationPanel=doc.getElementById('investigationPanel');
    const investigationDrawerTitle=doc.getElementById('investigationDrawerTitle');
    const investigationDrawerStatus=doc.getElementById('investigationDrawerStatus');
    const drawerCopyHandoffButton=doc.getElementById('drawerCopyHandoffButton');
    const investigationDrawerFooter=doc.getElementById('investigationDrawerFooter');
    const drawerRunAgainButton=doc.getElementById('drawerRunAgainButton');
    const historyRows=Array.isArray(data.investigationHistory)?data.investigationHistory:[];
    const historyHtml=historyRows.length
      ?'<div class="history-section"><h4>Previous investigations</h4>'+historyRows.slice(0,5).map(item=>'<div class="activity-item"><strong>'+esc(item.trigger||'Investigation')+'</strong><span>'+esc(fmtDate(item.observedAt))+' · '+esc(item.summary||'Investigation completed')+(item.resolvedAt?' · Resolved '+esc(relativeAge(item.resolvedAt)):'')+'</span></div>').join('')+'</div>'
      :'';
    if(investigationPanel) investigationPanel.innerHTML=investigationResultHtml(data.investigation)+historyHtml;
    if(investigationDrawerTitle) investigationDrawerTitle.textContent=p.name+' investigation';
    if(investigationDrawerStatus){
      investigationDrawerStatus.textContent=data.investigation?.loading?'Running…':data.investigation?'Latest result available':historyRows.length?'Previous results available':'';
    }
    if(drawerCopyHandoffButton){
      const busy=!!data.investigation?.loading;
      const copyable=!!(data.investigation?.report||data.investigation?.quickCheck||data.investigation?.handoff);
      drawerCopyHandoffButton.hidden=busy||!copyable;
    }
    if(drawerRunAgainButton){
      const busy=!!data.investigation?.loading;
      drawerRunAgainButton.hidden=!data.investigation||busy;
      if(investigationDrawerFooter) investigationDrawerFooter.hidden=drawerRunAgainButton.hidden;
    }

    const notices=attentionItems(data),readiness=releaseReadiness(data);
    const actionable=notices.filter(item=>item.kind!=='good');
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3>'+
      (actionable.length
        ?'<div class="attention-list">'+actionable.map(item=>attentionMarkup(item)).join('')+'</div>'
        :'<div class="attention good" style="margin-top:12px"><strong>Nothing needs attention right now</strong><p>No current incident or product-quality action is open.</p></div>');

    const reviewIsDependency=/^(after|when|once)\b|next recorded/i.test(String(p.nextReview||''));
    const nextDecision=operationalNextDecision(data);
    doc.getElementById('productFocusPanel').innerHTML=
      '<h3>Product focus</h3><div class="focus-grid" style="margin-top:10px">'+
      '<div class="focus-block"><strong>Current goal</strong><p>'+esc(p.focus)+'</p></div>'+
      '<div class="focus-block"><strong>Watching</strong><div class="evidence-list">'+p.evidence.map(item=>'<span class="evidence-chip">'+esc(item)+'</span>').join('')+'</div></div>'+
      '<div class="focus-block decision-now"><strong>Next decision</strong><p>'+esc(nextDecision)+'</p></div>'+
      '</div><div class="focus-followup"><strong>'+(reviewIsDependency?'Waiting on':'Next review')+'</strong><span>'+esc(p.nextReview)+'</span></div>';

    const riskItems=releaseRiskChecklist(data);
    const regression=regressionSignal(data);
    const monitoringGaps=setupGaps(data);
    const productNotes=Array.isArray(data.productNotes)?data.productNotes:[];
    doc.getElementById('decisionSupportPanel').innerHTML=
      '<div class="panel-title-row"><div><h3>Decision support</h3><p class="panel-copy">Release risk, regressions, blind spots, and the human decisions behind changes.</p></div><button class="button small" type="button" data-add-product-note>Add decision / change</button></div>'+
      '<div class="decision-support-grid" style="margin-top:12px">'+
        '<div class="decision-support-block"><strong>Would I hesitate to ship?</strong><div class="risk-checklist">'+riskItems.map(item=>'<div class="risk-row"><span class="health-status '+esc(item.kind)+'">'+esc(item.status)+'</span><div><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div></div>').join('')+'</div></div>'+
        '<div class="decision-support-block"><strong>Recent regression</strong><div class="regression-card '+esc(regression.kind)+'"><span class="health-status '+esc(regression.kind)+'">'+esc(regression.kind==='warn'?'Watch':regression.kind==='good'?'Healthy':'Unknown')+'</span><strong>'+esc(regression.title)+'</strong><span>'+esc(regression.detail)+'</span></div>'+
          '<div class="monitoring-gaps"><strong>What we cannot confirm</strong>'+(monitoringGaps.length?'<div class="gap-list">'+monitoringGaps.slice(0,4).map(gap=>'<span><b>'+esc(gap.label)+':</b> '+esc(gap.detail)+'</span>').join('')+'</div>':'<span class="healthy-note">No known monitoring gaps.</span>')+'</div></div>'+
      '</div>'+
      '<div class="decision-log"><div class="decision-log-head"><strong>Decision & change log</strong><span>Stored in this browser</span></div>'+
        (productNotes.length?'<div class="decision-log-list">'+productNotes.slice(0,5).map(note=>'<div class="decision-log-item"><span class="activity-type">'+esc(note.type==='change'?'Change':note.type==='experiment'?'Experiment':'Decision')+'</span><strong>'+esc(note.text)+'</strong><span>'+esc(fmtDate(note.createdAt))+'</span></div>').join('')+'</div>':'<div class="empty compact-empty">No product decisions or changes recorded yet.</div>')+
      '</div>';

    const latestInvestigationPanel=doc.getElementById('latestInvestigationPanel');
    if(latestInvestigationPanel){
      const latestInvestigation=data.investigation||historyRows[0]||null;
      if(latestInvestigation){
        const reportText=String(latestInvestigation.report||latestInvestigation.summary||latestInvestigation.title||'Investigation completed');
        const sections={};
        let current='summary';
        for(const rawLine of reportText.split(/\n+/)){
          const line=rawLine.trim();
          if(!line)continue;
          const key=line.toLowerCase();
          if(['current assessment','investigation scope','what failed','why this matters','recommended next action','next checkpoint'].includes(key)){
            current=key;sections[current]=sections[current]||[];continue;
          }
          sections[current]=sections[current]||[];
          sections[current].push(line.replace(/^[-•]\s*/,''));
        }
        const assessment=(sections['current assessment']||sections['investigation scope']||sections.summary||[]).slice(0,3);
        const failed=(sections['what failed']||[]).slice(0,4);
        const next=(sections['recommended next action']||sections['next checkpoint']||[]).slice(0,4);
        const when=latestInvestigation.observedAt||latestInvestigation.createdAt||historyRows[0]?.observedAt;
        latestInvestigationPanel.innerHTML=
          '<div class="panel-title-row"><div><h3>Latest investigation</h3><div class="investigation-overview-meta">'+
          (when?'<span>'+esc(fmtDate(when))+'</span>':'')+
          (latestInvestigation.qualityInvestigation?'<span>AI quality</span>':'<span>Project health</span>')+
          '</div></div><button class="button small" type="button" data-open-investigation>View full investigation</button></div>'+
          '<div class="investigation-overview-grid">'+
          '<div class="investigation-overview-block"><strong>Current assessment</strong>'+(assessment.length?'<p>'+esc(assessment.join(' '))+'</p>':'<p>No concise assessment was recorded.</p>')+'</div>'+
          '<div class="investigation-overview-block"><strong>What failed</strong>'+(failed.length?'<ul>'+failed.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'<p>No specific failed scenario was recorded.</p>')+'</div>'+
          '<div class="investigation-overview-block"><strong>Recommended next look</strong>'+(next.length?'<ul>'+next.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'<p>Use the full investigation for the next diagnostic step.</p>')+'</div>'+
          '</div>';
      }else{
        latestInvestigationPanel.innerHTML='<div class="panel-title-row"><div><h3>Latest investigation</h3><p class="panel-copy">Focused diagnostic context appears here after an investigation is run.</p></div><button class="button small" type="button" data-open-investigation>Investigate project</button></div><div class="investigation-overview-empty">No investigation has been recorded for this project yet.</div>';
      }
    }

    const overviewQuality=p.quality==='state'?qualityAttention(q):externalQualityAttention(externalQ);
    const overviewDelivery=deliveryAttentionForData(data);
    const overviewInfra=infrastructureAttention(platform);
    const runtimeStatus=productionRuntime(data);
    const aSummary=platform?.analytics;
    const statusLabel=kind=>kind==='bad'?'Needs attention':kind==='warn'?'Watch':kind==='good'?'Healthy':kind==='available'?'Data available':'Unknown';
    const qualityTime=p.quality==='state'
      ?[q?.review?.created_at,q?.ask?.created_at].filter(Boolean).sort().pop()
      :(externalQ?.ci?.updated_at||externalQ?.recorded?.updated_at||data.checkedAt);
    const healthRows=[
      {label:p.qualityLabel||'Quality',kind:overviewQuality?.kind||'unknown',detail:overviewQuality?.title||'Quality status unavailable',tab:'ai-quality',fresh:freshnessMeta(qualityTime,data.checkedAt,72)},
      {label:'Production',kind:runtimeStatus.kind,status:runtimeStatus.label,detail:runtimeStatus.detail,tab:'overview',section:'deliveryPanel',fresh:freshnessMeta(data.detailCheckedAt||d?.updatedAt||data.checkedAt,data.checkedAt,24)},
      {label:'Release pipeline',kind:overviewDelivery?.kind||'unknown',detail:overviewDelivery?.title||'Release status unavailable',tab:'overview',section:'deliveryPanel',fresh:freshnessMeta(d?.updatedAt,data.checkedAt,24)},
      ...(overviewInfra&&['bad','warn'].includes(overviewInfra.kind)?[{label:'Infrastructure',kind:overviewInfra.kind,detail:overviewInfra.title,tab:'overview',section:'systemsDetails',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,6)}]:[]),
      {label:'Site analytics',kind:pending.has('Analytics')?'unknown':aSummary?.available?'available':'unknown',status:aSummary?.available?'Data available':null,detail:pending.has('Analytics')?'Checking site analytics…':aSummary?.available?((aSummary.visitors??0)+' visitors · '+(aSummary.pageviews??0)+' page views · 30d'):(aSummary?.configured?'Connected, but comparison data is not available yet':'Site analytics are not connected'),tab:'overview',section:aSummary?.available?'analyticsPanel':'systemsDetails',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,24)}
    ];
    const changes=meaningfulChanges(data);
    const sinceLabel=data.lastVisit?.savedAt?fmtDate(data.lastVisit.savedAt):'your previous saved visit';
    const changesPanel=doc.getElementById('changesPanel');
    changesPanel.classList.toggle('compact-zero',!changes.length);
    changesPanel.innerHTML=changes.length
      ?'<div class="panel-title-row"><div><h3>Changed since last visit</h3><p class="panel-copy">Compared with '+esc(sinceLabel)+'. Only meaningful changes are shown.</p></div><span class="readiness-pill watch">'+esc(changes.length)+' change'+(changes.length===1?'':'s')+'</span></div><div class="change-list" style="margin-top:6px">'+changes.slice(0,8).map(item=>'<button class="change-item" type="button" data-tab-target="'+esc(item.tab||'activity')+'"'+(item.section?' data-section-target="'+esc(item.section)+'"':'')+'><span class="change-dot"></span><div><div class="change-item-head"><strong>'+esc(item.title)+'</strong><span class="change-time">'+esc(relativeAge(item.observedAt))+'</span></div><span class="change-detail">'+esc(item.detail)+'</span></div></button>').join('')+'</div>'
      :'<div class="changes-zero" role="status"><span aria-hidden="true">✓</span><strong>No meaningful changes since your last visit</strong></div>';
    doc.getElementById('overviewHealthPanel').innerHTML='<div class="panel-title-row"><h3>System health</h3></div>'+
      '<div class="overview-health" style="margin-top:10px">'+healthRows.map(item=>{
        const showFreshness=item.fresh?.stale||['bad','warn','unknown'].includes(item.kind);
        return '<button class="overview-health-row health-card '+esc(item.kind||'unknown')+'" type="button" data-tab-target="'+esc(item.tab)+'"'+(item.section?' data-section-target="'+esc(item.section)+'"':'')+'>'+
          '<div class="health-card-head"><strong>'+esc(item.label)+'</strong><span class="health-status '+esc(item.kind)+'">'+esc(item.status||statusLabel(item.kind))+'</span></div>'+
          '<span class="health-detail">'+esc(item.detail)+'</span>'+
          (showFreshness?'<span class="signal-meta '+(item.fresh?.stale?'stale':'')+'">'+esc(item.fresh?.label||'Freshness unknown')+'</span>':'')+
        '</button>';
      }).join('')+'</div>';

    // Product quality / evals
    let qualityHtml='';
    if(p.quality==='state'){
      const review=q?.review,ask=q?.ask,runs=[review,ask].filter(Boolean);
      if(!q&&pending.has('Quality')){
        qualityHtml='<h3>Product quality · AI evals</h3><div class="empty" style="margin-top:12px">Checking the latest recorded AI eval results…</div>';
      }else if(!runs.length){
        qualityHtml='<h3>Product quality · AI evals</h3>'+
          '<div class="eval-overview"><div><strong>No recorded AI eval yet</strong><span>Run a controlled check to see how State handles understanding, evidence, uncertainty, and decision authority.</span></div></div>';
      }else{
        const latestDate=runs.map(item=>item?.created_at).filter(Boolean).sort().pop();
        const total=runs.reduce((n,item)=>n+Number(item?.total||0),0);
        const severe=runs.reduce((n,item)=>n+Number(item?.high_severity_failures||0),0);
        const qa=qualityAttention(q);
        const staleResults=stateEvalResultsStale(q);
        const cards=[];
        const noteFor=check=>{const count=failureCheckCount(q,check);return count?count+' high-impact failure'+(count===1?'':'s'):'';};
        if(review?.interpretation_accuracy!=null) cards.push(stateScenarioCard('Update understanding',review.interpretation_accuracy,review,evalTrend(q.recent,'review_interpretation'),noteFor('interpretation')));
        if(ask?.ask_grounding!=null) cards.push(stateScenarioCard('Evidence grounding',ask.ask_grounding,ask,evalTrend(q.recent,'ask_quality'),noteFor('grounding')));
        if(ask?.authority_accuracy!=null) cards.push(stateScenarioCard('Decision authority',ask.authority_accuracy,ask,'',noteFor('authority')));
        if(ask?.uncertainty_accuracy!=null) cards.push(stateScenarioCard('Uncertainty handling',ask.uncertainty_accuracy,ask,'',noteFor('uncertainty')));
        const failureSummary=qualityFailureClassSummary(q);
        const failureDetailHtml=failureSummary.details?.length
          ?'<div class="failure-list">'+failureSummary.details.map(detail=>
              '<div class="failure-item-compact">'+
                '<div class="eyebrow">'+esc(detail.suite||'AI eval')+'</div>'+
                '<h4>'+esc(detail.title)+'</h4>'+
                '<div class="failure-facts"><strong>Observed</strong><span>'+esc(detail.whatHappened)+'</span><strong>Expected</strong><span>'+esc(detail.expected)+'</span><strong>Why it matters</strong><span>'+esc(detail.why)+'</span></div>'+
                '<div class="quality-actions"><button class="button small primary" type="button" data-investigate-quality data-failure-id="'+esc(detail.scenario_id||'')+'">Investigate failure</button><a class="button small" href="/state-evals?failure='+encodeURIComponent(detail.scenario_id||'')+'">View scenario</a></div>'+
              '</div>'
            ).join('')+'</div>'
          :'';
        const statusText=staleResults
          ?'Previous run · rerun required'
          :(failureSummary.count
            ?esc(total||'—')+' scenarios · '+failureSummary.count+' high-impact failure'+(failureSummary.count===1?'':'s')
            :esc(total||'—')+' scenarios · no high-impact failures');
        qualityHtml='<h3>Product quality · AI evals</h3>'+
          '<div class="eval-overview"><div><strong>AI eval status</strong><span>'+(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+statusText+'</span></div></div>'+
          (staleResults
            ?'<div class="run-callout stale-quality-summary"><strong>Previous results need a rerun</strong><p>'+esc(stateEvalStaleReason(q))+' Run the evals again before treating these scores as current.</p></div>'
            :failureSummary.count
              ?'<div class="run-callout quality-failure-summary"><strong>Failures requiring review</strong>'+failureDetailHtml+'</div><div class="eval-grid">'+cards.join('')+'</div>'
              :'<div class="eval-grid">'+cards.join('')+'</div>')+stateEvalHistory(q);
      }
      qualityHtml+='<p class="footnote"><a href="/state-evals">View full scenario catalog →</a></p>';
      const activeEvalRun=data.qualityRun;
      if(activeEvalRun){
        const delayed=activeEvalRun.state==='delayed';
        qualityHtml+='<div class="eval-run-status '+(delayed?'warn':'')+'" role="status"><strong>'+(delayed?'Run started · waiting for a newer result':'AI evals are running…')+'</strong><span>Started '+esc(fmtDate(activeEvalRun.startedAt))+'. The previous results stay visible until the new run finishes; this page checks automatically.</span></div>';
      }
      if(pending.has('Run controls')&&!run){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking run availability…</span></div>';
      }else if(run?.configured&&!activeEvalRun){
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all">Run all AI evals</button></div>'+
          '<div class="eval-suite-actions"><strong>Run a specific eval suite</strong><p>State has two controlled eval areas. Rerun one when you are checking a targeted change.</p><div class="suite-action-grid">'+
          '<button class="button small suite-action" type="button" data-run-checks="review"><span class="suite-action-copy"><strong>Update understanding</strong><span>How State interprets new evidence and proposed truth changes.</span></span><span class="suite-action-run">Run →</span></button>'+
          '<button class="button small suite-action" type="button" data-run-checks="ask"><span class="suite-action-copy"><strong>Answer quality</strong><span>Grounding, uncertainty, and decision authority in answers.</span></span><span class="suite-action-run">Run →</span></button>'+
          '</div></div>'+
          '<p class="footnote">Estimated model cost: '+esc(run.estimated_cost||'not configured')+'. You will confirm before any paid run starts.</p>';
      }else if(run&&!activeEvalRun){
        qualityHtml+='<p class="footnote">Running AI evals from the dashboard still needs setup. Existing recorded results can still appear here.</p>';
      }
      qualityHtml+='<p class="footnote">Resolved Reviews · 30d: '+esc(q?.resolvedReviews??'Not loaded')+'. Project content is not copied into this dashboard.</p>';
    }else if(p.id==='tastemake'&&externalQ){
      const endpoint=externalQ.endpoint||{},base=externalQ.baseline||{},ci=externalQ.ci||{};
      const top=externalQualityAttention(externalQ);
      qualityHtml='<h3>Product quality · Recommendation checks</h3>'+
        '<div class="eval-overview"><div><strong>'+esc(top?.title||'Recommendation checks loaded')+'</strong><span>Latest recorded recommendation-quality evidence</span></div></div>'+
        '<div class="eval-grid">'+
        stateEvalCard('Recommendation rules passed',(endpoint.rule_checks?.passed??'—')+'/'+(endpoint.rule_checks?.total??'—'),'Checks that recommendations obey the product rules.','')+
        stateEvalCard('Bad outputs were caught',(endpoint.validator_self_test?.caught??'—')+'/'+(endpoint.validator_self_test?.total??'—'),'Deliberately bad recommendations should be rejected before a user sees them.','')+
        stateEvalCard('Main automated checks',ci.conclusion==='success'?'Passing':(ci.conclusion||'Unknown'),'Confirms the current code still passes its automated quality gates.','')+
        stateEvalCard('Baseline outputs kept',(base.valid_fixture_outputs?.passed??'—')+'/'+(base.valid_fixture_outputs?.total??'—'),'A comparison point for whether quality is improving or regressing.','')+
        '</div>'+
        '<div class="eval-history"><h4>What these checks cover</h4><div class="run-summary">'+
        (externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></div>';
    }else if(p.id==='narc'&&externalQ){
      qualityHtml='<h3>Product quality · Game checks</h3>'+
        '<div class="eval-overview"><div><strong>'+(externalQ.recorded?.recorded_all_suites_green?'Automated checks are passing':'Automated check status is unclear')+'</strong><span>'+(externalQ.recorded?.full_playtest_pending?'Human first-run playtest is still open.':'Latest playtest gate is recorded.')+'</span></div></div>'+
        '<div class="eval-grid">'+
        stateEvalCard('Automated game checks',externalQ.recorded?.recorded_all_suites_green?'3/3 passing':'Unknown','Checks branches, consequences, endings, time rules, and desktop behavior.','')+
        stateEvalCard('Human first-run playtest',externalQ.recorded?.full_playtest_pending?'Still needed':'Recorded','This is the check that tells us whether the experience actually makes sense to a player.','')+
        '</div>'+
        '<div class="eval-history"><h4>Automated check details</h4><div class="run-summary">'+
        (externalQ.suites||[]).map(item=>'<div class="run-callout"><strong>'+esc(item.name)+'</strong><p>'+esc(item.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></div>';
    }else{
      qualityHtml='<h3>Product quality</h3><div class="empty" style="margin-top:12px">Quality data is not available right now.</div>';
    }
    if(p.id!=='state'&&run){
      const activeQualityRun=data.qualityRun;
      if(activeQualityRun){
        const delayed=activeQualityRun.state==='delayed';
        qualityHtml+='<div class="eval-run-status '+(delayed?'warn':'')+'" role="status"><strong>'+(delayed?'Run started · waiting for a newer result':'Quality checks are running…')+'</strong><span>Started '+esc(fmtDate(activeQualityRun.startedAt))+'. The latest recorded results stay visible until the workflow finishes.</span></div>';
      }
      if(pending.has('Run controls')){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking whether dashboard-run controls are ready…</span></div>';
      }else if(run.configured){
        const runDisabled=activeQualityRun?' disabled':'';
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all"'+runDisabled+'>'+(activeQualityRun?'Checks running…':esc(run.button_label||'Run quality checks'))+'</button></div>'+
          '<p class="footnote">This dashboard run uses the project\'s existing GitHub Actions workflow and does not make paid model calls.</p>';
      }else{
        qualityHtml+='<p class="footnote">Running these checks from the dashboard still needs GitHub workflow access. Existing recorded results can still appear here.</p>';
      }
    }
    doc.getElementById('qualityPanel').innerHTML=qualityHtml;

    // Usage only gets a standalone Overview section when there is real usage data to show.
    const a=platform?.analytics;
    const analyticsPanel=doc.getElementById('analyticsPanel');
    analyticsPanel.classList.toggle('usage-hidden',!a?.available);
    if(a?.available){
      const visitorTrend=trendText(a.visitors_delta_pct),pageTrend=trendText(a.pageviews_delta_pct);
      const visitorClass=a.visitors_delta_pct==null?'flat':Number(a.visitors_delta_pct)>0?'up':Number(a.visitors_delta_pct)<0?'down':'flat';
      const pageClass=a.pageviews_delta_pct==null?'flat':Number(a.pageviews_delta_pct)>0?'up':Number(a.pageviews_delta_pct)<0?'down':'flat';
      const hasVisitorComparison=a.visitors_delta_pct!=null&&!Number.isNaN(Number(a.visitors_delta_pct));
      const hasPageComparison=a.pageviews_delta_pct!=null&&!Number.isNaN(Number(a.pageviews_delta_pct));
      const trends=!hasVisitorComparison&&!hasPageComparison
        ?'<div class="usage-comparison-empty">No previous 30-day period to compare yet</div>'
        :'<div class="usage-trends">'+
          '<div class="trend '+visitorClass+'"><strong>Visitors:</strong> '+esc(visitorTrend)+'</div>'+
          '<div class="trend '+pageClass+'"><strong>Page views:</strong> '+esc(pageTrend)+'</div>'+
          '</div>';
      const analyticsUrl=p.links?.vercel?(p.links.vercel.replace(/\/$/,'')+'/analytics'):null;
      doc.getElementById('analyticsPanel').innerHTML='<div class="panel-title-row"><h3>Site analytics</h3>'+(analyticsUrl?'<a class="site-analytics-link" href="'+esc(analyticsUrl)+'" target="_blank" rel="noopener noreferrer">Open analytics ↗</a>':'')+'</div><div class="metrics" style="margin-top:12px">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div>'+trends;
    }else{
      analyticsPanel.innerHTML='';
    }

    // Chronological activity tells an operating story rather than exposing raw events.
    const timelineItems=activityTimelineItems(data);
    const activityFilter=data.activityFilter||'all';
    const filteredTimeline=activityFilter==='all'?timelineItems:timelineItems.filter(item=>item.category===activityFilter);
    const groupedDays=[];
    for(const item of filteredTimeline.slice(0,30)){
      const label=activityDayLabel(item.when);
      let group=groupedDays[groupedDays.length-1];
      if(!group||group.label!==label){group={label,items:[]};groupedDays.push(group);}
      group.items.push(item);
    }
    const activityItemMarkup=item=>{
      const attempts=Array.isArray(item.attempts)&&item.attempts.length>1
        ?'<details class="activity-attempts"><summary>Show '+item.attempts.length+' attempts</summary><div>'+item.attempts.map(attempt=>'<div class="activity-attempt"><span>'+esc(fmtDate(attempt.when))+'</span><span>'+esc(attempt.detail)+'</span></div>').join('')+'</div></details>'
        :'';
      const incidentClass=(item.type==='Release incident'||(Array.isArray(item.attempts)&&item.attempts.length>1))?' incident-episode':'';
      const impact=item.userImpact?'<span class="impact-chip '+esc(item.userImpact.kind||'unknown')+'">User impact: '+esc(item.userImpact.status||'Unknown')+'</span>':'';
      const followup=item.followup?'<span class="activity-followup">'+esc(item.followup)+'</span>':'';
      return '<div class="timeline-item'+incidentClass+'"><span class="timeline-time">'+esc(activityTimeRange(item))+'</span><span class="timeline-marker"></span><div class="timeline-content"><span class="activity-type">'+esc(item.type||'Activity')+'</span><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail||'')+'</span>'+impact+followup+attempts+'</div></div>';
    };
    const timelineHtml=filteredTimeline.length
      ?'<div class="activity-day-groups">'+groupedDays.map(group=>'<section class="activity-day"><h4>'+esc(group.label)+'</h4><div class="timeline">'+group.items.map(activityItemMarkup).join('')+'</div></section>').join('')+'</div>'
      :'<div class="empty">No activity matches this filter yet.</div>';
    const activityFilters=[['all','All'],['releases','Releases'],['quality','Quality'],['investigations','Investigations'],['decisions','Decisions']];
    doc.getElementById('historyPanel').innerHTML='<div class="panel-title-row"><div><h3>Activity</h3><p class="panel-copy">A chronological operating history across releases, quality checks, investigations, and recovery.</p></div></div>'+
      '<div class="activity-filters" role="group" aria-label="Filter activity">'+activityFilters.map(([key,label])=>'<button class="activity-filter '+(activityFilter===key?'active':'')+'" type="button" data-activity-filter="'+key+'" aria-pressed="'+(activityFilter===key?'true':'false')+'">'+label+'</button>').join('')+'</div>'+
      '<div style="margin-top:12px">'+timelineHtml+'</div>';
    const overviewActivity=timelineItems.length?'<div class="activity-list">'+timelineItems.slice(0,3).map(item=>'<div class="activity-item"><span class="activity-type">'+esc(item.type||'Activity')+'</span><strong>'+esc(item.title)+'</strong><span>'+esc(relativeAge(item.when))+' · '+esc(item.detail||'')+'</span></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('overviewActivityPanel').innerHTML='<div class="panel-title-row"><h3>Recent activity</h3><button class="button small" type="button" data-tab-target="activity">View timeline</button></div><div style="margin-top:12px">'+overviewActivity+'</div>';

    // Delivery separates what users have now from whether the next release can ship.
    const investigationBusy=!!data.investigation?.loading;
    const investigateButton=(type,environment,label)=>'<button class="button small" type="button" data-investigate="'+esc(type)+'" data-environment="'+esc(environment)+'"'+(investigationBusy?' disabled':'')+'>'+esc(label)+'</button>';
    const pipeline=deliveryAttentionForData(data);
    const deliveryKind=pipeline.kind||'unknown';
    const rawPreviewFailure=d?.vercel?.kind==='bad'&&deliveryKind==='good';
    const pipelineText=rawPreviewFailure?'No active production release failure':deliveryKind==='good'?'Latest production release is healthy':deliveryKind==='bad'?'Latest production release attempt did not deploy':deliveryKind==='warn'?'Latest production release attempt is still finishing':'Release status is unavailable';
    const deliveryClass=deliveryKind==='bad'?'bad':deliveryKind==='warn'?'warn':'';
    const runtime=productionRuntime(data);
    const environmentBlock=(label,item)=>{
      if(!item)return'<div class="delivery-environment"><div class="delivery-environment-head"><strong>'+esc(label)+'</strong><span>Unavailable</span></div></div>';
      const status=item.vercel?.kind==='good'?'Healthy':item.vercel?.kind==='bad'?'Needs attention':item.vercel?.kind==='warn'?'Watch':'Unknown';
      const vercelTarget=(item.vercel?.contexts||[]).map(context=>context?.target_url).find(url=>/^https:\/\/vercel\.com\//.test(String(url||'')))||p.links?.vercel;
      return '<div class="delivery-environment"><div class="delivery-environment-head"><div><strong>'+esc(label)+'</strong><span class="branch-label">'+esc(item.branch)+'</span></div><span class="delivery-status '+esc(item.vercel?.kind||'unknown')+'">'+esc(status)+'</span></div>'+
        '<a class="delivery-release" href="'+esc(changeUrl(p.repo,item)||repoUrl(p.repo))+'" target="_blank" rel="noopener noreferrer">'+esc(commitTitle(item.message))+'</a>'+
        '<div class="delivery-meta"><span>Updated '+esc(fmtDate(item.updatedAt))+'</span><span>'+githubLink(shortSha(item.sha),githubCommitUrl(p.repo,item.sha))+'</span><span>'+esc(item.vercel?.label||'Deployment status unavailable')+'</span>'+(vercelTarget?'<span>'+githubLink('Open in Vercel ↗',vercelTarget)+'</span>':'')+'</div></div>';
    };
    const prodInvestigate=deliveryKind==='bad'?investigateButton('vercel','production','Investigate deployment'):'';
    const checkInvestigate=Array.isArray(d?.failedChecks)&&d.failedChecks.length?investigateButton('github-check','production','Investigate failed check'):'';
    const deliveryHealthy=deliveryKind==='good'&&runtime.kind==='good'&&!checkInvestigate;
    const deliveryDetails=
      '<div class="delivery-split" style="margin-top:12px">'+
        '<div class="delivery-concept"><span class="activity-type">Runtime</span><strong>Current production</strong><span class="delivery-status '+esc(runtime.kind)+'">'+esc(runtime.label)+'</span><p>'+esc(runtime.detail)+'</p></div>'+
        '<div class="delivery-concept '+deliveryClass+'"><span class="activity-type">Release pipeline</span><strong>'+esc(pipelineText)+'</strong><span class="delivery-status '+esc(deliveryKind)+'">'+esc(deliveryKind==='good'?'Healthy':deliveryKind==='bad'?'Needs attention':deliveryKind==='warn'?'Watch':'Unknown')+'</span><p>'+esc(pipeline.detail)+'</p></div>'+
      '</div>'+
      '<div class="delivery-environments">'+(rawPreviewFailure?'<div class="delivery-environment"><div class="delivery-environment-head"><div><strong>Production release</strong></div><span class="delivery-status good">Healthy</span></div><div class="delivery-meta"><span>The failed Vercel status on the referenced commit was a preview or superseded attempt, not an active production release failure.</span>'+(p.links?.vercel?'<span>'+githubLink('Open in Vercel ↗',p.links.vercel)+'</span>':'')+'</div></div>':environmentBlock('Latest production release attempt',d))+(s?environmentBlock('Staging release',s):'')+'</div>'+
      '<div class="quality-actions">'+prodInvestigate+checkInvestigate+'</div>';
    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.classList.toggle('on-demand-panel',deliveryHealthy);
    if(!deliveryHealthy)deliveryPanel.classList.remove('revealed');
    deliveryPanel.innerHTML=deliveryHealthy
      ?'<div class="panel-title-row"><h3>Delivery details</h3><span class="readiness-pill ready">Healthy</span></div>'+deliveryDetails
      :'<div class="panel-title-row"><h3>Delivery</h3><span class="readiness-pill '+esc(readiness.kind==='bad'?'hold':readiness.kind==='warn'?'watch':readiness.kind==='good'?'ready':'unknown')+'">Release · '+esc(readiness.label)+'</span></div>'+deliveryDetails;

    // Infrastructure details live one layer down under Systems & connections.
    const r=platform?.render,n=platform?.neon;
    const infraCards=[];
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraCards.push({label:'Production backend',status:production.ok?'Healthy':'Unavailable',detail:'Render',url:p.links?.renderProduction});
      const stagingEnv=r.environments?.staging;
      if(stagingEnv) infraCards.push({label:'Staging backend',status:stagingEnv.ok?'Healthy':'Unknown',detail:stagingEnv.ok?'Render':'Render · no recent successful response observed; production unaffected',url:p.links?.renderStaging});
      else if(p.id==='state'&&pending.has('Staging backend')) infraCards.push({label:'Staging backend',status:'Checking…',detail:'Render',url:p.links?.renderStaging});
    }else if(p.id==='state') infraCards.push({label:'Production backend',status:pending.has('Production backend')?'Checking…':'Unavailable',detail:'Render',url:p.links?.renderProduction});
    if(n?.configured&&n.available) infraCards.push({label:'Database',status:'Connected',detail:'Neon',url:p.links?.neon});
    else if(n?.configured) infraCards.push({label:'Database',status:'Temporarily unavailable',detail:'Neon',url:p.links?.neon});
    else infraCards.push({label:'Database',status:p.id==='state'?'Not connected yet':'Not used',detail:p.id==='state'?'Neon':'No database dependency',url:p.id==='state'?p.links?.neon:null});
    const infraAttention=infrastructureAttention(platform);
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3>'+
      '<div class="delivery-summary '+(infraAttention?.kind==='bad'?'bad':infraAttention?.kind==='warn'?'warn':'')+'" style="margin-top:12px">'+esc(infraAttention?.title||'Production services healthy')+'</div>'+
      '<div class="service-grid">'+infraCards.map(item=>'<div class="service-card"><strong>'+esc(item.label)+'</strong><span class="service-status">'+esc(item.status)+'</span><span class="service-detail">'+esc(item.detail)+'</span>'+(item.url?'<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">Open '+esc(item.detail.split(' · ')[0])+' ↗</a>':'')+'</div>').join('')+'</div>';

    // Connections and coverage gaps are setup context, so they stay behind the Systems & connections disclosure.
    const ai=platform?.aiTelemetry;
    const connections=[];
    connections.push({label:'Code + deployments',value:d?'Connected':'Unavailable'});
    connections.push({label:'Backend health',value:r?.configured?'Connected':(p.id==='state'?'Unavailable':'Not used')});
    connections.push({label:'Site analytics',value:analyticsConnectionValue(platform,pending.has('Analytics'))});
    connections.push({label:'Database health',value:n?.available?'Connected':(p.id==='state'?'Not connected':'Not used')});
    connections.push({label:'AI operations',value:ai?.not_applicable?'Not used':ai?.available?'Connected':pending.has('AI operations')?'Checking…':'Not connected'});
    if(p.id==='state'){
      const latestEval=[q?.review,q?.ask].filter(Boolean).map(item=>item.created_at).filter(Boolean).sort().pop();
      connections.push({label:'AI quality evals',value:latestEval?'Connected · last run '+fmtDate(latestEval):(run?.configured?'Ready to run':'Setup needed')});
    }
    let aiHtml='';
    if(pending.has('AI operations')){
      aiHtml='<h4 style="margin:18px 0 8px">AI operations</h4><div class="empty">Checking AI cost and response speed…</div>';
    }else if(ai?.available){
      const samples=Number(ai.response_speed?.sample_size||0);
      const speedScope=ai.response_speed?.scope||'AI calls';
      const costScope=ai.cost?.scope||'recorded AI calls';
      aiHtml='<h4 style="margin:18px 0 8px">AI operations · last '+esc(ai.period_days||30)+' days</h4>'+
        '<div class="metrics">'+
        metric(samples?durationLabel(ai.response_speed?.p50_ms):'No calls yet','Typical response speed')+
        metric(samples?durationLabel(ai.response_speed?.p95_ms):'No calls yet','Slower-end response speed')+
        metric(costLabel(ai.cost?.estimated_usd),'Estimated AI cost')+
        '</div>'+
        '<p class="footnote">Speed: '+esc(speedScope)+'. Cost: '+esc(costScope)+'. '+esc(ai.note||'Operational metadata only; no project or user content is included.')+'</p>';
    }else if(ai?.not_applicable){
      aiHtml='<p class="footnote"><strong>AI operations:</strong> Not applicable. NARC does not make runtime AI calls.</p>';
    }
    const gaps=setupGaps(data);
    doc.getElementById('connectionsPanel').innerHTML='<h3>Connections & coverage</h3>'+
      '<div class="rows" style="margin-top:12px">'+connections.map(item=>row(item.label,item.value)).join('')+'</div>'+
      aiHtml+
      (gaps.length?'<h4 style="margin:18px 0 8px">Coverage gaps</h4><div class="coverage-grid">'+gaps.map(item=>'<div class="coverage-item"><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'');
  }

  function evalRunStorageKey(root,projectId){return 'project-health-eval-run:'+pageEnvironment(root)+':'+String(projectId||'state');}
  function loadEvalRunState(root,projectId){
    try{
      const key=evalRunStorageKey(root,projectId);
      const raw=root.localStorage?.getItem(key);if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed?.startedAt||Date.now()-new Date(parsed.startedAt).getTime()>10*60*1000){root.localStorage?.removeItem(key);return null;}
      return parsed;
    }catch(_){return null;}
  }
  function saveEvalRunState(root,value,projectId){
    try{
      const id=projectId||value?.project||'state';
      const key=evalRunStorageKey(root,id);
      if(value)root.localStorage?.setItem(key,JSON.stringify(value));
      else root.localStorage?.removeItem(key);
    }catch(_){}
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
    if(id==='review_ambiguity_opens_question')return 'Risk: ambiguous evidence could be treated as established truth instead of an explicit unknown.';
    return 'Risk: controlled behavior differed from the product contract and needs scenario-level review.';
  }
  function previousEvalRun(quality,current){
    if(!current)return null;
    return (Array.isArray(quality?.recent)?quality.recent:[]).find(item=>item?.suite===current.suite&&String(item.created_at||'')!==String(current.created_at||''))||null;
  }

  async function dispatchRun(data,root,suite='all'){
    const run=data.runInfo;if(!run?.configured)return;
    const projectId=data.project.id;
    if(run.paid_model_calls){
      const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
      const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
      const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nResults are recorded as aggregate quality data. Start the run?';
      if(!root.confirm(message)) return;
    }else{
      const message='Run '+String(run.label||'quality checks')+'?\n\nThis starts the project\'s existing GitHub Actions quality workflow. No paid model calls are part of this dashboard run.';
      if(!root.confirm(message)) return;
    }
    try{
      const baselineUpdatedAt=projectId==='state'
        ?null
        :(data.externalQuality?.ci?.updated_at||data.externalQuality?.recorded?.updated_at||null);
      const payload=await jsonFetch('/api/project-health-run',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          project:projectId,
          suite,
          record_environment:pageEnvironment(root),
          confirm_paid_model_calls:!!run.paid_model_calls,
          estimated_cost:run.estimated_cost,
          baseline_updated_at:baselineUpdatedAt
        })
      });
      return {
        ...payload,
        project:projectId,
        suite,
        startedAt:new Date().toISOString(),
        baselineReview:data.quality?.review?.created_at||null,
        baselineAsk:data.quality?.ask?.created_at||null,
        baselineUpdatedAt,
        state:'running'
      };
    }catch(error){
      root.alert('Could not start the quality checks: '+error.message);
      throw error;
    }
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
        sources:[{label:'State eval details',url:'/state-evals',observedAt:latestDate}],
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
      sources:[{label:'State eval details',url:'/state-evals',observedAt:latestDate}],
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

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),summary=doc.getElementById('overviewSummary'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel'),projectTabs=doc.getElementById('projectTabs'),projectDetail=doc.getElementById('projectDetail'),investigationDrawer=doc.getElementById('investigationDrawer'),investigationBackdrop=doc.getElementById('investigationBackdrop'),closeInvestigationDrawerButton=doc.getElementById('closeInvestigationDrawer'),drawerRunAgainButton=doc.getElementById('drawerRunAgainButton'),drawerCopyHandoffButton=doc.getElementById('drawerCopyHandoffButton'),productNoteDialog=doc.getElementById('productNoteDialog'),productNoteForm=doc.getElementById('productNoteForm'),productNoteType=doc.getElementById('productNoteType'),productNoteText=doc.getElementById('productNoteText');
    if(!cards||!status||!summary||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    state.forEach(item=>{item.investigationHistory=loadInvestigationHistory(root,item.project.id);item.productNotes=loadProductNotes(root,item.project.id);});
    const initialParams=new URLSearchParams(root.location.search);
    let activeId=initialParams.get('project')||'state';
    const allowedTabs=new Set(['overview','ai-quality','activity']);
    let activeTab=allowedTabs.has(initialParams.get('tab'))?initialParams.get('tab'):'overview';
    let summaryFilter='all';
    let renderQueued=false,refreshGeneration=0,investigationDrawerOpen=false;
    const demoState={phase:'idle',step:0,timers:[]};

    function activeData(){return state.find(item=>item.project.id===activeId)||null;}

    function recordInvestigation(data,investigation,trigger){
      if(!data||!investigation||investigation.loading)return;
      const row={
        id:String(investigation.observedAt||new Date().toISOString())+':'+String(trigger||'project'),
        observedAt:investigation.observedAt||new Date().toISOString(),
        trigger:trigger||'project check',
        summary:investigationHistorySummary(investigation),
        evidence:(investigation.sources||[]).map(source=>source.label).filter(Boolean),
        qualityInvestigation:!!investigation.qualityInvestigation,
        quickCheck:!!investigation.quickCheck,
        needsAttentionAtRun:overallAttention(data).kind!=='good',
        resolvedAt:null
      };
      const rows=Array.isArray(data.investigationHistory)?data.investigationHistory:[];
      data.investigationHistory=[row,...rows.filter(item=>item.id!==row.id)].slice(0,20);
      saveInvestigationHistory(root,data.project.id,data.investigationHistory);
    }
    function reconcileInvestigationHistory(data){
      if(!data||!Array.isArray(data.investigationHistory)||!data.investigationHistory.length)return;
      if(overallAttention(data).kind!=='good')return;
      let changed=false;
      data.investigationHistory=data.investigationHistory.map((item,index)=>{
        if(index===0&&item.needsAttentionAtRun&&!item.resolvedAt){changed=true;return {...item,resolvedAt:new Date().toISOString()};}
        return item;
      });
      if(changed)saveInvestigationHistory(root,data.project.id,data.investigationHistory);
    }

    function renderCards(){
      const visible=PROJECTS.filter(project=>{
        if(summaryFilter==='all')return true;
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        if(!item?.fresh)return false;
        return projectStatus(item).key===summaryFilter;
      });
      cards.innerHTML=visible.map(project=>{
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        return item?cardMarkup(item,project.id===activeId):loadingCardMarkup(project,project.id===activeId);
      }).join('');
      cards.hidden=!visible.length;
    }

    const reviewStorageKey='project-health-reviewed:'+pageEnvironment(root);
    function reviewedState(){
      try{return JSON.parse(root.localStorage?.getItem(reviewStorageKey)||'{}')||{};}catch(_){return{};}
    }
    function saveReviewedState(value){
      try{root.localStorage?.setItem(reviewStorageKey,JSON.stringify(value));}catch(_){}
    }
    function currentReviewItems(){return state.flatMap(activityReviewItems);}
    function currentIncidents(){return currentReviewItems().filter(item=>!item.resolved);}
    function openProductItems(){return state.flatMap(item=>productOpenItems(item).map(open=>({...open,project:item.project.name})));}

    function demoTimeline(){
      const steps=[
        'Checking the failed Vercel deployment',
        'Build output found, but the cause is not clear yet',
        'Expanding to the related GitHub change',
        'Preparing a product-friendly engineering handoff'
      ];
      return '<div class="demo-timeline">'+steps.map((label,index)=>{
        const done=demoState.phase==='done'||demoState.step>index;
        const active=demoState.phase==='running'&&demoState.step===index;
        return '<div class="demo-timeline-item '+(done?'done ':'')+(active?'active':'')+'">'+esc(label)+'</div>';
      }).join('')+'</div>';
    }
    function demoReport(){
      return '<div class="demo-report"><dl>'+
        '<dt>What happened</dt><dd>The latest Tastemake version failed during deployment and did not go live.</dd>'+
        '<dt>Likely cause</dt><dd>The related change introduced a required environment setting that is missing in this environment.</dd>'+
        '<dt>User impact</dt><dd>No outage. People are still using the previous production version.</dd>'+
        '<dt>Owner</dt><dd>Engineering</dd>'+
        '<dt>What I checked</dt><dd>Failed Vercel deployment, build output, and the related GitHub change.</dd>'+
        '<dt>Not checked</dt><dd>Secret values, database contents, or user-session data.</dd>'+
        '<dt>Next step</dt><dd>Verify the environment setting before changing application code, then rerun the deployment.</dd>'+
        '<dt>Confidence</dt><dd>Moderate. The build output and code change point to the same explanation, but the environment value itself is intentionally not visible.</dd>'+
        '</dl><div class="quality-actions"><button class="button small primary" type="button" data-demo-copy>Copy engineer handoff</button><button class="button small" type="button" data-demo-replay>Replay</button></div><p class="footnote">Simulated with fixed, sanitized evidence. No live AI call or infrastructure change occurs.</p></div>';
    }
    function demoIncidentMarkup(){
      return '<div class="review-item"><div><span class="review-kind demo">Demo incident</span><strong>Tastemake · Production deploy failed</strong>'+
        '<div class="review-meta">Simulated with fixed, sanitized evidence · a realistic replay of the live investigation workflow</div>'+
        '<div class="review-meta"><strong>Impact:</strong> The new version did not go live. Existing production remains available. · <strong>Owner:</strong> Engineering</div>'+
        (demoState.phase==='idle'?'':demoTimeline())+
        (demoState.phase==='done'?demoReport():'')+
        '</div><div class="review-actions">'+(demoState.phase==='idle'?'<button class="button small primary" type="button" data-demo-start>Investigate failure</button>':demoState.phase==='running'?'<button class="button small" type="button" disabled>Investigating…</button>':'')+'</div></div>';
    }

    function unreviewedIncidents(){
      const reviewed=reviewedState();
      return currentIncidents().filter(item=>!reviewed[item.key]);
    }
    function renderReviewInbox(){
      const items=unreviewedIncidents();
      if(!items.length){reviewInbox.innerHTML='';return;}
      const rows=items.slice(0,6).map(item=>{
        const source=item.url?'<a class="button small" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">View evidence</a>':'';
        return '<div class="review-item"><div><span class="review-kind incident">Live incident</span><strong>'+esc(item.project)+' · '+esc(item.title)+'</strong><div class="review-meta">'+esc(relativeAge(item.observedAt))+' · '+esc(item.detail)+'</div><div class="review-meta"><strong>Impact:</strong> '+esc(item.impact||'Unknown')+' · <strong>Owner:</strong> '+esc(item.owner||'Unknown')+'</div></div><div class="review-actions">'+source+'<button class="button small" type="button" data-review-key="'+esc(item.key)+'">Mark reviewed</button></div></div>';
      }).join('');
      reviewInbox.innerHTML='<section class="panel"><div class="panel-title-row"><h3>Incidents</h3><span class="readiness-pill watch">'+items.length+' unreviewed</span></div><div class="review-list" style="margin-top:10px">'+rows+'</div></section>';
    }
    function renderSummary(){
      if(PROJECTS.length<=3){summary.innerHTML='';summary.hidden=true;return;}
      summary.hidden=false;
      const fresh=state.filter(item=>item?.fresh);
      const actionCount=fresh.filter(item=>projectStatus(item).key==='action').length;
      const watchCount=fresh.filter(item=>projectStatus(item).key==='watch').length;
      summary.innerHTML=
        (actionCount?'<button class="summary-chip summary-action incident '+(summaryFilter==='action'?'active':'')+'" type="button" data-summary-filter="action"><strong>'+actionCount+'</strong> '+(actionCount===1?'needs':'need')+' attention</button>':'')+
        (watchCount?'<button class="summary-chip summary-action open '+(summaryFilter==='watch'?'active':'')+'" type="button" data-summary-filter="watch"><strong>'+watchCount+'</strong> watch</button>':'');
    }

    function applyTabState(){
      if(projectTabs){
        projectTabs.querySelectorAll('[data-tab]').forEach(button=>{
          const selected=button.dataset.tab===activeTab;
          button.classList.toggle('active',selected);
          button.setAttribute('aria-selected',selected?'true':'false');
        });
      }
      doc.querySelectorAll('[data-tab-panel]').forEach(panel=>{panel.hidden=panel.dataset.tabPanel!==activeTab;});
    }
    function setActiveTab(tab,updateUrl=true){
      activeTab=allowedTabs.has(tab)?tab:'overview';
      if(activeTab==='ai-quality'){
        const data=activeData();if(data)data.qualityRunCompletedAt=null;
      }
      applyTabState();
      if(updateUrl){
        const url=new URL(root.location.href);url.searchParams.set('project',activeId);url.searchParams.set('tab',activeTab);root.history.replaceState(null,'',url);
      }
    }
    function renderNow(){
      renderQueued=false;
      renderCards();renderSummary();renderReviewInbox();
      const data=activeData();if(data)renderDetail(data,doc);
      applyTabState();
      root.PROJECT_HEALTH_LAST_TIMINGS=Object.fromEntries(state.map(item=>[item.project.id,{...item.timings}]));
    }
    function scheduleRender(){
      if(renderQueued)return;
      renderQueued=true;
      const schedule=root.requestAnimationFrame||((fn)=>root.setTimeout(fn,16));
      schedule(renderNow);
    }
    function persist(){saveSnapshot(root,state);}

    async function ensureDetails(id){
      const data=state.find(item=>item.project.id===id);if(!data)return;
      await loadProjectDetails(data,root,()=>{scheduleRender();});
      reconcileInvestigationHistory(data);
      scheduleRender();persist();
    }

    function select(id){
      closeInvestigationDrawer();
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      scheduleRender();
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);url.searchParams.set('tab',activeTab);root.history.replaceState(null,'',url);
      ensureDetails(activeId);
    }

    function clearDemoTimers(){demoState.timers.forEach(id=>root.clearTimeout(id));demoState.timers=[];}
    function startDemo(){
      clearDemoTimers();
      demoState.phase='running';demoState.step=0;renderNow();
      const points=[[700,1],[2100,2],[3900,3],[5600,4]];
      for(const [delay,step] of points){
        demoState.timers.push(root.setTimeout(()=>{demoState.step=step;renderNow();},delay));
      }
      demoState.timers.push(root.setTimeout(()=>{demoState.phase='done';demoState.step=4;renderNow();},7200));
    }
    async function copyDemoHandoff(button){
      const text=['Tastemake engineering handoff','','Issue','The latest version failed during deployment and did not go live.','','User impact','No outage. People are still using the previous production version.','','Likely cause','The related change introduced a required environment setting that is missing in this environment.','','Evidence checked','Failed Vercel deployment, build output, related GitHub change.','','Not checked','Secret values, database contents, user-session data.','','Suggested starting point','Verify the environment setting before changing application code, then rerun the deployment.','','Confidence','Moderate. The build output and code change point to the same explanation, but the environment value itself is intentionally not visible.','','Demo replay using fixed, sanitized evidence.'].join('\n');
      try{await root.navigator.clipboard.writeText(text);button.textContent='Copied';root.setTimeout(()=>{button.textContent='Copy engineer handoff';},1500);}catch(_){root.prompt('Copy engineering handoff',text);}
    }

    cards.addEventListener('click',event=>{const item=event.target.closest?.('.project-switcher-item');if(item)select(item.dataset.project);});

    summary.addEventListener('click',event=>{
      const filterButton=event.target.closest?.('[data-summary-filter]');
      if(filterButton){
        const requested=filterButton.dataset.summaryFilter||'all';
        summaryFilter=summaryFilter===requested?'all':requested;
        const candidates=state.filter(item=>item?.fresh&&(summaryFilter==='all'||projectStatus(item).key===summaryFilter));
        if(summaryFilter!=='all'&&candidates.length&&!candidates.some(item=>item.project.id===activeId))select(candidates[0].project.id);
        else renderNow();
        return;
      }
      if(event.target.closest?.('[data-summary-incidents]')){
        const first=unreviewedIncidents()[0];
        if(first){
          const data=state.find(item=>item.project.name===first.project);
          if(data&&data.project.id!==activeId)select(data.project.id);
          reviewInbox.scrollIntoView?.({behavior:'smooth',block:'start'});
        }
      }
    });

    if(projectTabs)projectTabs.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-tab]');
      if(button)setActiveTab(button.dataset.tab);
    });
    function openInfoDialog(dialog){
      if(!dialog)return;
      const menu=doc.getElementById('projectActionMenu');
      if(menu)menu.open=false;
      if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
      else dialog.setAttribute('open','');
    }
    if(projectDetail)projectDetail.addEventListener('click',event=>{
      const addNoteButton=event.target.closest?.('[data-add-product-note]');
      if(addNoteButton){
        if(productNoteDialog?.showModal)productNoteDialog.showModal();else productNoteDialog?.setAttribute('open','');
        root.setTimeout(()=>productNoteText?.focus?.(),0);
        return;
      }
      const activityFilterButton=event.target.closest?.('[data-activity-filter]');
      if(activityFilterButton){
        const data=activeData();
        if(data){data.activityFilter=activityFilterButton.dataset.activityFilter||'all';renderNow();}
        return;
      }
      const systemsButton=event.target.closest?.('[data-open-systems]');
      if(systemsButton){
        setActiveTab('overview');
        openInfoDialog(doc.getElementById('systemsDetails'));
        return;
      }
      const aboutButton=event.target.closest?.('[data-open-about]');
      if(aboutButton){
        openInfoDialog(doc.getElementById('aboutProjectHealth'));
        return;
      }
      const target=event.target.closest?.('[data-tab-target],[data-section-target]');
      if(!target)return;
      const tab=target.dataset.tabTarget||'overview';
      setActiveTab(tab);
      if(target.dataset.sectionTarget){
        const section=doc.getElementById(target.dataset.sectionTarget);
        if(section?.tagName==='DIALOG'){openInfoDialog(section);return;}
        if(section?.classList?.contains('on-demand-panel'))section.classList.add('revealed');
        root.setTimeout(()=>section?.scrollIntoView?.({behavior:'smooth',block:'start'}),0);
      }
    });
    doc.addEventListener('click',event=>{
      const close=event.target.closest?.('[data-close-info]');
      if(close){
        const dialog=close.closest?.('dialog');
        if(dialog?.open&&typeof dialog.close==='function')dialog.close();
        else dialog?.removeAttribute?.('open');
      }
    });

    if(closeInvestigationDrawerButton)closeInvestigationDrawerButton.addEventListener('click',closeInvestigationDrawer);
    if(investigationBackdrop)investigationBackdrop.addEventListener('click',closeInvestigationDrawer);
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&investigationDrawerOpen)closeInvestigationDrawer();});

    function openInvestigationDrawer(){
      if(!investigationDrawer)return;
      investigationDrawerOpen=true;
      investigationDrawer.hidden=false;
      investigationDrawer.setAttribute('aria-hidden','false');
      if(investigationBackdrop) investigationBackdrop.hidden=false;
      const panel=doc.getElementById('investigationPanel');
      panel?.focus?.({preventScroll:true});
      doc.body?.classList?.add('drawer-open');
    }
    function closeInvestigationDrawer(){
      investigationDrawerOpen=false;
      if(investigationDrawer){
        investigationDrawer.hidden=true;
        investigationDrawer.setAttribute('aria-hidden','true');
      }
      if(investigationBackdrop) investigationBackdrop.hidden=true;
      doc.body?.classList?.remove('drawer-open');
    }
    function revealInvestigation(){openInvestigationDrawer();}

    async function runAgentInvestigation(data,signalType,environment='production'){
      if(!data)return;
      data.investigation={loading:true};renderNow();revealInvestigation();
      try{
        const payload=await jsonFetch('/api/project-health-investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:data.project.id,environment,signalType}),timeoutMs:30000});
        data.investigation={report:payload.report,sources:Array.isArray(payload.sources)?payload.sources:[],observedAt:payload.observedAt};
      }catch(error){
        data.investigation={error:error.message||'Could not complete the investigation.'};
      }
      recordInvestigation(data,data.investigation,signalType==='vercel'?'Deployment failure':'Failed release check');
      renderNow();
    }

    const headerRunChecksButton=doc.getElementById('headerRunChecksButton');
    if(headerRunChecksButton)headerRunChecksButton.addEventListener('click',async()=>{
      const data=activeData();if(!data||!data.runInfo?.configured||data.qualityRun)return;
      if(data.qualityRunCompletedAt){setActiveTab('ai-quality');renderNow();return;}
      headerRunChecksButton.disabled=true;
      headerRunChecksButton.textContent='Starting checks…';
      try{
        const started=await dispatchRun(data,root,'all');
        if(started?.started){
          data.qualityRun=started;
          data.qualityRunCompletedAt=null;
          saveEvalRunState(root,started,data.project.id);
          setActiveTab('ai-quality');
          renderNow();
          pollEvalResults(data);
        }else{
          renderNow();
        }
      }catch(_){renderNow();}
    });

    async function startProjectInvestigation(data){
      if(!data)return;
      const liveIncident=activityReviewItems(data).find(item=>!item.resolved);
      if(liveIncident?.kind==='deployment'){await runAgentInvestigation(data,'vercel','production');return;}
      if(data.project.quality==='state'&&['bad','warn'].includes(qualityAttention(data.quality).kind)){
        data.investigation=qualityInvestigation(data);recordInvestigation(data,data.investigation,'AI eval');renderNow();revealInvestigation();return;
      }
      if(deliveryAttentionForData(data).kind==='bad'){
        const failedChecks=Array.isArray(data.delivery?.failedChecks)?data.delivery.failedChecks:[];
        await runAgentInvestigation(data,failedChecks.length?'github-check':'vercel','production');return;
      }
      data.investigation=quickProjectCheck(data);
      recordInvestigation(data,data.investigation,'Project check');
      renderNow();
      revealInvestigation();
    }

    const projectCheckButton=doc.getElementById('projectCheckButton');
    if(projectCheckButton)projectCheckButton.addEventListener('click',async()=>{
      const data=activeData();if(!data||data.investigation?.loading)return;
      await startProjectInvestigation(data);
    });
    if(drawerRunAgainButton)drawerRunAgainButton.addEventListener('click',async()=>{
      const data=activeData();if(!data)return;
      await startProjectInvestigation(data);
    });

    if(drawerCopyHandoffButton)drawerCopyHandoffButton.addEventListener('click',async()=>{
      const data=activeData();if(!data||!data.investigation)return;
      const handoff=projectHandoff(data);
      const text=handoff.handoffText||handoff.report||'';
      if(!text)return;
      try{
        await root.navigator.clipboard.writeText(text);
        drawerCopyHandoffButton.textContent='Copied';
        root.setTimeout(()=>{drawerCopyHandoffButton.textContent='Copy handoff';},1500);
      }catch(_){root.prompt('Copy project handoff',text);}
    });

    const attentionPanel=doc.getElementById('attentionPanel');
    if(attentionPanel)attentionPanel.addEventListener('click',event=>{
      const action=event.target.closest?.('[data-attention-action]');
      if(!action)return;
      const data=activeData();if(!data)return;
      if(action.dataset.attentionAction==='run-ai-checks'){
        const runButton=doc.getElementById('headerRunChecksButton');
        if(runButton&&!runButton.disabled)runButton.click();
        return;
      }
      if(action.dataset.attentionAction==='review-quality'){
        setActiveTab('ai-quality');
        renderNow();
      }
    });


    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-investigate]');
      if(!button)return;
      const data=activeData();if(!data)return;
      if(!root.confirm('Run the read-only investigation agent? It will inspect only bounded evidence relevant to this failure and cannot change code, configuration, or deployments.'))return;
      await runAgentInvestigation(data,button.dataset.investigate,button.dataset.environment);
    });

    if(productNoteForm)productNoteForm.addEventListener('submit',event=>{
      event.preventDefault();
      const data=activeData();if(!data)return;
      const textValue=String(productNoteText?.value||'').trim();
      if(!textValue)return;
      const row={id:'note-'+Date.now(),type:String(productNoteType?.value||'decision'),text:textValue,createdAt:new Date().toISOString()};
      data.productNotes=[row,...(Array.isArray(data.productNotes)?data.productNotes:[])].slice(0,30);
      saveProductNotes(root,data.project.id,data.productNotes);
      if(productNoteText)productNoteText.value='';
      if(productNoteType)productNoteType.value='decision';
      if(productNoteDialog?.close)productNoteDialog.close();else productNoteDialog?.removeAttribute?.('open');
      renderNow();
    });

    async function refreshAll(){
      if(refresh.disabled)return;
      refresh.disabled=true;
      const generation=++refreshGeneration;
      state=PROJECTS.map(project=>{
        const previous=state.find(item=>item.project.id===project.id);
        return emptyProjectData(project,previous);
      });
      scheduleRender();

      const completed=new Set();
      const pendingNames=()=>PROJECTS.filter(project=>!completed.has(project.id)).map(project=>project.name);
      status.textContent=progressText(0,PROJECTS.length,pendingNames());

      const jobs=PROJECTS.map(async project=>{
        const index=PROJECTS.findIndex(p=>p.id===project.id);
        const seed=state[index];
        const item=await loadProject(project,root,partial=>{
          if(generation!==refreshGeneration)return;
          state[index]=partial;
          scheduleRender();
        },seed);
        if(generation!==refreshGeneration)return;
        state[index]=item;
        completed.add(project.id);
        if(item.qualityPromise)item.qualityPromise.finally(()=>{if(generation===refreshGeneration){scheduleRender();persist();}});
        scheduleRender();
        if(completed.size<PROJECTS.length)status.textContent=progressText(completed.size,PROJECTS.length,pendingNames());
      });

      await Promise.all(jobs);
      if(generation!==refreshGeneration)return;
      state.forEach(reconcileInvestigationHistory);
      persist();
      status.innerHTML='<strong>Updated just now</strong>';
      refresh.disabled=false;
      ensureDetails(activeId);
    }

    if(cached?.savedAt)status.innerHTML='<strong>Showing the last good snapshot.</strong> Last checked '+esc(fmtDate(cached.savedAt))+'. Refreshing current health…';
    renderNow();
    refresh.addEventListener('click',refreshAll);
    reviewInbox.addEventListener('click',async event=>{
      const reviewButton=event.target.closest?.('[data-review-key]');
      if(reviewButton){
        const reviewed=reviewedState();reviewed[reviewButton.dataset.reviewKey]=new Date().toISOString();saveReviewedState(reviewed);renderNow();return;
      }

    });
    const evalPollTimers=new Map();
    async function pollEvalResults(data){
      if(!data?.qualityRun)return;
      const projectId=data.project.id;
      const existing=evalPollTimers.get(projectId);
      if(existing)root.clearTimeout(existing);
      const runState=data.qualityRun;
      try{
        let complete=false;
        if(projectId==='state'){
          const latest=await loadStateQuality(root);
          data.quality=latest;
          complete=evalRunComplete(latest,runState);
        }else{
          const latest=await loadExternalQuality(data.project);
          data.externalQuality=latest;
          complete=externalQualityRunComplete(latest,runState);
        }
        if(complete){
          data.qualityRun=null;
          data.qualityRunCompletedAt=activeTab==='ai-quality'?null:new Date().toISOString();
          saveEvalRunState(root,null,projectId);
          reconcileInvestigationHistory(data);
          persist();
          renderNow();
          return;
        }
      }catch(_){}
      const age=Date.now()-new Date(runState.startedAt).getTime();
      if(age>4*60*1000)runState.state='delayed';
      if(age<10*60*1000){
        renderNow();
        evalPollTimers.set(projectId,root.setTimeout(()=>pollEvalResults(data),7000));
      }else{
        data.qualityRun=null;
        saveEvalRunState(root,null,projectId);
        renderNow();
      }
    }

    qualityPanel.addEventListener('click',async event=>{
      const investigate=event.target.closest?.('[data-investigate-quality]');
      if(investigate){
        const data=activeData();if(!data)return;
        data.investigation=qualityInvestigation(data,investigate.dataset.failureId||null);
        recordInvestigation(data,data.investigation,investigate.dataset.failureId?'AI eval failure · '+investigate.dataset.failureId:'AI eval');
        renderNow();revealInvestigation();return;
      }
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data||data.qualityRun)return;
      const originalLabel=button.textContent;
      button.disabled=true;
      button.textContent='Starting…';
      try{
        const started=await dispatchRun(data,root,button.dataset.runChecks||'all');
        if(started?.started){
          data.qualityRun=started;
          data.qualityRunCompletedAt=null;
          saveEvalRunState(root,started,data.project.id);
          setActiveTab('ai-quality');
          renderNow();
          pollEvalResults(data);
        }else{
          button.disabled=false;
          button.textContent=originalLabel;
        }
      }catch(_){renderDetail(data,doc);}
    });
    await refreshAll();
    const requestedInvestigation=initialParams.get('investigate');
    if(requestedInvestigation==='quality'){
      const data=activeData();
      if(data?.project?.id==='state'&&data.quality){
        const requestedFailure=initialParams.get('failure');
        data.investigation=qualityInvestigation(data,requestedFailure||null);
        recordInvestigation(data,data.investigation,requestedFailure?'AI eval failure · '+requestedFailure:'AI eval');
        renderNow();
        revealInvestigation();
        const url=new URL(root.location.href);
        url.searchParams.delete('failure');
        url.searchParams.delete('investigate');
        root.history.replaceState(null,'',url);
      }
    }
    for(const project of PROJECTS){
      const resumedRun=loadEvalRunState(root,project.id);
      if(!resumedRun)continue;
      const data=state.find(item=>item.project.id===project.id);
      if(!data){saveEvalRunState(root,null,project.id);continue;}
      const complete=project.id==='state'
        ?evalRunComplete(data.quality,resumedRun)
        :externalQualityRunComplete(data.externalQuality,resumedRun);
      if(!complete){
        data.qualityRun=resumedRun;
        renderNow();
        pollEvalResults(data);
      }else{
        saveEvalRunState(root,null,project.id);
      }
    }
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,deliveryAttentionForData,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,regressionSignal,releaseRiskChecklist,healthConsistencyIssues,productionRuntime,operationalNextDecision,qualityFailureClassSummary,failureCheckCount,failureExplanation,activityTimelineItems,projectQualityLabel,evalScore,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,productNoteKey,loadProductNotes,saveProductNotes,loadProject,loadProjectDetails,infraCardLabel,analyticsConnectionValue,analyticsGapDetail,analyticsLabel,relativeAge,changedSinceVisit,meaningfulChanges,freshnessMeta,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,trendText,activityReviewItems,progressText,quickProjectCheck,evalRunComplete,externalQualityRunComplete,qualityInvestigation,projectHandoff,init};
});
