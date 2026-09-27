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
  function repoUrl(repo){return 'https://github.com/'+repo;}
  function githubApi(path){return 'https://api.github.com'+path;}
  function pageEnvironment(root){const host=String(root?.location?.hostname||'');return /(^|[-.])staging([-.]|$)|-git-/i.test(host)?'staging':'production';}

  async function jsonFetch(url,options={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{...options,signal:controller.signal,headers:{Accept:'application/json',...(options.headers||{})}});
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
      const envs=Object.values(render.environments||{});
      if(envs.some(x=>!x.ok)) return {kind:'bad',title:'Backend health needs attention',detail:'At least one configured Render environment is not responding successfully.'};
    }
    const neon=platform?.neon;
    if(neon?.configured&&neon.available===false) return {kind:'warn',title:'Database health could not be read',detail:'Neon is configured, but its project health request failed.'};
    return null;
  }
  function overallAttention(data){
    const signals=[deliveryAttention(data.delivery)];
    if(data.quality) signals.push(qualityAttention(data.quality));
    const infra=infrastructureAttention(data.platform);if(infra) signals.push(infra);
    const priority={bad:3,warn:2,unknown:1,good:0};
    return signals.sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  }

  async function loadGitHubProject(project,branchName){
    const branch=await jsonFetch(githubApi('/repos/'+project.repo+'/branches/'+encodeURIComponent(branchName)),{headers:{Accept:'application/vnd.github+json'}});
    const status=await jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+branch.commit.sha+'/status'),{headers:{Accept:'application/vnd.github+json'}});
    return deliveryHealth(branch,status);
  }
  async function loadStateQuality(root){return normalizeQuality(await jsonFetch('/api/project-health-state-quality?env='+pageEnvironment(root)));}
  async function loadPlatform(project){return await jsonFetch('/api/project-health-platform?project='+encodeURIComponent(project.id));}
  async function loadRunInfo(project){try{return await jsonFetch('/api/project-health-run?project='+encodeURIComponent(project.id));}catch(error){if(error.status===404)return null;throw error;}}

  async function loadProject(project,root){
    const data={project,delivery:null,staging:null,quality:null,platform:null,runInfo:null,errors:[]};
    try{data.delivery=await loadGitHubProject(project,project.branch);}catch(e){data.errors.push('Delivery: '+e.message);}
    if(project.stagingBranch){try{data.staging=await loadGitHubProject(project,project.stagingBranch);}catch(e){data.errors.push('Staging: '+e.message);}}
    if(project.quality==='state'){try{data.quality=await loadStateQuality(root);}catch(e){data.errors.push('Quality: '+e.message);}}
    try{data.platform=await loadPlatform(project);}catch(e){data.errors.push('Platform: '+e.message);}
    try{data.runInfo=await loadRunInfo(project);}catch(e){data.errors.push('Run controls: '+e.message);}
    return data;
  }

  function fmtDate(value){if(!value)return'Unknown';const d=new Date(value);return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function row(label,value){return '<div class="row"><span>'+esc(label)+'</span><span>'+esc(value)+'</span></div>';}
  function metric(value,label){return '<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
  function attentionMarkup(item){return '<div class="attention '+esc(item.kind||'')+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>';}

  function infraCardLabel(platform){
    const render=platform?.render;
    if(render?.configured){
      const envs=Object.values(render.environments||{});
      if(envs.some(x=>!x.ok)) return 'Backend needs attention';
      if(envs.length) return 'Backend healthy';
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
  function cardMarkup(data,active){
    const att=overallAttention(data),d=data.delivery;
    const quality=data.project.quality==='state'?(data.quality?qualityAttention(data.quality).title:'Quality unavailable'):'Project-specific checks next';
    return '<article class="project-card '+(active?'active':'')+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(att.kind)+'">'+esc(att.kind==='good'?'Healthy':att.kind==='bad'?'Needs attention':'Check')+'</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Latest commit</span><span class="signal-value">'+esc(shortSha(d?.sha))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.label||'Unavailable')+'</span></div>'+
      '<div class="signal"><span class="signal-label">Infrastructure</span><span class="signal-value">'+esc(infraCardLabel(data.platform))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Site analytics</span><span class="signal-value">'+esc(analyticsLabel(data.platform))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Product quality</span><span class="signal-value">'+esc(quality)+'</span></div>'+
      '</div></article>';
  }

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,platform=data.platform,run=data.runInfo;
    doc.getElementById('detailTitle').textContent=p.name;doc.getElementById('detailCopy').textContent=p.description;doc.getElementById('repoLink').href=repoUrl(p.repo);

    const notices=[deliveryAttention(d)];if(p.quality==='state')notices.push(qualityAttention(q));const infra=infrastructureAttention(platform);if(infra)notices.push(infra);
    if(platform?.analytics?.configured&&platform.analytics.available===false) notices.push({kind:'warn',title:'Site analytics unavailable',detail:'Vercel Web Analytics is configured but did not return usable counts.'});
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3><p class="panel-copy">Concrete signals first. No combined health score.</p><div class="rows">'+notices.map(attentionMarkup).join('')+'</div>';

    const prod=d?row('Production branch',d.branch)+row('Latest commit',shortSha(d.sha))+row('Vercel',d.vercel.label)+row('Commit time',fmtDate(d.updatedAt)):'<div class="empty">Production delivery data could not be loaded.</div>';
    const stage=s?'<div style="margin-top:12px">'+row('Staging branch',s.branch)+row('Staging commit',shortSha(s.sha))+row('Staging Vercel',s.vercel.label)+'</div>':'';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><p class="panel-copy">GitHub branch heads plus Vercel commit status.</p><div class="rows">'+prod+stage+'</div>';

    const r=platform?.render,n=platform?.neon;
    let infraHtml='';
    if(r?.configured){
      infraHtml+=Object.entries(r.environments||{}).map(([name,x])=>row('Render '+name,(x.ok?'Healthy':'Unavailable')+(x.build?' · '+shortSha(x.build):'')+(x.latency_ms!=null?' · '+x.latency_ms+'ms':''))).join('');
    }else infraHtml+=row('Render','Not used by this project');
    if(n?.configured&&n.available) infraHtml+=row('Neon',[(n.name||'Connected'),n.primary_branch?('branch '+n.primary_branch):null,n.branch_count!=null?(n.branch_count+' branches'):null].filter(Boolean).join(' · '));
    else if(n?.configured) infraHtml+=row('Neon','Configured, but unavailable');
    else infraHtml+=row('Neon','Not connected');
    doc.getElementById('infrastructurePanel').innerHTML='<h3>Infrastructure</h3><p class="panel-copy">Service/database health without exposing credentials or project content.</p><div class="rows">'+infraHtml+'</div>';

    const a=platform?.analytics;
    if(a?.available){
      doc.getElementById('analyticsPanel').innerHTML='<h3>Site analytics</h3><p class="panel-copy">Production Vercel Web Analytics, aggregate counts only.</p><div class="metrics">'+metric(a.visitors??'—','Visitors · 30d')+metric(a.pageviews??'—','Page views · 30d')+'</div><p class="footnote">No raw visitor identities, project content, prompts, or answers are copied into Project Health.</p>';
    }else{
      doc.getElementById('analyticsPanel').innerHTML='<h3>Site analytics</h3><p class="panel-copy">Traffic belongs alongside quality and reliability.</p><div class="empty">'+esc(a?.configured?'Web Analytics is configured but unavailable for this project.':'Add a server-side VERCEL_TOKEN to show production visitors and page views here.')+'</div>';
    }

    if(p.quality==='state'){
      const review=q?.review,ask=q?.ask;
      doc.getElementById('qualityPanel').innerHTML='<h3>Product quality</h3><p class="panel-copy">State uses its existing aggregate controlled-eval records. Project content is not copied here.</p><div class="metrics">'+metric(review?percent(review.interpretation_accuracy):'Not run','Review interpretation')+metric(ask?percent(ask.ask_grounding):'Not run','Ask grounding')+metric(ask?percent(ask.authority_accuracy):'Not run','Ask authority handling')+'</div><p class="footnote">Resolved Reviews · 30d: '+esc(q?.resolvedReviews??'Not loaded')+'. Material edits measure human correction effort, not automatically AI error.</p>';
    }else{
      doc.getElementById('qualityPanel').innerHTML='<h3>Product quality</h3><p class="panel-copy">The common shell is live; '+esc(p.name)+'-specific quality checks are intentionally not fabricated.</p><div class="empty">Next: connect the checks that actually define quality for this product.</div>';
    }

    const runButton=doc.getElementById('runChecksButton');
    if(run?.configured){runButton.disabled=false;runButton.textContent='Run health checks';runButton.title='';}
    else{runButton.disabled=true;runButton.textContent=run?'Finish run setup':'Checks not wired yet';runButton.title=run?'Configure server-side GitHub credentials, admin key, and an explicit cost estimate.':'No dashboard-run workflow is configured for this project yet.';}
    if(run){
      doc.getElementById('runPanel').innerHTML='<h3>Run health checks</h3><p class="panel-copy">Start the project\'s controlled checks without leaving this dashboard.</p><div class="run-summary"><div class="run-callout"><strong>'+esc(run.label)+'</strong><p>'+esc(run.note)+'</p></div>'+row('Controlled cases',run.minimum_controlled_cases!=null?('At least '+run.minimum_controlled_cases):'Not specified')+row('Estimated cost',run.estimated_cost||'Not configured')+row('Target branch',run.ref||'Unknown')+'</div><p class="footnote">The button stays disabled until a cost estimate is configured. Starting a run also requires an admin key and an explicit confirmation of paid model calls.</p>';
    }else{
      doc.getElementById('runPanel').innerHTML='<h3>Run health checks</h3><p class="panel-copy">This project does not have a dashboard-run workflow yet.</p><div class="empty">Its existing automated tests still contribute through GitHub delivery status. A dedicated health-check workflow can be added later.</div>';
    }
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

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),refresh=doc.getElementById('refreshButton'),runButton=doc.getElementById('runChecksButton');
    if(!cards||!status||!refresh||!runButton)return;
    let state=[],activeId=new URLSearchParams(root.location.search).get('project')||'state';

    function activeData(){return state.find(item=>item.project.id===activeId)||null;}
    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      cards.querySelectorAll('.project-card').forEach(card=>card.classList.toggle('active',card.dataset.project===activeId));
      const data=activeData();if(data)renderDetail(data,doc);
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
    }
    function wireCards(){cards.querySelectorAll('.project-card').forEach(card=>{card.addEventListener('click',()=>select(card.dataset.project));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(card.dataset.project);}});});}

    async function refreshAll(){
      refresh.disabled=true;status.textContent='Refreshing project health…';
      const results=await Promise.all(PROJECTS.map(project=>loadProject(project,root)));state=results;
      cards.innerHTML=results.map(item=>cardMarkup(item,item.project.id===activeId)).join('');wireCards();select(activeId);
      const errors=results.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      status.innerHTML=errors.length?'<strong>Some signals are unavailable.</strong> '+esc(errors.join(' · ')):'<strong>Health refreshed.</strong> Delivery, connected infrastructure, analytics, and project-specific quality signals are up to date.';
      refresh.disabled=false;
    }

    refresh.addEventListener('click',refreshAll);
    runButton.addEventListener('click',async()=>{const data=activeData();if(!data)return;runButton.disabled=true;try{await dispatchRun(data,root);}catch(_){}finally{renderDetail(data,doc);}});
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,normalizeQuality,qualityAttention,deliveryAttention,infrastructureAttention,overallAttention,percent,shortSha,loadProject,infraCardLabel,analyticsLabel,init};
});