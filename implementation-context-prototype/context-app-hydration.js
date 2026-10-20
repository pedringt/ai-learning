// context-app-hydration.js: moved verbatim out of context-app.js (Oct 2026, pure-move split; no
// behavior change). Loaded before context-app.js, which calls install() once, passing the
// closure values these functions used to read directly, and gets the functions back.
// Data loading: hydrateBackend() (fast attention path + bootstrap), project activation and
// the project list, open-Review refresh, and the thin context-backend-sync.js wrappers that
// mirror API payloads into `state`.
window.STATE_APP_HYDRATION=Object.freeze({install(ctx){
  const {API,BACKEND_SYNC,currentProjectStage,renderWorkspaceAttentionOnly,renderWorkspaceBelowGridOnly,root,state,workspaceAttentionHtml,closeDialog,updateNav,render}=ctx;
  /* ----------------------------------------------------------------------
     Hydration

     Loads the project on open. getAttention() is a deliberate fast path so the
     attention row can render before the rest of the project arrives.
     ------------------------------------------------------------------- */
  // toFront defaults to true for the live "I just submitted evidence and it
  // produced a Review" call sites, where showing the newest review first is
  // the right UX. Bulk hydration passes toFront:false -- appending in the
  // order the loop encounters them (the backend's own consequentiality
  // order, see list_reviews) -- because calling this per-review with the
  // default unshift inside a hydration loop silently reverses that order:
  // Workspace's attention list then disagreed with Ask about what mattered
  // most, since Ask fetches reviews fresh and never goes through this
  // reversal. Found via live QA 2026-09-07.
  function upsertBackendReview(review,{toFront=true}={}){ return BACKEND_SYNC.upsertBackendReview(state.data.reviews,review,{toFront}); }

  function replaceBackendOpenReviews(rawReviews){ state.data.reviews=BACKEND_SYNC.replaceBackendOpenReviews(state.data.reviews,rawReviews); }

  function mapApiReview(r, fallbackEvidence=''){ return BACKEND_SYNC.mapApiReview(r,fallbackEvidence); }

  // Ask queries the backend fresh on every question, but Open Items only
  // hydrates its local review list once (hydrateBackend()) -- so Ask can
  // surface a "Review ->" link for a Review Open Items hasn't loaded yet.
  // Found via live QA 2026-09-12: clicking that link did a local-only lookup
  // and silently no-op'd on a miss. Refresh the open-reviews list from the
  // backend (same prune-then-upsert shape hydrateBackend() itself uses) so a
  // miss gets one real chance to resolve before giving up.
  async function refreshOpenReviews(){
    if(!API)return;
    try{
      const rawReviews=(await API.getReviews('open')).items||[];
      replaceBackendOpenReviews(rawReviews);
      for(const raw of (rawReviews||[])){
        const note=state.data.notes.find(n=>n.evidenceId===raw.evidence_id);
        const mapped=mapApiReview(raw,raw.evidence_content||'');
        mapped.evidenceId=note?.id||`api-note-${raw.evidence_id}`;
        upsertBackendReview(mapped,{toFront:false});
      }
    }catch(error){
      console.warn('Could not refresh open reviews.',error);
    }
  }

  /* ----------------------------------------------------------------------
     Backend mapping and sync

     Translates API payloads into the client's shape and reconciles them with
     local state. Nothing here decides anything; it only mirrors the server.
     Moved into context-backend-sync.js (window.STATE_BACKEND_SYNC) 2026-09-12
     -- these are thin wrappers so every existing call site keeps working.
     ------------------------------------------------------------------- */
  function titleForStateItem(item){ return BACKEND_SYNC.titleForStateItem(item); }

  function formatBackendDate(value){ return BACKEND_SYNC.formatBackendDate(value); }
  function sourceLabel(source){ return BACKEND_SYNC.sourceLabel(source); }
  function historyType(item,topicName){ return BACKEND_SYNC.historyType(item,topicName); }
  function syncApiHistory(items){ state.data.history=BACKEND_SYNC.syncApiHistory(state.data.knowledge,state.data.notes,items); }
  function syncApiEvidence(items,openReviews,resolvedReviews){ state.data.notes=BACKEND_SYNC.syncApiEvidence(items,openReviews,resolvedReviews,state.data.notes); }

  function syncApiState(items){ BACKEND_SYNC.syncApiState(state.data.knowledge,items); }

  function questionTextKey(value){ return BACKEND_SYNC.questionTextKey(value); }

  function remapQuestionReferences(oldId,newId){ BACKEND_SYNC.remapQuestionReferences(state.data.reviews,oldId,newId); }

  function syncApiQuestions(items){ state.data.questions=BACKEND_SYNC.syncApiQuestions(state.data.questions,items,state.data.reviews); }


  async function createBackendQuestion(text){ return API.createQuestion(text,{origin:'Added from Workspace',blocking:false}); }

  async function submitEvidence(text, sourceType='manual_note'){
    return API.submitEvidence(text,sourceType);
  }

  async function retryEvidenceAnalysis(evidenceId){ return API.retryEvidenceAnalysis(evidenceId); }

  // state.md #114: fetched once and cached -- the set of selectable projects
  // essentially never changes within a session, so this never needs to be
  // part of every hydrateBackend() round trip.
  async function ensureProjectsList(){
    if(state.data.projects)return;
    try{
      const payload=await API.getProjects();
      state.data.projects=payload.items||[];
      updateNav();
    }catch(err){
      console.warn('Project list unavailable; the switcher will stay empty until a retry.',err);
    }
  }

  // Shared by switch-project and save-new-project: point the app at
  // projectId and fully re-hydrate. Callers own their own loading/error
  // dialogs since the copy differs ("switching" vs "creating").
  async function activateProject(projectId){
    const summary=await API.switchProject(projectId);
    API.setActiveProject?.(summary.id);
    window.STATE_ASK_UI?.resetForProjectSwitch(summary.id);
    state.data.project={...state.data.project,...summary};
    state.projectConfirmed=true;
    // Clear every locally-held record before re-hydrating -- never fall
    // back to context-data.js's static Northstar fixture here, or its
    // placeholder facts would flash on screen while the new project's
    // real data loads.
    state.data.knowledge=[];
    state.data.reviews=[];
    state.data.questions=[];
    state.data.notes=[];
    state.data.history=[];
    state.data.drafts=[];
    state.projectRules=[];
    state.view='overview';
    state.result=null;state.resultQuery='';state.expandedReviewId=null;state.openQuestionIds.clear();
    state.backendStatus={state:'loading',evidence:'loading',reviews:'loading',history:'loading',questions:'loading',rules:'loading',drafts:'loading'};
    state.isAnalyzing=false;
    render();
    // A minimum-visible floor keeps the loading dialog from flashing even
    // when both the switch and the hydration happen to be near-instant.
    const minVisible=new Promise(resolve=>setTimeout(resolve,450));
    await Promise.all([hydrateBackend(),minVisible]);
    closeDialog();
  }

  // Bug report (2026-09-15): rapidly creating/switching projects could let
  // an earlier, still-in-flight hydrateBackend() call for the PREVIOUS
  // project land after a newer call already started -- its stale response
  // would overwrite state.data.notes/reviews/etc. with the old project's
  // data (and even reset API's activeProjectId back via payload.project,
  // see below), which read as "notes from another project leaking into a
  // new one." Every hydrateBackend() call claims the next generation
  // number up front; a call whose generation is no longer the latest by
  // the time its response arrives discards that response instead of
  // applying it.
  async function hydrateBackend(){
    if(!API)return;
    const myGeneration=++state.hydrationGeneration;
    ensureProjectsList();
    const loadStatus=document.getElementById('appLoadStatus');
    if(loadStatus){loadStatus.textContent=`Opening ${state.data.project?.name||'the project'}…`;loadStatus.hidden=false;}
    state.workspaceAttentionStatus='loading';
    renderWorkspaceAttentionOnly();
    // Load the first action layer separately while the rest of the project opens.
    API.getAttention().then(payload=>{
      if(myGeneration!==state.hydrationGeneration)return;
      syncApiQuestions(payload.questions||[]);
      replaceBackendOpenReviews(payload.open_reviews||[]);
      for(const raw of (payload.open_reviews||[])){
        const note=state.data.notes.find(n=>n.evidenceId===raw.evidence_id);
        const mapped=mapApiReview(raw,raw.evidence_content||'');
        mapped.evidenceId=note?.id||`api-note-${raw.evidence_id}`;
        upsertBackendReview(mapped,{toFront:false});
      }
      state.backendStatus.reviews='loaded';
      state.backendStatus.questions='loaded';
      state.workspaceAttentionStatus='loaded';
      updateNav();
      renderWorkspaceAttentionOnly();
      // This is the only point where the fast path's real question/review
      // data reaches the page before the slower full bootstrap -- What
      // Changed/Current State need to redraw here too, or they keep
      // showing whatever they computed at initial mount.
      renderWorkspaceBelowGridOnly();
    }).catch(attentionError=>{
      console.warn('Fast attention load unavailable; full Workspace load will continue.',attentionError);
    });
    const keys=['state','evidence','open','resolved','history','questions','rules','drafts'];
    let byKey;
    try{
      const payload=await API.getBootstrap();
      if(myGeneration!==state.hydrationGeneration)return;
      // state.md #114: the active project's identity comes from the backend
      // on every hydration -- never assumed to still be Northstar. Falls
      // back to whatever state.data.project already held (the static
      // pre-hydration placeholder, or the last-known project) if this
      // particular payload didn't carry one.
      if(payload.project){state.data.project={...state.data.project,...payload.project};state.projectConfirmed=true;API.setActiveProject(payload.project.id);}
      const fulfilled=items=>({status:'fulfilled',value:{items:items||[]}});
      byKey={
        state:fulfilled(payload.state), evidence:fulfilled(payload.evidence),
        open:fulfilled(payload.open_reviews), resolved:fulfilled(payload.resolved_reviews),
        history:fulfilled(payload.history), questions:fulfilled(payload.questions),
        rules:fulfilled(payload.rules), drafts:fulfilled(payload.drafts)
      };
    }catch(bootstrapError){
      console.warn('Workspace bootstrap unavailable; retrying individual resources.',bootstrapError);
      const calls=[
        API.getState(), API.getEvidence(), API.getReviews('open'), API.getReviews('resolved'), API.getHistory(), API.getQuestions('open'), API.getRules(), API.getDrafts()
      ];
      const results=await Promise.allSettled(calls);
      if(myGeneration!==state.hydrationGeneration)return;
      byKey=Object.fromEntries(keys.map((key,i)=>[key,results[i]]));
    }
    const payloadOf=result=>result.status==='fulfilled'?result.value:{items:[]};
    state.backendStatus.state=byKey.state.status==='fulfilled'?'loaded':'error';
    state.backendStatus.evidence=byKey.evidence.status==='fulfilled'?'loaded':'error';
    state.backendStatus.reviews=(byKey.open.status==='fulfilled'&&byKey.resolved.status==='fulfilled')?'loaded':'error';
    state.backendStatus.history=byKey.history.status==='fulfilled'?'loaded':'error';
    state.backendStatus.questions=byKey.questions.status==='fulfilled'?'loaded':'error';
    state.backendStatus.rules=byKey.rules.status==='fulfilled'?'loaded':'error';
    state.backendStatus.drafts=byKey.drafts.status==='fulfilled'?'loaded':'error';

    if(byKey.state.status==='fulfilled') syncApiState(payloadOf(byKey.state).items||[]);
    if(byKey.rules.status==='fulfilled') state.projectRules=payloadOf(byKey.rules).items||[];
    if(byKey.drafts.status==='fulfilled') syncApiDrafts(payloadOf(byKey.drafts).items||[]);
    if(byKey.evidence.status==='fulfilled') syncApiEvidence(
      payloadOf(byKey.evidence).items||[],
      byKey.open.status==='fulfilled'?payloadOf(byKey.open).items||[]:null,
      byKey.resolved.status==='fulfilled'?payloadOf(byKey.resolved).items||[]:null
    );
    if(byKey.history.status==='fulfilled') syncApiHistory(payloadOf(byKey.history).items||[]);
    if(byKey.questions.status==='fulfilled'){
      syncApiQuestions(payloadOf(byKey.questions).items||[]);
    }else{
      state.data.questions=[];
    }
    if(byKey.open.status==='fulfilled'){
      const openItems=payloadOf(byKey.open).items||[];
      replaceBackendOpenReviews(openItems);
      for(const raw of openItems){
        const note=state.data.notes.find(n=>n.evidenceId===raw.evidence_id);
        const mapped=mapApiReview(raw,raw.evidence_content||''); mapped.evidenceId=note?.id||`api-note-${raw.evidence_id}`; upsertBackendReview(mapped,{toFront:false});
      }
    }else{
      state.data.reviews=state.data.reviews.filter(r=>!r.backendReviewId);
    }
    state.workspaceAttentionStatus=(byKey.open.status==='fulfilled'&&byKey.questions.status==='fulfilled')?'loaded':'error';
    for(const [key,result] of Object.entries(byKey)) if(result.status==='rejected') console.warn(`Backend ${key} unavailable:`,result.reason);
    if(loadStatus)loadStatus.hidden=true;
    updateNav();
    // Workspace owns a stable page title. Hydration updates project context
    // through the persistent switcher and may refresh the stage copy, but it
    // must not replace the Workspace heading with the active project name.
    if(state.view==='overview'){
      const stageEl=root.querySelector('.overview-heading .overview-stage');
      const wantStage=currentProjectStage();
      if(stageEl&&wantStage&&stageEl.textContent!==wantStage)stageEl.textContent=wantStage;
    }
    // Backend hydration must never replace the Ask DOM while a person is typing.
    // Workspace attention can update independently; other views may rerender normally.
    if(state.view==='overview'){
      if(!state.result){
        const updated=renderWorkspaceAttentionOnly();
        if(!updated){
          const askPanel=root.querySelector('.ask-panel');
          if(askPanel){
            const holder=document.createElement('div');
            holder.innerHTML=workspaceAttentionHtml();
            if(holder.firstElementChild) askPanel.insertAdjacentElement('afterend',holder.firstElementChild);
          }
        }
        // Same reasoning as the fast attention path above: the full
        // bootstrap is what actually populates state.data.history/knowledge
        // with real values, but nothing was re-drawing What
        // Changed/Current State to reflect them -- they stayed frozen at
        // whatever the very first synchronous render computed, on every
        // page load, not just during the fast-path race window.
        renderWorkspaceBelowGridOnly();
      }
      return;
    }
    render();
  }
  function syncApiDrafts(items){ state.data.notes=BACKEND_SYNC.syncApiDrafts(state.data.notes,items); }
  return {upsertBackendReview,replaceBackendOpenReviews,mapApiReview,refreshOpenReviews,formatBackendDate,sourceLabel,historyType,syncApiHistory,syncApiState,syncApiQuestions,createBackendQuestion,submitEvidence,retryEvidenceAnalysis,activateProject,hydrateBackend};
}});
