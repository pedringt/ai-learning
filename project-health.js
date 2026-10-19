(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){root.PROJECT_HEALTH=api;if(root.document) api.init(root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Data and pure analysis live in project-health-model.js (#452).
  const PROJECT_HEALTH_MODEL=(typeof module==='object'&&module.exports&&typeof require==='function')?require('./project-health-model.js'):globalThis.PROJECT_HEALTH_MODEL;
  const {PROJECTS,esc,shortSha,commitTitle,repoUrl,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,githubLink,changeUrl,commitLabel,htmlRow,linkedRow,githubApi,vercelFromStatus,deliveryHealth,normalizeQuality,percent,highImpactText,modelDisplayName,qualityAttention,deliveryAttention,deliveryAttentionForData,infrastructureAttention,externalQualityAttention,pendingSet,coreStatusKnown,activityStillLoading,productOpenItems,allAttentionSignals,overallAttention,projectStatus,qualityNotMeasured,healthySummary,investigationUsesModel,actionNotes,RUN_COOLDOWN_MINUTES,runCooldownFor,cooldownStartFromRetryAfter,attentionItems,setupGaps,releaseReadiness,regressionSignal,recurringFailureSignal,operationalSignals,healthConsistencyIssues,releaseRiskChecklist,productionRuntime,operationalNextDecision,failureCheckCount,failureExplanation,qualityFailureClassSummary,activityTimelineItems,activityDayLabel,activityTimeRange,evalBehaviorBranch,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,investigationHistorySummary,makeRunner,STATE_EVAL_CONTRACT_UPDATED_AT,dateMs,fmtDate,relativeAge,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,freshnessMeta,qualitySnapshot,visitBaseline,healthStateLabel,meaningfulChanges,changedSinceVisit,trendText,activityReviewItems,row,metric,durationLabel,costLabel,attentionMarkup,neonConnectionDetail,infraCardLabel,analyticsConnectionValue,analyticsGapDetail,analyticsReceiving,analyticsSignal,analyticsLabel,projectQualityLabel,stageTag,loadingCardMarkup,cardMarkup,evalSuiteLabel,evalScore,evalTrend,stateEvalCard,stateScenarioCard,scenarioPassLabel,stateEvalHistory,mockSparkline,mockTrendValues,mockDelta,investigationResultHtml,evalRunComplete,externalQualityRunComplete,evalFailureImpact,previousEvalRun,progressText,quickProjectCheck,qualityInvestigation,projectHandoff}=PROJECT_HEALTH_MODEL;
  function pageEnvironment(root){
    const host=String(root?.location?.hostname||'');
    const params=new URLSearchParams(String(root?.location?.search||''));
    const explicit=String(params.get('env')||'').toLowerCase();
    if(explicit==='staging'||explicit==='production')return explicit;
    if(/(^|[-.])staging([-.]|$)/i.test(host))return 'staging';
    return 'production';
  }
  async function jsonFetch(url,options={}){
    const controller=new AbortController();const timeoutMs=Number(options.timeoutMs||10000);const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const fetchOptions={...options};delete fetchOptions.timeoutMs;
    try{
      const response=await fetch(url,{...fetchOptions,signal:controller.signal,headers:{Accept:'application/json',...(fetchOptions.headers||{})}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(payload?.detail||payload?.message||('Request failed: '+response.status));error.status=response.status;error.payload=payload;throw error;}
      return payload;
    }finally{clearTimeout(timer);}
  }

  // GitHub reads go through /api/project-health-github (one edge-cached, token-authenticated response per
  // project) instead of ~23 unauthenticated browser calls to api.github.com per page load (QA, Oct 10).
  function githubSummary(project,root,data){
    if(data?.githubSummary)return data.githubSummary;
    const promise=jsonFetch('/api/project-health-github?project='+encodeURIComponent(project.id)+'&env='+pageEnvironment(root),{timeoutMs:15000});
    if(data)data.githubSummary=promise;
    // A failed bundle is retried by the next refresh, not reused.
    promise.catch(()=>{if(data&&data.githubSummary===promise)data.githubSummary=null;});
    return promise;
  }
  function githubPart(part,label){
    if(part?.ok)return part.value;
    const error=new Error(part?.detail||(label+' is unavailable'));
    error.status=part?.status||502;
    throw error;
  }
  async function loadGitHubProject(project,root,data,which='delivery'){
    const summary=await githubSummary(project,root,data);
    return githubPart(summary?.[which],which==='staging'?'Staging delivery':'Delivery');
  }
  async function loadStateQuality(root){
    const url='/api/project-health-state-quality?env='+pageEnvironment(root);
    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{return normalizeQuality(await jsonFetch(url,{timeoutMs:12000}));}
      catch(error){
        lastError=error;
        if(attempt===0&&(error?.status===502||error?.status===503||error?.status===504||error?.name==='AbortError')){
          await new Promise(resolve=>setTimeout(resolve,650));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
  async function loadStateEvalBehavior(project,root,data){
    if(!(Array.isArray(project?.evalBehaviorPaths)&&project.evalBehaviorPaths.length))return null;
    const summary=await githubSummary(project,root,data);
    return githubPart(summary?.evalBehavior,'Quality behavior');
  }
  async function loadPlatformSignal(project,signal){return await jsonFetch('/api/project-health-platform?project='+encodeURIComponent(project.id)+'&signal='+encodeURIComponent(signal),{timeoutMs:6500});}
  async function loadRunInfo(project,root){if(project.noRunWorkflow)return null;try{return await jsonFetch('/api/project-health-run?project='+encodeURIComponent(project.id)+'&env='+pageEnvironment(root),{timeoutMs:5000});}catch(error){if(error.status===404)return null;throw error;}}
  // Authority Lab: one row per test suite; counts are null when the job log could not be read.
  function suiteRows(externalQ){
    return (externalQ?.suites||[]).map(item=>{
      const total=Number(item.tests),passed=Number(item.passed);
      const score=Number.isFinite(total)&&total>0&&Number.isFinite(passed)?passed/total:null;
      const passedRun=externalQ?.ci?.conclusion==='success';
      return {name:item.name,detail:item.detail,score:score??(passedRun?1:null),label:score!=null?(passed+' / '+total+' passing'):(passedRun?'Passed (count unavailable)':'Status unavailable')};
    });
  }
  async function loadExternalQuality(project){if(project.noQualitySource)return null;return await jsonFetch('/api/project-health-project-quality?project='+encodeURIComponent(project.id),{timeoutMs:7000});}
  async function loadActivity(project){const payload=await jsonFetch('/api/project-health-activity?project='+encodeURIComponent(project.id),{timeoutMs:14000});return payload?.activity||null;}
  async function loadOpenPullRequests(project,root,data){
    try{
      const summary=await githubSummary(project,root,data);
      const pulls=summary?.openPullRequests?.ok?summary.openPullRequests.value:[];
      return Array.isArray(pulls)?pulls:[];
    }catch(_){return[];}
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

  async function loadProject(project,root,onUpdate,seed){
    const data=emptyProjectData(project,seed);
    const run=makeRunner(data,onUpdate);
    // Deployment activity is the slowest call (a Vercel deployment list plus a bounded log read). It
    // runs alongside the core signals but does not hold back the project's core status.
    const activityTask=run('Activity',loadActivity(project),value=>{data.activity=value;});
    const core=[
      run('Delivery',loadGitHubProject(project,root,data),value=>{data.delivery=value;}),
      run('Run controls',loadRunInfo(project,root),value=>{data.runInfo=value;})
    ];
    if(project.id==='state'){
      core.push(run('Production backend',loadPlatformSignal(project,'production-render'),value=>{data.platform=mergePlatform(data.platform,value);}));
      core.push(run('Quality behavior',loadStateEvalBehavior(project,root,data),value=>{data.qualityBehaviorUpdatedAt=value?.updatedAt||null;if(data.quality)data.quality.behaviorUpdatedAt=data.qualityBehaviorUpdatedAt;}));
    }
    const qualityTask=project.quality==='state'
      ? run('Quality',loadStateQuality(root),value=>{data.quality=value;if(data.qualityBehaviorUpdatedAt)data.quality.behaviorUpdatedAt=data.qualityBehaviorUpdatedAt;})
      : run('Quality',loadExternalQuality(project),value=>{data.externalQuality=value;});
    data.qualityPromise=qualityTask;
    await Promise.all([...core,qualityTask]);
    data.fresh=true;
    data.checkedAt=new Date().toISOString();
    if(typeof onUpdate==='function')onUpdate(data);
    await activityTask;
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
      run('Open work',loadOpenPullRequests(project,root,data),value=>{data.openPullRequests=Array.isArray(value)?value:[];})
    ];
    if(project.id==='state'){
      tasks.push(
        run('Staging delivery',loadGitHubProject(project,root,data,'staging'),value=>{data.staging=value;}),
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

  function renderDetail(data,doc){
    const p=data.project,d=data.delivery,s=data.staging,q=data.quality,externalQ=data.externalQuality,platform=data.platform,run=data.runInfo,activity=data.activity;
    const pending=pendingSet(data);
    doc.getElementById('detailTitle').textContent=p.name;
    doc.getElementById('detailCopy').textContent=(p.stageLabel?p.stageLabel+' · ':'')+p.description;
    const detailIcon=doc.getElementById('detailIcon');
    if(detailIcon)detailIcon.textContent=(p.name||'?').slice(0,1).toUpperCase();
    const detailHeaderStatus=doc.getElementById('detailHeaderStatus');
    if(detailHeaderStatus){
      const status=projectStatus(data);
      detailHeaderStatus.className='status-pill '+esc(status.key);
      detailHeaderStatus.textContent=status.label;
    }
    // "Live site" and "GitHub" links beside the title; a project without one of the URLs omits that link.
    for(const [id,url] of [['detailLiveLink',p.links?.live||''],['detailRepoLink',p.repo?repoUrl(p.repo):'']]){
      const link=doc.getElementById(id);
      if(!link)continue;
      link.hidden=!url;
      if(url)link.href=url;else link.removeAttribute('href');
    }
    const qualityTab=doc.querySelector?.('[data-tab="ai-quality"]');
    if(qualityTab)qualityTab.textContent=p.qualityLabel||'Quality';
    const linksMenu=doc.getElementById('projectLinksMenu');
    if(linksMenu){
      // Live site and GitHub are beside the title now, so the menu keeps only the other destinations.
      const links=[
        ['Vercel',p.links?.vercel],
        ['Render · production',p.links?.renderProduction],
        ['Neon',p.links?.neon],
        [p.id==='state'?'Full AI eval details':p.id==='tastemake'?'Recommendation checks':p.id==='narc'?'Game checks':p.id==='authority-lab'?'Test runs':(p.qualityLabel||'Quality checks'),p.links?.quality]
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
      projectCheckButton.classList.add('primary');
    }
    const activeEvalRun=data.qualityRun;
    if(headerRunChecksButton){
      const canRun=!!run?.configured&&run?.can_run_here!==false;
      headerRunChecksButton.hidden=!canRun&&!activeEvalRun;
      const group=doc.getElementById('headerRunChecksGroup');
      if(group)group.hidden=headerRunChecksButton.hidden;
      if(!headerRunChecksButton.dataset.starting){
        headerRunChecksButton.disabled=!!activeEvalRun||!canRun;
        headerRunChecksButton.textContent=activeEvalRun?'Running…':(run?.button_label||'Run AI evals');
      }
      headerRunChecksButton.classList.remove('primary');
    }
    const notes=actionNotes(data);
    for(const [buttonId,noteId,note] of [['projectCheckButton','investigateNote',notes.investigate],['headerRunChecksButton','runChecksNote',notes.run]]){
      const button=doc.getElementById(buttonId),noteEl=doc.getElementById(noteId);
      if(!button||!noteEl)continue;
      noteEl.hidden=!note;
      // The short text breaks at " · " into one line per fact; the full sentence is what assistive tech reads.
      noteEl.innerHTML=note?'<span aria-hidden="true">'+note.short.split(' · ').map(line=>'<span class="action-note-line">'+esc(line)+'</span>').join('')+'</span><span class="visually-hidden">'+esc(note.full)+'</span>':'';
      if(note)button.setAttribute('aria-describedby',noteId);else button.removeAttribute('aria-describedby');
      button.title=buttonId==='headerRunChecksButton'&&activeEvalRun?'Quality checks are running. Open Quality for details.':(note?.full||'');
    }
    const evalRunBanner=doc.getElementById('evalRunBanner');
    if(evalRunBanner){
      evalRunBanner.hidden=!activeEvalRun;
      if(activeEvalRun){
        const stateLabel=p.id==='state'?'AI evals are running':'Quality checks are running';
        const delayed=activeEvalRun.state==='delayed';
        evalRunBanner.innerHTML='<div class="eval-global-status-copy"><div><strong>'+(delayed?'Still running · taking longer than usual':stateLabel)+'</strong><span>Started '+esc(fmtDate(activeEvalRun.startedAt))+' · Previous results remain visible until the new run finishes.</span></div></div><button class="button small" type="button" data-open-running-quality>'+(p.id==='state'?'View AI Evals':'View quality')+' →</button>';
      }else{
        evalRunBanner.innerHTML='';
      }
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
        :(()=>{const ok=healthySummary(data);return '<div class="attention '+(ok.qualityNotMeasured?'unknown':'good')+'" style="margin-top:12px"><strong>'+esc(ok.rowTitle)+'</strong><p>'+esc(ok.qualityNotMeasured?ok.headline:ok.rowDetail)+'</p></div>';})());

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
    const operational=operationalSignals(data);
    const productNotes=Array.isArray(data.productNotes)?data.productNotes:[];
    doc.getElementById('decisionSupportPanel').innerHTML=
      '<div class="panel-title-row"><div><h3>Decision support</h3><p class="panel-copy">Release risk, regressions, blind spots, and the human decisions behind changes.</p></div><button class="button small" type="button" data-add-product-note>Add decision / change</button></div>'+
      '<div class="decision-support-grid" style="margin-top:12px">'+
        '<div class="decision-support-block"><strong>Would I hesitate to ship?</strong><div class="risk-checklist">'+riskItems.map(item=>'<div class="risk-row"><span class="health-status '+esc(item.kind)+'">'+esc(item.status)+'</span><div><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div></div>').join('')+'</div></div>'+
        '<div class="decision-support-block"><strong>Recent regression</strong><div class="regression-card '+esc(regression.kind)+'"><span class="health-status '+esc(regression.kind)+'">'+esc(regression.kind==='warn'?'Watch':regression.kind==='good'?'Healthy':'Unknown')+'</span><strong>'+esc(regression.title)+'</strong><span>'+esc(regression.detail)+'</span></div>'+
          '<div class="monitoring-gaps"><strong>What we cannot confirm</strong>'+(monitoringGaps.length?'<div class="gap-list">'+monitoringGaps.slice(0,4).map(gap=>'<span><b>'+esc(gap.label)+':</b> '+esc(gap.detail)+'</span>').join('')+'</div>':'<span class="healthy-note">No known monitoring gaps.</span>')+'</div>'+
          '<div class="monitoring-gaps"><strong>Operational signals</strong>'+(operational.length?'<div class="risk-checklist">'+operational.slice(0,5).map(item=>'<div class="risk-row"><span class="health-status '+esc(item.kind)+'">'+esc(item.status)+'</span><div><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div></div>').join('')+'</div>':'<span class="healthy-note">No additional operational signals for this project.</span>')+'</div></div>'+
      '</div>'+
      '<div class="decision-log"><div class="decision-log-head"><strong>Decision & change log</strong><span>Stored in this browser</span></div>'+
        (productNotes.length?'<div class="decision-log-list">'+productNotes.slice(0,5).map(note=>'<div class="decision-log-item"><span class="activity-type">'+esc(note.type==='change'?'Change':note.type==='experiment'?'Experiment':'Decision')+'</span><strong>'+esc(note.text)+'</strong><span>'+esc(fmtDate(note.createdAt))+'</span></div>').join('')+'</div>':'<div class="empty compact-empty">No product decisions or changes recorded yet.</div>')+
      '</div>';

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
      {label:p.qualityLabel||'Quality',kind:overviewQuality?.kind||'unknown',detail:overviewQuality?.title||(p.noQualitySource?'Not connected yet':'Quality status unavailable'),tab:'ai-quality',fresh:freshnessMeta(qualityTime,data.checkedAt,72)},
      {label:'Production',kind:runtimeStatus.kind,status:runtimeStatus.label,detail:runtimeStatus.detail,tab:'overview',section:'deliveryPanel',fresh:freshnessMeta(data.detailCheckedAt||d?.updatedAt||data.checkedAt,data.checkedAt,24)},
      {label:'Release pipeline',kind:overviewDelivery?.kind||'unknown',detail:overviewDelivery?.title||'Release status unavailable',tab:'overview',section:'deliveryPanel',fresh:freshnessMeta(d?.updatedAt,data.checkedAt,24)},
      ...(overviewInfra&&['bad','warn'].includes(overviewInfra.kind)?[{label:'Infrastructure',kind:overviewInfra.kind,detail:overviewInfra.title,tab:'overview',section:'systemsDetails',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,6)}]:[]),
      {label:'Site analytics',kind:pending.has('Analytics')?'unknown':aSummary?.available?'available':'unknown',status:aSummary?.available?'Data available':null,detail:pending.has('Analytics')?'Checking site analytics…':aSummary?.available?(analyticsSignal(aSummary).status+'. '+analyticsSignal(aSummary).detail):(aSummary?.configured?'Connected, but comparison data is not available yet':'Site analytics are not connected'),tab:'overview',section:aSummary?.available?'analyticsPanel':'systemsDetails',fresh:freshnessMeta(data.detailCheckedAt||data.checkedAt,data.checkedAt,24)}
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

    const overviewQualitySummaryPanel=doc.getElementById('overviewQualitySummaryPanel');
    if(overviewQualitySummaryPanel){
      const scorePct=value=>{
        const n=Number(value);
        return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n*1000)/10)):null;
      };
      const summaryCard=(title,score,note,kind,trend)=>{
        const pct=scorePct(score);
        return '<div class="mock-quality-card">'+
          '<div class="mock-quality-card-head"><h4>'+esc(title)+'</h4><span class="status-pill '+esc(kind||'unknown')+'">'+
            esc(kind==='good'?'Healthy':kind==='bad'?'Needs attention':kind==='warn'?'Watch':'Unknown')+
          '</span></div>'+
          '<div class="mock-quality-score">'+(pct==null?'—':esc(pct+'%'))+'</div>'+
          '<div class="mock-quality-note">'+esc(note||'No recorded result yet')+'</div>'+
          '<div class="mock-quality-bar '+esc(kind||'unknown')+'"><span style="width:'+(pct==null?0:pct)+'%"></span></div>'+
          (trend?'<div class="mock-quality-trend">'+esc(trend)+'</div>':'')+
        '</div>';
      };
      let cards='',summaryCopy='Project-specific quality evidence.';
      if(p.quality==='state'){
        const review=q?.review,ask=q?.ask;
        const reviewScore=review?.interpretation_accuracy??evalScore(review);
        const askScore=ask?.ask_grounding??evalScore(ask);
        const reviewKind=!review?'unknown':Number(review.high_severity_failures||0)>0?'bad':Number(reviewScore)<1?'warn':'good';
        const askKind=!ask?'unknown':Number(ask.high_severity_failures||0)>0?'bad':Number(askScore)<1?'warn':'good';
        cards=
          summaryCard('Update understanding',reviewScore,review?scenarioPassLabel(review,reviewScore):'No recorded run',reviewKind,evalTrend(q?.recent,'review_interpretation'))+
          summaryCard('Answer quality',askScore,ask?scenarioPassLabel(ask,askScore):'No recorded run',askKind,evalTrend(q?.recent,'ask_quality'));
        summaryCopy='Controlled evals for how State understands updates and answers from evidence.';
      }else if(p.id==='tastemake'&&externalQ){
        const endpoint=externalQ.endpoint||{};
        const rp=Number(endpoint.rule_checks?.passed),rt=Number(endpoint.rule_checks?.total);
        const cp=Number(endpoint.validator_self_test?.caught),ct=Number(endpoint.validator_self_test?.total);
        const ruleScore=rt?rp/rt:null,catchScore=ct?cp/ct:null;
        cards=
          summaryCard('Recommendation rules',ruleScore,rt?(rp+' / '+rt+' passed'):'No recorded result',rt&&rp===rt?'good':'warn','')+
          summaryCard('Bad outputs caught',catchScore,ct?(cp+' / '+ct+' caught'):'No recorded result',ct&&cp===ct?'good':'warn','');
        summaryCopy='Recommendation grounding, rule compliance, and validator protection.';
      }else if(p.id==='authority-lab'&&externalQ){
        cards=suiteRows(externalQ).map(row=>summaryCard(row.name,row.score,row.label,row.score===1?'good':row.score==null?'unknown':'warn','')).join('');
        summaryCopy='The app and agent test suites on main (Node 22 and 24).';
      }else if(p.id==='narc'&&externalQ){
        const green=!!externalQ.recorded?.recorded_all_suites_green;
        const pendingPlaytest=!!externalQ.recorded?.full_playtest_pending;
        cards=
          summaryCard('Automated game checks',green?1:null,green?'3 / 3 suites passing':'Status unavailable',green?'good':'unknown','')+
          summaryCard('Human first-run playtest',pendingPlaytest?0:null,pendingPlaytest?'Still needed':'Recorded',pendingPlaytest?'warn':'good','');
        summaryCopy='Automated branch checks plus the human first-run playtest gate.';
      }else if(p.noQualitySource){
        cards=summaryCard('Quality checks',null,'Not connected yet','unknown','');
        summaryCopy='This project has no automated checks the dashboard can read yet.';
      }else{
        cards=summaryCard(p.qualityLabel||'Product quality',null,'Quality summary is not available yet','unknown','');
      }
      overviewQualitySummaryPanel.innerHTML=
        '<div class="mock-quality-head"><div><h3>Quality & evaluation</h3><p>'+esc(summaryCopy)+'</p></div>'+
        '<button class="button small" type="button" data-tab-target="ai-quality">View full quality details</button></div>'+
        '<div class="mock-quality-grid">'+cards+'</div>';
    }

    const overviewInvestigationPanel=doc.getElementById('overviewInvestigationPanel');
    if(overviewInvestigationPanel){
      const current=overallAttention(data);
      const failureDetails=p.quality==='state'?qualityFailureClassSummary(q).details||[]:[];
      const liveFailure=activityReviewItems(data).find(item=>!item.resolved);
      const failedItems=[];
      if(liveFailure)failedItems.push(liveFailure.title);
      failureDetails.slice(0,2).forEach(item=>failedItems.push(item.title||item.scenario_id||'Quality scenario needs review'));
      const nextLook=operationalNextDecision(data);
      const latestHistory=Array.isArray(data.investigationHistory)?data.investigationHistory[0]:null;
      overviewInvestigationPanel.innerHTML=
        '<div class="panel-title-row"><div><h3>Latest investigation</h3><p class="panel-copy">'+
          esc(latestHistory?('Last recorded '+relativeAge(latestHistory.observedAt)):'Current diagnostic view from loaded evidence')+
        '</p></div><button class="button small" type="button" data-open-investigation>Open investigation</button></div>'+
        '<div class="mock-investigation-grid">'+
          '<div class="mock-investigation-block"><strong>Current assessment</strong><p>'+esc(current.title)+'. '+esc(current.detail||'')+'</p></div>'+
          '<div class="mock-investigation-block"><strong>What failed</strong>'+
            (failedItems.length?'<ul>'+failedItems.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'<p>No specific current failure is recorded.</p>')+
          '</div>'+
          '<div class="mock-investigation-block"><strong>Recommended next look</strong><p>'+esc(nextLook)+'</p></div>'+
        '</div>';
    }

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
                '<div class="quality-actions"><button class="button small primary" type="button" data-investigate-quality data-failure-id="'+esc(detail.scenario_id||'')+'">Investigate failure</button><a class="button small" href="'+esc(p.links.quality)+'?failure='+encodeURIComponent(detail.scenario_id||'')+'" target="_blank" rel="noopener noreferrer">View scenario ↗</a></div>'+
              '</div>'
            ).join('')+'</div>'
          :'';
        const activeEvalRun=data.qualityRun;
        const evalStateClass=activeEvalRun?'running':staleResults?'warn':failureSummary.count?'bad':'healthy';
        const statusTitle=activeEvalRun
          ?(activeEvalRun.state==='delayed'?'AI eval run is taking longer than expected':'AI evals are running')
          :(staleResults
            ?'AI evals need to be rerun'
            :(failureSummary.count?'AI evals need review':'AI evals are healthy'));
        const statusDetail=activeEvalRun
          ?'Started '+esc(fmtDate(activeEvalRun.startedAt))+' · Previous results stay visible below until this run finishes.'
          :(staleResults
            ?(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+'Previous run needs a rerun before these scores are treated as current.'
            :(latestDate?'Last checked '+esc(fmtDate(latestDate))+' · ':'')+esc(total||'—')+' scenarios · '+(failureSummary.count
              ?failureSummary.count+' high-impact failure'+(failureSummary.count===1?'':'s')
              :'no high-impact failures'));
        const statusAction=(!activeEvalRun&&!staleResults&&failureSummary.count)
          ?'<button class="button small eval-overview-action" type="button" data-jump-quality-failures>Review failure'+(failureSummary.count===1?'':'s')+'</button>'
          :'';
        qualityHtml='<h3>Product quality · AI evals</h3>'+
          '<div class="eval-overview '+evalStateClass+'" '+(activeEvalRun?'role="status"':'')+'><div><strong>'+statusTitle+'</strong><span>'+statusDetail+'</span>'+statusAction+'</div></div>'+
          (staleResults
            ?'<div class="run-callout stale-quality-summary"><strong>Previous results need a rerun</strong><p>'+esc(stateEvalStaleReason(q))+' Run the evals again before treating these scores as current.</p></div>'
            :failureSummary.count
              ?'<div class="run-callout quality-failure-summary" id="qualityFailures"><strong>Failures requiring review</strong>'+failureDetailHtml+'</div><div class="eval-grid">'+cards.join('')+'</div>'
              :'<div class="eval-grid">'+cards.join('')+'</div>')+stateEvalHistory(q);
      }
      qualityHtml+='<p class="footnote"><a href="'+esc(p.links.quality)+'" target="_blank" rel="noopener noreferrer">View full scenario catalog ↗</a></p>';
      if(pending.has('Run controls')&&!run){
        qualityHtml+='<div class="eval-actions"><span class="footnote">Checking run availability…</span></div>';
      }else if(run?.configured&&run?.can_run_here!==false&&!activeEvalRun){
        qualityHtml+='<div class="eval-actions"><button class="button small primary" type="button" data-run-checks="all">Run all AI evals</button></div>'+
          '<div class="eval-suite-actions"><strong>Run a specific eval suite</strong><p>State has two controlled eval areas. Rerun one when you are checking a targeted change.</p><div class="suite-action-grid">'+
          '<button class="button small suite-action" type="button" data-run-checks="review"><span class="suite-action-copy"><strong>Update understanding</strong><span>How State interprets new evidence and proposed truth changes.</span></span><span class="suite-action-run">Run →</span></button>'+
          '<button class="button small suite-action" type="button" data-run-checks="ask"><span class="suite-action-copy"><strong>Answer quality</strong><span>Grounding, uncertainty, and decision authority in answers.</span></span><span class="suite-action-run">Run →</span></button>'+
          '</div></div>'+
          '<p class="footnote">Estimated model cost: '+esc(run.estimated_cost||'not configured')+'. Runs are limited to one every '+RUN_COOLDOWN_MINUTES+' minutes, and you confirm before any paid run starts.</p>';
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
        stateEvalCard('Baseline comparison',(base.valid_fixture_outputs?.passed??'—')+'/'+(base.valid_fixture_outputs?.total??'—'),'Historical comparison only. Baseline misses do not create a current Project Health warning.','')+
        '</div>'+
        '<div class="eval-history"><h4>What these checks cover</h4><div class="run-summary">'+
        (externalQ.check_groups||[]).map(g=>'<div class="run-callout"><strong>'+esc(g.name)+'</strong><p>'+esc(g.detail)+'</p></div>').join('')+
        '<p class="footnote">'+esc(externalQ.caveat||'')+'</p></div></div>';
    }else if(p.id==='authority-lab'&&externalQ){
      const top=externalQualityAttention(externalQ),ci=externalQ.ci||{};
      qualityHtml='<h3>Product quality · Automated tests</h3>'+
        '<div class="eval-overview"><div><strong>'+esc(top?.title||'Test results loaded')+'</strong><span>Latest test run on main'+(ci.updated_at?' · '+esc(fmtDate(ci.updated_at)):'')+'</span></div></div>'+
        '<div class="eval-grid">'+suiteRows(externalQ).map(row=>stateEvalCard(row.name,row.label,row.detail,'')).join('')+'</div>'+
        '<p class="footnote">'+esc(externalQ.caveat||'')+(ci.html_url?' <a href="'+esc(ci.html_url)+'" target="_blank" rel="noopener noreferrer">Open the run ↗</a>':'')+'</p>';
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
    }else if(p.noQualitySource){
      qualityHtml='<h3>Product quality</h3><div class="empty" style="margin-top:12px">Not connected yet. This project has no automated checks the dashboard can read yet.</div>';
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
    applyRunCooldown(data,doc);

    // Detailed usage rendering is retained for compatibility; the visible analytics summary now lives on Overview.
    const a=platform?.analytics;
    const analyticsPanel=doc.getElementById('analyticsPanel');
    analyticsPanel.classList.remove('usage-hidden');
    const analyticsUrl=p.links?.vercel?(p.links.vercel.replace(/\/$/,'')+'/analytics'):null;
    if(pending.has('Analytics')){
      analyticsPanel.innerHTML='<div class="panel-title-row"><h3>Site analytics</h3></div><div class="empty" style="margin-top:12px">Loading site analytics…</div>';
    }else if(a?.available){
      const signal=analyticsSignal(a);
      analyticsPanel.innerHTML='<div class="panel-title-row"><h3>Site analytics</h3>'+(analyticsUrl?'<a class="site-analytics-link" href="'+esc(analyticsUrl)+'" target="_blank" rel="noopener noreferrer">Open analytics ↗</a>':'')+'</div><div class="attention '+esc(signal.kind)+'" style="margin-top:12px"><strong>'+esc(signal.status)+'</strong><p>'+esc(signal.detail)+'</p></div>';
    }else{
      const unavailable=a?.configured===false
        ?'Site analytics are not connected for this project.'
        :(a?.error||'Site analytics are temporarily unavailable.');
      analyticsPanel.innerHTML='<div class="panel-title-row"><h3>Site analytics</h3>'+(analyticsUrl?'<a class="site-analytics-link" href="'+esc(analyticsUrl)+'" target="_blank" rel="noopener noreferrer">Open analytics ↗</a>':'')+'</div><div class="empty" style="margin-top:12px">'+esc(unavailable)+'</div>';
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
    doc.getElementById('overviewActivityPanel').innerHTML='<div class="panel-title-row"><h3>Recent activity</h3><button class="button small" type="button" data-tab-target="releases">View timeline</button></div><div style="margin-top:12px">'+overviewActivity+'</div>';

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
    if(evalRunBanner)evalRunBanner.addEventListener('click',event=>{
      if(!event.target.closest?.('[data-open-running-quality]'))return;
      setActiveTab('ai-quality');
      renderNow();
      root.scrollTo?.({top:Math.max(0,(doc.getElementById('qualityPanel')?.getBoundingClientRect().top||0)+root.scrollY-24),behavior:'smooth'});
    });

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
      if(stagingEnv) infraCards.push({label:'Staging backend',status:stagingEnv.ok?'Healthy':'Unknown',detail:stagingEnv.ok?'Render':'Render · no recent successful response observed; production unaffected',url:null});
      else if(p.id==='state'&&pending.has('Staging backend')) infraCards.push({label:'Staging backend',status:'Checking…',detail:'Render',url:null});
    }else if(p.id==='state') infraCards.push({label:'Production backend',status:pending.has('Production backend')?'Checking…':'Unavailable',detail:'Render',url:p.links?.renderProduction});
    if(n?.configured&&n.available) infraCards.push({label:'Database',status:'Connected',detail:neonConnectionDetail(n),url:p.links?.neon});
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
      const firstSamples=Number(ai.response_speed?.first_response_sample_size||0);
      const speedScope=ai.response_speed?.scope||'AI calls';
      const costScope=ai.cost?.scope||'recorded AI calls';
      aiHtml='<h4 style="margin:18px 0 8px">AI operations · last '+esc(ai.period_days||30)+' days</h4>'+
        '<div class="metrics">'+
        metric(firstSamples?durationLabel(ai.response_speed?.first_response_p50_ms):'No calls yet','Typical time to first answer')+
        metric(samples?durationLabel(ai.response_speed?.p50_ms):'No calls yet','Typical complete answer')+
        metric(costLabel(ai.cost?.estimated_usd),'Estimated AI cost')+
        '</div>'+
        '<p class="footnote">Speed: '+esc(speedScope)+'. Cost: '+esc(costScope)+'. '+esc(ai.note||'Operational metadata only; no project or user content is included.')+'</p>';
    }else if(ai?.not_applicable){
      aiHtml='<p class="footnote"><strong>AI operations:</strong> Not applicable. '+esc(p.name)+' does not make runtime AI calls.</p>';
    }
    const gaps=setupGaps(data);
    doc.getElementById('connectionsPanel').innerHTML='<h3>Connections & coverage</h3>'+
      '<div class="rows" style="margin-top:12px">'+connections.map(item=>row(item.label,item.value)).join('')+'</div>'+
      aiHtml+
      (gaps.length?'<h4 style="margin:18px 0 8px">Coverage gaps</h4><div class="coverage-grid">'+gaps.map(item=>'<div class="coverage-item"><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div>').join('')+'</div>':'');
  }

  // Run cooldown (visual pass, Oct 11): while the run API would refuse a new run, the run buttons are disabled and say
  // when they are available. The run GET's last_run_started_at covers runs started anywhere (refreshed with the page);
  // a start from this browser is remembered per browser, and a 429 from the API also sets it.
  function runStartedKey(root,projectId){return 'project-health-run-started:'+pageEnvironment(root)+':'+String(projectId||'state');}
  function loadRunStartedAt(root,projectId){try{return root.localStorage?.getItem(runStartedKey(root,projectId))||null;}catch(_){return null;}}
  function recordRunStarted(root,data,startedAt){
    if(!data||!startedAt)return;
    data.runStartedAt=startedAt;
    try{root.localStorage?.setItem(runStartedKey(root,data.project.id),startedAt);}catch(_){}
  }
  // Refreshes rebuild the project objects, so the remembered start is read back from storage when missing.
  function runCooldownNow(root,data,now=Date.now()){
    if(data&&!data.runStartedAt)data.runStartedAt=loadRunStartedAt(root,data.project.id);
    return runCooldownFor(data,now);
  }
  function applyRunCooldown(data,doc,now=Date.now()){
    const run=data?.runInfo;
    const canRun=!!run?.configured&&run?.can_run_here!==false;
    const cooldown=runCooldownNow(doc.defaultView||globalThis,data,now);
    if(!canRun||data.qualityRun)return cooldown;
    const header=doc.getElementById('headerRunChecksButton');
    if(header&&!header.dataset.starting){
      header.disabled=cooldown.active;
      header.textContent=cooldown.active?cooldown.label:(run.button_label||'Run AI evals');
    }
    doc.querySelectorAll?.('#qualityPanel [data-run-checks]').forEach(button=>{
      if(button.dataset.starting)return;
      const target=button.querySelector('.suite-action-run')||button;
      if(!button.dataset.idleLabel)button.dataset.idleLabel=target.textContent;
      button.disabled=cooldown.active;
      target.textContent=cooldown.active?cooldown.label:button.dataset.idleLabel;
    });
    return cooldown;
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

  async function dispatchRun(data,root,suite='all'){
    const run=data.runInfo;if(!run?.configured||run?.can_run_here===false)return;
    const projectId=data.project.id;
    if(run.paid_model_calls){
      const labels={all:'all AI quality checks',review:'update-understanding checks',ask:'answer-quality checks'};
      const cases=suite==='all'?Math.max(16,Number(run.minimum_controlled_cases||8)):Number(run.minimum_controlled_cases||8);
      const message='Run '+(labels[suite]||labels.all)+'?\n\nAbout '+cases+' controlled scenarios will use paid model calls.\nEstimated cost: '+run.estimated_cost+'\n\nRuns are limited to one every '+RUN_COOLDOWN_MINUTES+' minutes. Results are recorded as aggregate quality data and may update what this page shows. Start the run?';
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
      const startedAt=new Date().toISOString();
      if(payload?.started)recordRunStarted(root,data,startedAt);
      return {
        ...payload,
        project:projectId,
        suite,
        startedAt,
        baselineReview:data.quality?.review?.created_at||null,
        baselineAsk:data.quality?.ask?.created_at||null,
        baselineUpdatedAt,
        state:'running'
      };
    }catch(error){
      if(error?.status===429)recordRunStarted(root,data,cooldownStartFromRetryAfter(error.payload?.retry_after_seconds));
      root.alert('Could not start the quality checks: '+error.message);
      throw error;
    }
  }

  async function init(root){
    const doc=root.document,cards=doc.getElementById('projectCards'),status=doc.getElementById('status'),reviewInbox=doc.getElementById('reviewInbox'),refresh=doc.getElementById('refreshButton'),qualityPanel=doc.getElementById('qualityPanel'),projectTabs=doc.getElementById('projectTabs'),projectDetail=doc.getElementById('projectDetail'),investigationDrawer=doc.getElementById('investigationDrawer'),investigationBackdrop=doc.getElementById('investigationBackdrop'),closeInvestigationDrawerButton=doc.getElementById('closeInvestigationDrawer'),drawerRunAgainButton=doc.getElementById('drawerRunAgainButton'),drawerCopyHandoffButton=doc.getElementById('drawerCopyHandoffButton'),productNoteDialog=doc.getElementById('productNoteDialog'),productNoteForm=doc.getElementById('productNoteForm'),productNoteType=doc.getElementById('productNoteType'),productNoteText=doc.getElementById('productNoteText');
    if(!cards||!status||!reviewInbox||!refresh||!qualityPanel)return;
    const cached=loadSnapshot(root);
    let state=PROJECTS.map(project=>hydrateProjectData(project,cached?.projects?.find(item=>item.projectId===project.id)));
    state.forEach(item=>{item.investigationHistory=loadInvestigationHistory(root,item.project.id);item.productNotes=loadProductNotes(root,item.project.id);});
    const initialParams=new URLSearchParams(root.location.search);
    let activeId=initialParams.get('project')||'state';
    const allowedTabs=new Set(['overview','ai-quality','releases','decision-support']);
    const legacyTabMap={activity:'releases',usage:'overview',investigation:'overview',technical:'decision-support'};
    const requestedTab=initialParams.get('tab');
    const initialTab=legacyTabMap[requestedTab]||requestedTab;
    let activeTab=allowedTabs.has(initialTab)?initialTab:'overview';
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
      // Use the same project data and select() path as the former card switcher.
      // Do not replace options on every async refresh: preserve native keyboard focus.
      const options=PROJECTS.map(project=>{
        const item=state.find(entry=>entry&&entry.project.id===project.id);
        const label=item?projectStatus(item).label:'Loading…';
        return '<option value="'+esc(project.id)+'">'+esc(project.name+' · '+label)+'</option>';
      }).join('');
      if(cards.innerHTML!==options)cards.innerHTML=options;
      cards.value=PROJECTS.some(project=>project.id===activeId)?activeId:'state';
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
    function renderGlobalOverview(){
      const global=doc.getElementById('phGlobalContent');
      if(!global)return;
      const live=state.filter(item=>item?.fresh);
      const pending=state.some(item=>!coreStatusKnown(item));
      const issues=live.flatMap(item=>attentionItems(item)
        .filter(signal=>signal.kind!=='good'&&signal.title!=='Still checking')
        .map(signal=>({...signal,project:item.project})))
        .sort((a,b)=>({bad:0,warn:1,unknown:2}[a.kind]??3)-({bad:0,warn:1,unknown:2}[b.kind]??3));
      const changes=state.flatMap(item=>meaningfulChanges(item).map(change=>({...change,project:item.project})))
        .sort((a,b)=>(dateMs(b.observedAt)||0)-(dateMs(a.observedAt)||0));
      const activity=state.flatMap(item=>activityTimelineItems(item).map(event=>({...event,project:item.project})))
        .sort((a,b)=>(dateMs(b.when)||0)-(dateMs(a.when)||0));
      const count=issues.length;
      const actionable=issues.filter(signal=>signal.kind==='bad'||signal.kind==='warn').length;
      const unchecked=count-actionable;
      const headline=actionable
        ?'<span>'+actionable+' '+(actionable===1?'thing':'things')+'</span> need'+(actionable===1?'s':'')+' attention.'
        :pending?'Checking what needs attention.'
        :unchecked?'Couldn\'t check every project signal.'
        :'Nothing needs immediate attention.';
      const attentionLabel=actionable?'Needs attention':unchecked?'Couldn\'t check':'Needs attention';
      const timeline=activity.slice(0,6).reverse().map(event=>
        '<button type="button" class="ph-timeline-event" data-ph-project="'+esc(event.project.id)+'" data-ph-tab="'+esc(event.category==='quality'?'ai-quality':'releases')+'" title="'+esc(event.project.name+' · '+event.title)+'"><i></i><span>'+esc(activityDayLabel(event.when))+'</span></button>'
      ).join('');
      const alerts=issues.slice(0,3).map(signal=>
        '<button class="ph-signal ph-'+esc(signal.kind)+'" type="button" data-ph-project="'+esc(signal.project.id)+'" data-ph-tab="'+esc(signal.category==='quality'?'ai-quality':signal.category==='delivery'?'releases':'overview')+'">'+
        '<span class="ph-kicker">'+esc(signal.category||'Project signal')+' · '+esc(signal.project.name)+'</span><strong>'+esc(signal.title)+'</strong><span class="ph-signal-copy">'+esc(signal.detail||'Review the current evidence for this signal.')+'</span><span class="ph-signal-status">'+esc(signal.kind==='bad'?'Needs attention':signal.kind==='warn'?'Investigate':'Couldn\'t check')+' →</span></button>'
      ).join('');
      const extra=issues.slice(3).map(signal=>'<button type="button" class="ph-extra" data-ph-project="'+esc(signal.project.id)+'" data-ph-tab="'+esc(signal.category==='quality'?'ai-quality':'overview')+'"><strong>'+esc(signal.project.name)+'</strong> · '+esc(signal.title)+' <span aria-hidden="true">→</span></button>').join('');
      const projects=PROJECTS.map(project=>{
        const data=state.find(item=>item.project.id===project.id),health=data?projectStatus(data):{key:'checking',label:'Checking'};
        const signal=data?overallAttention(data):{title:'Checking project health'};
        return '<button type="button" class="ph-product" data-ph-project="'+esc(project.id)+'" data-ph-tab="overview"><span class="ph-logo">'+esc(project.name[0])+'</span><span><strong>'+esc(project.name)+'</strong><small>'+esc(data?.fresh?signal.title:'Checking project health…')+'</small></span><span class="ph-state ph-'+esc(health.key)+'">'+esc(health.shortLabel||health.label)+'</span><span aria-hidden="true">›</span></button>';
      }).join('');
      const selected=activeData(),healthRows=doc.querySelector('#overviewHealthPanel .overview-health')?.innerHTML||'';
      const recent=activity.slice(0,5).map(event=>
        '<button type="button" class="ph-activity-row" data-ph-project="'+esc(event.project.id)+'" data-ph-tab="'+esc(event.category==='quality'?'ai-quality':'releases')+'"><time>'+esc(relativeAge(event.when))+'</time><i></i><span><strong>'+esc(event.title)+'</strong><small>'+esc(event.project.name+' · '+event.type)+'</small></span></button>'
      ).join('');
      const changed=changes.slice(0,5).map(change=>
        '<button type="button" class="ph-change-row" data-ph-project="'+esc(change.project.id)+'" data-ph-tab="'+esc(change.tab||'overview')+'"><time>'+esc(relativeAge(change.observedAt))+'</time><span><strong>'+esc(change.title)+'</strong><small>'+esc(change.project.name+' · '+change.detail)+'</small></span><span aria-hidden="true">›</span></button>'
      ).join('');
      const open=state.flatMap(item=>productOpenItems(item).map(entry=>({...entry,project:item.project}))).slice(0,4).map(entry=>
        '<button type="button" class="ph-open-row" data-ph-project="'+esc(entry.project.id)+'" data-ph-tab="ai-quality"><strong>'+esc(entry.title)+'</strong><small>'+esc(entry.project.name+' · '+(entry.owner||'Product'))+'</small></button>'
      ).join('');
      const html='<div class="ph-hero"><div><h2>'+headline+'</h2><p>What needs attention across your projects, based on the connected signals.</p></div><aside class="ph-timeline"><div class="ph-panel-heading"><h3>Recent changes</h3><span>Recorded activity</span></div>'+
        (timeline?'<div class="ph-timeline-track">'+timeline+'</div>':'<p class="ph-empty">No recent activity has loaded yet.</p>')+'</aside></div>'+
        '<section class="ph-attention"><div class="ph-attention-band"><span class="ph-alert-icon">!</span><h3>'+attentionLabel+'</h3><span>'+count+' '+(count===1?'item':'items')+'</span></div><div class="ph-attention-grid '+(count?'':'ph-no-alerts')+'">'+
        (alerts||'<p class="ph-empty">'+(pending?'Checking the latest signals…':'No current attention items in the connected signals.')+'</p>')+'</div>'+(extra?'<div class="ph-extra-list">'+extra+'</div>':'')+'</section>'+
        '<div class="ph-three"><section class="ph-panel"><div class="ph-panel-heading"><h3>Product focus</h3><span>Across your projects</span></div><div class="ph-products">'+projects+'</div></section>'+
        '<section class="ph-panel"><div class="ph-panel-heading"><h3>Overall health</h3><span>'+esc(selected?.project.name||'Selected project')+'</span></div><div class="ph-health">'+(healthRows||'<p class="ph-empty">Checking project health…</p>')+'</div></section>'+
        '<section class="ph-panel"><div class="ph-panel-heading"><h3>Recent activity</h3><span>Across your projects</span></div><div class="ph-activity">'+(recent||'<p class="ph-empty">No activity has loaded yet.</p>')+'</div></section></div>'+
        '<div class="ph-two"><section class="ph-panel"><div class="ph-panel-heading"><h3>Changed since your last visit</h3><span>Meaningful changes only</span></div><div>'+ (changed||'<p class="ph-empty">No meaningful changes recorded since your last visit.</p>')+'</div></section>'+
        '<section class="ph-panel"><div class="ph-panel-heading"><h3>Open items</h3><span>Product quality</span></div><div>'+(open||'<p class="ph-empty">No open product-quality items in the connected sources.</p>')+'</div></section></div>';
      if(global.innerHTML!==html)global.innerHTML=html;
      doc.getElementById('phDetailLabel').textContent=(selected?.project.name||'Project')+' details';
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
      const global=doc.getElementById('phGlobal');if(global)global.hidden=activeTab!=='overview';
      const detail=doc.getElementById('phSelectedDetail');
      if(detail)detail.classList.toggle('is-tab',activeTab!=='overview');
    }
    function setActiveTab(tab,updateUrl=true){
      const legacyTabMap={activity:'releases',usage:'overview',investigation:'overview',technical:'decision-support'};
      const normalized=legacyTabMap[tab]||tab;
      activeTab=allowedTabs.has(normalized)?normalized:'overview';
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
      renderCards();renderReviewInbox();
      const data=activeData();if(data)renderDetail(data,doc);
      renderGlobalOverview();
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

    cards.addEventListener('change',event=>select(event.target.value));

    doc.getElementById('phGlobalContent')?.addEventListener('click',event=>{
      const target=event.target.closest?.('[data-ph-project],[data-tab-target]');
      if(!target)return;
      if(target.dataset.phProject)select(target.dataset.phProject);
      if(target.dataset.phTab||target.dataset.tabTarget)setActiveTab(target.dataset.phTab||target.dataset.tabTarget);
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
      if(runCooldownNow(root,data).active)return;
      headerRunChecksButton.disabled=true;
      headerRunChecksButton.dataset.starting='1';
      headerRunChecksButton.textContent='Starting checks…';
      try{
        const started=await dispatchRun(data,root,'all');
        delete headerRunChecksButton.dataset.starting;
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
      }catch(_){delete headerRunChecksButton.dataset.starting;renderNow();}
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
        root.setTimeout(()=>doc.getElementById('qualityFailures')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
      }
    });


    const deliveryPanel=doc.getElementById('deliveryPanel');
    deliveryPanel.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-investigate]');
      if(!button)return;
      const data=activeData();if(!data)return;
      if(!root.confirm('Run the read-only investigation agent? It makes one small paid AI call, inspects only bounded evidence relevant to this failure, and cannot change code, configuration, or deployments.'))return;
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

      // A project counts as refreshed once its core status is known; one still waiting only on the
      // deployment-activity detail is named separately instead of holding the count at 0.
      const statusKnown=new Set(),finished=new Set();
      const pendingNames=()=>PROJECTS.filter(project=>!statusKnown.has(project.id)).map(project=>project.name);
      const activityNames=()=>PROJECTS.filter(project=>statusKnown.has(project.id)&&!finished.has(project.id)&&activityStillLoading(state.find(item=>item.project.id===project.id))).map(project=>project.name);
      const showProgress=()=>{if(finished.size<PROJECTS.length)status.textContent=progressText(statusKnown.size,PROJECTS.length,pendingNames(),activityNames());};
      showProgress();

      const jobs=PROJECTS.map(async project=>{
        const index=PROJECTS.findIndex(p=>p.id===project.id);
        const seed=state[index];
        const item=await loadProject(project,root,partial=>{
          if(generation!==refreshGeneration)return;
          state[index]=partial;
          if(coreStatusKnown(partial))statusKnown.add(project.id);
          scheduleRender();
          showProgress();
        },seed);
        if(generation!==refreshGeneration)return;
        state[index]=item;
        statusKnown.add(project.id);
        finished.add(project.id);
        scheduleRender();
        showProgress();
      });

      await Promise.all(jobs);
      if(generation!==refreshGeneration)return;
      state.forEach(reconcileInvestigationHistory);
      await ensureDetails(activeId);
      persist();
      status.innerHTML='<strong>Updated just now</strong>';
      refresh.disabled=false;
    }

    if(cached?.savedAt)status.innerHTML='<strong>Showing the last good snapshot.</strong> Last checked '+esc(fmtDate(cached.savedAt))+'. Refreshing current health…';
    renderNow();
    refresh.addEventListener('click',refreshAll);
    doc.addEventListener('click',event=>{
      if(event.target.closest?.('[data-retry-health]'))refreshAll();
    });
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
      const jumpToFailures=event.target.closest?.('[data-jump-quality-failures]');
      if(jumpToFailures){
        doc.getElementById('qualityFailures')?.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      const investigate=event.target.closest?.('[data-investigate-quality]');
      if(investigate){
        const data=activeData();if(!data)return;
        data.investigation=qualityInvestigation(data,investigate.dataset.failureId||null);
        recordInvestigation(data,data.investigation,investigate.dataset.failureId?'AI eval failure · '+investigate.dataset.failureId:'AI eval');
        renderNow();revealInvestigation();return;
      }
      const button=event.target.closest?.('[data-run-checks]');
      if(!button)return;
      const data=activeData();if(!data||data.qualityRun||runCooldownNow(root,data).active)return;
      // Suite cards change only their "Run →" label, so the title and description survive a cancelled confirm.
      const label=button.querySelector('.suite-action-run')||button;
      const originalLabel=label.textContent;
      button.disabled=true;
      button.dataset.starting='1';
      label.textContent='Starting…';
      try{
        const started=await dispatchRun(data,root,button.dataset.runChecks||'all');
        delete button.dataset.starting;
        if(started?.started){
          data.qualityRun=started;
          data.qualityRunCompletedAt=null;
          saveEvalRunState(root,started,data.project.id);
          setActiveTab('ai-quality');
          renderNow();
          pollEvalResults(data);
        }else{
          button.disabled=false;
          label.textContent=originalLabel;
        }
      }catch(_){delete button.dataset.starting;renderDetail(data,doc);}
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
    // Keep "Available in N min" current and re-enable the run buttons when the cooldown ends.
    root.setInterval?.(()=>{const data=activeData();if(data)applyRunCooldown(data,doc);},15000);
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

  return {PROJECTS,pageEnvironment,evalBehaviorBranch,vercelFromStatus,deliveryHealth,commitTitle,githubCommitUrl,pullRequestNumber,githubPullRequestUrl,changeUrl,normalizeQuality,qualityAttention,externalQualityAttention,deliveryAttention,deliveryAttentionForData,infrastructureAttention,allAttentionSignals,attentionItems,overallAttention,productOpenItems,projectStatus,setupGaps,releaseReadiness,regressionSignal,recurringFailureSignal,operationalSignals,releaseRiskChecklist,healthConsistencyIssues,productionRuntime,operationalNextDecision,qualityFailureClassSummary,failureCheckCount,failureExplanation,activityTimelineItems,projectQualityLabel,evalScore,percent,shortSha,pendingSet,coreStatusKnown,activityStillLoading,mergePlatform,emptyProjectData,safeExternalQualitySnapshot,serializeProjectData,hydrateProjectData,productNoteKey,loadProductNotes,saveProductNotes,loadProject,loadProjectDetails,infraCardLabel,neonConnectionDetail,analyticsConnectionValue,analyticsGapDetail,analyticsSignal,analyticsLabel,relativeAge,changedSinceVisit,meaningfulChanges,freshnessMeta,stateEvalContractStale,stateEvalBehaviorStale,stateEvalResultsStale,stateEvalStaleReason,trendText,activityReviewItems,progressText,quickProjectCheck,evalRunComplete,externalQualityRunComplete,qualityInvestigation,projectHandoff,init};
});
