(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){root.PROJECT_HEALTH=api;if(root.document) api.init(root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const PROJECTS=[
    {
      id:'state',name:'State',description:'Human-reviewed project truth system with maintained Current State.',repo:'pedringt/ai-learning',branch:'main',stagingBranch:'staging',quality:'state',
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
  function pageEnvironment(root){const host=String(root?.location?.hostname||'');return /(^|[-.])staging([-.]|$)|-git-/i.test(host)?'staging':'production';}

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
    const severe=runs.reduce((n,r)=>n+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:'A serious AI quality check failed',detail:severe+' high-impact failure'+(severe===1?'':'s')+' appeared in the latest recorded checks.'};
    if(runs.some(r=>Number(r.failed_cases||0)>0||(r.overall_pass_rate!=null&&Number(r.overall_pass_rate)<1))) return {kind:'warn',title:'Some AI quality checks need a look',detail:'At least one controlled scenario did not behave as expected.'};
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
      if(['bad','warn'].includes(q.kind)) items.push({...q,category:'quality',owner:'Product'});
    }else{
      if(!data.externalQuality&&!data.fresh)return items;
      const q=externalQualityAttention(data.externalQuality);
      if(q&&['bad','warn'].includes(q.kind)) items.push({...q,category:'quality',owner:'Product'});
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
    if(att.kind==='bad') return {key:'action',label:'Action',kind:'bad'};
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
    const pending=pendingSet(data);
    if(pending.size) return [{kind:'unknown',title:'Still checking',detail:'Some connected signals are still loading.'}];
    return [{kind:'good',title:'Nothing needs action right now',detail:'No current incident or product-quality action is open.'}];
  }
  function setupGaps(data){
    const gaps=[],p=data.project,platform=data.platform,run=data.runInfo,ai=platform?.aiTelemetry;
    if(platform?.analytics?.configured===false||(!platform?.analytics?.available&&!pendingSet(data).has('Analytics'))) gaps.push({label:'Usage analytics',detail:'Not connected yet. This limits trend and adoption context.'});
    if(p.id==='state'&&!platform?.neon?.available) gaps.push({label:'Database health',detail:'Not connected or unavailable. This is a monitoring gap, not a product incident.'});
    if(p.id==='state'&&run&&!run.configured) gaps.push({label:'Run AI quality checks',detail:'Dashboard-run setup is incomplete.'});
    if(p.id!=='narc'&&!pendingSet(data).has('AI operations')&&!ai?.available){
      gaps.push({label:'AI cost',detail:'Estimated model spend is not available yet.'});
      gaps.push({label:'AI response speed',detail:'Observed model response speed is not available yet.'});
    }else if(p.id==='state'&&ai?.available&&ai.cost?.partial){
      gaps.push({label:'AI cost coverage',detail:'Interpretation cost is estimated from recorded tokens. Ask token cost is not persisted yet, so this is intentionally partial.'});
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

  async function loadGitHubProject(project,branchName){
    const headers={Accept:'application/vnd.github+json'};
    const [branch,status,checkRuns]=await Promise.all([
      jsonFetch(githubApi('/repos/'+project.repo+'/branches/'+encodeURIComponent(branchName)),{headers,timeoutMs:6000}),
      jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+encodeURIComponent(branchName)+'/status'),{headers,timeoutMs:6000}),
      jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+encodeURIComponent(branchName)+'/check-runs?per_page=10'),{headers,timeoutMs:6000}).catch(()=>({check_runs:[]}))
    ]);
    return deliveryHealth(branch,status,checkRuns);
  }
  async function loadStateQuality(root){return normalizeQuality(await jsonFetch('/api/project-health-state-quality?env='+pageEnvironment(root),{timeoutMs:7000}));}
  async function loadPlatformSignal(project,signal){return await jsonFetch('/api/project-health-platform?project='+encodeURIComponent(project.id)+'&signal='+encodeURIComponent(signal),{timeoutMs:6500});}
  async function loadRunInfo(project){if(project.id!=='state')return null;try{return await jsonFetch('/api/project-health-run?project=state',{timeoutMs:5000});}catch(error){if(error.status===404)return null;throw error;}}
  async function loadExternalQuality(project){try{return await jsonFetch('/api/project-health-project-quality?project='+encodeURIComponent(project.id),{timeoutMs:7000});}catch(error){if(error.status===404)return null;throw error;}}
  async function loadActivity(project){try{const payload=await jsonFetch('/api/project-health-activity?project='+encodeURIComponent(project.id),{timeoutMs:7500});return payload?.activity||null;}catch(error){if(error.status===404)return null;throw error;}}
  async function loadOpenPullRequests(project){try{return await jsonFetch(githubApi('/repos/'+project.repo+'/pulls?state=open&per_page=5'),{headers:{Accept:'application/vnd.github+json'},timeoutMs:6000});}catch(_){return[];}}

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
      staging:s.staging||null,
      quality:s.quality||null,
      externalQuality:s.externalQuality||null,
      platform:s.platform||null,
      activity:s.activity||null,
      openPullRequests:Array.isArray(s.openPullRequests)?s.openPullRequests:[],
      runInfo:null,
      checkedAt:s.checkedAt||null,
      detailCheckedAt:s.detailCheckedAt||null,
      investigation:s.investigation||null,
      errors:[],
      pending:new Set(),
      timings:{},
      fresh:false,
      detailLoaded:false,
      detailLoading:false,
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
      if(Date.now()-new Date(parsed.savedAt).getTime()>24*60*60*1000)return null;
      return parsed;
    }catch(_){return null;}
  }
  function saveSnapshot(root,state){
    try{
      root.localStorage?.setItem(snapshotKey(root),JSON.stringify({savedAt:new Date().toISOString(),projects:state.map(serializeProjectData)}));
    }catch(_){}
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
    }
    const qualityTask=project.quality==='state'
      ? run('Quality',loadStateQuality(root),value=>{data.quality=value;})
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

  function fmtDate(value){if(!value)return'Unknown';const d=new Date(value);return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function relativeAge(value){
    if(!value)return'not checked yet';
    const time=new Date(value).getTime();if(Number.isNaN(time))return'unknown';
    const minutes=Math.max(0,Math.round((Date.now()-time)/60000));
    if(minutes<1)return'just now';
    if(minutes<60)return minutes+'m ago';
    const hours=Math.round(minutes/60);if(hours<24)return hours+'h ago';
    return Math.round(hours/24)+'d ago';
  }
  function changedSinceVisit(data){return !!(data?.lastSeenSha&&data?.delivery?.sha&&data.lastSeenSha!==data.delivery.sha);}
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
        title:failure.recovered?'Deployment failed, then recovered':'Production deployment failed',
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
    if(amount<0.01)return'  function attentionMarkup(item){return '<div class="attention '+esc(item.kind||'')+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>';}

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
  function analyticsLabel(platform){
    const a=platform?.analytics;
    if(a?.available) return (a.visitors??'—')+' visitors · 30d';
    if(a?.configured) return 'Analytics unavailable';
    return 'Analytics not connected';
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
    return '<article class="project-card '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(project.name)+'</h2><p>'+esc(project.description)+'</p></div><span class="status-pill unknown">Checking</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">Checking…</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">Checking…</span></div>'+
      '</div></article>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),d=data.delivery,pending=pendingSet(data);
    const quality=projectQualityLabel(data);
    const changePrefix=changedSinceVisit(data)?'New · ':'';
    return '<article class="project-card '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal change-signal"><span class="signal-label">'+esc(changePrefix+'Latest release')+'</span><span class="signal-value">'+(d?githubLink(commitTitle(d.message),changeUrl(data.project.repo,d)):esc(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span><span class="change-date">'+esc(d?'Updated '+fmtDate(d.updatedAt):(pending.has('Delivery')?'':'Date unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.kind==='good'?'Healthy':d?.vercel?.kind==='bad'?'Needs action':d?.vercel?.kind==='warn'?'In progress':(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">'+esc((data.quality||data.externalQuality)?quality:(pending.has('Quality')?'Checking…':'Unavailable'))+'</span></div>'+
      '</div><div class="freshness">Checked '+esc(relativeAge(data.checkedAt))+'</div></article>';
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
  function stateEvalHistory(q){
    const rows=Array.isArray(q?.recent)?q.recent.slice(0,8):[];
    if(!rows.length)return'';
    return '<details class="eval-history"><summary>See recent check details</summary><div style="margin-top:10px">'+rows.map(item=>{
      const score=evalScore(item);
      const meta=[item.created_at?fmtDate(item.created_at):null,item.total!=null?item.total+' scenarios':null,item.high_severity_failures!=null?item.high_severity_failures+' high-impact failures':null].filter(Boolean).join(' · ');
      const technical=[item.provider,item.model_identifier,item.build].filter(Boolean).join(' · ');
      return '<details class="eval-run-row"><summary><strong>'+esc(evalSuiteLabel(item))+'</strong> · '+esc(score==null?'Score unavailable':percent(score))+'</summary><span>'+esc(meta||'Aggregate result recorded')+'</span>'+(technical?'<span>Technical record: '+esc(technical)+'</span>':'')+'</details>';
    }).join('')+'<p class="footnote">Only aggregate results are stored here. Controlled scenario content stays out of Project Health.</p></div></details>';
  }
  function investigationResultHtml(investigation){
    if(investigation?.loading) return '<div class="investigation-result" role="status"><strong>Investigating…</strong><p>Checking the failed signal first, then expanding only if the evidence is not enough.</p></div>';
    if(investigation?.error) return '<div class="investigation-result" role="status"><strong>Investigation unavailable</strong><p>'+esc(investigation.error)+'</p></div>';
    if(!investigation?.report)return'';
    return '<div class="investigation-result"><strong>Investigation · '+esc(fmtDate(investigation.observedAt))+'</strong><pre>'+esc(investigation.report)+'</pre>'+
      '<div class="investigation-sources"><strong>Evidence checked</strong> '+investigation.sources.map(source=>githubLink(esc(source.label),source.url)).join(' · ')+'</div>'+
      '<div class="quality-actions"><button class="button small" type="button" data-copy-handoff>Copy engineer handoff</button></div>'+
      '<p class="footnote">Read-only investigation. Verify the conclusion before changing anything.</p></div>';
  }

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    const pending=pendingSet(data);
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    doc.getElementById('repoLink').href=repoUrl(p.repo);

    const notices=attentionItems(data),readiness=releaseReadiness(data);
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3>'+
      '<div class="row" style="margin:10px 0"><span>Release readiness</span><span>'+esc(readiness.label)+'</span></div>'+
      '<p class="footnote" style="margin:0 0 10px">'+esc(readiness.detail)+'</p>'+
      '<div class="rows">'+notices.map(item=>attentionMarkup(item)).join('')+'</div>';

    doc.getElementById('productFocusPanel').innerHTML=
      '<h3>Product focus</h3><div class="focus-grid" style="margin-top:12px">'+
      '<div class="focus-block"><strong>Current goal</strong><p>'+esc(p.focus)+'</p></div>'+
      '<div class="focus-block"><strong>Watching</strong><div class="evidence-list">'+p.evidence.map(item=>'<span class="evidence-chip">'+esc(item)+'</span>').join('')+'</div></div>'+
      '<div class="focus-block"><strong>Next decision</strong><p>'+esc(p.nextDecision)+'</p></div>'+
      '<div class="focus-block"><strong>Next review</strong><p>'+esc(p.nextReview)+'</p></div>'+
      '</div>';

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
        const cards=[];
        if(review?.interpretation_accuracy!=null) cards.push(stateEvalCard('Understood updates correctly',percent(review.interpretation_accuracy),'Did State interpret the project update the way the product expected?',evalTrend(q.recent,'review_interpretation')));
        if(ask?.ask_grounding!=null) cards.push(stateEvalCard('Answers stayed supported by evidence',percent(ask.ask_grounding),'Did answers stick to known project information instead of filling gaps?',evalTrend(q.recent,'ask_quality')));
        if(ask?.authority_accuracy!=null) cards.push(stateEvalCard('Respected decision authority',percent(ask.authority_accuracy),'Did State keep proposed changes separate from approved project truth?',''));
        if(ask?.uncertainty_accuracy!=null) cards.push(stateEvalCard('Handled uncertainty clearly',percent(ask.uncertainty_accuracy),'Did State say when the available evidence was not enough?',''));
        qualityHtml='<h3>Product quality · AI checks</h3>'+
          '<div class="eval-overview"><div><strong>'+esc(qa.title)+'</strong><span>'+(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+esc(total||'—')+' scenarios · '+esc(severe)+' high-impact failures</span></div></div>'+
          '<div class="eval-grid">'+cards.join('')+'</div>'+stateEvalHistory(q);
      }
      if(pending.has('Run controls')){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking whether dashboard-run controls are ready…</span></div>';
      }else if(run?.configured){
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all">Run all AI checks</button><button class="button small" type="button" data-run-checks="review">Check update understanding</button><button class="button small" type="button" data-run-checks="ask">Check answer quality</button></div>'+
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
        '<details class="eval-history"><summary>See what these checks cover</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else if(p.id==='narc'&&externalQ){
      qualityHtml='<h3>Product quality · Game checks</h3>'+
        '<div class="eval-overview"><div><strong>'+(externalQ.recorded?.recorded_all_suites_green?'Automated checks are passing':'Automated check status is unclear')+'</strong><span>'+(externalQ.recorded?.full_playtest_pending?'Human first-run playtest is still open.':'Latest playtest gate is recorded.')+'</span></div></div>'+
        '<div class="eval-grid">'+
        stateEvalCard('Automated game checks',externalQ.recorded?.recorded_all_suites_green?'3/3 passing':'Unknown','Checks branches, consequences, endings, time rules, and desktop behavior.','')+
        stateEvalCard('Human first-run playtest',externalQ.recorded?.full_playtest_pending?'Still needed':'Recorded','This is the check that tells us whether the experience actually makes sense to a player.','')+
        '</div>'+
        '<details class="eval-history"><summary>See automated check details</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.suites||[]).map(item=>'<div class="run-callout"><strong>'+esc(item.name)+'</strong><p>'+esc(item.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else{
      qualityHtml='<h3>Product quality</h3><div class="empty" style="margin-top:12px">Quality data is not available right now.</div>';
    }
    doc.getElementById('qualityPanel').innerHTML=qualityHtml;

    // Usage
    const a=platform?.analytics;
    if(pending.has('Analytics')){
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">Checking usage…</div>';
    }else if(a?.available){
      const visitorTrend=trendText(a.visitors_delta_pct),pageTrend=trendText(a.pageviews_delta_pct);
      const visitorClass=a.visitors_delta_pct==null?'flat':Number(a.visitors_delta_pct)>0?'up':Number(a.visitors_delta_pct)<0?'down':'flat';
      const pageClass=a.pageviews_delta_pct==null?'flat':Number(a.pageviews_delta_pct)>0?'up':Number(a.pageviews_delta_pct)<0?'down':'flat';
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="metrics" style="margin-top:12px">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div><div class="trend '+visitorClass+'">'+esc(visitorTrend)+'</div><div class="trend '+pageClass+'">'+esc(pageTrend)+'</div>';
    }else{
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">'+esc(a?.configured?'Usage data is temporarily unavailable.':'Usage analytics are not connected yet.')+'</div>';
    }

    // Recent activity / lightweight history
    const activityItems=[];
    if(activity?.available){
      const dep=activity.deployments||{},recovered=(dep.recent_failures||[]).filter(item=>item.recovered);
      activityItems.push({title:(dep.total||0)+' production releases in the last '+(activity.lookback_days||7)+' days',detail:(dep.failed||0)+' failed · '+recovered.length+' recovered'});
      const runtimeCount=(activity.runtime?.issues||[]).reduce((total,item)=>total+Number(item.count||0),0);
      activityItems.push({title:runtimeCount?'User-facing errors were observed':'No user-facing server errors found in the latest release',detail:runtimeCount?runtimeCount+' bounded error occurrences need context.':'The latest bounded runtime check is clear.'});
    }
    const prs=Array.isArray(data.openPullRequests)?data.openPullRequests:[];
    if(prs.length) activityItems.push({title:prs.length+' '+(prs.length===1?'change is':'changes are')+' still being worked on',detail:prs.slice(0,2).map(pr=>String(pr.title||'Untitled')).join(' · ')});
    if(p.id==='state'&&Array.isArray(q?.recent)&&q.recent.length){
      const item=q.recent[0];
      activityItems.push({title:evalSuiteLabel(item)+' was checked',detail:item.created_at?fmtDate(item.created_at):'Latest aggregate result recorded'});
    }else if(p.id==='tastemake'&&externalQ){
      activityItems.push({title:'Recommendation quality checks '+(externalQ.ci?.conclusion==='success'?'passed':'updated'),detail:externalQ.ci?.updated_at?fmtDate(externalQ.ci.updated_at):'Latest run recorded'});
    }else if(p.id==='narc'&&externalQ?.recorded?.full_playtest_pending){
      activityItems.push({title:'Full first-run playtest is still open',detail:'Automated checks are not a substitute for the human playthrough.'});
    }
    const activityHtml=activityItems.length?'<div class="activity-list">'+activityItems.slice(0,5).map(item=>'<div class="activity-item"><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('historyPanel').innerHTML='<h3>Recent activity</h3><div style="margin-top:12px">'+activityHtml+'</div>';

    // Delivery: product summary first, engineering evidence on demand.
    const investigationBusy=!!data.investigation?.loading;
    const investigateButton=(type,environment,label)=>'<button class="button small" type="button" data-investigate="'+esc(type)+'" data-environment="'+esc(environment)+'"'+(investigationBusy?' disabled':'')+'>'+esc(label)+'</button>';
    const deliveryKind=d?.vercel?.kind||'unknown';
    const deliveryText=deliveryKind==='good'?'Production is healthy'+(d?.updatedAt?' · updated '+fmtDate(d.updatedAt):''):deliveryKind==='bad'?'The latest version did not go live':deliveryKind==='warn'?'A deployment is still finishing':'Delivery status is unavailable';
    const deliveryClass=deliveryKind==='bad'?'bad':deliveryKind==='warn'?'warn':'';
    const prodDetails=d?row('Production branch',d.branch)+linkedRow('Latest release',commitTitle(d.message),changeUrl(p.repo,d))+row('Updated',fmtDate(d.updatedAt))+linkedRow('Commit',shortSha(d.sha),githubCommitUrl(p.repo,d.sha))+row('Deployment',d.vercel.label):'<div class="empty">Production delivery data could not be loaded.</div>';
    const stageDetails=s?row('Staging branch',s.branch)+linkedRow('Staging change',commitTitle(s.message),changeUrl(p.repo,s))+row('Staging updated',fmtDate(s.updatedAt))+linkedRow('Staging commit',shortSha(s.sha),githubCommitUrl(p.repo,s.sha))+row('Staging deployment',s.vercel.label):'';
    const prodInvestigate=d?.vercel?.kind==='bad'?investigateButton('vercel','production','Investigate failure'):'';
    const checkInvestigate=Array.isArray(d?.failedChecks)&&d.failedChecks.length?investigateButton('github-check','production','Investigate failed check'):'';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><div class="delivery-summary '+deliveryClass+'" style="margin-top:12px">'+esc(deliveryText)+'</div>'+
      '<div class="quality-actions">'+prodInvestigate+checkInvestigate+'</div>'+
      '<details class="technical-details"'+(deliveryKind==='bad'?' open':'')+'><summary>View delivery evidence</summary><div class="rows" style="margin-top:10px">'+prodDetails+stageDetails+'</div></details>'+
      investigationResultHtml(data.investigation);

    // Infrastructure stays visible because it is short.
    const r=platform?.render,n=platform?.neon;
    let infraHtml='';
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraHtml+=row('Production service',production.ok?'Healthy':'Unavailable');
      const stagingEnv=r.environments?.staging;
      if(stagingEnv) infraHtml+=row('Staging service',stagingEnv.ok?'Healthy':'May be asleep · production unaffected');
      else if(p.id==='state'&&pending.has('Staging backend')) infraHtml+=row('Staging service','Checking…');
    }else if(p.id==='state') infraHtml+=row('Production service',pending.has('Production backend')?'Checking…':'Unavailable');
    if(n?.configured&&n.available) infraHtml+=row('Database health','Connected');
    else if(n?.configured) infraHtml+=row('Database health','Temporarily unavailable');
    else infraHtml+=row('Database health',p.id==='state'?'Not connected yet':'Not used');
    const infraAttention=infrastructureAttention(data);
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3>'+
      '<div class="delivery-summary '+(infraAttention?.kind==='bad'?'bad':infraAttention?.kind==='warn'?'warn':'')+'" style="margin-top:12px">'+esc(infraAttention?.title||'Production services healthy')+'</div>'+
      '<div class="rows" style="margin-top:10px">'+infraHtml+'</div>';

    // Connections and coverage gaps stay visible; they are setup context, not incidents.
    const ai=platform?.aiTelemetry;
    const connections=[];
    connections.push({label:'Code + deployments',value:d?'Connected':'Unavailable'});
    connections.push({label:'Backend health',value:r?.configured?'Connected':(p.id==='state'?'Unavailable':'Not used')});
    connections.push({label:'Usage analytics',value:platform?.analytics?.available?'Connected':'Not connected'});
    connections.push({label:'Database health',value:n?.available?'Connected':(p.id==='state'?'Not connected':'Not used')});
    connections.push({label:'AI operations',value:ai?.not_applicable?'Not used':ai?.available?'Connected':pending.has('AI operations')?'Checking…':'Not connected'});
    if(p.id==='state') connections.push({label:'Run AI quality checks',value:run?.configured?'Ready':'Setup needed'});
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

  async function dispatchRun(data,root,suite='all'){
    const run=data.runInfo;if(!run?.configured)return;
    const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
    const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
    const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nResults are recorded as aggregate quality data. Start the run?';
    if(!root.confirm(message)) return;
    let key=root.sessionStorage.getItem('project-health-admin-key')||'';
    if(!key) key=root.prompt('Project Health admin key')||'';
    if(!key) return;
    root.sessionStorage.setItem('project-health-admin-key',key);
    try{
      const payload=await jsonFetch('/api/project-health-run',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,suite,record_environment:pageEnvironment(root),confirm_paid_model_calls:true,estimated_cost:run.estimated_cost})});
      root.alert('AI quality checks started. Refresh Project Health after the workflow finishes to see the recorded results.');
      return payload;
    }catch(error){
      if(error.status===401) root.sessionStorage.removeItem('project-health-admin-key');
      root.alert('Could not start the quality checks: '+error.message);
      throw error;
    }
  }

  function progressText(done,total,pendingNames){
    if(done>=total) return 'Finishing refresh…';
    const pending=Array.isArray(pendingNames)&&pendingNames.length?pendingNames.join(', '):'remaining projects';
    return 'Refreshing '+done+' of '+total+' projects… '+pending+' still checking.';
  }

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),summary=doc.getElementById('overviewSummary'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel');
    if(!cards||!status||!summary||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    let activeId=new URLSearchParams(root.location.search).get('project')||'state';
    let renderQueued=false,refreshGeneration=0;
    const demoState={phase:'idle',step:0,timers:[]};

    function activeData(){return state.find(item=>item.project.id===activeId)||null;}

    function renderCards(){
      cards.innerHTML=PROJECTS.map(project=>{
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        return item?cardMarkup(item,project.id===activeId):loadingCardMarkup(project,project.id===activeId);
      }).join('');
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

    function renderReviewInbox(){
      const items=currentIncidents(),reviewed=reviewedState();
      if(!items.length){
        reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-empty">No live incidents need attention right now.</div>'+demoIncidentMarkup()+'</section>';
        return;
      }
      const rows=items.slice(0,6).map(item=>{
        const source=item.url?'<a class="button small" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">View evidence</a>':'';
        const isReviewed=!!reviewed[item.key];
        return '<div class="review-item"><div><span class="review-kind incident">Live incident</span><strong>'+esc(item.project)+' · '+esc(item.title)+'</strong><div class="review-meta">'+esc(relativeAge(item.observedAt))+' · '+esc(item.detail)+'</div><div class="review-meta"><strong>Impact:</strong> '+esc(item.impact||'Unknown')+' · <strong>Owner:</strong> '+esc(item.owner||'Unknown')+'</div></div><div class="review-actions">'+source+(isReviewed?'<span class="status-pill healthy">Reviewed</span>':'<button class="button small" type="button" data-review-key="'+esc(item.key)+'">Mark reviewed</button>')+'</div></div>';
      }).join('');
      reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-list" style="margin-top:12px">'+rows+'</div></section>';
    }
    function renderSummary(){
      const fresh=state.filter(item=>item?.fresh);
      const incidentCount=currentIncidents().length;
      const openCount=openProductItems().length;
      const changedCount=fresh.filter(changedSinceVisit).length;
      const checked=fresh.map(item=>item.checkedAt).filter(Boolean).sort().pop();
      summary.innerHTML='<span class="summary-chip incident"><strong>'+incidentCount+'</strong> '+(incidentCount===1?'incident':'incidents')+'</span>'+
        '<span class="summary-chip open"><strong>'+openCount+'</strong> open '+(openCount===1?'item':'items')+'</span>'+
        '<span class="summary-chip"><strong>'+changedCount+'</strong> changed since last visit</span>'+
        '<span class="summary-chip"><strong>'+esc(checked?relativeAge(checked):'checking')+'</strong> last checked</span>';
    }

    function renderNow(){
      renderQueued=false;
      renderCards();renderSummary();renderReviewInbox();
      const data=activeData();if(data)renderDetail(data,doc);
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
      scheduleRender();persist();
    }

    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      scheduleRender();
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
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

    cards.addEventListener('click',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card)select(card.dataset.project);});
    cards.addEventListener('keydown',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(card.dataset.project);}});

    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.addEventListener('click',async event=>{
      const copyButton=event.target.closest?.('[data-copy-handoff]');
      if(copyButton){
        const data=activeData(),investigation=data?.investigation;if(!data||!investigation?.report)return;
        const sources=(investigation.sources||[]).map(source=>'- '+source.label+': '+source.url).join('\n');
        const text=[data.project.name+' engineering handoff','',investigation.report,'',sources?'Evidence:\n'+sources:'','', 'Generated by Project Health. Read-only investigation; verify before changing anything.'].filter(Boolean).join('\n');
        try{await root.navigator.clipboard.writeText(text);copyButton.textContent='Copied';root.setTimeout(()=>{copyButton.textContent='Copy engineer handoff';},1500);}catch(_){root.prompt('Copy engineering handoff',text);}
        return;
      }
      const button=event.target.closest?.('[data-investigate]');
      if(!button)return;
      const data=activeData();if(!data)return;
      if(!root.confirm('Investigate this failure? Project Health will check only the relevant bounded evidence and send a sanitized summary to Anthropic. It cannot change code, configuration, or deployments.'))return;
      let key=root.sessionStorage.getItem('project-health-investigation-key')||'';
      if(!key)key=root.prompt('Project Health investigation key')||'';
      if(!key)return;
      root.sessionStorage.setItem('project-health-investigation-key',key);
      data.investigation={loading:true};renderNow();
      try{
        const payload=await jsonFetch('/api/project-health-investigate',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,environment:button.dataset.environment,signalType:button.dataset.investigate}),timeoutMs:30000});
        data.investigation={report:payload.report,sources:Array.isArray(payload.sources)?payload.sources:[],observedAt:payload.observedAt};
      }catch(error){
        if(error.status===401)root.sessionStorage.removeItem('project-health-investigation-key');
        data.investigation={error:error.message||'Could not complete the investigation.'};
      }
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
      const errors=state.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      persist();
      status.innerHTML=errors.length?'<strong>Refresh finished with some coverage gaps.</strong> The dashboard keeps unavailable data separate from product incidents.':'<strong>Health is up to date.</strong>';
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
      if(event.target.closest?.('[data-demo-start]')||event.target.closest?.('[data-demo-replay]')){startDemo();return;}
      const copy=event.target.closest?.('[data-demo-copy]');if(copy){await copyDemoHandoff(copy);}
    });
    qualityPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data)return;
      button.disabled=true;
      try{await dispatchRun(data,root,button.dataset.runChecks||'all');}catch(_){}
      finally{renderDetail(data,doc);}
    });
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,projectQualityLabel,evalScore,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,loadProject,loadProjectDetails,infraCardLabel,analyticsLabel,relativeAge,changedSinceVisit,trendText,activityReviewItems,progressText,init};
});
+amount.toFixed(4);
    return'  function attentionMarkup(item){return '<div class="attention '+esc(item.kind||'')+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>';}

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
  function analyticsLabel(platform){
    const a=platform?.analytics;
    if(a?.available) return (a.visitors??'—')+' visitors · 30d';
    if(a?.configured) return 'Analytics unavailable';
    return 'Analytics not connected';
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
    return '<article class="project-card '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(project.name)+'</h2><p>'+esc(project.description)+'</p></div><span class="status-pill unknown">Checking</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">Checking…</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">Checking…</span></div>'+
      '</div></article>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),d=data.delivery,pending=pendingSet(data);
    const quality=projectQualityLabel(data);
    const changePrefix=changedSinceVisit(data)?'New · ':'';
    return '<article class="project-card '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal change-signal"><span class="signal-label">'+esc(changePrefix+'Latest release')+'</span><span class="signal-value">'+(d?githubLink(commitTitle(d.message),changeUrl(data.project.repo,d)):esc(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span><span class="change-date">'+esc(d?'Updated '+fmtDate(d.updatedAt):(pending.has('Delivery')?'':'Date unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.kind==='good'?'Healthy':d?.vercel?.kind==='bad'?'Needs action':d?.vercel?.kind==='warn'?'In progress':(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">'+esc((data.quality||data.externalQuality)?quality:(pending.has('Quality')?'Checking…':'Unavailable'))+'</span></div>'+
      '</div><div class="freshness">Checked '+esc(relativeAge(data.checkedAt))+'</div></article>';
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
  function stateEvalHistory(q){
    const rows=Array.isArray(q?.recent)?q.recent.slice(0,8):[];
    if(!rows.length)return'';
    return '<details class="eval-history"><summary>See recent check details</summary><div style="margin-top:10px">'+rows.map(item=>{
      const score=evalScore(item);
      const meta=[item.created_at?fmtDate(item.created_at):null,item.total!=null?item.total+' scenarios':null,item.high_severity_failures!=null?item.high_severity_failures+' high-impact failures':null].filter(Boolean).join(' · ');
      const technical=[item.provider,item.model_identifier,item.build].filter(Boolean).join(' · ');
      return '<details class="eval-run-row"><summary><strong>'+esc(evalSuiteLabel(item))+'</strong> · '+esc(score==null?'Score unavailable':percent(score))+'</summary><span>'+esc(meta||'Aggregate result recorded')+'</span>'+(technical?'<span>Technical record: '+esc(technical)+'</span>':'')+'</details>';
    }).join('')+'<p class="footnote">Only aggregate results are stored here. Controlled scenario content stays out of Project Health.</p></div></details>';
  }
  function investigationResultHtml(investigation){
    if(investigation?.loading) return '<div class="investigation-result" role="status"><strong>Investigating…</strong><p>Checking the failed signal first, then expanding only if the evidence is not enough.</p></div>';
    if(investigation?.error) return '<div class="investigation-result" role="status"><strong>Investigation unavailable</strong><p>'+esc(investigation.error)+'</p></div>';
    if(!investigation?.report)return'';
    return '<div class="investigation-result"><strong>Investigation · '+esc(fmtDate(investigation.observedAt))+'</strong><pre>'+esc(investigation.report)+'</pre>'+
      '<div class="investigation-sources"><strong>Evidence checked</strong> '+investigation.sources.map(source=>githubLink(esc(source.label),source.url)).join(' · ')+'</div>'+
      '<div class="quality-actions"><button class="button small" type="button" data-copy-handoff>Copy engineer handoff</button></div>'+
      '<p class="footnote">Read-only investigation. Verify the conclusion before changing anything.</p></div>';
  }

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    const pending=pendingSet(data);
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    doc.getElementById('repoLink').href=repoUrl(p.repo);

    const notices=attentionItems(data),readiness=releaseReadiness(data);
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3>'+
      '<div class="row" style="margin:10px 0"><span>Release readiness</span><span>'+esc(readiness.label)+'</span></div>'+
      '<p class="footnote" style="margin:0 0 10px">'+esc(readiness.detail)+'</p>'+
      '<div class="rows">'+notices.map(item=>attentionMarkup(item)).join('')+'</div>';

    doc.getElementById('productFocusPanel').innerHTML=
      '<h3>Product focus</h3><div class="focus-grid" style="margin-top:12px">'+
      '<div class="focus-block"><strong>Current goal</strong><p>'+esc(p.focus)+'</p></div>'+
      '<div class="focus-block"><strong>Watching</strong><div class="evidence-list">'+p.evidence.map(item=>'<span class="evidence-chip">'+esc(item)+'</span>').join('')+'</div></div>'+
      '<div class="focus-block"><strong>Next decision</strong><p>'+esc(p.nextDecision)+'</p></div>'+
      '<div class="focus-block"><strong>Next review</strong><p>'+esc(p.nextReview)+'</p></div>'+
      '</div>';

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
        const cards=[];
        if(review?.interpretation_accuracy!=null) cards.push(stateEvalCard('Understood updates correctly',percent(review.interpretation_accuracy),'Did State interpret the project update the way the product expected?',evalTrend(q.recent,'review_interpretation')));
        if(ask?.ask_grounding!=null) cards.push(stateEvalCard('Answers stayed supported by evidence',percent(ask.ask_grounding),'Did answers stick to known project information instead of filling gaps?',evalTrend(q.recent,'ask_quality')));
        if(ask?.authority_accuracy!=null) cards.push(stateEvalCard('Respected decision authority',percent(ask.authority_accuracy),'Did State keep proposed changes separate from approved project truth?',''));
        if(ask?.uncertainty_accuracy!=null) cards.push(stateEvalCard('Handled uncertainty clearly',percent(ask.uncertainty_accuracy),'Did State say when the available evidence was not enough?',''));
        qualityHtml='<h3>Product quality · AI checks</h3>'+
          '<div class="eval-overview"><div><strong>'+esc(qa.title)+'</strong><span>'+(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+esc(total||'—')+' scenarios · '+esc(severe)+' high-impact failures</span></div></div>'+
          '<div class="eval-grid">'+cards.join('')+'</div>'+stateEvalHistory(q);
      }
      if(pending.has('Run controls')){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking whether dashboard-run controls are ready…</span></div>';
      }else if(run?.configured){
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all">Run all AI checks</button><button class="button small" type="button" data-run-checks="review">Check update understanding</button><button class="button small" type="button" data-run-checks="ask">Check answer quality</button></div>'+
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
        '<details class="eval-history"><summary>See what these checks cover</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else if(p.id==='narc'&&externalQ){
      qualityHtml='<h3>Product quality · Game checks</h3>'+
        '<div class="eval-overview"><div><strong>'+(externalQ.recorded?.recorded_all_suites_green?'Automated checks are passing':'Automated check status is unclear')+'</strong><span>'+(externalQ.recorded?.full_playtest_pending?'Human first-run playtest is still open.':'Latest playtest gate is recorded.')+'</span></div></div>'+
        '<div class="eval-grid">'+
        stateEvalCard('Automated game checks',externalQ.recorded?.recorded_all_suites_green?'3/3 passing':'Unknown','Checks branches, consequences, endings, time rules, and desktop behavior.','')+
        stateEvalCard('Human first-run playtest',externalQ.recorded?.full_playtest_pending?'Still needed':'Recorded','This is the check that tells us whether the experience actually makes sense to a player.','')+
        '</div>'+
        '<details class="eval-history"><summary>See automated check details</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.suites||[]).map(item=>'<div class="run-callout"><strong>'+esc(item.name)+'</strong><p>'+esc(item.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else{
      qualityHtml='<h3>Product quality</h3><div class="empty" style="margin-top:12px">Quality data is not available right now.</div>';
    }
    doc.getElementById('qualityPanel').innerHTML=qualityHtml;

    // Usage
    const a=platform?.analytics;
    if(pending.has('Analytics')){
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">Checking usage…</div>';
    }else if(a?.available){
      const visitorTrend=trendText(a.visitors_delta_pct),pageTrend=trendText(a.pageviews_delta_pct);
      const visitorClass=a.visitors_delta_pct==null?'flat':Number(a.visitors_delta_pct)>0?'up':Number(a.visitors_delta_pct)<0?'down':'flat';
      const pageClass=a.pageviews_delta_pct==null?'flat':Number(a.pageviews_delta_pct)>0?'up':Number(a.pageviews_delta_pct)<0?'down':'flat';
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="metrics" style="margin-top:12px">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div><div class="trend '+visitorClass+'">'+esc(visitorTrend)+'</div><div class="trend '+pageClass+'">'+esc(pageTrend)+'</div>';
    }else{
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">'+esc(a?.configured?'Usage data is temporarily unavailable.':'Usage analytics are not connected yet.')+'</div>';
    }

    // Recent activity / lightweight history
    const activityItems=[];
    if(activity?.available){
      const dep=activity.deployments||{},recovered=(dep.recent_failures||[]).filter(item=>item.recovered);
      activityItems.push({title:(dep.total||0)+' production releases in the last '+(activity.lookback_days||7)+' days',detail:(dep.failed||0)+' failed · '+recovered.length+' recovered'});
      const runtimeCount=(activity.runtime?.issues||[]).reduce((total,item)=>total+Number(item.count||0),0);
      activityItems.push({title:runtimeCount?'User-facing errors were observed':'No user-facing server errors found in the latest release',detail:runtimeCount?runtimeCount+' bounded error occurrences need context.':'The latest bounded runtime check is clear.'});
    }
    const prs=Array.isArray(data.openPullRequests)?data.openPullRequests:[];
    if(prs.length) activityItems.push({title:prs.length+' '+(prs.length===1?'change is':'changes are')+' still being worked on',detail:prs.slice(0,2).map(pr=>String(pr.title||'Untitled')).join(' · ')});
    if(p.id==='state'&&Array.isArray(q?.recent)&&q.recent.length){
      const item=q.recent[0];
      activityItems.push({title:evalSuiteLabel(item)+' was checked',detail:item.created_at?fmtDate(item.created_at):'Latest aggregate result recorded'});
    }else if(p.id==='tastemake'&&externalQ){
      activityItems.push({title:'Recommendation quality checks '+(externalQ.ci?.conclusion==='success'?'passed':'updated'),detail:externalQ.ci?.updated_at?fmtDate(externalQ.ci.updated_at):'Latest run recorded'});
    }else if(p.id==='narc'&&externalQ?.recorded?.full_playtest_pending){
      activityItems.push({title:'Full first-run playtest is still open',detail:'Automated checks are not a substitute for the human playthrough.'});
    }
    const activityHtml=activityItems.length?'<div class="activity-list">'+activityItems.slice(0,5).map(item=>'<div class="activity-item"><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('historyPanel').innerHTML='<h3>Recent activity</h3><div style="margin-top:12px">'+activityHtml+'</div>';

    // Delivery: product summary first, engineering evidence on demand.
    const investigationBusy=!!data.investigation?.loading;
    const investigateButton=(type,environment,label)=>'<button class="button small" type="button" data-investigate="'+esc(type)+'" data-environment="'+esc(environment)+'"'+(investigationBusy?' disabled':'')+'>'+esc(label)+'</button>';
    const deliveryKind=d?.vercel?.kind||'unknown';
    const deliveryText=deliveryKind==='good'?'Production is healthy'+(d?.updatedAt?' · updated '+fmtDate(d.updatedAt):''):deliveryKind==='bad'?'The latest version did not go live':deliveryKind==='warn'?'A deployment is still finishing':'Delivery status is unavailable';
    const deliveryClass=deliveryKind==='bad'?'bad':deliveryKind==='warn'?'warn':'';
    const prodDetails=d?row('Production branch',d.branch)+linkedRow('Latest release',commitTitle(d.message),changeUrl(p.repo,d))+row('Updated',fmtDate(d.updatedAt))+linkedRow('Commit',shortSha(d.sha),githubCommitUrl(p.repo,d.sha))+row('Deployment',d.vercel.label):'<div class="empty">Production delivery data could not be loaded.</div>';
    const stageDetails=s?row('Staging branch',s.branch)+linkedRow('Staging change',commitTitle(s.message),changeUrl(p.repo,s))+row('Staging updated',fmtDate(s.updatedAt))+linkedRow('Staging commit',shortSha(s.sha),githubCommitUrl(p.repo,s.sha))+row('Staging deployment',s.vercel.label):'';
    const prodInvestigate=d?.vercel?.kind==='bad'?investigateButton('vercel','production','Investigate failure'):'';
    const checkInvestigate=Array.isArray(d?.failedChecks)&&d.failedChecks.length?investigateButton('github-check','production','Investigate failed check'):'';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><div class="delivery-summary '+deliveryClass+'" style="margin-top:12px">'+esc(deliveryText)+'</div>'+
      '<div class="quality-actions">'+prodInvestigate+checkInvestigate+'</div>'+
      '<details class="technical-details"'+(deliveryKind==='bad'?' open':'')+'><summary>View delivery evidence</summary><div class="rows" style="margin-top:10px">'+prodDetails+stageDetails+'</div></details>'+
      investigationResultHtml(data.investigation);

    // Infrastructure stays visible because it is short.
    const r=platform?.render,n=platform?.neon;
    let infraHtml='';
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraHtml+=row('Production service',production.ok?'Healthy':'Unavailable');
      const stagingEnv=r.environments?.staging;
      if(stagingEnv) infraHtml+=row('Staging service',stagingEnv.ok?'Healthy':'May be asleep · production unaffected');
      else if(p.id==='state'&&pending.has('Staging backend')) infraHtml+=row('Staging service','Checking…');
    }else if(p.id==='state') infraHtml+=row('Production service',pending.has('Production backend')?'Checking…':'Unavailable');
    if(n?.configured&&n.available) infraHtml+=row('Database health','Connected');
    else if(n?.configured) infraHtml+=row('Database health','Temporarily unavailable');
    else infraHtml+=row('Database health',p.id==='state'?'Not connected yet':'Not used');
    const infraAttention=infrastructureAttention(data);
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3>'+
      '<div class="delivery-summary '+(infraAttention?.kind==='bad'?'bad':infraAttention?.kind==='warn'?'warn':'')+'" style="margin-top:12px">'+esc(infraAttention?.title||'Production services healthy')+'</div>'+
      '<div class="rows" style="margin-top:10px">'+infraHtml+'</div>';

    // Connections and coverage gaps stay visible; they are setup context, not incidents.
    const connections=[];
    connections.push({label:'Code + deployments',value:d?'Connected':'Unavailable'});
    connections.push({label:'Backend health',value:r?.configured?'Connected':(p.id==='state'?'Unavailable':'Not used')});
    connections.push({label:'Usage analytics',value:platform?.analytics?.available?'Connected':'Not connected'});
    connections.push({label:'Database health',value:n?.available?'Connected':(p.id==='state'?'Not connected':'Not used')});
    if(p.id==='state') connections.push({label:'Run AI quality checks',value:run?.configured?'Ready':'Setup needed'});
    const gaps=setupGaps(data);
    doc.getElementById('connectionsPanel').innerHTML='<h3>Connections & coverage</h3>'+
      '<div class="rows" style="margin-top:12px">'+connections.map(item=>row(item.label,item.value)).join('')+'</div>'+
      (gaps.length?'<h4 style="margin:18px 0 8px">Coverage gaps</h4><div class="coverage-grid">'+gaps.map(item=>'<div class="coverage-item"><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'');
  }

  async function dispatchRun(data,root,suite='all'){
    const run=data.runInfo;if(!run?.configured)return;
    const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
    const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
    const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nResults are recorded as aggregate quality data. Start the run?';
    if(!root.confirm(message)) return;
    let key=root.sessionStorage.getItem('project-health-admin-key')||'';
    if(!key) key=root.prompt('Project Health admin key')||'';
    if(!key) return;
    root.sessionStorage.setItem('project-health-admin-key',key);
    try{
      const payload=await jsonFetch('/api/project-health-run',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,suite,record_environment:pageEnvironment(root),confirm_paid_model_calls:true,estimated_cost:run.estimated_cost})});
      root.alert('AI quality checks started. Refresh Project Health after the workflow finishes to see the recorded results.');
      return payload;
    }catch(error){
      if(error.status===401) root.sessionStorage.removeItem('project-health-admin-key');
      root.alert('Could not start the quality checks: '+error.message);
      throw error;
    }
  }

  function progressText(done,total,pendingNames){
    if(done>=total) return 'Finishing refresh…';
    const pending=Array.isArray(pendingNames)&&pendingNames.length?pendingNames.join(', '):'remaining projects';
    return 'Refreshing '+done+' of '+total+' projects… '+pending+' still checking.';
  }

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),summary=doc.getElementById('overviewSummary'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel');
    if(!cards||!status||!summary||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    let activeId=new URLSearchParams(root.location.search).get('project')||'state';
    let renderQueued=false,refreshGeneration=0;
    const demoState={phase:'idle',step:0,timers:[]};

    function activeData(){return state.find(item=>item.project.id===activeId)||null;}

    function renderCards(){
      cards.innerHTML=PROJECTS.map(project=>{
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        return item?cardMarkup(item,project.id===activeId):loadingCardMarkup(project,project.id===activeId);
      }).join('');
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

    function renderReviewInbox(){
      const items=currentIncidents(),reviewed=reviewedState();
      if(!items.length){
        reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-empty">No live incidents need attention right now.</div>'+demoIncidentMarkup()+'</section>';
        return;
      }
      const rows=items.slice(0,6).map(item=>{
        const source=item.url?'<a class="button small" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">View evidence</a>':'';
        const isReviewed=!!reviewed[item.key];
        return '<div class="review-item"><div><span class="review-kind incident">Live incident</span><strong>'+esc(item.project)+' · '+esc(item.title)+'</strong><div class="review-meta">'+esc(relativeAge(item.observedAt))+' · '+esc(item.detail)+'</div><div class="review-meta"><strong>Impact:</strong> '+esc(item.impact||'Unknown')+' · <strong>Owner:</strong> '+esc(item.owner||'Unknown')+'</div></div><div class="review-actions">'+source+(isReviewed?'<span class="status-pill healthy">Reviewed</span>':'<button class="button small" type="button" data-review-key="'+esc(item.key)+'">Mark reviewed</button>')+'</div></div>';
      }).join('');
      reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-list" style="margin-top:12px">'+rows+'</div></section>';
    }
    function renderSummary(){
      const fresh=state.filter(item=>item?.fresh);
      const incidentCount=currentIncidents().length;
      const openCount=openProductItems().length;
      const changedCount=fresh.filter(changedSinceVisit).length;
      const checked=fresh.map(item=>item.checkedAt).filter(Boolean).sort().pop();
      summary.innerHTML='<span class="summary-chip incident"><strong>'+incidentCount+'</strong> '+(incidentCount===1?'incident':'incidents')+'</span>'+
        '<span class="summary-chip open"><strong>'+openCount+'</strong> open '+(openCount===1?'item':'items')+'</span>'+
        '<span class="summary-chip"><strong>'+changedCount+'</strong> changed since last visit</span>'+
        '<span class="summary-chip"><strong>'+esc(checked?relativeAge(checked):'checking')+'</strong> last checked</span>';
    }

    function renderNow(){
      renderQueued=false;
      renderCards();renderSummary();renderReviewInbox();
      const data=activeData();if(data)renderDetail(data,doc);
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
      scheduleRender();persist();
    }

    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      scheduleRender();
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
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

    cards.addEventListener('click',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card)select(card.dataset.project);});
    cards.addEventListener('keydown',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(card.dataset.project);}});

    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.addEventListener('click',async event=>{
      const copyButton=event.target.closest?.('[data-copy-handoff]');
      if(copyButton){
        const data=activeData(),investigation=data?.investigation;if(!data||!investigation?.report)return;
        const sources=(investigation.sources||[]).map(source=>'- '+source.label+': '+source.url).join('\n');
        const text=[data.project.name+' engineering handoff','',investigation.report,'',sources?'Evidence:\n'+sources:'','', 'Generated by Project Health. Read-only investigation; verify before changing anything.'].filter(Boolean).join('\n');
        try{await root.navigator.clipboard.writeText(text);copyButton.textContent='Copied';root.setTimeout(()=>{copyButton.textContent='Copy engineer handoff';},1500);}catch(_){root.prompt('Copy engineering handoff',text);}
        return;
      }
      const button=event.target.closest?.('[data-investigate]');
      if(!button)return;
      const data=activeData();if(!data)return;
      if(!root.confirm('Investigate this failure? Project Health will check only the relevant bounded evidence and send a sanitized summary to Anthropic. It cannot change code, configuration, or deployments.'))return;
      let key=root.sessionStorage.getItem('project-health-investigation-key')||'';
      if(!key)key=root.prompt('Project Health investigation key')||'';
      if(!key)return;
      root.sessionStorage.setItem('project-health-investigation-key',key);
      data.investigation={loading:true};renderNow();
      try{
        const payload=await jsonFetch('/api/project-health-investigate',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,environment:button.dataset.environment,signalType:button.dataset.investigate}),timeoutMs:30000});
        data.investigation={report:payload.report,sources:Array.isArray(payload.sources)?payload.sources:[],observedAt:payload.observedAt};
      }catch(error){
        if(error.status===401)root.sessionStorage.removeItem('project-health-investigation-key');
        data.investigation={error:error.message||'Could not complete the investigation.'};
      }
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
      const errors=state.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      persist();
      status.innerHTML=errors.length?'<strong>Refresh finished with some coverage gaps.</strong> The dashboard keeps unavailable data separate from product incidents.':'<strong>Health is up to date.</strong>';
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
      if(event.target.closest?.('[data-demo-start]')||event.target.closest?.('[data-demo-replay]')){startDemo();return;}
      const copy=event.target.closest?.('[data-demo-copy]');if(copy){await copyDemoHandoff(copy);}
    });
    qualityPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data)return;
      button.disabled=true;
      try{await dispatchRun(data,root,button.dataset.runChecks||'all');}catch(_){}
      finally{renderDetail(data,doc);}
    });
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,projectQualityLabel,evalScore,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,loadProject,loadProjectDetails,infraCardLabel,analyticsLabel,relativeAge,changedSinceVisit,trendText,activityReviewItems,progressText,init};
});
+amount.toFixed(2);
  }
  function attentionMarkup(item){return '<div class="attention '+esc(item.kind||'')+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>';}

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
  function analyticsLabel(platform){
    const a=platform?.analytics;
    if(a?.available) return (a.visitors??'—')+' visitors · 30d';
    if(a?.configured) return 'Analytics unavailable';
    return 'Analytics not connected';
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
    return '<article class="project-card '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(project.name)+'</h2><p>'+esc(project.description)+'</p></div><span class="status-pill unknown">Checking</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">Checking…</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">Checking…</span></div>'+
      '</div></article>';
  }
  function cardMarkup(data,active){
    const status=projectStatus(data),d=data.delivery,pending=pendingSet(data);
    const quality=projectQualityLabel(data);
    const changePrefix=changedSinceVisit(data)?'New · ':'';
    return '<article class="project-card '+(active?'active':'')+'" data-kind="'+esc(status.kind)+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal change-signal"><span class="signal-label">'+esc(changePrefix+'Latest release')+'</span><span class="signal-value">'+(d?githubLink(commitTitle(d.message),changeUrl(data.project.repo,d)):esc(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span><span class="change-date">'+esc(d?'Updated '+fmtDate(d.updatedAt):(pending.has('Delivery')?'':'Date unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.kind==='good'?'Healthy':d?.vercel?.kind==='bad'?'Needs action':d?.vercel?.kind==='warn'?'In progress':(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Quality</span><span class="signal-value">'+esc((data.quality||data.externalQuality)?quality:(pending.has('Quality')?'Checking…':'Unavailable'))+'</span></div>'+
      '</div><div class="freshness">Checked '+esc(relativeAge(data.checkedAt))+'</div></article>';
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
  function stateEvalHistory(q){
    const rows=Array.isArray(q?.recent)?q.recent.slice(0,8):[];
    if(!rows.length)return'';
    return '<details class="eval-history"><summary>See recent check details</summary><div style="margin-top:10px">'+rows.map(item=>{
      const score=evalScore(item);
      const meta=[item.created_at?fmtDate(item.created_at):null,item.total!=null?item.total+' scenarios':null,item.high_severity_failures!=null?item.high_severity_failures+' high-impact failures':null].filter(Boolean).join(' · ');
      const technical=[item.provider,item.model_identifier,item.build].filter(Boolean).join(' · ');
      return '<details class="eval-run-row"><summary><strong>'+esc(evalSuiteLabel(item))+'</strong> · '+esc(score==null?'Score unavailable':percent(score))+'</summary><span>'+esc(meta||'Aggregate result recorded')+'</span>'+(technical?'<span>Technical record: '+esc(technical)+'</span>':'')+'</details>';
    }).join('')+'<p class="footnote">Only aggregate results are stored here. Controlled scenario content stays out of Project Health.</p></div></details>';
  }
  function investigationResultHtml(investigation){
    if(investigation?.loading) return '<div class="investigation-result" role="status"><strong>Investigating…</strong><p>Checking the failed signal first, then expanding only if the evidence is not enough.</p></div>';
    if(investigation?.error) return '<div class="investigation-result" role="status"><strong>Investigation unavailable</strong><p>'+esc(investigation.error)+'</p></div>';
    if(!investigation?.report)return'';
    return '<div class="investigation-result"><strong>Investigation · '+esc(fmtDate(investigation.observedAt))+'</strong><pre>'+esc(investigation.report)+'</pre>'+
      '<div class="investigation-sources"><strong>Evidence checked</strong> '+investigation.sources.map(source=>githubLink(esc(source.label),source.url)).join(' · ')+'</div>'+
      '<div class="quality-actions"><button class="button small" type="button" data-copy-handoff>Copy engineer handoff</button></div>'+
      '<p class="footnote">Read-only investigation. Verify the conclusion before changing anything.</p></div>';
  }

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    const pending=pendingSet(data);
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    doc.getElementById('repoLink').href=repoUrl(p.repo);

    const notices=attentionItems(data),readiness=releaseReadiness(data);
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3>'+
      '<div class="row" style="margin:10px 0"><span>Release readiness</span><span>'+esc(readiness.label)+'</span></div>'+
      '<p class="footnote" style="margin:0 0 10px">'+esc(readiness.detail)+'</p>'+
      '<div class="rows">'+notices.map(item=>attentionMarkup(item)).join('')+'</div>';

    doc.getElementById('productFocusPanel').innerHTML=
      '<h3>Product focus</h3><div class="focus-grid" style="margin-top:12px">'+
      '<div class="focus-block"><strong>Current goal</strong><p>'+esc(p.focus)+'</p></div>'+
      '<div class="focus-block"><strong>Watching</strong><div class="evidence-list">'+p.evidence.map(item=>'<span class="evidence-chip">'+esc(item)+'</span>').join('')+'</div></div>'+
      '<div class="focus-block"><strong>Next decision</strong><p>'+esc(p.nextDecision)+'</p></div>'+
      '<div class="focus-block"><strong>Next review</strong><p>'+esc(p.nextReview)+'</p></div>'+
      '</div>';

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
        const cards=[];
        if(review?.interpretation_accuracy!=null) cards.push(stateEvalCard('Understood updates correctly',percent(review.interpretation_accuracy),'Did State interpret the project update the way the product expected?',evalTrend(q.recent,'review_interpretation')));
        if(ask?.ask_grounding!=null) cards.push(stateEvalCard('Answers stayed supported by evidence',percent(ask.ask_grounding),'Did answers stick to known project information instead of filling gaps?',evalTrend(q.recent,'ask_quality')));
        if(ask?.authority_accuracy!=null) cards.push(stateEvalCard('Respected decision authority',percent(ask.authority_accuracy),'Did State keep proposed changes separate from approved project truth?',''));
        if(ask?.uncertainty_accuracy!=null) cards.push(stateEvalCard('Handled uncertainty clearly',percent(ask.uncertainty_accuracy),'Did State say when the available evidence was not enough?',''));
        qualityHtml='<h3>Product quality · AI checks</h3>'+
          '<div class="eval-overview"><div><strong>'+esc(qa.title)+'</strong><span>'+(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+esc(total||'—')+' scenarios · '+esc(severe)+' high-impact failures</span></div></div>'+
          '<div class="eval-grid">'+cards.join('')+'</div>'+stateEvalHistory(q);
      }
      if(pending.has('Run controls')){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking whether dashboard-run controls are ready…</span></div>';
      }else if(run?.configured){
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all">Run all AI checks</button><button class="button small" type="button" data-run-checks="review">Check update understanding</button><button class="button small" type="button" data-run-checks="ask">Check answer quality</button></div>'+
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
        '<details class="eval-history"><summary>See what these checks cover</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else if(p.id==='narc'&&externalQ){
      qualityHtml='<h3>Product quality · Game checks</h3>'+
        '<div class="eval-overview"><div><strong>'+(externalQ.recorded?.recorded_all_suites_green?'Automated checks are passing':'Automated check status is unclear')+'</strong><span>'+(externalQ.recorded?.full_playtest_pending?'Human first-run playtest is still open.':'Latest playtest gate is recorded.')+'</span></div></div>'+
        '<div class="eval-grid">'+
        stateEvalCard('Automated game checks',externalQ.recorded?.recorded_all_suites_green?'3/3 passing':'Unknown','Checks branches, consequences, endings, time rules, and desktop behavior.','')+
        stateEvalCard('Human first-run playtest',externalQ.recorded?.full_playtest_pending?'Still needed':'Recorded','This is the check that tells us whether the experience actually makes sense to a player.','')+
        '</div>'+
        '<details class="eval-history"><summary>See automated check details</summary><div class="run-summary" style="margin-top:10px">'+
        (externalQ.suites||[]).map(item=>'<div class="run-callout"><strong>'+esc(item.name)+'</strong><p>'+esc(item.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></details>';
    }else{
      qualityHtml='<h3>Product quality</h3><div class="empty" style="margin-top:12px">Quality data is not available right now.</div>';
    }
    doc.getElementById('qualityPanel').innerHTML=qualityHtml;

    // Usage
    const a=platform?.analytics;
    if(pending.has('Analytics')){
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">Checking usage…</div>';
    }else if(a?.available){
      const visitorTrend=trendText(a.visitors_delta_pct),pageTrend=trendText(a.pageviews_delta_pct);
      const visitorClass=a.visitors_delta_pct==null?'flat':Number(a.visitors_delta_pct)>0?'up':Number(a.visitors_delta_pct)<0?'down':'flat';
      const pageClass=a.pageviews_delta_pct==null?'flat':Number(a.pageviews_delta_pct)>0?'up':Number(a.pageviews_delta_pct)<0?'down':'flat';
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="metrics" style="margin-top:12px">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div><div class="trend '+visitorClass+'">'+esc(visitorTrend)+'</div><div class="trend '+pageClass+'">'+esc(pageTrend)+'</div>';
    }else{
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><div class="empty" style="margin-top:12px">'+esc(a?.configured?'Usage data is temporarily unavailable.':'Usage analytics are not connected yet.')+'</div>';
    }

    // Recent activity / lightweight history
    const activityItems=[];
    if(activity?.available){
      const dep=activity.deployments||{},recovered=(dep.recent_failures||[]).filter(item=>item.recovered);
      activityItems.push({title:(dep.total||0)+' production releases in the last '+(activity.lookback_days||7)+' days',detail:(dep.failed||0)+' failed · '+recovered.length+' recovered'});
      const runtimeCount=(activity.runtime?.issues||[]).reduce((total,item)=>total+Number(item.count||0),0);
      activityItems.push({title:runtimeCount?'User-facing errors were observed':'No user-facing server errors found in the latest release',detail:runtimeCount?runtimeCount+' bounded error occurrences need context.':'The latest bounded runtime check is clear.'});
    }
    const prs=Array.isArray(data.openPullRequests)?data.openPullRequests:[];
    if(prs.length) activityItems.push({title:prs.length+' '+(prs.length===1?'change is':'changes are')+' still being worked on',detail:prs.slice(0,2).map(pr=>String(pr.title||'Untitled')).join(' · ')});
    if(p.id==='state'&&Array.isArray(q?.recent)&&q.recent.length){
      const item=q.recent[0];
      activityItems.push({title:evalSuiteLabel(item)+' was checked',detail:item.created_at?fmtDate(item.created_at):'Latest aggregate result recorded'});
    }else if(p.id==='tastemake'&&externalQ){
      activityItems.push({title:'Recommendation quality checks '+(externalQ.ci?.conclusion==='success'?'passed':'updated'),detail:externalQ.ci?.updated_at?fmtDate(externalQ.ci.updated_at):'Latest run recorded'});
    }else if(p.id==='narc'&&externalQ?.recorded?.full_playtest_pending){
      activityItems.push({title:'Full first-run playtest is still open',detail:'Automated checks are not a substitute for the human playthrough.'});
    }
    const activityHtml=activityItems.length?'<div class="activity-list">'+activityItems.slice(0,5).map(item=>'<div class="activity-item"><strong>'+esc(item.title)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'<div class="empty">No recent activity is available yet.</div>';
    doc.getElementById('historyPanel').innerHTML='<h3>Recent activity</h3><div style="margin-top:12px">'+activityHtml+'</div>';

    // Delivery: product summary first, engineering evidence on demand.
    const investigationBusy=!!data.investigation?.loading;
    const investigateButton=(type,environment,label)=>'<button class="button small" type="button" data-investigate="'+esc(type)+'" data-environment="'+esc(environment)+'"'+(investigationBusy?' disabled':'')+'>'+esc(label)+'</button>';
    const deliveryKind=d?.vercel?.kind||'unknown';
    const deliveryText=deliveryKind==='good'?'Production is healthy'+(d?.updatedAt?' · updated '+fmtDate(d.updatedAt):''):deliveryKind==='bad'?'The latest version did not go live':deliveryKind==='warn'?'A deployment is still finishing':'Delivery status is unavailable';
    const deliveryClass=deliveryKind==='bad'?'bad':deliveryKind==='warn'?'warn':'';
    const prodDetails=d?row('Production branch',d.branch)+linkedRow('Latest release',commitTitle(d.message),changeUrl(p.repo,d))+row('Updated',fmtDate(d.updatedAt))+linkedRow('Commit',shortSha(d.sha),githubCommitUrl(p.repo,d.sha))+row('Deployment',d.vercel.label):'<div class="empty">Production delivery data could not be loaded.</div>';
    const stageDetails=s?row('Staging branch',s.branch)+linkedRow('Staging change',commitTitle(s.message),changeUrl(p.repo,s))+row('Staging updated',fmtDate(s.updatedAt))+linkedRow('Staging commit',shortSha(s.sha),githubCommitUrl(p.repo,s.sha))+row('Staging deployment',s.vercel.label):'';
    const prodInvestigate=d?.vercel?.kind==='bad'?investigateButton('vercel','production','Investigate failure'):'';
    const checkInvestigate=Array.isArray(d?.failedChecks)&&d.failedChecks.length?investigateButton('github-check','production','Investigate failed check'):'';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><div class="delivery-summary '+deliveryClass+'" style="margin-top:12px">'+esc(deliveryText)+'</div>'+
      '<div class="quality-actions">'+prodInvestigate+checkInvestigate+'</div>'+
      '<details class="technical-details"'+(deliveryKind==='bad'?' open':'')+'><summary>View delivery evidence</summary><div class="rows" style="margin-top:10px">'+prodDetails+stageDetails+'</div></details>'+
      investigationResultHtml(data.investigation);

    // Infrastructure stays visible because it is short.
    const r=platform?.render,n=platform?.neon;
    let infraHtml='';
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraHtml+=row('Production service',production.ok?'Healthy':'Unavailable');
      const stagingEnv=r.environments?.staging;
      if(stagingEnv) infraHtml+=row('Staging service',stagingEnv.ok?'Healthy':'May be asleep · production unaffected');
      else if(p.id==='state'&&pending.has('Staging backend')) infraHtml+=row('Staging service','Checking…');
    }else if(p.id==='state') infraHtml+=row('Production service',pending.has('Production backend')?'Checking…':'Unavailable');
    if(n?.configured&&n.available) infraHtml+=row('Database health','Connected');
    else if(n?.configured) infraHtml+=row('Database health','Temporarily unavailable');
    else infraHtml+=row('Database health',p.id==='state'?'Not connected yet':'Not used');
    const infraAttention=infrastructureAttention(data);
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3>'+
      '<div class="delivery-summary '+(infraAttention?.kind==='bad'?'bad':infraAttention?.kind==='warn'?'warn':'')+'" style="margin-top:12px">'+esc(infraAttention?.title||'Production services healthy')+'</div>'+
      '<div class="rows" style="margin-top:10px">'+infraHtml+'</div>';

    // Connections and coverage gaps stay visible; they are setup context, not incidents.
    const connections=[];
    connections.push({label:'Code + deployments',value:d?'Connected':'Unavailable'});
    connections.push({label:'Backend health',value:r?.configured?'Connected':(p.id==='state'?'Unavailable':'Not used')});
    connections.push({label:'Usage analytics',value:platform?.analytics?.available?'Connected':'Not connected'});
    connections.push({label:'Database health',value:n?.available?'Connected':(p.id==='state'?'Not connected':'Not used')});
    if(p.id==='state') connections.push({label:'Run AI quality checks',value:run?.configured?'Ready':'Setup needed'});
    const gaps=setupGaps(data);
    doc.getElementById('connectionsPanel').innerHTML='<h3>Connections & coverage</h3>'+
      '<div class="rows" style="margin-top:12px">'+connections.map(item=>row(item.label,item.value)).join('')+'</div>'+
      (gaps.length?'<h4 style="margin:18px 0 8px">Coverage gaps</h4><div class="coverage-grid">'+gaps.map(item=>'<div class="coverage-item"><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'');
  }

  async function dispatchRun(data,root,suite='all'){
    const run=data.runInfo;if(!run?.configured)return;
    const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
    const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
    const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nResults are recorded as aggregate quality data. Start the run?';
    if(!root.confirm(message)) return;
    let key=root.sessionStorage.getItem('project-health-admin-key')||'';
    if(!key) key=root.prompt('Project Health admin key')||'';
    if(!key) return;
    root.sessionStorage.setItem('project-health-admin-key',key);
    try{
      const payload=await jsonFetch('/api/project-health-run',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,suite,record_environment:pageEnvironment(root),confirm_paid_model_calls:true,estimated_cost:run.estimated_cost})});
      root.alert('AI quality checks started. Refresh Project Health after the workflow finishes to see the recorded results.');
      return payload;
    }catch(error){
      if(error.status===401) root.sessionStorage.removeItem('project-health-admin-key');
      root.alert('Could not start the quality checks: '+error.message);
      throw error;
    }
  }

  function progressText(done,total,pendingNames){
    if(done>=total) return 'Finishing refresh…';
    const pending=Array.isArray(pendingNames)&&pendingNames.length?pendingNames.join(', '):'remaining projects';
    return 'Refreshing '+done+' of '+total+' projects… '+pending+' still checking.';
  }

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),summary=doc.getElementById('overviewSummary'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel');
    if(!cards||!status||!summary||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    let activeId=new URLSearchParams(root.location.search).get('project')||'state';
    let renderQueued=false,refreshGeneration=0;
    const demoState={phase:'idle',step:0,timers:[]};

    function activeData(){return state.find(item=>item.project.id===activeId)||null;}

    function renderCards(){
      cards.innerHTML=PROJECTS.map(project=>{
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        return item?cardMarkup(item,project.id===activeId):loadingCardMarkup(project,project.id===activeId);
      }).join('');
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

    function renderReviewInbox(){
      const items=currentIncidents(),reviewed=reviewedState();
      if(!items.length){
        reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-empty">No live incidents need attention right now.</div>'+demoIncidentMarkup()+'</section>';
        return;
      }
      const rows=items.slice(0,6).map(item=>{
        const source=item.url?'<a class="button small" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">View evidence</a>':'';
        const isReviewed=!!reviewed[item.key];
        return '<div class="review-item"><div><span class="review-kind incident">Live incident</span><strong>'+esc(item.project)+' · '+esc(item.title)+'</strong><div class="review-meta">'+esc(relativeAge(item.observedAt))+' · '+esc(item.detail)+'</div><div class="review-meta"><strong>Impact:</strong> '+esc(item.impact||'Unknown')+' · <strong>Owner:</strong> '+esc(item.owner||'Unknown')+'</div></div><div class="review-actions">'+source+(isReviewed?'<span class="status-pill healthy">Reviewed</span>':'<button class="button small" type="button" data-review-key="'+esc(item.key)+'">Mark reviewed</button>')+'</div></div>';
      }).join('');
      reviewInbox.innerHTML='<section class="panel"><h3>Incidents</h3><div class="review-list" style="margin-top:12px">'+rows+'</div></section>';
    }
    function renderSummary(){
      const fresh=state.filter(item=>item?.fresh);
      const incidentCount=currentIncidents().length;
      const openCount=openProductItems().length;
      const changedCount=fresh.filter(changedSinceVisit).length;
      const checked=fresh.map(item=>item.checkedAt).filter(Boolean).sort().pop();
      summary.innerHTML='<span class="summary-chip incident"><strong>'+incidentCount+'</strong> '+(incidentCount===1?'incident':'incidents')+'</span>'+
        '<span class="summary-chip open"><strong>'+openCount+'</strong> open '+(openCount===1?'item':'items')+'</span>'+
        '<span class="summary-chip"><strong>'+changedCount+'</strong> changed since last visit</span>'+
        '<span class="summary-chip"><strong>'+esc(checked?relativeAge(checked):'checking')+'</strong> last checked</span>';
    }

    function renderNow(){
      renderQueued=false;
      renderCards();renderSummary();renderReviewInbox();
      const data=activeData();if(data)renderDetail(data,doc);
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
      scheduleRender();persist();
    }

    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      scheduleRender();
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
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

    cards.addEventListener('click',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card)select(card.dataset.project);});
    cards.addEventListener('keydown',event=>{if(event.target.closest?.('a,button'))return;const card=event.target.closest?.('.project-card');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(card.dataset.project);}});

    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.addEventListener('click',async event=>{
      const copyButton=event.target.closest?.('[data-copy-handoff]');
      if(copyButton){
        const data=activeData(),investigation=data?.investigation;if(!data||!investigation?.report)return;
        const sources=(investigation.sources||[]).map(source=>'- '+source.label+': '+source.url).join('\n');
        const text=[data.project.name+' engineering handoff','',investigation.report,'',sources?'Evidence:\n'+sources:'','', 'Generated by Project Health. Read-only investigation; verify before changing anything.'].filter(Boolean).join('\n');
        try{await root.navigator.clipboard.writeText(text);copyButton.textContent='Copied';root.setTimeout(()=>{copyButton.textContent='Copy engineer handoff';},1500);}catch(_){root.prompt('Copy engineering handoff',text);}
        return;
      }
      const button=event.target.closest?.('[data-investigate]');
      if(!button)return;
      const data=activeData();if(!data)return;
      if(!root.confirm('Investigate this failure? Project Health will check only the relevant bounded evidence and send a sanitized summary to Anthropic. It cannot change code, configuration, or deployments.'))return;
      let key=root.sessionStorage.getItem('project-health-investigation-key')||'';
      if(!key)key=root.prompt('Project Health investigation key')||'';
      if(!key)return;
      root.sessionStorage.setItem('project-health-investigation-key',key);
      data.investigation={loading:true};renderNow();
      try{
        const payload=await jsonFetch('/api/project-health-investigate',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,environment:button.dataset.environment,signalType:button.dataset.investigate}),timeoutMs:30000});
        data.investigation={report:payload.report,sources:Array.isArray(payload.sources)?payload.sources:[],observedAt:payload.observedAt};
      }catch(error){
        if(error.status===401)root.sessionStorage.removeItem('project-health-investigation-key');
        data.investigation={error:error.message||'Could not complete the investigation.'};
      }
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
      const errors=state.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      persist();
      status.innerHTML=errors.length?'<strong>Refresh finished with some coverage gaps.</strong> The dashboard keeps unavailable data separate from product incidents.':'<strong>Health is up to date.</strong>';
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
      if(event.target.closest?.('[data-demo-start]')||event.target.closest?.('[data-demo-replay]')){startDemo();return;}
      const copy=event.target.closest?.('[data-demo-copy]');if(copy){await copyDemoHandoff(copy);}
    });
    qualityPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data)return;
      button.disabled=true;
      try{await dispatchRun(data,root,button.dataset.runChecks||'all');}catch(_){}
      finally{renderDetail(data,doc);}
    });
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,projectQualityLabel,evalScore,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,loadProject,loadProjectDetails,infraCardLabel,analyticsLabel,relativeAge,changedSinceVisit,trendText,activityReviewItems,progressText,init};
});
