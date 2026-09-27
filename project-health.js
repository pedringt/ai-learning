(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){
    root.PROJECT_HEALTH=api;
    if(root.document) api.init(root);
  }
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const PROJECTS=[
    {
      id:'state',
      name:'State',
      description:'Maintained project truth with human-authorized Current State.',
      repo:'pedringt/ai-learning',
      branch:'main',
      stagingBranch:'staging',
      quality:'state'
    },
    {
      id:'tastemake',
      name:'Tastemake',
      description:'Taste-learning recommendations and preference discovery.',
      repo:'pedringt/tastemake',
      branch:'main'
    },
    {
      id:'narc',
      name:'NARC',
      description:'Workplace-surveillance satire game and branching system.',
      repo:'pedringt/narc',
      branch:'main'
    }
  ];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function shortSha(sha){return sha?String(sha).slice(0,7):'Unknown';}
  function repoUrl(repo){return 'https://github.com/'+repo;}
  function githubApi(path){return 'https://api.github.com'+path;}

  function pageEnvironment(root){
    const host=String(root?.location?.hostname||'');
    return /(^|[-.])staging([-.]|$)|-git-/i.test(host)?'staging':'production';
  }

  async function jsonFetch(url,options={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{...options,signal:controller.signal,headers:{'Accept':'application/vnd.github+json',...(options.headers||{})}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload?.message||('Request failed: '+response.status));
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
    const vercel=vercelFromStatus(status);
    const commit=branch?.commit||{};
    return {
      branch:branch?.name||'Unknown',
      sha:commit.sha||null,
      commitUrl:commit.sha?repoUrl(branch.repo||'')+'/commit/'+commit.sha:null,
      vercel,
      updatedAt:commit.commit?.committer?.date||commit.commit?.author?.date||null,
      message:commit.commit?.message||''
    };
  }

  function normalizeQuality(payload){
    const live=payload?.live_review_quality||{};
    const controlled=payload?.controlled_evals||{};
    const review=controlled.latest_review_interpretation||null;
    const ask=controlled.latest_ask_quality||null;
    return {
      resolvedReviews:Number(live.resolved_reviews||0),
      acceptedAsProposedRate:live.accepted_as_proposed_rate,
      materialEditRate:live.material_edit_rate,
      review,
      ask,
      recent:Array.isArray(controlled.recent)?controlled.recent:[]
    };
  }

  function percent(value){
    if(value==null||Number.isNaN(Number(value))) return 'Not measured';
    return (Math.round(Number(value)*1000)/10)+'%';
  }

  function qualityAttention(q){
    if(!q) return {kind:'unknown',title:'Quality not loaded',detail:'No project-specific quality data is available in this view yet.'};
    const runs=[q.review,q.ask].filter(Boolean);
    if(!runs.length) return {kind:'warn',title:'Run controlled checks',detail:'No Review or Ask quality run has been recorded yet.'};
    const severe=runs.reduce((sum,r)=>sum+Number(r.high_severity_failures||0),0);
    if(severe>0) return {kind:'bad',title:'AI quality needs attention',detail:severe+' high-severity controlled eval failure'+(severe===1?'':'s')+' in the latest State checks.'};
    const failed=runs.some(r=>Number(r.failed_cases||0)>0 || (r.overall_pass_rate!=null&&Number(r.overall_pass_rate)<1));
    if(failed) return {kind:'warn',title:'Review the latest quality failures',detail:'The latest controlled evals contain one or more failed cases.'};
    return {kind:'good',title:'Latest State quality checks look healthy',detail:'No high-severity failures were reported in the latest recorded Review and Ask runs.'};
  }

  function deliveryAttention(delivery){
    if(!delivery) return {kind:'warn',title:'Delivery status unavailable',detail:'GitHub or deployment status could not be loaded.'};
    if(delivery.vercel.kind==='bad') return {kind:'bad',title:'Deployment needs attention',detail:'GitHub reports a failed Vercel deployment for the latest commit.'};
    if(delivery.vercel.kind==='warn') return {kind:'warn',title:'Deployment is still running',detail:'The latest Vercel deployment has not finished yet.'};
    if(delivery.vercel.kind==='good') return {kind:'good',title:'Latest deployment looks healthy',detail:'GitHub reports successful Vercel status for the latest commit.'};
    return {kind:'warn',title:'Deployment status is not connected',detail:'The latest commit loaded, but no Vercel commit status was available.'};
  }

  function overallAttention(delivery,quality){
    const signals=[deliveryAttention(delivery)];
    if(quality) signals.push(qualityAttention(quality));
    const priority={bad:3,warn:2,unknown:1,good:0};
    return signals.sort((a,b)=>priority[b.kind]-priority[a.kind])[0];
  }

  async function loadGitHubProject(project,branchName){
    const branch=await jsonFetch(githubApi('/repos/'+project.repo+'/branches/'+encodeURIComponent(branchName)));
    branch.repo=project.repo;
    const status=await jsonFetch(githubApi('/repos/'+project.repo+'/commits/'+branch.commit.sha+'/status'));
    return deliveryHealth(branch,status);
  }

  async function loadStateQuality(root){
    const env=pageEnvironment(root);
    return normalizeQuality(await jsonFetch('/api/project-health-state-quality?env='+encodeURIComponent(env),{headers:{'Accept':'application/json'}}));
  }

  async function loadProject(project,root){
    const data={project,delivery:null,staging:null,quality:null,errors:[]};
    try{data.delivery=await loadGitHubProject(project,project.branch);}catch(error){data.errors.push('Delivery: '+error.message);}
    if(project.stagingBranch){
      try{data.staging=await loadGitHubProject(project,project.stagingBranch);}catch(error){data.errors.push('Staging: '+error.message);}
    }
    if(project.quality==='state'){
      try{data.quality=await loadStateQuality(root);}catch(error){data.errors.push('Quality: '+error.message);}
    }
    return data;
  }

  function fmtDate(value){
    if(!value) return 'Unknown';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }

  function cardMarkup(data,active){
    const att=overallAttention(data.delivery,data.quality);
    const d=data.delivery;
    const quality=data.project.quality==='state'
      ? (data.quality?qualityAttention(data.quality).title:'Quality unavailable')
      : 'Project-specific checks next';
    return '<article class="project-card '+(active?'active':'')+'" data-project="'+esc(data.project.id)+'" tabindex="0" role="button" aria-label="Open '+esc(data.project.name)+' health">'+
      '<div class="card-head"><div><h2>'+esc(data.project.name)+'</h2><p>'+esc(data.project.description)+'</p></div><span class="status-pill '+esc(att.kind)+'">'+esc(att.kind==='good'?'Healthy':att.kind==='bad'?'Needs attention':'Check')+'</span></div>'+
      '<div class="signal-list">'+
      '<div class="signal"><span class="signal-label">Latest commit</span><span class="signal-value">'+esc(shortSha(d?.sha))+'</span></div>'+
      '<div class="signal"><span class="signal-label">Delivery</span><span class="signal-value">'+esc(d?.vercel?.label||'Unavailable')+'</span></div>'+
      '<div class="signal"><span class="signal-label">Product quality</span><span class="signal-value">'+esc(quality)+'</span></div>'+
      '</div></article>';
  }

  function row(label,value){return '<div class="row"><span>'+esc(label)+'</span><span>'+esc(value)+'</span></div>';}
  function metric(value,label){return '<div class="metric"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality;
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=p.description;
    const repo=doc.getElementById('repoLink');repo.href=repoUrl(p.repo);

    const notices=[deliveryAttention(d)];
    if(p.quality==='state') notices.push(qualityAttention(q));
    const items=notices.map(item=>'<div class="attention '+(item.kind==='good'?'good':'')+'"><strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>').join('');
    doc.getElementById('attentionPanel').innerHTML='<h3>What needs attention?</h3><p class="panel-copy">Concrete signals first. No combined health score.</p><div class="rows">'+items+'</div>';

    const prodRows=d
      ? row('Production branch',d.branch)+row('Latest commit',shortSha(d.sha))+row('Vercel',d.vercel.label)+row('Commit time',fmtDate(d.updatedAt))
      : '<div class="empty">Production delivery data could not be loaded.</div>';
    const stagingRows=s
      ? '<div style="margin-top:12px">'+row('Staging branch',s.branch)+row('Staging commit',shortSha(s.sha))+row('Staging Vercel',s.vercel.label)+'</div>'
      : '';
    doc.getElementById('deliveryPanel').innerHTML='<h3>Delivery</h3><p class="panel-copy">GitHub branch heads plus Vercel commit status.</p><div class="rows">'+prodRows+stagingRows+'</div>';

    if(p.quality==='state'){
      const review=q?.review,ask=q?.ask;
      doc.getElementById('qualityPanel').innerHTML='<h3>Product quality</h3><p class="panel-copy">State uses its existing aggregate controlled-eval records. Project content is not copied here.</p>'+
        '<div class="metrics">'+metric(review?percent(review.interpretation_accuracy):'Not run','Review interpretation')+metric(ask?percent(ask.ask_grounding):'Not run','Ask grounding')+metric(ask?percent(ask.authority_accuracy):'Not run','Ask authority handling')+'</div>'+
        '<p class="footnote">Resolved Reviews · 30d: '+esc(q?.resolvedReviews??'Not loaded')+'. Material edits are human correction effort, not automatically AI error.</p>';
    }else{
      doc.getElementById('qualityPanel').innerHTML='<h3>Product quality</h3><p class="panel-copy">The common shell is live; '+esc(p.name)+'-specific quality checks are intentionally not fabricated.</p><div class="empty">Next: connect the checks that actually define quality for this product.</div>';
    }

    const next = p.id==='state'
      ? 'Next adapters: Render backend health, Neon database health, portfolio/site analytics, and a dashboard control that starts the existing controlled eval workflow.'
      : p.id==='tastemake'
        ? 'Next adapters: recommendation-quality evals, candidate-pool/data completeness checks, site/product analytics, and deployment history.'
        : 'Next adapters: narrative branch consistency, unreachable-state checks, playthrough smoke tests, site/product analytics, and deployment history.';
    doc.getElementById('comingPanel').innerHTML='<h3>Next connections</h3><p class="panel-copy">V1 keeps missing signals explicit instead of pretending they are healthy.</p><div class="empty">'+esc(next)+'</div>';
  }

  async function init(root){
    const doc=root.document;
    const cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),refresh=doc.getElementById('refreshButton');
    if(!cards||!status||!refresh) return;
    let state=[],activeId=new URLSearchParams(root.location.search).get('project')||'state';

    function select(id){
      activeId=PROJECTS.some(p=>p.id===id)?id:'state';
      cards.querySelectorAll('.project-card').forEach(card=>card.classList.toggle('active',card.dataset.project===activeId));
      const data=state.find(item=>item.project.id===activeId);
      if(data) renderDetail(data,doc);
      const url=new URL(root.location.href);url.searchParams.set('project',activeId);root.history.replaceState(null,'',url);
    }

    function wireCards(){
      cards.querySelectorAll('.project-card').forEach(card=>{
        card.addEventListener('click',()=>select(card.dataset.project));
        card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(card.dataset.project);}});
      });
    }

    async function refreshAll(){
      refresh.disabled=true;status.textContent='Refreshing project health…';
      const results=await Promise.all(PROJECTS.map(project=>loadProject(project,root)));
      state=results;
      cards.innerHTML=results.map(item=>cardMarkup(item,item.project.id===activeId)).join('');
      wireCards();select(activeId);
      const errors=results.flatMap(item=>item.errors.map(error=>item.project.name+': '+error));
      if(errors.length){
        status.innerHTML='<strong>Some signals are unavailable.</strong> '+esc(errors.join(' · '));
      }else{
        status.innerHTML='<strong>Health refreshed.</strong> Live GitHub/Vercel signals loaded for all three projects'+(results.find(x=>x.project.id==='state')?.quality?' and State quality data loaded.':'.');
      }
      refresh.disabled=false;
    }

    refresh.addEventListener('click',refreshAll);
    await refreshAll();
  }

  return {PROJECTS,pageEnvironment,vercelFromStatus,deliveryHealth,normalizeQuality,qualityAttention,deliveryAttention,overallAttention,percent,shortSha,loadProject,init};
});