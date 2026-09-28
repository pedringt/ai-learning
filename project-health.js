(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){root.PROJECT_HEALTH=api;if(root.document) api.init(root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const PROJECTS=[
    {id:'state',name:'State',description:'Maintained project truth with human-authorized Current State.',repo:'pedringt/ai-learning',branch:'main',stagingBranch:'staging',quality:'state'},
    {id:'tastemake',name:'Tastemake',description:'Taste-learning recommendations and preference discovery.',repo:'pedringt/tastemake',branch:'main'},
    {id:'narc',name:'NARC',description:'Workplace-surveillance satire game and branching system.',repo:'pedringt/narc',branch:'main'}
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

  function deliveryHealth(branch,status){
    const commit=branch?.commit||{};
    return {branch:branch?.name||'Unknown',sha:commit.sha||null,vercel:vercelFromStatus(status),updatedAt:commit.commit?.committer?.date||commit.commit?.author?.date||null,message:commit.commit?.message||''};
  }

  function normalizeQuality(payload){
    const live=payload?.live_review_quality||{},controlled=payload?.controlled_evals||{};
    return {resolvedReviews:Number(live.resolved_reviews||0),acceptedAsProposedRate:live.accepted_as_proposed_rate,materialEditRate:live.material_edit_rate,review:controlled.latest_review_interpretation||null,ask:controlled.latest_ask_quality||null,recent:Array.isArray(controlled.recent)?controlled.recent:[]};
  }
  function percent(v){return v==null||Number.isNaN(Number(v))?'Not measured':(Math.round(Number(v)*1000)/10)+'%';}
  function qualityAttention(q){
    if(!q) return {kind:'unknown',title:'Quality not loaded',detail:'No project-specific quality data is available yet.'};
    const runs=[q.review,q.ask].filter(Boolean);
    if(!runs.length) return {kind:'warn',title:'Run controlled checks',detail:'No Review or Ask quality run has been recorded yet.'};
    const severe=runs.reduce((n,r)=>n+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:'AI quality needs attention',detail:severe+' high-severity controlled eval failure'+(severe===1?'':'s')+' in the latest State checks.'};
    if(runs.some(r=>Number(r.failed_cases||0)>0||(r.overall_pass_rate!=null&&Number(r.overall_pass_rate)<1))) return {kind:'warn',title:'Review the latest quality failures',detail:'The latest controlled evals contain one or more failed cases.'};
    return {kind:'good',title:'Latest State quality checks look healthy',detail:'No high-severity failures were reported in the latest recorded Review and Ask runs.'};
  }
  function deliveryAttention(d){
    if(!d) return {kind:'warn',title:'Delivery status unavailable',detail:'GitHub or deployment status could not be loaded.'};
    if(d.vercel.kind==='bad') return {kind:'bad',title:'Deployment needs attention',detail:'GitHub reports a failed Vercel deployment for the latest commit.'};
    if(d.vercel.kind==='warn') return {kind:'warn',title:'Deployment is still running',detail:'The latest Vercel deployment has not finished yet.'};
    if(d.vercel.kind==='good') return {kind:'good',title:'Latest deployment looks healthy',detail:'GitHub reports successful Vercel status for the latest commit.'};
    return {kind:'warn',title:'Deployment status is not connected',detail:'The latest commit loaded, but no Vercel commit status was available.'};
  }
  function infrastructureAttention(platform){
    const render=platform?.render;
    if(render?.configured){
      const production=render.environments?.production;
      const staging=render.environments?.staging;
      if(production&&!production.ok) return {kind:'bad',title:'Production backend needs attention',detail:'The production Render health endpoint is not responding successfully.'};
      if(staging&&!staging.ok) return {kind:'warn',title:'Staging backend is not responding',detail:'State staging is on Render free tier and may simply be asleep; production health is evaluated separately.'};
    }
    const neon=platform?.neon;
    if(neon?.configured&&neon.available===false) return {kind:'warn',title:'Database health could not be read',detail:'Neon is configured, but its project health request failed.'};
    return null;
  }
  function externalQualityAttention(q){
    if(!q) return null;
    const items=Array.isArray(q.attention)?q.attention:[];
    if(!items.length) return {kind:'unknown',title:'Quality status unavailable',detail:'No project-specific quality attention signal was returned.'};
    const priority={bad:3,warn:2,unknown:1,good:0};
    return [...items].sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  }
  function pendingSet(data){return data?.pending instanceof Set?data.pending:new Set();}
  function allAttentionSignals(data){
    const pending=pendingSet(data),signals=[];
    if(data.delivery) signals.push(deliveryAttention(data.delivery));
    else if(data.fresh&& !pending.has('Delivery')) signals.push(deliveryAttention(null));
    if(data.quality) signals.push(qualityAttention(data.quality));
    const external=externalQualityAttention(data.externalQuality);if(external) signals.push(external);
    const infra=infrastructureAttention(data.platform);if(infra) signals.push(infra);
    if(data.platform?.analytics?.configured&&data.platform.analytics.available===false&&!pending.has('Analytics')){
      signals.push({kind:'warn',title:'Site analytics unavailable',detail:'Vercel Web Analytics is configured but did not return usable counts.'});
    }
    return signals;
  }
  function overallAttention(data){
    const priority={bad:3,warn:2,unknown:1,good:0};
    const signals=allAttentionSignals(data);
    const pending=pendingSet(data);
    if(!signals.length) return {kind:'unknown',title:'Checking project health',detail:'Connected signals are still loading.'};
    const sorted=signals.sort((a,b)=>priority[b.kind]-priority[a.kind]);
    if(priority[sorted[0].kind]>=2) return sorted[0];
    if(['Delivery','Quality','Production backend'].some(label=>pending.has(label))){
      return {kind:'unknown',title:'Finishing health check',detail:'Core signals are still arriving.'};
    }
    return sorted[0];
  }
  function attentionItems(data){
    const signals=allAttentionSignals(data);
    const issues=signals.filter(item=>item.kind==='bad'||item.kind==='warn');
    if(issues.length) return issues;
    const pending=pendingSet(data);
    if(pending.size){
      return [{kind:'unknown',title:'Still checking',detail:Array.from(pending).join(', ')+' still '+(pending.size===1?'is':'are')+' loading.'}];
    }
    return [{kind:'good',title:'Nothing urgent needs attention',detail:'The connected delivery, infrastructure, and product-quality signals look healthy.'}];
  }

  async function loadGitHubProject(project,branchName){
    const headers={Accept:'application/vnd.github+json'};
    const [branch,status]=await Promise.all([
      jsonFetch(githubApi('/repos/'+project.repo+'/branches/'+encodeURIComponent(branchName)),{headers,timeoutMs:6000}),
      jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+encodeURIComponent(branchName)+'/status'),{headers,timeoutMs:6000})
    ]);
    return deliveryHealth(branch,status);
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
        observedAt:issue.last_seen,
        resolved:false,
        url:issue.source_url||null
      });
    }
    return items.sort((a,b)=>(b.observedAt||0)-(a.observedAt||0));
  }
  function row(label,value){return '<div class="row"><span>'+esc(label)+'</span><span>'+esc(value)+'</span></div>';}
  function metric(value,label){return '<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
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
    if(data.project.quality==='state') return data.quality?qualityAttention(data.quality).title:'Quality unavailable';
    const q=data.externalQuality;if(!q) return 'Quality unavailable';
    const top=externalQualityAttention(q);
    if(q.project==='tastemake'&&q.ci?.conclusion==='success'&&top?.kind==='good') return 'QA + eval rules healthy';
    if(q.project==='narc'&&q.recorded?.recorded_all_suites_green) return q.recorded.full_playtest_pending?'Tests green · playtest pending':'Recorded tests green';
    return top?.title||'Quality loaded';
  }
  function loadingCardMarkup(project,active){
    return '<article class="project-card '+(active?'active':'')+'" data-kind="unknown" data-project="'+esc(project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(project.name)+'</h2><p>'+esc(project.description)+'</p></div><span class="status-pill unknown">Checking</span></div>'+
      '<div class="card-focus">Checking connected sources…</div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">Checking…</span></div>'+
      '<div class="signal"><span class="signal-label">Product quality</span><span class="signal-value">Checking…</span></div>'+
      '</div></article>';
  }
  function cardMarkup(data,active){
    const att=overallAttention(data),d=data.delivery;
    const pending=pendingSet(data);
    const quality=projectQualityLabel(data);
    const changePrefix=changedSinceVisit(data)?'New since last visit · ':'';
    return '<article class="project-card '+(active?'active':'')+'" data-kind="'+esc(att.kind)+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(att.kind)+'">'+esc(att.kind==='good'?'Healthy':att.kind==='bad'?'Needs attention':'Check')+'</span></div>'+
      '<div class="card-focus">'+esc(att.title)+'</div>'+
      '<div class="signal-list">'+
      '<div class="signal change-signal"><span class="signal-label">'+esc(changePrefix+'Latest change')+'</span><span class="signal-value">'+esc(d?commitTitle(d.message):(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span><span class="change-date">'+esc(d?'Updated '+fmtDate(d.updatedAt):(pending.has('Delivery')?'':'Date unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.label||(pending.has('Delivery')?'Checking…':'Unavailable'))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Product quality</span><span class="signal-value">'+esc((data.quality||data.externalQuality)?quality:(pending.has('Quality')?'Checking…':'Unavailable'))+'</span></div>'+
      '</div><div class="freshness">Checked '+esc(relativeAge(data.checkedAt))+'</div></article>';
  }

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    doc.getElementById('repoLink').href=repoUrl(p.repo);

    const notices=attentionItems(data);
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3><p class="panel-copy">Only exceptions and decisions that deserve attention show here. Healthy checks stay in their own sections.</p><div class="rows">'+notices.map(attentionMarkup).join('')+'</div>';

    const vercelUrl='https://vercel.com/cairn10/'+encodeURIComponent(p.id);
    const prod=d?row('Production branch',d.branch)+row('Latest change',commitTitle(d.message))+row('Updated',fmtDate(d.updatedAt))+row('Commit',shortSha(d.sha))+row('Vercel',d.vercel.label):'<div class="empty">Production delivery data could not be loaded.</div>';
    const stage=s?'<div style="margin-top:12px">'+row('Staging branch',s.branch)+row('Latest change',commitTitle(s.message))+row('Updated',fmtDate(s.updatedAt))+row('Commit',shortSha(s.sha))+row('Staging Vercel',s.vercel.label)+'</div>':'';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><p class="panel-copy">Current branch and deployment state. Older operational context lives under Recent context.</p><div class="rows">'+prod+stage+'</div><p class="footnote"><a href="'+esc(vercelUrl)+'" target="_blank" rel="noopener noreferrer">Open '+esc(p.name)+' in Vercel</a></p>';

    const pending=pendingSet(data),r=platform?.render,n=platform?.neon;
    let infraHtml='';
    if(r?.configured){
      const production=r.environments?.production;
      if(production) infraHtml+=row('Render production',production.ok?'Healthy':'Unavailable');
      const staging=r.environments?.staging;
      if(staging&&!staging.ok) infraHtml+=row('Render staging','Unavailable · may be asleep');
      else if(p.id==='state'&&!staging&&pending.has('Staging backend')) infraHtml+=row('Render staging','Checking…');
    }else if(p.id==='state') infraHtml+=row('Render',pending.has('Production backend')?'Checking production…':'Unavailable');
    if(n?.configured&&n.available) infraHtml+=row('Neon','Connected');
    else if(n?.configured) infraHtml+=row('Neon','Configured, but unavailable');
    else infraHtml+=row('Neon',p.id==='state'?'Not connected':'Not used or not connected');
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3><p class="panel-copy">Healthy services stay compact. Detail matters here mainly when something is wrong.</p><div class="rows">'+infraHtml+'</div>';

    const a=platform?.analytics;
    if(pending.has('Analytics')){
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><p class="panel-copy">Production Web Analytics with a simple previous-period comparison.</p><div class="empty">Checking analytics…</div>';
    }else if(a?.available){
      const visitorTrend=trendText(a.visitors_delta_pct);
      const pageTrend=trendText(a.pageviews_delta_pct);
      const visitorClass=a.visitors_delta_pct==null?'flat':Number(a.visitors_delta_pct)>0?'up':Number(a.visitors_delta_pct)<0?'down':'flat';
      const pageClass=a.pageviews_delta_pct==null?'flat':Number(a.pageviews_delta_pct)>0?'up':Number(a.pageviews_delta_pct)<0?'down':'flat';
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><p class="panel-copy">Production Vercel Web Analytics, aggregate counts only.</p><div class="metrics">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div><div class="trend '+visitorClass+'">'+esc(visitorTrend)+'</div><div class="trend '+pageClass+'">'+esc(pageTrend)+'</div><p class="footnote">No raw visitor identities, project content, prompts, or answers are copied into Project Health.</p>';
    }else{
      doc.getElementById('analyticsPanel').innerHTML='<h3>Usage</h3><p class="panel-copy">Traffic belongs alongside quality and reliability when it has useful context.</p><div class="empty">'+esc(a?.configured?'Web Analytics is configured but unavailable for this project.':'Usage analytics are not connected yet.')+'</div>';
    }

    let qualityHtml='';
    if(p.quality==='state'){
      const review=q?.review,ask=q?.ask;
      if(!q&&pending.has('Quality')){
        qualityHtml='<h3>Product quality</h3><p class="panel-copy">State uses its existing aggregate controlled-eval records.</p><div class="empty">Checking State quality…</div>';
      }else{
        qualityHtml='<h3>Product quality</h3><p class="panel-copy">State uses aggregate controlled-eval records. Project content is not copied here.</p><div class="metrics">'+metric(review?percent(review.interpretation_accuracy):'Not run','Review interpretation')+metric(ask?percent(ask.ask_grounding):'Not run','Ask grounding')+metric(ask?percent(ask.authority_accuracy):'Not run','Ask authority handling')+'</div><p class="footnote">Resolved Reviews · 30d: '+esc(q?.resolvedReviews??'Not loaded')+'. Material edits measure human correction effort, not automatically AI error.</p>';
      }
      let runAction='';
      if(pending.has('Run controls')) runAction='<button class="button small" type="button" disabled>Checking run setup…</button>';
      else if(run?.configured) runAction='<button class="button small primary" type="button" data-run-checks>Run health checks</button><span class="footnote">Estimated cost '+esc(run.estimated_cost||'not configured')+'. Paid calls require confirmation.</span>';
      else if(run) runAction='<button class="button small" type="button" disabled>Finish run setup</button>';
      if(runAction) qualityHtml+='<div class="quality-actions">'+runAction+'</div>';
    }else if(p.id==='tastemake'&&externalQ){
      const endpoint=externalQ.endpoint||{},base=externalQ.baseline||{},ci=externalQ.ci||{};
      const groups=(externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('');
      qualityHtml='<h3>Product quality</h3><p class="panel-copy">Recommendation quality is evaluated against grounding, calibration, user authority, cross-domain restraint, and validator defenses.</p>'+
        '<div class="metrics">'+metric(ci.conclusion==='success'?'Passing':(ci.conclusion||'Unknown'),'Main QA workflow')+metric((endpoint.rule_checks?.passed??'—')+'/'+(endpoint.rule_checks?.total??'—'),'Endpoint rule checks')+metric((endpoint.validator_self_test?.caught??'—')+'/'+(endpoint.validator_self_test?.total??'—'),'Bad outputs caught')+'</div>'+
        '<div class="run-summary" style="margin-top:12px">'+groups+'</div>'+
        '<p class="footnote">Baseline comparison: '+esc(base.valid_fixture_outputs?.passed??'—')+'/'+esc(base.valid_fixture_outputs?.total??'—')+' fixtures kept all proposals. '+esc(externalQ.caveat||'')+' Source commit '+esc(shortSha(externalQ.source_commit))+'.</p>';
    }else if(p.id==='narc'&&externalQ){
      const suites=(externalQ.suites||[]).map(item=>'<div class="run-callout"><strong>'+esc(item.name)+'</strong><p>'+esc(item.detail)+'</p><p class="footnote">'+esc(item.command)+'</p></div>').join('');
      qualityHtml='<h3>Product quality</h3><p class="panel-copy">NARC quality is mostly deterministic: branch/state consistency, authored consequences, and desktop integration. Human playtesting remains a separate product-quality gate.</p>'+
        '<div class="metrics">'+metric(externalQ.recorded?.recorded_all_suites_green?'3/3':'Unknown','Suites recorded green')+metric(externalQ.recorded?.full_playtest_pending?'Pending':'Recorded','Full first-run playtest')+metric(externalQ.analytics_blocked_until_playtest?'Blocked':'Open','Gameplay analytics')+'</div><div class="run-summary" style="margin-top:12px">'+suites+'</div>'+
        '<p class="footnote">'+esc(externalQ.caveat||'')+' Source commit '+esc(shortSha(externalQ.source_commit))+'.</p>';
    }else{
      qualityHtml='<h3>Product quality</h3><p class="panel-copy">'+esc(p.name)+' quality data could not be loaded.</p><div class="empty">Missing data stays missing rather than being guessed.</div>';
    }
    doc.getElementById('qualityPanel').innerHTML=qualityHtml;

    let historyHtml='';
    if(activity?.available){
      const dep=activity.deployments||{};
      historyHtml+=row('Production deploys · 7d',(dep.total??'—')+' total · '+(dep.failed??'—')+' failed');
      const recovered=(dep.recent_failures||[]).filter(item=>item.recovered).length;
      if(recovered)historyHtml+=row('Recovered failures · 7d',String(recovered));
      const runtimeCount=(activity.runtime?.issues||[]).reduce((total,item)=>total+Number(item.count||0),0);
      historyHtml+=row('Runtime errors · latest deploy',activity.runtime?.available?String(runtimeCount):'Unavailable');
    }
    const prs=Array.isArray(data.openPullRequests)?data.openPullRequests:[];
    historyHtml+=row('Open pull requests',String(prs.length));
    if(prs.length) historyHtml+=prs.slice(0,2).map(pr=>row('In progress','#'+pr.number+' · '+String(pr.title||'Untitled').slice(0,80))).join('');

    if(p.id==='state'){
      const recent=Array.isArray(q?.recent)?q.recent.slice(0,3):[];
      historyHtml+=recent.length
        ? recent.map(item=>row((item.suite||item.eval_suite||'Controlled eval').replaceAll('_',' '),[item.build?shortSha(item.build):null,item.model||null,item.created_at?fmtDate(item.created_at):null].filter(Boolean).join(' · '))).join('')
        : '';
    }else if(p.id==='tastemake'&&externalQ){
      historyHtml+=row('Latest QA',externalQ.ci?.updated_at?fmtDate(externalQ.ci.updated_at):'Unknown')+row('Eval contract',externalQ.endpoint?.contract||externalQ.baseline?.contract||'Unknown');
    }else if(p.id==='narc'&&externalQ){
      historyHtml+=row('Recorded verification',externalQ.recorded?.recorded_all_suites_green?'All 3 suites green':'Not confirmed')+row('Next quality gate',externalQ.recorded?.full_playtest_pending?'Full ~15-minute playtest':'No pending playtest recorded');
    }
    if(!historyHtml)historyHtml='<div class="empty">No recent context is available yet.</div>';
    doc.getElementById('historyPanel').innerHTML='<h3>Recent context</h3><p class="panel-copy">A small reliability and work history, not a full trace explorer.</p><div class="rows">'+historyHtml+'</div><p class="footnote">Detail checked '+esc(relativeAge(data.detailCheckedAt||data.checkedAt))+'.</p>';

    const connections=[];
    connections.push({label:'GitHub + Vercel delivery',value:d?'Connected':'Unavailable'});
    if(r?.configured) connections.push({label:'Render backend',value:'Connected'});
    else if(p.id==='state') connections.push({label:'Render backend',value:'Unavailable'});
    else connections.push({label:'Render backend',value:'Not used'});
    connections.push({label:'Site analytics',value:platform?.analytics?.available?'Connected':'Set up later'});
    connections.push({label:'Neon health',value:n?.available?'Connected':'Set up later'});
    connections.push({label:'Run health checks',value:run?.configured?'Ready':'Set up later'});
    doc.getElementById('connectionsPanel').innerHTML='<details class="setup-details"><summary>Connections & setup</summary><p class="panel-copy">Optional setup status. Missing optional credentials do not make a project unhealthy.</p><div class="rows">'+connections.map(item=>row(item.label,item.value)).join('')+'</div></details>';
  }

  async function dispatchRun(data,root){
    const run=data.runInfo;if(!run?.configured)return;
    const message=run.label+'\n\nAt least '+run.minimum_controlled_cases+' controlled cases plus the existing walkthrough.\nEstimated cost: '+run.estimated_cost+'\n\nStart this paid model-backed health check?';
    if(!root.confirm(message)) return;
    let key=root.sessionStorage.getItem('project-health-admin-key')||'';
    if(!key) key=root.prompt('Project Health admin key')||'';
    if(!key) return;
    root.sessionStorage.setItem('project-health-admin-key',key);
    try{
      const payload=await jsonFetch('/api/project-health-run',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Health-Key':key},body:JSON.stringify({project:data.project.id,confirm_paid_model_calls:true,estimated_cost:run.estimated_cost})});
      root.alert('Health checks started. Results will appear here after the workflow records them.');
      return payload;
    }catch(error){
      if(error.status===401) root.sessionStorage.removeItem('project-health-admin-key');
      root.alert('Could not start health checks: '+error.message);
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
    function unreviewedItems(){
      const reviewed=reviewedState();
      return currentReviewItems().filter(item=>!reviewed[item.key]);
    }
    function renderReviewInbox(){
      const items=unreviewedItems();
      if(!items.length){
        reviewInbox.innerHTML='<section class="panel"><h3>Needs review</h3><p class="panel-copy">Meaningful delivery and runtime problems appear here. Healthy logs stay out of the way.</p><div class="review-empty">Nothing new needs review.</div></section>';
        return;
      }
      const rows=items.slice(0,6).map(item=>{
        const source=item.url?'<a class="button small" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">View source</a>':'';
        const stateLabel=item.resolved?'Recovered':'New';
        return '<div class="review-item"><div><strong>'+esc(item.project)+' · '+esc(item.title)+'</strong><div class="review-meta">'+esc(stateLabel)+' · '+esc(relativeAge(item.observedAt))+' · '+esc(item.detail)+'</div></div><div class="review-actions">'+source+'<button class="button small" type="button" data-review-key="'+esc(item.key)+'">Mark reviewed</button></div></div>';
      }).join('');
      reviewInbox.innerHTML='<section class="panel"><h3>Needs review</h3><p class="panel-copy">A small error inbox from recent production deploys and bounded runtime error signals.</p><div class="review-list">'+rows+'</div></section>';
    }
    function renderSummary(){
      const fresh=state.filter(item=>item?.fresh);
      const reviewCount=unreviewedItems().length;
      const changedCount=fresh.filter(changedSinceVisit).length;
      const checked=fresh.map(item=>item.checkedAt).filter(Boolean).sort().pop();
      summary.innerHTML='<span class="summary-chip"><strong>'+reviewCount+'</strong> need review</span>'+
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
      await loadProjectDetails(data,root,partial=>{scheduleRender();});
      scheduleRender();persist();
    }

    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      scheduleRender();
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
      ensureDetails(activeId);
    }

    cards.addEventListener('click',event=>{const card=event.target.closest?.('.project-card');if(card)select(card.dataset.project);});
    cards.addEventListener('keydown',event=>{const card=event.target.closest?.('.project-card');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(card.dataset.project);}});

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
        if(item.qualityPromise){
          item.qualityPromise.finally(()=>{if(generation===refreshGeneration){scheduleRender();persist();}});
        }
        scheduleRender();
        if(completed.size<PROJECTS.length){
          status.textContent=progressText(completed.size,PROJECTS.length,pendingNames());
        }
      });

      await Promise.all(jobs);
      if(generation!==refreshGeneration)return;
      const errors=state.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      persist();
      status.innerHTML=errors.length?'<strong>Core refresh complete with some unavailable sources.</strong> Remaining quality/detail signals continue independently.':'<strong>Core health is up to date.</strong> Product quality may still be finishing; detailed signals load when you open a project.';
      refresh.disabled=false;
      ensureDetails(activeId);
    }

    if(cached?.savedAt){
      status.innerHTML='<strong>Showing the last good snapshot.</strong> Last checked '+esc(fmtDate(cached.savedAt))+'. Refreshing current health…';
    }
    renderNow();
    refresh.addEventListener('click',refreshAll);
    reviewInbox.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-review-key]');
      if(!button)return;
      const reviewed=reviewedState();
      reviewed[button.dataset.reviewKey]=new Date().toISOString();
      saveReviewedState(reviewed);
      renderNow();
    });
    qualityPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data)return;
      button.disabled=true;
      try{await dispatchRun(data,root);}catch(_){}
      finally{renderDetail(data,doc);}
    });
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,commitTitle,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,projectQualityLabel,percent,shortSha,pendingSet,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,loadProject,loadProjectDetails,infraCardLabel,analyticsLabel,relativeAge,changedSinceVisit,trendText,activityReviewItems,progressText,init};
});
