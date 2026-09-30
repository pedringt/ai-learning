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
      owner:'Product'
    },
    {
      id:'tastemake',name:'Tastemake',description:'Taste-learning recommendation prototype built around preference discovery.',repo:'pedringt/tastemake',branch:'main',
      focus:'Improve recommendation variety without weakening relevance or grounding.',
      evidence:['Recommendation breadth','Irrelevant suggestions','Validator catches','Repeat engagement'],
      nextDecision:'Decide whether the canonical store improves recommendation quality enough to expand further.',
      nextReview:'After the next recommendation-quality pass.',
      owner:'Product'
    },
    {
      id:'narc',name:'NARC',description:'Workplace-surveillance satire game with branching consequences.',repo:'pedringt/narc',branch:'main',
      focus:'Make the first playthrough feel like a coherent workplace simulation rather than a stack of mechanics.',
      evidence:['First-run playtest','Branch consistency','Confusing choices','Replayable endings'],
      nextDecision:'Decide whether the first-play flow is clear enough before adding more branches and mechanics.',
      nextReview:'After the full first-run playtest.',
      owner:'Product'
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
  function qualityAttention(q){
    if(!q) return {kind:'unknown',title:'Quality data is not available yet',detail:'Project Health could not load a recent quality result.'};
    const runs=[q.review,q.ask].filter(Boolean);
    if(!runs.length) return {kind:'warn',title:'AI quality checks have not been recorded yet',detail:'Run the controlled checks to see how State handles understanding, evidence, uncertainty, and decision authority.'};
    if(stateEvalResultsStale(q)) return {kind:'warn',title:'AI quality checks need to be rerun',detail:stateEvalStaleReason(q)+' Historical failures are not treated as current product failures.',nextAction:'Run the controlled AI quality checks again.',owner:'Product'};
    const severe=runs.reduce((n,r)=>n+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:'A serious AI quality check failed',detail:severe+' high-impact failure'+(severe===1?'':'s')+' appeared in the latest recorded checks.',nextAction:'Review the failed scenario evidence and decide whether product behavior or the eval contract is wrong.',owner:'Product'};
    if(runs.some(r=>{const score=evalScore(r);return Number(r.failed_cases||0)>0||(score!=null&&score<1);})) return {kind:'warn',title:'Some AI quality checks need a look',detail:'At least one controlled scenario did not behave as expected.',nextAction:'Review the scenario-level miss, then rerun the affected suite.',owner:'Product'};
    return {kind:'good',title:'AI quality checks are healthy',detail:'The latest recorded checks did not report a high-impact failure.'};
  }
  function deliveryAttention(d){
    if(!d) return {kind:'warn',title:'Delivery status is unavailable',detail:'Project Health could not confirm the latest release status.'};
    if(d.vercel.kind==='bad') return {kind:'bad',title:'The latest version did not deploy',detail:'The existing production version should still be available while engineering reviews the failed release.'};
    if(Array.isArray(d.failedChecks)&&d.failedChecks.length) return {kind:'bad',title:'A release check failed',detail:'An automated check failed before this change could be trusted.'};
    if(d.vercel.kind==='warn') return {kind:'warn',title:'A deployment is still finishing',detail:'No action is needed unless it stays pending longer than expected.'};
    if(d.vercel.kind==='good') return {kind:'good',title:'Delivery is healthy',detail:'The latest release completed successfully.'};
    return {kind:'warn',title:'Deployment status is not connected',detail:'Project Health can see the latest change but cannot confirm its Vercel result.'};
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
        const noRecordedRuns=![q.review,q.ask].filter(Boolean).length;
        items.push({...q,category:'quality',action:noRecordedRuns||stateEvalResultsStale(q)?'run-ai-checks':'investigate-quality',owner:q.owner||'Product',nextAction:q.nextAction||(noRecordedRuns?'Run the controlled AI quality checks.':'Review the latest quality evidence.')});
      }
    }else{
      if(!data.externalQuality&&!data.fresh)return items;
      const q=externalQualityAttention(data.externalQuality);
      if(q&&['bad','warn'].includes(q.kind)) items.push({...q,category:'quality',owner:'Product',nextAction:'Review the project-specific quality evidence.'});
    }
    return items;
  }
  function allAttentionSignals(data){
    const pending=pendingSet(data),signals=[];
    if(data.delivery) signals.push(deliveryAttention(data.delivery));
    else if(data.fresh&&!pending.has('Delivery')) signals.push(deliveryAttention(null));
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
    const delivery=deliveryAttention(data.delivery);
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
    const delivery=deliveryAttention(data.delivery);
    if(delivery.kind==='bad') return [{...delivery,category:'delivery',owner:'Engineering',nextAction:'Open the failed deployment/check evidence and identify the first actionable cause.'}];
    const infra=infrastructureAttention(data.platform);
    if(infra&&['bad','warn'].includes(infra.kind)) return [{...infra,category:'infrastructure',owner:'Engineering',nextAction:'Verify whether this is a real service problem or a monitoring/coverage gap.'}];
    const pending=pendingSet(data);
    if(pending.size) return [{kind:'unknown',title:'Still checking',detail:'Some connected signals are still loading.'}];
    return [{kind:'good',title:'Nothing needs action right now',detail:'No current incident, product-quality action, delivery failure, or infrastructure issue is open.'}];
  }
  function setupGaps(data){
    const gaps=[],p=data.project,platform=data.platform,run=data.runInfo,ai=platform?.aiTelemetry;
    if(platform?.analytics?.configured===false) gaps.push({label:'Usage analytics',detail:analyticsGapDetail(platform.analytics)});
    else if(platform?.analytics?.configured&&!platform?.analytics?.available&&!pendingSet(data).has('Analytics')) gaps.push({label:'Usage analytics',detail:analyticsGapDetail(platform.analytics)});
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
    if(p.id==='state'&&run&&!run.configured) gaps.push({label:'Run AI quality checks',detail:'Dashboard-run setup is incomplete.'});
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
    if(incidents.length||open.some(item=>item.kind==='bad')) return {label:'Hold',detail:'Resolve the current high-impact issue before treating the next release as ready.'};
    if(open.length) return {label:'Watch',detail:'Delivery is healthy, but a product-quality check or human review is still open.'};
    if(data.delivery?.vercel?.kind==='good') return {label:'Ready',detail:'Delivery is healthy and there is no current high-impact quality issue.'};
    return {label:'Unknown',detail:'There is not enough current evidence to call this release-ready.'};
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
      if(stateEvalResultsStale(data.quality))return 'Rerun the AI quality checks before changing State behavior or the eval.';
      if(q.kind==='bad')return 'Review the high-impact failure class before changing the prompt, product behavior, or eval.';
      if(q.kind==='warn')return 'Review the quality miss and decide whether it represents product behavior or eval noise.';
    }else{
      const q=externalQualityAttention(data?.externalQuality);
      if(q?.kind==='bad')return 'Review the failing product-quality signal and decide whether the next change should address it.';
      if(q?.kind==='warn')return 'Decide whether the watched quality signal needs action before expanding scope.';
    }
    const delivery=deliveryAttention(data?.delivery);
    if(delivery.kind==='bad')return 'Decide whether to retry the failed release or supersede it with the current branch.';
    const infra=infrastructureAttention(data?.platform);
    if(infra?.kind==='bad')return 'Confirm user impact and assign the infrastructure response.';
    if(Array.isArray(data?.openPullRequests)&&data.openPullRequests.length)return 'Decide whether the current open work is ready for the next release.';
    return 'No immediate product decision is required. Continue the current goal until the next review.';
  }
  function qualityFailureClassSummary(q){
    const runs=[q?.review,q?.ask].filter(Boolean);
    const details=runs.flatMap(run=>Array.isArray(run?.failure_details)?run.failure_details:[]);
    const high=details.filter(item=>String(item?.severity||'').toLowerCase()==='high');
    const names=[...new Set(high.map(item=>{
      const category=String(item?.category||item?.scenario_id||'').replaceAll('_',' ').trim();
      return category||'controlled behavior';
    }))];
    return {count:runs.reduce((n,run)=>n+Number(run?.high_severity_failures||0),0),classes:names.slice(0,3)};
  }
  function activityTimelineItems(data){
    const p=data?.project||{},d=data?.delivery,q=data?.quality,externalQ=data?.externalQuality,activity=data?.activity;
    const items=[];
    if(d?.updatedAt)items.push({when:d.updatedAt,type:'Release',title:'Production release',detail:commitTitle(d.message)+' · '+shortSha(d.sha)});
    if(activity?.available){
      const dep=activity.deployments||{};
      const recoveryGroups=new Map();
      for(const failure of dep.recent_failures||[]){
        if(failure.created_at)items.push({when:failure.created_at,type:'Incident / recovery',title:'Deployment failed',detail:failure.message||'Production deployment failed'});
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
          type:'Incident / recovery',
          title:'Deployment recovered'+(recovery.count>1?' ×'+recovery.count:''),
          detail:recovery.count>1?'Multiple failed release attempts were superseded by a later healthy deployment.':'A later release restored a healthy production state.'
        });
      }
      for(const issue of activity.runtime?.issues||[]){
        if(issue.last_seen)items.push({when:issue.last_seen,type:'Incident / recovery',title:'Runtime signal',detail:(issue.path||'Server route')+(issue.count?' · '+issue.count+' occurrences':'')});
      }
    }
    const prs=Array.isArray(data?.openPullRequests)?data.openPullRequests:[];
    for(const pr of prs.slice(0,4)){
      const when=pr.updated_at||pr.created_at;
      if(when)items.push({when,type:'Release',title:'Open PR · '+(pr.number?'#'+pr.number:'work in progress'),detail:String(pr.title||'Untitled')});
    }
    if(p.id==='state'&&Array.isArray(q?.recent)){
      for(const item of q.recent.slice(0,6)){
        if(item.created_at)items.push({when:item.created_at,type:'Quality check',title:evalSuiteLabel(item)+' checked',detail:(evalScore(item)==null?'Score unavailable':percent(evalScore(item)))+' · '+Number(item.high_severity_failures||0)+' high-impact failures'});
      }
    }else if(p.id==='tastemake'&&externalQ?.ci?.updated_at){
      items.push({when:externalQ.ci.updated_at,type:'Quality check',title:'Recommendation quality checks updated',detail:externalQ.ci.conclusion==='success'?'Automated recommendation checks passed.':'Latest check result recorded.'});
    }else if(p.id==='narc'&&externalQ?.recorded?.updated_at){
      items.push({when:externalQ.recorded.updated_at,type:'Quality check',title:'Game quality record updated',detail:externalQ.recorded.full_playtest_pending?'Full first-run playtest still open.':'Latest recorded quality state.'});
    }
    for(const item of data?.investigationHistory||[]){
      items.push({when:item.observedAt,type:'Investigation',title:item.trigger||'Project check',detail:(item.summary||'Investigation completed')+(item.resolvedAt?' · later resolved':'')});
      if(item.resolvedAt)items.push({when:item.resolvedAt,type:'Incident / recovery',title:'Investigated issue resolved',detail:item.trigger||'Project investigation'});
    }
    return items.sort((a,b)=>(dateMs(b.when)||0)-(dateMs(a.when)||0));
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
  async function loadRunInfo(project){if(project.id!=='state')return null;try{return await jsonFetch('/api/project-health-run?project=state',{timeoutMs:5000});}catch(error){if(error.status===404)return null;throw error;}}
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
      run('Activity',loadActivity(project),value=>{data.activity=value;})
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
        run('Staging backend',loadPlatformSignal(project,'staging-render'),value=>{data.platform=mergePlatform(data.platform,value);}),
        run('Run controls',loadRunInfo(project),value=>{data.runInfo=value;})
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
  function meaningfulChanges(data){
    const before=data?.lastVisit;
    if(!before)return[];
    const items=[];
    if(before.deliverySha&&data.delivery?.sha&&before.deliverySha!==data.delivery.sha){
      items.push({title:'New production release',detail:commitTitle(data.delivery.message)+' · '+shortSha(data.delivery.sha),observedAt:data.delivery.updatedAt||data.checkedAt,tab:'delivery'});
    }
    if(before.deliveryKind&&data.delivery?.vercel?.kind&&before.deliveryKind!==data.delivery.vercel.kind){
      items.push({title:'Delivery status changed',detail:(before.deliveryKind||'unknown')+' → '+data.delivery.vercel.kind,observedAt:data.delivery.updatedAt||data.checkedAt,tab:'delivery'});
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
      items.push({title:'Analytics availability changed',detail:(before.analyticsAvailable?'Available':'Unavailable')+' → '+(analytics.available?'Available':'Unavailable'),observedAt:data.detailCheckedAt||data.checkedAt,tab:'activity'});
    }
    if(analytics?.available&&before.analyticsPageviews!=null&&Number(analytics.pageviews)!==Number(before.analyticsPageviews)){
      const diff=Number(analytics.pageviews)-Number(before.analyticsPageviews);
      items.push({title:'Usage changed',detail:(diff>=0?'+':'')+diff+' page views in the current 30-day window',observedAt:data.detailCheckedAt||data.checkedAt,tab:'activity'});
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
      if(item.action==='run-ai-checks') return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-attention-action="run-ai-checks" aria-label="Run AI checks">'+content+'<span class="attention-action-label">Run AI checks →</span></button>';
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-attention-action="ai-quality" aria-label="Investigate '+esc(item.title)+'">'+content+'<span class="attention-action-label">Investigate this issue →</span></button>';
    }
    if(item.category==='delivery'){
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-tab-target="delivery">'+content+'<span class="attention-action-label">View delivery evidence →</span></button>';
    }
    if(item.category==='infrastructure'){
      return '<button class="attention attention-action '+esc(item.kind||'')+'" type="button" data-tab-target="infra">'+content+'<span class="attention-action-label">View infrastructure →</span></button>';
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
      if(q.kind==='good') return 'AI checks healthy';
      if(q.kind==='bad') return 'AI checks need action';
      if(q.kind==='warn') return 'AI checks need a look';
      return q.title;
    }
    const q=data.externalQuality;if(!q) return 'Quality unavailable';
    const top=externalQualityAttention(q);
    if(q.project==='tastemake'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'Recommendation checks healthy';
    if(q.project==='narc'&&q.recorded?.recorded_all_suites_green) return q.recorded.full_playtest_pending?'Automated checks pass · playtest open':'Game checks healthy';
    return top?.title||'Quality loaded';
  }
  function loadingCardMarkup(project,active){
    return '<button class="project-switcher-item '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" type="button" aria-pressed="'+(active?'true':'false')+'">'+
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
  function stateEvalCard(title,value,description,trend){
    return '<div class="eval-card"><strong>'+esc(title)+'</strong><div class="score">'+esc(value)+'</div><p>'+esc(description)+'</p>'+(trend?'<p><strong>'+esc(trend)+'</strong></p>':'')+'</div>';
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
    doc.getElementById('repoLink').href=repoUrl(p.repo);
    const projectCheckButton=doc.getElementById('projectCheckButton');
    const headerRunChecksButton=doc.getElementById('headerRunChecksButton');
    const currentQuality=p.quality==='state'?qualityAttention(q):externalQualityAttention(externalQ);
    const noRecordedStateRuns=p.id==='state'&&![q?.review,q?.ask].filter(Boolean).length;
    const shouldRunChecksFirst=p.id==='state'&&run?.configured&&(noRecordedStateRuns||stateEvalResultsStale(q));
    const shouldInvestigateFirst=currentQuality?.kind==='bad'||deliveryAttention(d).kind==='bad';
    if(projectCheckButton){
      projectCheckButton.disabled=!!data.investigation?.loading;
      projectCheckButton.textContent=data.investigation?.loading?'Checking project…':data.investigation?'View investigation':shouldInvestigateFirst?'Investigate failure':'Investigate project';
      projectCheckButton.classList.toggle('primary',!!shouldInvestigateFirst&&!shouldRunChecksFirst);
      projectCheckButton.style.order=shouldRunChecksFirst?'2':'1';
    }
    if(headerRunChecksButton){
      const activeEvalRun=data.qualityRun;
      headerRunChecksButton.hidden=!(p.id==='state'&&run?.configured);
      headerRunChecksButton.disabled=!!activeEvalRun;
      headerRunChecksButton.textContent=activeEvalRun?'AI checks running…':data.qualityRunCompletedAt?'View AI results':'Run AI checks';
      headerRunChecksButton.classList.toggle('primary',!!shouldRunChecksFirst);
      headerRunChecksButton.style.order=shouldRunChecksFirst?'1':'2';
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

    const overviewQuality=p.quality==='state'?qualityAttention(q):externalQualityAttention(externalQ);
    const overviewDelivery=deliveryAttention(d);
    const overviewInfra=infrastructureAttention(platform);
    const runtimeStatus=productionRuntime(data);
    const aSummary=platform?.analytics;
    const statusLabel=kind=>kind==='bad'?'Needs attention':kind==='warn'?'Watch':kind==='good'?'Healthy':kind==='available'?'Data available':'Unknown';
    const qualityTime=p.quality==='state'
      ?[q?.review?.created_at,q?.ask?.created_at].filter(Boolean).sort().pop()
      :(externalQ?.ci?.updated_at||externalQ?.recorded?.updated_at||data.checkedAt);
    const healthRows=[
      {label:'AI quality',kind:overviewQuality?.kind||'unknown',detail:overviewQuality?.title||'Quality status unavailable',tab:'ai-quality',fresh:freshnessMeta(qualityTime,data.checkedAt,72)},
      {label:'Production',kind:runtimeStatus.kind,status:runtimeStatus.label,detail:runtimeStatus.detail,tab:'delivery',fresh:freshnessMeta(data.detailCheckedAt||d?.updatedAt||data.checkedAt,data.checkedAt,24)},
      {label:'Release pipeline',kind:overviewDelivery?.kind||'unknown',detail:overviewDelivery?.title||'Release status unavailable',tab:'delivery',fresh:freshnessMeta(d?.updatedAt,data.checkedAt,24)},
      {label:'Infrastructure',kind:overviewInfra?.kind||'good',detail:overviewInfra?.title||'Production services healthy',tab:'infra',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,6)},
      {label:'Usage',kind:pending.has('Analytics')?'unknown':aSummary?.available?'available':'unknown',status:aSummary?.available?'Data available':null,detail:pending.has('Analytics')?'Checking usage…':aSummary?.available?((aSummary.visitors??0)+' visitors · '+(aSummary.pageviews??0)+' page views · 30d'):(aSummary?.configured?'Connected, but comparison data is not available yet':'Usage analytics are not connected'),tab:'activity',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,24)}
    ];
    const changes=meaningfulChanges(data);
    const sinceLabel=data.lastVisit?.savedAt?fmtDate(data.lastVisit.savedAt):'your previous saved visit';
    const changesPanel=doc.getElementById('changesPanel');
    changesPanel.classList.toggle('compact-zero',!changes.length);
    changesPanel.innerHTML=changes.length
      ?'<div class="panel-title-row"><div><h3>Changed since last visit</h3><p class="panel-copy">Compared with '+esc(sinceLabel)+'. Only meaningful changes are shown.</p></div><span class="readiness-pill watch">'+esc(changes.length)+' change'+(changes.length===1?'':'s')+'</span></div><div class="change-list" style="margin-top:8px">'+changes.slice(0,8).map(item=>'<button class="change-item" type="button" data-tab-target="'+esc(item.tab||'activity')+'"><span class="change-dot"></span><div><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail)+'</span></div></button>').join('')+'</div>'
      :'<button class="changes-zero" type="button" data-tab-target="activity"><span aria-hidden="true">✓</span><strong>No meaningful changes since your last visit</strong></button>';
    const overviewGaps=setupGaps(data);
    doc.getElementById('overviewHealthPanel').innerHTML='<div class="panel-title-row"><h3>Project health</h3>'+(overviewGaps.length?'<span class="readiness-pill watch">'+esc(overviewGaps.length)+' coverage '+(overviewGaps.length===1?'gap':'gaps')+'</span>':'')+'</div>'+
      '<div class="overview-health" style="margin-top:6px">'+healthRows.map(item=>'<button class="overview-health-row" type="button" data-tab-target="'+esc(item.tab)+'"><div><strong>'+esc(item.label)+'</strong><span class="health-status '+esc(item.kind)+'">'+esc(item.status||statusLabel(item.kind))+'</span><span class="health-detail">'+esc(item.detail)+'</span><span class="signal-meta '+(item.fresh?.stale?'stale':'')+'">'+esc(item.fresh?.label||'Freshness unknown')+'</span></div><span class="health-chevron" aria-hidden="true">›</span></button>').join('')+'</div>';

    // Product quality / evals
    let qualityHtml='';
    if(p.quality==='state'){
      const review=q?.review,ask=q?.ask,runs=[review,ask].filter(Boolean);
      if(!q&&pending.has('Quality')){
        qualityHtml='<h3>Product quality · AI checks</h3><div class="empty" style="margin-top:12px">Checking the latest recorded AI quality results…</div>';
      }else if(!runs.length){
        qualityHtml='<h3>Product quality · AI checks</h3>'+
          '<div class="eval-overview"><div><strong>No recorded AI quality check yet</strong><span>Run a controlled check to see how State handles understanding, evidence, uncertainty, and decision authority.</span></div></div>';
      }else{
        const latestDate=runs.map(item=>item?.created_at).filter(Boolean).sort().pop();
        const total=runs.reduce((n,item)=>n+Number(item?.total||0),0);
        const severe=runs.reduce((n,item)=>n+Number(item?.high_severity_failures||0),0);
        const qa=qualityAttention(q);
        const staleResults=stateEvalResultsStale(q);
        const cards=[];
        if(review?.interpretation_accuracy!=null) cards.push(stateEvalCard('Understood updates correctly',percent(review.interpretation_accuracy),'Did State interpret the project update the way the product expected?',evalTrend(q.recent,'review_interpretation')));
        if(ask?.ask_grounding!=null) cards.push(stateEvalCard('Answers stayed supported by evidence',percent(ask.ask_grounding),'Did answers stick to known project information instead of filling gaps?',evalTrend(q.recent,'ask_quality')));
        if(ask?.authority_accuracy!=null) cards.push(stateEvalCard('Respected decision authority',percent(ask.authority_accuracy),'Did State keep proposed changes separate from approved project truth?',''));
        if(ask?.uncertainty_accuracy!=null) cards.push(stateEvalCard('Handled uncertainty clearly',percent(ask.uncertainty_accuracy),'Did State say when the available evidence was not enough?',''));
        const failureSummary=qualityFailureClassSummary(q);
        const failureClassText=failureSummary.classes.length?'Main failure areas: '+failureSummary.classes.join(', ')+'.':'Open the failed scenarios to see the affected behavior.';
        qualityHtml='<h3>Product quality · AI checks</h3>'+
          '<div class="eval-overview"><div><strong>'+esc(qa.title)+'</strong><span>'+(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+(staleResults?'Previous run · rerun required':esc(total||'—')+' scenarios')+'</span></div></div>'+
          (staleResults
            ?'<div class="run-callout stale-quality-summary"><strong>What to know from the last run</strong><p>The previous run recorded '+esc(severe)+' high-impact miss'+(severe===1?'':'es')+', but '+esc(stateEvalStaleReason(q).toLowerCase())+' Run the checks again before treating those scores as current.</p></div>'
            :failureSummary.count
              ?'<div class="run-callout quality-failure-summary"><strong>'+esc(failureSummary.count)+' high-impact failure'+(failureSummary.count===1?'':'s')+' require review</strong><p>'+esc(failureClassText)+'</p></div><div class="eval-grid">'+cards.join('')+'</div>'
              :'<div class="eval-grid">'+cards.join('')+'</div>')+stateEvalHistory(q);
      }
      qualityHtml+='<p class="footnote"><a href="/state-evals">View eval details →</a></p>';
      const activeEvalRun=data.qualityRun;
      if(activeEvalRun){
        const delayed=activeEvalRun.state==='delayed';
        qualityHtml+='<div class="eval-run-status '+(delayed?'warn':'')+'" role="status"><strong>'+(delayed?'Run started · waiting for a newer result':'AI checks are running…')+'</strong><span>Started '+esc(fmtDate(activeEvalRun.startedAt))+'. The previous results stay visible until the new run finishes; this page checks automatically.</span></div>';
      }
      if(pending.has('Run controls')){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking whether dashboard-run controls are ready…</span></div>';
      }else if(run?.configured){
        const runDisabled=activeEvalRun?' disabled':'';
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all"'+runDisabled+'>'+(activeEvalRun?'AI checks running…':'Run all AI checks')+'</button><button class="button small" type="button" data-run-checks="review"'+runDisabled+'>Check update understanding</button><button class="button small" type="button" data-run-checks="ask"'+runDisabled+'>Check answer quality</button></div>'+
          '<p class="footnote">Estimated model cost: '+esc(run.estimated_cost||'not configured')+'. You will confirm before any paid run starts.</p>';
      }else if(run){
        qualityHtml+='<p class="footnote">Running AI checks from the dashboard still needs setup. Existing recorded results can still appear here.</p>';
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
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="metrics" style="margin-top:12px">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div>'+trends;
    }else{
      analyticsPanel.innerHTML='';
    }

    // Chronological activity tells an operating story rather than exposing raw events.
    const timelineItems=activityTimelineItems(data);
    const timelineHtml=timelineItems.length?'<div class="timeline">'+timelineItems.slice(0,18).map(item=>'<div class="timeline-item"><span class="timeline-time">'+esc(fmtDate(item.when))+'</span><span class="timeline-marker"></span><div class="timeline-content"><span class="activity-type">'+esc(item.type||'Activity')+'</span><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail||'')+'</span></div></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('historyPanel').innerHTML='<h3>Activity</h3><p class="panel-copy">A chronological operating history across releases, quality checks, investigations, and recovery.</p><div style="margin-top:12px">'+timelineHtml+'</div>';
    const overviewActivity=timelineItems.length?'<div class="activity-list">'+timelineItems.slice(0,3).map(item=>'<div class="activity-item"><span class="activity-type">'+esc(item.type||'Activity')+'</span><strong>'+esc(item.title)+'</strong><span>'+esc(relativeAge(item.when))+' · '+esc(item.detail||'')+'</span></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('overviewActivityPanel').innerHTML='<div class="panel-title-row"><h3>Recent activity</h3><button class="button small" type="button" data-tab-target="activity">View timeline</button></div><div style="margin-top:12px">'+overviewActivity+'</div>';

    // Delivery separates what users have now from whether the next release can ship.
    const investigationBusy=!!data.investigation?.loading;
    const investigateButton=(type,environment,label)=>'<button class="button small" type="button" data-investigate="'+esc(type)+'" data-environment="'+esc(environment)+'"'+(investigationBusy?' disabled':'')+'>'+esc(label)+'</button>';
    const deliveryKind=d?.vercel?.kind||'unknown';
    const pipelineText=deliveryKind==='good'?'Latest release deployed successfully':deliveryKind==='bad'?'Latest release attempt did not deploy':deliveryKind==='warn'?'Latest release attempt is still finishing':'Release status is unavailable';
    const deliveryClass=deliveryKind==='bad'?'bad':deliveryKind==='warn'?'warn':'';
    const runtime=productionRuntime(data);
    const environmentBlock=(label,item)=>{
      if(!item)return'<div class="delivery-environment"><div class="delivery-environment-head"><strong>'+esc(label)+'</strong><span>Unavailable</span></div></div>';
      const status=item.vercel?.kind==='good'?'Healthy':item.vercel?.kind==='bad'?'Needs attention':item.vercel?.kind==='warn'?'Watch':'Unknown';
      return '<div class="delivery-environment"><div class="delivery-environment-head"><div><strong>'+esc(label)+'</strong><span class="branch-label">'+esc(item.branch)+'</span></div><span class="delivery-status '+esc(item.vercel?.kind||'unknown')+'">'+esc(status)+'</span></div>'+
        '<a class="delivery-release" href="'+esc(changeUrl(p.repo,item)||repoUrl(p.repo))+'" target="_blank" rel="noopener noreferrer">'+esc(commitTitle(item.message))+'</a>'+
        '<div class="delivery-meta"><span>Updated '+esc(fmtDate(item.updatedAt))+'</span><span>'+githubLink(shortSha(item.sha),githubCommitUrl(p.repo,item.sha))+'</span><span>'+esc(item.vercel?.label||'Deployment status unavailable')+'</span></div></div>';
    };
    const prodInvestigate=d?.vercel?.kind==='bad'?investigateButton('vercel','production','Investigate failure'):'';
    const checkInvestigate=Array.isArray(d?.failedChecks)&&d.failedChecks.length?investigateButton('github-check','production','Investigate failed check'):'';
    doc.getElementById('deliveryPanel').innerHTML='<div class="panel-title-row"><h3>Delivery</h3><span class="readiness-pill '+esc(readiness.label.toLowerCase())+'">Release '+esc(readiness.label)+'</span></div>'+
      '<div class="delivery-split" style="margin-top:12px">'+
        '<div class="delivery-concept"><span class="activity-type">Runtime</span><strong>Current production</strong><span class="delivery-status '+esc(runtime.kind)+'">'+esc(runtime.label)+'</span><p>'+esc(runtime.detail)+'</p></div>'+
        '<div class="delivery-concept '+deliveryClass+'"><span class="activity-type">Release pipeline</span><strong>'+esc(pipelineText)+'</strong><span class="delivery-status '+esc(deliveryKind)+'">'+esc(deliveryKind==='good'?'Healthy':deliveryKind==='bad'?'Attention needed':deliveryKind==='warn'?'Watch':'Unknown')+'</span><p>'+esc(deliveryAttention(d).detail)+'</p></div>'+
      '</div>'+
      '<div class="delivery-environments">'+environmentBlock('Latest production release attempt',d)+(s?environmentBlock('Staging release',s):'')+'</div>'+
      '<div class="quality-actions">'+prodInvestigate+checkInvestigate+'</div>';

    // Infrastructure stays visible, grouped as services rather than settings rows.
    const r=platform?.render,n=platform?.neon;
    const infraCards=[];
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraCards.push({label:'Production backend',status:production.ok?'Healthy':'Unavailable',detail:'Render'});
      const stagingEnv=r.environments?.staging;
      if(stagingEnv) infraCards.push({label:'Staging backend',status:stagingEnv.ok?'Healthy':'Unknown',detail:stagingEnv.ok?'Render':'Render · no recent successful response observed; production unaffected'});
      else if(p.id==='state'&&pending.has('Staging backend')) infraCards.push({label:'Staging backend',status:'Checking…',detail:'Render'});
    }else if(p.id==='state') infraCards.push({label:'Production backend',status:pending.has('Production backend')?'Checking…':'Unavailable',detail:'Render'});
    if(n?.configured&&n.available) infraCards.push({label:'Database',status:'Connected',detail:'Neon'});
    else if(n?.configured) infraCards.push({label:'Database',status:'Temporarily unavailable',detail:'Neon'});
    else infraCards.push({label:'Database',status:p.id==='state'?'Not connected yet':'Not used',detail:p.id==='state'?'Neon':'No database dependency'});
    const infraAttention=infrastructureAttention(data);
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3>'+
      '<div class="delivery-summary '+(infraAttention?.kind==='bad'?'bad':infraAttention?.kind==='warn'?'warn':'')+'" style="margin-top:12px">'+esc(infraAttention?.title||'Production services healthy')+'</div>'+
      '<div class="service-grid">'+infraCards.map(item=>'<div class="service-card"><strong>'+esc(item.label)+'</strong><span class="service-status">'+esc(item.status)+'</span><span class="service-detail">'+esc(item.detail)+'</span></div>').join('')+'</div>';

    // Connections and coverage gaps stay visible; they are setup context, not incidents.
    const ai=platform?.aiTelemetry;
    const connections=[];
    connections.push({label:'Code + deployments',value:d?'Connected':'Unavailable'});
    connections.push({label:'Backend health',value:r?.configured?'Connected':(p.id==='state'?'Unavailable':'Not used')});
    connections.push({label:'Usage analytics',value:analyticsConnectionValue(platform,pending.has('Analytics'))});
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

  function evalRunStorageKey(root){return 'project-health-eval-run:'+pageEnvironment(root);}
  function loadEvalRunState(root){
    try{
      const raw=root.localStorage?.getItem(evalRunStorageKey(root));if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed?.startedAt||Date.now()-new Date(parsed.startedAt).getTime()>10*60*1000){root.localStorage?.removeItem(evalRunStorageKey(root));return null;}
      return parsed;
    }catch(_){return null;}
  }
  function saveEvalRunState(root,value){
    try{
      if(value)root.localStorage?.setItem(evalRunStorageKey(root),JSON.stringify(value));
      else root.localStorage?.removeItem(evalRunStorageKey(root));
    }catch(_){}
  }
  function evalRunComplete(quality,runState){
    if(!quality||!runState)return false;
    const changed=(run,baseline)=>!!run?.created_at&&String(run.created_at)!==String(baseline||'');
    if(runState.suite==='review')return changed(quality.review,runState.baselineReview);
    if(runState.suite==='ask')return changed(quality.ask,runState.baselineAsk);
    return changed(quality.review,runState.baselineReview)&&changed(quality.ask,runState.baselineAsk);
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
    const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
    const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
    const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nResults are recorded as aggregate quality data. Start the run?';
    if(!root.confirm(message)) return;
    try{
      const payload=await jsonFetch('/api/project-health-run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:data.project.id,suite,record_environment:pageEnvironment(root),confirm_paid_model_calls:true,estimated_cost:run.estimated_cost})});
      return {
        ...payload,
        suite,
        startedAt:new Date().toISOString(),
        baselineReview:data.quality?.review?.created_at||null,
        baselineAsk:data.quality?.ask?.created_at||null,
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

  function qualityInvestigation(data){
    const quality=data?.quality||{};
    const runs=[
      {label:'Update understanding',run:quality.review},
      {label:'Answer quality',run:quality.ask}
    ].filter(item=>item.run);
    const affected=runs.filter(item=>{
      const score=evalScore(item.run);
      return Number(item.run?.high_severity_failures||0)>0||(score!=null&&score<1);
    });
    const details=affected.flatMap(item=>(Array.isArray(item.run?.failure_details)?item.run.failure_details:[]).map(detail=>({...detail,suiteLabel:item.label})));
    const severe=affected.reduce((n,item)=>n+Number(item.run?.high_severity_failures||0),0);
    const latestDate=runs.map(item=>item.run?.created_at).filter(Boolean).sort().pop()||new Date().toISOString();
    const review=quality.review,ask=quality.ask;
    const reviewScore=evalScore(review),askScore=evalScore(ask);
    const previousReview=previousEvalRun(quality,review);
    const previousReviewScore=evalScore(previousReview);
    const reviewCount=review?.total!=null&&reviewScore!=null?Math.round(Number(review.total)*reviewScore):null;
    const currentLines=[];
    if(review)currentLines.push('Update understanding: '+percent(reviewScore)+(reviewCount!=null?' ('+reviewCount+'/'+review.total+' scenarios)':'')+' · '+Number(review.high_severity_failures||0)+' high-impact failures');
    if(ask)currentLines.push('Answer quality: '+percent(askScore)+' · '+Number(ask.high_severity_failures||0)+' high-impact failures');
    const failedLines=details.length?details.map(detail=>{
      const expected=detail.expected?'Expected: '+detail.expected+'. ':'';
      const observed=detail.observed?'Observed: '+detail.observed+'. ':'';
      const observedAlreadyListsChecks=/^Failed checks:/i.test(String(detail.observed||''));
      const checks=!observedAlreadyListsChecks&&(detail.failed_checks||[]).length?'Failed checks: '+detail.failed_checks.join(', ')+'. ':'';
      return '- '+detail.suiteLabel+' / '+detail.scenario_id+' ('+(detail.severity||'unknown')+'). '+expected+observed+checks+evalFailureImpact(detail);
    }):['- Exact scenario metadata is unavailable for this older run, so Project Health can only report the suite-level result.'];
    const improvements=[];
    if(reviewScore!=null&&previousReviewScore!=null){
      const delta=Math.round((reviewScore-previousReviewScore)*1000)/10;
      improvements.push('- Update understanding '+(delta>=0?'improved ':'declined ')+Math.abs(delta)+' points from '+percent(previousReviewScore)+' to '+percent(reviewScore)+'.');
    }
    if(review&&previousReview&&Number(previousReview.high_severity_failures||0)!==Number(review.high_severity_failures||0)){
      improvements.push('- High-impact failures changed from '+Number(previousReview.high_severity_failures||0)+' to '+Number(review.high_severity_failures||0)+'.');
    }
    if(!severe&&details.length) improvements.push('- The current misses are medium severity; no current controlled scenario is reporting a high-impact truth failure.');
    const nextStep=details.length
      ?'Review the remaining scenario-level misses below. Fix product behavior only where the contract is still right; adjust the eval where the observed behavior is acceptable. Then rerun the affected suite and compare against this run.'
      :'Inspect the affected suite and rerun after the next change so future failures record scenario-level evidence.';
    if(stateEvalResultsStale(quality)){
      const historical=currentLines.length?currentLines.map(line=>'- '+line).join('\n'):'- No historical aggregate result is available.';
      const report=[
        'Current assessment',
        stateEvalStaleReason(quality)+' The recorded failures are historical and should not be treated as current product failures.',
        '',
        'Historical result',
        historical,
        '',
        'Why this changed',
        stateEvalBehaviorStale(quality)?'State behavior changed after this run, so the old scores no longer describe the current product.':'The eval expectations changed after this run, so the old scores no longer describe the current contract.',
        '',
        'Recommended next action',
        'Rerun the controlled AI quality checks. Use the new run as the current baseline before changing State behavior.',
        '',
        'Owner',
        'Product',
        '',
        'Confidence',
        'High confidence that the recorded run is stale relative to the current State behavior or eval contract. No claim is being made yet about how a fresh run will score.'
      ].join('\n');
      return {
        report,
        sources:[{label:'State eval details',url:'/state-evals',observedAt:latestDate}],
        observedAt:latestDate,
        qualityInvestigation:true,
        staleEvalContract:stateEvalContractStale(quality),
        staleEvalBehavior:stateEvalBehaviorStale(quality),
        staleEvalResults:true
      };
    }

    const report=[
      'Current assessment',
      currentLines.join('\n')||'No current controlled-eval result is available.',
      '',
      'What failed',
      failedLines.join('\n'),
      '',
      'Why this matters',
      severe>0
        ?'At least one current failure can affect maintained project truth or another high-impact behavior.'
        :'The current failures are quality/workflow misses rather than a production outage or a recorded high-impact truth failure.',
      '',
      'What changed since the previous run',
      improvements.length?improvements.join('\n'):'- No directly comparable earlier run is available.',
      '',
      'Recommended next action',
      nextStep,
      '',
      'Technical context',
      [review?.model_identifier||ask?.model_identifier,review?.build||ask?.build].filter(Boolean).join(' · ')||'Model/build metadata unavailable',
      '',
      'Owner',
      'Product + Engineering',
      '',
      'Confidence',
      details.length?'High confidence in which controlled scenarios failed because the latest run persisted scenario-level metadata. Root cause still requires interpreting each scenario against the product contract.':'Moderate confidence because this older run does not include scenario-level failure metadata.'
    ].join('\n');
    return {
      report,
      sources:[{label:'State eval details',url:'/state-evals',observedAt:latestDate}],
      observedAt:latestDate,
      qualityInvestigation:true
    };
  }

  function projectHandoff(data){
    const status=projectStatus(data);
    const notices=attentionItems(data).filter(item=>item.kind!=='good');
    const latestQuality=data?.project?.quality==='state'&&data.quality
      ?(stateEvalResultsStale(data.quality)
        ?'Needs rerun · '+stateEvalStaleReason(data.quality)+' Historical failures are not treated as current product failures.'
        :[data.quality.review,data.quality.ask].filter(Boolean).map(run=>evalSuiteLabel(run)+': '+percent(evalScore(run))+' · '+Number(run.high_severity_failures||0)+' high-impact failures').join('\n'))
      :projectQualityLabel(data);
    const release=data?.delivery
      ?commitTitle(data.delivery.message)+' · '+shortSha(data.delivery.sha)+' · '+fmtDate(data.delivery.updatedAt)
      :'Unavailable';
    const issueText=notices.length?notices.map(item=>'- '+item.title+': '+item.detail).join('\n'):'- Nothing currently needs action.';
    const investigation=data?.investigation;
    const prior=investigation?.qualityInvestigation&&data?.project?.quality==='state'&&stateEvalResultsStale(data.quality)
      ?'Historical AI-quality investigation from the previous State behavior. See eval details if you need the old scenario-level evidence; rerun the checks before treating it as current.'
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
    const handoffReviewIsDependency=/^(after|when|once)\b|next recorded/i.test(String(data.project.nextReview||''));
    const handoffText=[
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
      prior,
      '',
      'Next decision',
      operationalNextDecision(data),
      '',
      handoffReviewIsDependency?'Waiting on':'Next review',
      data.project.nextReview,
      '',
      'Generated from Project Health. Review before sharing or acting on it.'
    ].join('\n');
    return {
      handoff:true,
      handoffText,
      report:handoffText,
      observedAt:new Date().toISOString(),
      sources:[]
    };
  }

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),summary=doc.getElementById('overviewSummary'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel'),projectTabs=doc.getElementById('projectTabs'),projectDetail=doc.getElementById('projectDetail'),investigationDrawer=doc.getElementById('investigationDrawer'),investigationBackdrop=doc.getElementById('investigationBackdrop'),closeInvestigationDrawerButton=doc.getElementById('closeInvestigationDrawer'),drawerRunAgainButton=doc.getElementById('drawerRunAgainButton'),drawerCopyHandoffButton=doc.getElementById('drawerCopyHandoffButton');
    if(!cards||!status||!summary||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    state.forEach(item=>{item.investigationHistory=loadInvestigationHistory(root,item.project.id);});
    const initialParams=new URLSearchParams(root.location.search);
    let activeId=initialParams.get('project')||'state';
    const allowedTabs=new Set(['overview','ai-quality','delivery','infra','activity']);
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
      const fresh=state.filter(item=>item?.fresh);
      const incidentCount=unreviewedIncidents().length;
      const actionCount=fresh.filter(item=>projectStatus(item).key==='action').length;
      const watchCount=fresh.filter(item=>projectStatus(item).key==='watch').length;
      const checked=fresh.map(item=>item.checkedAt).filter(Boolean).sort().pop();
      summary.innerHTML='<button class="summary-chip summary-action '+(summaryFilter==='all'?'active':'')+'" type="button" data-summary-filter="all"><strong>'+PROJECTS.length+'</strong> projects</button>'+
        (actionCount?'<button class="summary-chip summary-action incident '+(summaryFilter==='action'?'active':'')+'" type="button" data-summary-filter="action"><strong>'+actionCount+'</strong> need action</button>':'')+
        (watchCount?'<button class="summary-chip summary-action open '+(summaryFilter==='watch'?'active':'')+'" type="button" data-summary-filter="watch"><strong>'+watchCount+'</strong> watch</button>':'')+
        (incidentCount?'<button class="summary-chip summary-action incident" type="button" data-summary-incidents><strong>'+incidentCount+'</strong> '+(incidentCount===1?'incident':'incidents')+'</button>':'')+
        '<span class="summary-chip summary-meta"><strong>'+esc(checked?relativeAge(checked):'checking')+'</strong> last updated</span>';
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
        summaryFilter=filterButton.dataset.summaryFilter||'all';
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
    if(projectDetail)projectDetail.addEventListener('click',event=>{
      const target=event.target.closest?.('[data-tab-target]');
      if(target)setActiveTab(target.dataset.tabTarget);
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
      const data=activeData();if(!data||data.project.id!=='state'||data.qualityRun)return;
      if(data.qualityRunCompletedAt){setActiveTab('ai-quality');renderNow();return;}
      headerRunChecksButton.disabled=true;
      headerRunChecksButton.textContent='Starting AI checks…';
      try{
        const started=await dispatchRun(data,root,'all');
        if(started?.started){
          data.qualityRun=started;
          data.qualityRunCompletedAt=null;
          saveEvalRunState(root,started);
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
      if(data.delivery?.vercel?.kind==='bad'){await runAgentInvestigation(data,'vercel','production');return;}
      if(Array.isArray(data.delivery?.failedChecks)&&data.delivery.failedChecks.length){await runAgentInvestigation(data,'github-check','production');return;}
      if(data.project.quality==='state'&&['bad','warn'].includes(qualityAttention(data.quality).kind)){
        data.investigation=qualityInvestigation(data);recordInvestigation(data,data.investigation,'AI quality');renderNow();revealInvestigation();return;
      }
      data.investigation=quickProjectCheck(data);
      recordInvestigation(data,data.investigation,'Project check');
      renderNow();
      revealInvestigation();
    }

    const projectCheckButton=doc.getElementById('projectCheckButton');
    if(projectCheckButton)projectCheckButton.addEventListener('click',async()=>{
      const data=activeData();if(!data)return;
      if(data.investigation&&!data.investigation.loading){revealInvestigation();return;}
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
      if(action.dataset.attentionAction==='ai-quality'){
        setActiveTab('ai-quality');
        data.investigation=qualityInvestigation(data);
        recordInvestigation(data,data.investigation,'AI quality');
        renderNow();
        revealInvestigation();
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
      const errors=state.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      persist();
      const coverageGapCount=errors.length;
      status.innerHTML='<strong>Updated just now</strong>'+(coverageGapCount?' · '+coverageGapCount+' coverage '+(coverageGapCount===1?'gap':'gaps'):'')+(errors.length?' · some signals unavailable':'');
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
    let evalPollTimer=null;
    async function pollEvalResults(data){
      if(!data?.qualityRun)return;
      if(evalPollTimer)root.clearTimeout(evalPollTimer);
      const runState=data.qualityRun;
      try{
        const latest=await loadStateQuality(root);
        data.quality=latest;
        if(evalRunComplete(latest,runState)){
          data.qualityRun=null;
          data.qualityRunCompletedAt=activeTab==='ai-quality'?null:new Date().toISOString();
          saveEvalRunState(root,null);
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
        evalPollTimer=root.setTimeout(()=>pollEvalResults(data),7000);
      }else{
        data.qualityRun=null;
        saveEvalRunState(root,null);
        renderNow();
      }
    }

    qualityPanel.addEventListener('click',async event=>{
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
          saveEvalRunState(root,started);
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
    const resumedRun=loadEvalRunState(root);
    if(resumedRun){
      const stateData=state.find(item=>item.project.id==='state');
      if(stateData&&!evalRunComplete(stateData.quality,resumedRun)){
        stateData.qualityRun=resumedRun;
        renderNow();
        pollEvalResults(stateData);
      }else{
        saveEvalRunState(root,null);
      }
    }
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,productionRuntime,operationalNextDecision,qualityFailureClassSummary,activityTimelineItems,projectQualityLabel,evalScore,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,loadProject,loadProjectDetails,infraCardLabel,analyticsConnectionValue,analyticsGapDetail,analyticsLabel,relativeAge,changedSinceVisit,meaningfulChanges,freshnessMeta,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,trendText,activityReviewItems,progressText,quickProjectCheck,evalRunComplete,qualityInvestigation,projectHandoff,init};
});
