Warning: truncated output (original token count: 35614)
Total output lines: 1804

(() => {
  const D = window.PROJECT_CONTEXT_DATA;
  const API = window.STATE_API;
  const ASK = window.STATE_ASK;
  const NOTES_VIEW = window.STATE_NOTES_VIEW;
  const OPEN_ITEMS_VIEW = window.STATE_OPEN_ITEMS_VIEW;
  const PROJECT_VIEW = window.STATE_PROJECT_VIEW;
  const BACKEND_SYNC = window.STATE_BACKEND_SYNC;
  const clone = x => JSON.parse(JSON.stringify(x));
  const initial = clone(D);
  const state = {
    data: clone(D), view:'overview', result:null, resultQuery:'', askInputDraft:'', projectMenuOpen:false, refinements:[], lastScenario:null,
    addedSample:false, pendingCreated:false, reviewBannerDismissed:false, dialogReturnFocus:null, expandedNotes:new Set(), noteComposerOpen:false, editingNoteId:null, dismissedNudges:new Set(), historyTopic:null, historyEvidenceId:null, historySearch:'', notesFilter:'all', notesDateFilter:'all', notesSearch:'', isAnalyzing:false, openQuestionsExpanded:false, expandedReviewId:null, openItemSections:{reviews:false,blockers:false,drafts:true,questions:null}, projectRules:[], workspaceAttentionStatus:'loading', backendStatus:{state:'loading',evidence:'loading',reviews:'loading',history:'loading',questions:'loading',rules:'loading',drafts:'loading'}, projectConfirmed:false, hydrationGeneration:0
  };

  const root = document.getElementById('viewRoot');
  const overlay = document.getElementById('overlay');
  const dialogBody = document.getElementById('dialogBody');
  // Modal must always start closed, independent of stale DOM/CSS state.
  overlay.hidden = true;
  dialogBody.innerHTML = '';
  document.body.classList.remove('modal-open');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  // state.md #114: the Workspace header's stage subtitle used to read
  // D.project.stage, a static pre-hydration placeholder that never updated
  // after switching projects. "Project stage" is matched by topic label
  // (same convention as context-project-view.js's projectOrientation()), not
  // a fixed id, so a different project's own stage fact works identically.
  function currentProjectStage(){
    const stage=state.data.knowledge.find(k=>k.state==='current'&&norm(k.title||'')==='project stage');
    return stage?.statement||'';
  }
  // No backendStatus.questions==='loaded' gate: the fast attention-only
  // hydration path (see hydrateBackend()) can populate real, backendManaged
  // question data well before the slower full bootstrap flips that status
  // flag. Gating on it made this return [] during that window even though
  // workspaceAttentionHtml() (which filters the same backendManaged data
  // directly) already showed the real count -- a real "Current State says
  // no open questions, Attention says 3 blocking" contradiction users could
  // actually see. backendManaged itself is the correct guard: it's false
  // until synced from a real API response, so pre-hydration this still
  // yields [] exactly as before.
  const openQuestions = () => API
    ? state.data.questions.filter(q => q.status === 'open' && q.backendManaged)
    : state.data.questions.filter(q => q.status === 'open');
  const pendingReviews = () => API
    ? (state.backendStatus.reviews==='loaded' ? state.data.reviews.filter(r => r.status === 'pending' && r.backendReviewId) : [])
    : state.data.reviews.filter(r => r.status === 'pending');
  const uiPendingReviews = () => pendingReviews();
  const securityUpdated = () => state.data.reviews.find(r => r.id==='r-security')?.status === 'update';
  const todayISO = () => { const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const todayLabel = () => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date());
  const isoValue = item => item?.dateISO || item?.createdISO || '';
  const sortDateAsc = (a,b) => isoValue(a).localeCompare(isoValue(b));
  const sortDateDesc = (a,b) => isoValue(b).localeCompare(isoValue(a));

  // #113: the Current State subnav's area links are generated from the
  // project's own current facts (PROJECT_VIEW.visibleAreas, the same list
  // that decides the page body's sections) rather than three area buttons
  // hardcoded in index.html -- a different project's areas appear here
  // without editing this file or its markup. Only the static "Overview"
  // jump button is kept in the HTML; area buttons are (re)built each time
  // and diffed by area id so an unrelated updateNav() call doesn't fight the
  // user mid-scroll (updateProjectSubnavActive still runs after this).
  function syncProjectSubnav(){
    const areas=state.backendStatus.state==='loaded'?PROJECT_VIEW.visibleAreas(state.data.knowledge):[];
    document.querySelectorAll('#projectSubnav, #mobileProjectSubnav').forEach(sub=>{
      const existingIds=[...sub.querySelectorAll('[data-project-area]')].map(b=>b.dataset.projectArea).join(',');
      if(existingIds===areas.map(a=>a.id).join(',')) return;
      sub.querySelectorAll('[data-project-area]').forEach(b=>b.remove());
      for(const area of areas){
        const btn=document.createElement('button');
        btn.dataset.projectJump=`project-${area.id}`;
        btn.dataset.projectArea=area.id;
        btn.textContent=area.name;
        sub.appendChild(btn);
      }
    });
  }

  // state.md #114: the project switcher's entries are generated from the
  // real project list (state.data.projects, fetched once via
  // ensureProjectsList()) instead of the four hardcoded/disabled buttons
  // index.html used to carry. Also keeps the switcher button's own label in
  // sync with whichever project is actually active.
  function syncProjectMenu(){
    const label=document.getElementById('projectSwitcher');
    const name=state.data.project?.name||'Project';
    const activeIdForLabel=state.data.project?.id||'';
    // Publish the project's id only once the server has confirmed it (#232). Until then
    // state.data.project is the seed fixture (Northstar), and other modules build their
    // X-State-Project-Id header from this attribute: sending the seed's id would write
    // to Northstar while this tab is about to open a different project. Left unset,
    // they omit the header and the server uses its own active project, which is the
    // one this tab is about to open. (Analytics already treats "unset" as unresolved.)
    const idConfirmed=state.projectConfirmed===true;
    if(label&&label.dataset&&(label.dataset.name!==name||(idConfirmed&&label.dataset.projectId!==activeIdForLabel))){
      label.dataset.name=name;
      // projectId lets other modules (Copy Context, Ask starters) read
      // which project is actually live from the DOM without importing
      // context-app.js's own module-scoped state -- see QA follow-up notes
      // in context-product-polish.js for why the static DATA.project fixture
      // couldn't be trusted for this.
      if(idConfirmed)label.dataset.projectId=activeIdForLabel;
      // Blank-project bug report (2026-09-15): context-settings.js's
      // full-page Settings view is a separate module with no access to
      // this closure's `state` -- it reads project identity off this same
      // dataset (see its rulePlaceholder()) rather than duplicating a
      // second source of truth, so lifecycle controls (Reset vs Delete)
      // there need the same seeded flag available here.
      if(idConfirmed)label.dataset.seeded=String(state.data.project?.seeded!==false);
      label.innerHTML=`${esc(name)} <span>⌄</span>`;
    }
    const menu=document.getElementById('projectMenu');
    if(!menu||!menu.dataset)return;
    const projects=state.data.projects||[];
    const activeId=state.data.project?.id;
    const signature=projects.map(p=>p.id).join(',')+'|'+activeId;
    if(menu.dataset.signature===signature)return;
    menu.dataset.signature=signature;
    menu.innerHTML=projects.map(p=>`<button data-action="switch-project" data-project-id="${esc(p.id)}"${p.id===activeId?' class="active"':''}>${esc(p.name)}${p.id===activeId?' <span>Current</span>':''}</button>`).join('')
      +`<button class="project-menu-new" data-action="new-project">+ New project</button>`;
  }

  function updateNav(){
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===state.view));
    const projectActive=state.view==='project-overview';
    const projectToggle=document.querySelector('.project-nav-toggle'); if(projectToggle) projectToggle.classList.toggle('active',projectActive);
    syncProjectSubnav();
    document.querySelectorAll('#projectSubnav, #mobileProjectSubnav').forEach(sub=>{sub.hidden=!projectActive;});
    const openItemsCount=uiPendingReviews().length+openQuestions().filter(q=>q.blocking).length;
    document.querySelectorAll('#openItemsActionCount, #mobileOpenItemsCount').forEach(actionCount=>{actionCount.textContent=openItemsCount;actionCount.hidden=!openItemsCount;actionCount.setAttribute('aria-label',`${openItemsCount} items need attention`);});
    syncProjectMenu();
    const pm=document.getElementById('projectMenu'), ps=document.getElementById('projectSwitcher'); if(pm)pm.hidden=!state.projectMenuOpen; if(ps)ps.setAttribute('aria-expanded',state.projectMenuOpen?'true':'false');
    // The sidebar scrolls (overflow-y:auto on desktop) which -- per the CSS
    // spec -- forces its horizontal overflow to clip too, so a menu
    // positioned relative to it (its old behavior) got its right edge cut
    // off rather than overlapping the main content. Fixed positioning,
    // anchored to the button's own on-screen rect, escapes that clipping.
    // QA follow-up (2026-09-14): raising z-index alone didn't fix the
    // follow-up overlap bug -- .app-sidebar is position:sticky, which
    // establishes its own stacking context, and a position:fixed
    // descendant's z-index is only compared against siblings *within* that
    // context, not the page at large, so it stayed trapped beneath
    // ordinary content elsewhere on the page no matter how high its
    // z-index went. Moving the element to be a direct child of <body> (the
    // same pattern the toast and dialog overlay already use) escapes every
    // ancestor stacking context, not just this one.
    if(pm&&typeof document.body?.appendChild==='function'&&pm.parentElement!==document.body)document.body.appendChild(pm);
    if(pm&&ps&&state.projectMenuOpen){
      const rect=ps.getBoundingClientRect();
      pm.style.position='fixed';
      pm.style.top=`${rect.bottom+6}px`;
      pm.style.left=`${rect.left}px`;
      pm.style.width=`${Math.max(rect.width,260)}px`;
    }
    document.querySelector('.mobile-primary-nav .nav-item.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function updateProjectSubnavActive(targetId){
    if(state.view!=='project-overview') return;
    const buttons=[...document.querySelectorAll('[data-project-jump]:not([hidden])')];
    const ids=buttons.map(btn=>btn.dataset.projectJump).filter(id=>document.getElementById(id));
    let activeId=targetId&&ids.includes(targetId)?targetId:null;
    if(!activeId&&ids.length){
      const threshold=120;
      activeId=ids.reduce((best,id)=>{
        const top=document.getElementById(id).getBoundingClientRect().top;
        const distance=Math.abs(top-threshold);
        return !best||distance<best.distance?{id,distance}:best;
      },null)?.id||ids[0];
    }
    buttons.forEach(btn=>{
      const active=btn.dataset.projectJump===activeId;
      btn.classList.toggle('active',active);
      if(active) btn.setAttribute('aria-current','location'); else btn.removeAttribute('aria-current');
    });
  }

  // 'settings' intentionally maps to a no-op: context-settings.js owns
  // #viewRoot's content for that view entirely through its own
  // load()/MutationObserver pair, decoupled from this render(). Without an
  // explicit no-op here, the `|| renderOverview` fallback below silently
  // overwrites Settings' content with Workspace's on *any* call to this
  // render() while state.view==='settings' -- including the one
  // hydrateBackend() fires when its async fetch resolves, which does not
  // itself check what view is active. That produces a real, reachable bug
  // independent of any Settings-specific flow: land on/navigate to
  // Settings while hydrateBackend's fetch is still in flight (guaranteed
  // right after a fresh page load, e.g. the Slack OAuth redirect lands
  // there) and its resolution can clobber Settings back to Workspace
  // content while the sidebar still shows Settings highlighted.
  function render(){ updateNav(); const views={overview:renderOverview,notes:renderNotes,'open-items':renderOpenItems,questions:renderOpenItems,review:renderOpenItems,history:renderHistory,'project-overview':renderProjectOverview,settings:()=>{}}; (views[state.view]||renderOverview)(); ASK?.activateWaitStates?.(root); }

  const VIEW_ANALYTICS_EVENTS={overview:'workspace_viewed','project-overview':'current_state_viewed','open-items':'open_items_viewed',questions:'open_items_viewed',review:'open_items_viewed',notes:'notes_viewed',history:'history_viewed',settings:'settings_viewed'};
  function navigateTo(view,{preserveHistoryTopic=false,preserveHistoryEvidence=false}={}){
    state.view=view;
    window.StateAnalytics?.track(VIEW_ANALYTICS_EVENTS[view]||'view_changed',{view});
    if(view==='history'){
      if(!preserveHistoryTopic)state.historyTopic=null;
      if(!preserveHistoryEvidence)state.historyEvidenceId=null;
    }else{state.historyTopic=null;state.historyEvidenceId=null;}
    // Navigation is not a new Ask session. Keep the current answer/query so a
    // user can inspect Project, Open Items, Notes, or History and return to the
    // same working Ask. Explicit New ask / reset actions own session cleanup.
    render();
    // Scroll synchronously, in the same tick as render() -- not a frame
    // later via requestAnimationFrame, as this used to do. Leaving a
    // scrolled-down Current State page (with its subnav open) shrinks the
    // page a lot; deferring the scroll reset let the browser paint one
    // frame of the new, shorter content at the old scroll offset first (a
    // visible snap), before the correction landed. The browser doesn't
    // paint until this function returns, so doing both in one synchronous
    // pass produces a single atomic visual update instead of two.
    // Tried scrolling to top BEFORE the content swap instead -- doesn't
    // work: CSS scroll anchoring compensates for the subsequent layout
    // shift and silently drags the scroll position back away from 0.
    window.scrollTo({top:0,behavior:'auto'});
  }

  function projectScrollTop(target){
    const el=document.getElementById(target);
    if(!el)return null;
    // Scroll to the Project document itself, not the browser/page origin.
    // Returning to window Y=0 reintroduces the portfolio chrome and causes the
    // visible geometry jump seen in deployed QA. Section headings no longer
    // use sticky positioning, so one absolute target is stable for the whole
    // animation.
    const offset=target==='project-top'?12:18;
    return Math.max(0,Math.round(window.scrollY+el.getBoundingClientRect().top-offset));
  }
  function scrollProjectTarget(target){
    const top=projectScrollTop(target);
    if(top===null)return;
    window.scrollTo({top,behavior:'smooth'});
  }


  // #113: "Project stage"/"Project outcome" are matched by topic label, not
  // a fixed id, so a different project's own universal facts are excluded
  // from area grouping the same way -- mirrors context-project-view.js's
  // isUniversalMeta (duplicated rather than shared: a two-line pure
  // predicate, same reasoning as this file's other small duplications of
  // that module's helpers).
  const projectUniversalTopics=new Set(['project stage','project outcome']);
  function isProjectUniversalMeta(k){ return projectUniversalTopics.has(norm(k.title||'')); }
  function currentKnowledge(area){ return state.data.knowledge.filter(k=>k.state==='current' && (!area || (!isProjectUniversalMeta(k)&&(k.projectArea||'general')===area))); }

  /* ----------------------------------------------------------------------
     Project view

     Grouping, wiki paragraphs, outline sections, and the page itself live in
     context-project-view.js (see the comment above the Notes wrappers for
     why); decorateProjectProvenance() below stays here since it patches the
     live DOM after render() rather than returning a string.
     ------------------------------------------------------------------- */

  // Reuses context-provenance.js's exposed trace-building and markup
  // functions rather than a second provenance system -- History already
  // shows "Why State treats this as current" for a focused fact, but an
  // unfamiliar user has no reason to know that's where it lives. Adds the
  // same disclosure directly on each maintained fact in Project instead.
  //
  // hasAcceptedProvenance() needs the same async bootstrap data
  // buildTrace() does, so this can't be decided synchronously inside
  // context-project-view.js's projectFact() at render time without delaying
  // the whole Project view
  // on a fetch just for this. Painting the outline immediately and
  // patching in a toggle per fact once that data resolves matches the
  // same paint-then-patch pattern already used elsewhere (e.g. Settings'
  // rules list) -- and a fact with no accepted provenance (e.g. seeded
  // baseline facts like stage/outcome) just never gets a toggle, per the
  // "skip silently, no empty state" requirement.
  let projectProvenanceDecorating=false;
  async function decorateProjectProvenance(){
    const PROV=window.STATE_PROVENANCE;
    if(!PROV?.loadProvenance||projectProvenanceDecorating||state.view!=='project-overview') return;
    projectProvenanceDecorating=true;
    try{
      const data=await PROV.loadProvenance();
      if(state.view!=='project-overview') return;
      root.querySelectorAll('.project-maintained-fact[data-state-id]').forEach(li=>{
        if(!li.isConnected||li.querySelector('.project-fact-provenance')) return;
        const trace=PROV.buildTrace(li.dataset.stateId,data);
        if(!PROV.hasAcceptedProvenance(trace)) return;
        const markup=PROV.traceMarkup(trace);
        if(!markup) return;
        const holder=document.createElement('div');
        holder.className='project-fact-provenance';
        holder.innerHTML=`<button type="button" class="text-button project-provenance-toggle" data-action="toggle-provenance" aria-expanded="false">Why this is current →</button><div class="project-provenance-body" hidden>${markup}</div>`;
        li.appendChild(holder);
      });
    }catch(error){console.warn('Could not load project provenance.',error);}
    finally{projectProvenanceDecorating=false;}
  }

  function renderProjectOverview(){
    root.innerHTML=PROJECT_VIEW.render({backendState:state.backendStatus.state,projectName:state.data.project.name,knowledge:state.data.knowledge,history:state.data.history,pendingFor});
    decorateProjectProvenance();
    requestAnimationFrame(()=>updateProjectSubnavActive());
  }
  let askStreamPaintQueued=false;
  let askStreamLastPaint=0;
  function paintStreamingAsk(){
    if(askStreamPaintQueued) return;
    askStreamPaintQueued=true;
    const paint=timestamp=>{
      if(timestamp-askStreamLastPaint<64){ requestAnimationFrame(paint); return; }
      askStreamPaintQueued=false;
      askStreamLastPaint=timestamp;
      if(!state.result?.liveAskStreaming) return;
      const target=root.querySelector('.answer-content');
      if(target && ASK?.renderStream) target.innerHTML=ASK.renderStream(state.result.liveAskStreamRaw||'',state.result.liveAskPreview||null);
      else renderOverview();
    };
    requestAnimationFrame(paint);
  }

  function liveAskLoadingHtml(){
    const preview=state.result?.liveAskPreview;
    const message=preview?.message || 'Finding relevant project context · checking Reviews and unresolved questions · shaping the useful parts.';
    const label=preview?.grounded ? 'Grounded context ready' : 'Building your briefing…';
    return `<div class="ask-live-loading${preview?.grounded?' has-grounded-preview':''}"><span class="ask-loading-mark" aria-hidden="true"></span><div><strong>${esc(label)}</strong><p>${esc(message)}</p><p class="ask-loading-note">Suggested prompts above answer instantly from what's already known -- this one runs a live check against the full project record.</p></div></div>`;
  }
  function workspaceAttentionHtml(){
    if(API && state.workspaceAttentionStatus==='loading'){
      return `<section class="workspace-attention is-loading" aria-busy="true"><div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>Opening action items…</h3></div></div></section>`;
    }
    if(API && state.workspaceAttentionStatus==='error'){
      return `<section class="workspace-attention is-clear"><div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>Attention items could not be loaded</h3><p>Ask still works; try Open Items again in a moment.</p></div><button class="text-button" data-action="retry-hydration">Try again →</button></div></section>`;
    }
    const reviews=API?state.data.reviews.filter(r=>r.status==='pending'&&r.backendReviewId):uiPendingReviews();
    const blockers=(API?state.data.questions.filter(q=>q.status==='open'&&q.backendManaged):openQuestions()).filter(q=>q.blocking);
    const items=[];
    reviews.slice(0,2).forEach(r=>items.push({kind:'review',id:r.id,label:'Review',title:r.summary||r.title,detail:r.whyConsequential||r.proposed||'New evidence may change Current State.'}));
    if(items.length<2) blockers.slice(0,2-items.length).forEach(q=>items.push({kind:'blocker',id:q.id,label:'Blocking question',title:q.text,detail:q.blocks?`Blocks ${q.blocks}`:'A concrete dependency is waiting on this answer.'}));
    const total=reviews.length+blockers.length;
    if(!items.length){
      return `<section class="workspace-attention is-clear"><div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>You're caught up</h3><p>Nothing currently needs a decision and no questions are blocking progress.</p></div><button class="text-button" data-view="open-items">Open Items →</button></div></section>`;
    }
    // Describe exactly what's rendered in `items` below, never the uncapped
    // reviews/blockers totals -- those can outnumber the 2 row slots, and a
    // breakdown claiming "3 blocking questions" while only 1 (or 0) blocker
    // row actually renders is the exact silent mismatch this guards against.
    const shownReviews=items.filter(i=>i.kind==='review').length;
    const shownBlockers=items.filter(i=>i.kind==='blocker').length;
    const hiddenCount=total-items.length;
    const breakdownParts=[];
    if(shownReviews) breakdownParts.push(`${shownReviews} review${shownReviews===1?'':'s'}`);
    if(shownBlockers) breakdownParts.push(`${shownBlockers} blocking question${shownBlockers===1?'':'s'}`);
    if(hiddenCount>0) breakdownParts.push(`+${hiddenCount} more in Open Items`);
    const rows=items.map(item=>`<button class="attention-item ${item.kind}" data-action="${item.kind==='review'?'open-specific-review':'go-open-question'}" ${item.kind==='review'?`data-review-id="${esc(item.id)}"`:`data-question-id="${esc(item.id)}"`}><span class="attention-item-copy"><span class="attention-kind">${esc(item.label)}</span><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></span><span class="attention-arrow" aria-hidden="true">→</span></button>`).join('');
    return `<section class="workspace-attention"><div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>${total===1?'1 item is waiting on you':`${total} items are waiting on you`}</h3><p class="attention-intro-text">${esc(breakdownParts.join(' · '))}</p></div><button class="text-button" data-view="open-items">Open Items →</button></div><div class="attention-list">${rows}</div></section>`;
  }
  // Answers "What actually changed?" -- up to 3 meaningful recent decisions,
  // led by the substance of the change (history's `after` text), not a
  // generic "X was updated" label. Not a second History feed: no
  // filtering/search here, just a link out. Rows have no trailing arrow --
  // the whole row is already the click target.
  function whatChangedHtml(){
    if(state.backendStatus.history!=='loaded'){
      return `<section class="workspace-recent"><div class="workspace-recent-head"><span class="eyebrow">What changed</span><button class="text-button" data-view="history">History →</button></div><p class="workspace-section-hint" role="status">${state.backendStatus.history==='error'?'Recent changes are unavailable.':'Loading recent changes…'}</p></section>`;
    }
    // 3, not matched 1:1 with Current State's 4-item cap: each entry here
    // carries an extra metadata line (topic · date) a fact-preview bullet
    // doesn't, so equal *count* isn't equal *height* -- confirmed against
    // real content, 3 rows here reads closest to 4 fact bullets (QA
    // follow-up, 2026-09-14, round 3).
    const entries=(state.data.history||[]).slice().sort(sortDateDesc).slice(0,3);
    // QA follow-up (2026-09-14): returning '' here for a project with no
    // History yet (e.g. Juniper, freshly seeded) made the whole "What
    // Changed" card vanish, leaving "Current State" alone stretched across
    // the row -- confirmed live, read as broken rather than "nothing here
    // yet." An explicit empty state keeps the two-card layout intact.
    if(!entries.length) return `<section class="workspace-recent"><div class="workspace-recent-head"><span class="eyebrow">What changed</span><button class="text-button" data-view="history">History →</button></div><p class="workspace-section-hint">No changes recorded yet.</p></section>`;
    const rows=entries.map(h=>{
      const date=h.date||formatBackendDate(h.changed_at);
      const topic=state.backendStatus.state==='loaded'&&h.knowledgeId?state.data.knowledge.find(k=>k.id===h.knowledgeId):null;
      const kicker=topic?`${topic.title} · ${date}`:date;
      const summary=h.after||h.type||historyType(h);
      const linkAttrs=h.knowledgeId?`data-action="view-topic-history" data-knowledge-id="${esc(h.knowledgeId)}"`:'data-view="history"';
      return `<button class="recent-update-row" ${linkAttrs}><strong>${esc(truncateText(summary,120))}</strong><span>${esc(kicker)}</span></button>`;
    }).join('');
    return `<section class="workspace-recent"><div class="workspace-recent-head"><span class="eyebrow">What changed</span><button class="text-button" data-view="history">History →</button></div><p class="workspace-section-hint">Recent decisions and updates to the project.</p><div class="recent-update-list">${rows}</div></section>`;
  }
  // Answers "Where does the project stand?" -- a Current State pulse across
  // three real dimensions: what's fresh (last change), how much is
  // established (decision count), and what's blocking (open questions).
  // Three genuine rows, not padding added to match What Changed's height.
  function currentStateHtml(){
    const stateLoaded=state.backendStatus.state==='loaded';
    const questionsLoaded=state.backendStatus.questions==='loaded';
    const historyLoaded=state.backendStatus.history==='loaded';
    if(state.backendStatus.state==='loading'||state.backendStatus.questions==='loading'||state.backendStatus.history==='loading'){
      return `<section class="workspace-status-card" aria-busy="true"><span class="eyebrow">Current State</span><div class="workspace-status-body"><div class="workspace-status-item"><strong class="workspace-status-value" role="status">Loading Current State…</strong><div class="workspace-status-row"><span>Opening the latest project understanding.</span></div></div></div></section>`;
    }
    const last=historyLoaded?(state.data.history||[]).slice().sort(sortDateDesc)[0]:null;
    const lastUpdated=last?(last.date||formatBackendDate(last.changed_at)):null;
    const lastTopic=stateLoaded&&last?.knowledgeId?state.data.knowledge.find(k=>k.id===last.knowledgeId):null;
    const lastLabel=lastTopic?.title||last?.type||'';
    // Current State holds facts, constraints, scope, and outcomes -- not
    // just "decisions" -- and an open Question is not necessarily blocking
    // or undecided, so this card's copy must not conflate the two. See
    // openQuestions()'s own note above and the Open Items badge (which
    // already separates blocking questions from every open one).
    const establishedCount=(state.data.knowledge||[]).filter(k=>k.state==='current').length;
    const openCount=openQuestions().length;
    const blockingCount=openQuestions().filter(q=>q.blocking).length;
    const openHeadline=!questionsLoaded?(state.backendStatus.questions==='error'?'Questions unavailable':'…'):openCount===0?'✓ No open questions':`${openCount} open question${openCount===1?'':'s'}`;
    const openSupportText=!questionsLoaded
      ? (state.backendStatus.questions==='error'?'Open questions could not be loaded.':'Loading open questions…')
      : openCount===0
      ? 'Nothing to track right now.'
      : blockingCount===0
        ? 'None are currently blocking progress.'
        : `${blockingCount} ${blockingCount===1?'is':'are'} currently blocking progress.`;
    // QA follow-up (2026-09-14): the previous bullet-list preview here
    // (checkmarked real facts, not just a count) was removed for showing
    // hardcoded Northstar text on every project -- its DOM-scraping data
    // source could never work. The card design itself was preferred over
    // the plain count that replaced it; this rebuilds it against
    // state.data.knowledge directly (already correctly project-scoped
    // everywhere else in this file), never falling back to fixed text.
    // isProjectUniversalMeta excludes "Project stage"/"Project outcome" --
    // headline framing, not itself an example of a specific fact.
    // QA follow-up (2026-09-14), round 2: the first rebuild created a bare
    // <ul class="state-fact-preview"> and left the original three status
    // rows visible, producing a tall stack of both layouts at once. Two
    // things were missed: (1) context-attention-alignment.js has its own
    // separate decorator (search "workspace-status-card" there) that only
    // activates when .state-fact-preview contains the exact structure the
    // original factPreview() built -- a <p> subtitle and a .text-button
    // Browse link inside it, which it relocates into the header (icon +
    // title + "Browse ->") -- a bare <ul> made it a no-op. (2) a CSS rule
    // (deleted along with the broken feature, restored in context-tool.css)
    // is what hides the three status-item rows once the preview exists, so
    // only the focused card -- header, subtitle, bullets -- shows.
    const previewFacts=stateLoaded?(state.data.knowledge||[]).filter(k=>k.state==='current'&&!isProjectUniversalMeta(k)).slice(0,4):[];
    // Truncated: this is a glance/preview (Browse -> reaches the full
    // text), not a place for a full-paragraph fact -- an untruncated real
    // statement can run several lines, growing this card unevenly against
    // its paired "What Changed" card (QA follow-up, 2026-09-14).
    const factPreviewHtml=previewFacts.length?`<div class="state-fact-preview"><p>What's treated as true.</p><ul>${previewFacts.map(k=>`<li>${esc(truncateText(k.statement||k.title,120))}</li>`).join('')}</ul><button class="text-button" data-view="project-overview">Browse Current State →</button></div>`:'';
    return `<section class="workspace-status-card"><span class="eyebrow">Current State</span><div class="workspace-status-body">
      <div class="workspace-status-item"><strong class="workspace-status-value">${!historyLoaded?(state.backendStatus.history==='error'?'Recent change unavailable':'…'):lastUpdated?`Updated ${esc(lastUpdated)}`:'Not yet established'}</strong><div class="workspace-status-row"><span>${!historyLoaded&&state.backendStatus.history!=='error'?'Loading most recent change…':lastLabel?esc(lastLabel):'Most recent change.'}</span></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value">${stateLoaded?`${establishedCount} established fact${establishedCount===1?'':'s'}`:state.backendStatus.state==='error'?'Established facts unavailable':'… established facts'}</strong><div class="workspace-status-row"><span>What the project currently treats as true.</span><button class="text-button" data-view="project-overview">Browse Current State →</button></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value${questionsLoaded&&openCount===0?' is-clear':''}">${esc(openHeadline)}</strong><div class="workspace-status-row"><span>${openSupportText}</span><button class="text-button" data-view="open-items">Open Items →</button></div></div>
      ${factPreviewHtml}
    </div></section>`;
  }
  function renderWorkspaceAttentionOnly(){
    if(state.view!=='overview' || state.result) return false;
    const current=root.querySelector('.workspace-attention');
    if(!current) return false;
    const holder=document.createElement('div');
    holder.innerHTML=workspaceAttentionHtml();
    const next=holder.firstElementChild;
    if(!next) return false;
    current.replaceWith(next);
    return true;
  }
  // Sibling to renderWorkspaceAttentionOnly(): the fast attention-only
  // hydration path populates real question/review data that What Changed
  // and Current State also read (openQuestions(), decision counts), so it
  // needs to redraw them too -- otherwise Current State keeps showing
  // whatever it computed at initial mount (often "no open questions")
  // until the slower full bootstrap eventually finishes.
  function renderWorkspaceBelowGridOnly(){
    if(state.view!=='overview' || state.result) return false;
    const current=root.querySelector('.workspace-below-grid');
    if(!current) return false;
    current.innerHTML=whatChangedHtml()+currentStateHtml();
    return true;
  }
  function liveRecordStatus(){
    // Reuses the same backend-confirmed filters as everywhere else
    // (pendingReviews/openQuestions), not a raw status lookup on
    // state.data.reviews/questions directly: once a review or question is
    // resolved, replaceBackendOpenReviews/syncApiQuestions-style hydration
    // prunes it from local state rather than flipping its status, so a
    // find-by-id lookup for a just-resolved record returns nothing. An "is
    // it still in the live open set" check handles that correctly either
    // way, where a status lookup with a "not found -> still pending"
    // fallback would get it backwards.
    const openReviewIds = new Set(pendingReviews().map(r=>r.id));
    const openQuestionIds = new Set(openQuestions().map(q=>q.id));
    return {
      isReviewOpen: id => openReviewIds.has(id),
      isQuestionOpen: id => openQuestionIds.has(id),
      openReviewIds: () => Array.from(openReviewIds),
      openQuestionIds: () => Array.from(openQuestionIds),
    };
  }
  function renderOverview(){
    // Needs your attention is the whole top of Workspace because it's the
    // only thing here that requires action; Recently Updated and Project
    // Status are catch-up/orientation, one step down in the hierarchy.
    // Ask no longer has an inline instance in Workspace -- it's a global
    // read-only utility reached from the floating Ask State control
    // (context-product-polish.js), not a Workspace feature.
    root.innerHTML = `<section class="overview pristine">
      <section class="overview-heading"><div class="overview-heading-row"><div><h2>Workspace</h2>${currentProjectStage()?`<p class="overview-stage">${esc(currentProjectStage())}</p>`:''}</div><button class="btn secondary overview-add" data-action="add-info">+ Add Evidence</button></div></section>
      ${workspaceAttentionHtml()}
      <div class="workspace-below-grid">
        ${whatChangedHtml()}
        ${currentStateHtml()}
      </div>
    </section>`;
    // Keep Workspace decorations in the same render task as their container.
    // Their observers remain as a fallback for other DOM changes, but should
    // not insert the banner or source strip in a later frame after navigation.
    ASK?.syncWorkspaceDecorations?.();
    window.STATE_WORKSPACE_SOURCES?.decorate?.();
    // The Ask loading and refinement nodes are emitted here, and renderOverview
    // is called directly on the Ask paths rather than always through render(),
    // so activate the rotating wait states at the point they are created.
    ASK?.activateWaitStates?.(root);
  }

  // state.md #115: this used to be a much larger legacy Ask layer (a
  // no-backend fallback pipeline predating the live Ask State drawer) full
  // of Northstar-specific canned answers, a vendor contact, percentages,
  // and Tier-1/support/security narrative templates -- none of it reachable
  // from any live UI (the drawer's runAsk(), in context-product-polish.js,
  // is the only Ask surface a user actually reaches, and it never falls
  // back into this module). Deleted rather than isolated: it was dead code,
  // not a real fallback path, so the smallest safe fix was removal.
  //
  // What's left is a genuinely live, project-neutral bridge: STATE_ASK_ROUTING
  // (below) lets runAsk() check whether a query is a generic inventory
  // request ("what needs review?", "what's blocking?", "what's still open?")
  // before calling the backend, and show a compact count-and-link card
  // instead of spending a live Ask call on a question Open Items already
  // answers authoritatively. detectAskIntent() only classifies the three
  // kinds that card actually uses; everything else falls through to null,
  // which means "let the real backend Ask answer this."
  function detectAskIntent(raw){
    const q=norm(raw); if(!q)return null;
    const has=(re)=>re.test(q);
    if(has(/\b(blocker|blockers|blocking|blocked|holding us up|hold us up|in the way|stop us|stopping us|prevent us|waiting on|needs attention|need attention|requires attention|needs my attention|require my attention)\b/)) return {kind:'blockers'};
    if(has(/\b(needs review|need review|pending review|awaiting review|review first|evidence.*incorporated|new evidence|open review|open reviews|pending reviews|should i approve|need to approve|needs? to be approved|what to approve|what should i approve|what do i need to approve)\b/)) return {kind:'pending'};
    if(has(/\b(open questions?|still open|unresolved|unknowns|dont know|do not know|havent figured|have not figured|what havent we figured out|still need to figure|assumptions.*validated|what isnt decided|what is not decided|needs answering|need answering|still needs answering|not been answered|hasnt been answered|has not been answered|remains unanswered|not yet answered)\b/)) return {kind:'open'};
    return null;
  }

  // A generic inventory question ("what needs review?", "list every open
  // review") is really a navigation request. Answering it with a synthesized
  // list risks Ask quietly drifting out of sync with Open Items, the
  // authoritative view for these counts. Route there instead: a count plus a
  // link, nothing Ask has to keep consistent on its own.
  function routingCardHtml({category,sentence,detail,count,view,anchor}){
    return `<div class="result-label">Open Items</div><div class="ask-routing-card"><div class="ask-routing-card-head"><span class="ask-routing-category">${esc(category)}</span><span class="ask-routing-co…15614 tokens truncated…iReviews.length?'pending':'no_review_needed'; n.reviewId=apiReviews[0]?.id||null; n.reviewIds=apiReviews.map(r=>r.id); n.evidenceId=result.evidence_id;
      apiReviews.forEach(r=>{r.evidenceId=n.id; upsertBackendReview(r);});
      state.reviewBannerDismissed=false; state.isAnalyzing=false; stopAnalysisClock(); updateNav();
      if(apiReviews.length) showDialog(`<span class="eyebrow">Evidence added</span><h2 id="dialogTitle">Evidence added</h2><p>${apiReviews.length===1?'1 Review needs your decision.':`${apiReviews.length} Reviews need your decisions.`}</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">View Review</button><button class="btn secondary" data-action="go-notes">Back to Notes</button></div>`);
      else showDialog(`<span class="eyebrow">Evidence added</span><h2 id="dialogTitle">Evidence added</h2><p>Added as Evidence. Current State did not need a Review.</p><div class="dialog-actions"><button class="btn primary" data-action="go-notes">Back to Notes</button></div>`);
    }catch(e){
      if(e?.evidenceId){
        n.evidenceId=e.evidenceId; n.status='failed';
        if(n.draftId){try{await API.deleteDraft(n.draftId);}catch(err){console.warn('Evidence saved but draft cleanup failed:',err);}
          n.draftId=null;n.backendDraft=false;n.backendManaged=true;
        }
      }
      await showAnalysisFailure(e,{draftMessage:e?.evidenceId?'The evidence is saved and can be retried.':'The note is still a draft.',safeContext:'Your note'});
    }
  }

  async function addQuestion(text){
    const clean=(text||'').trim(); if(!clean)return;
    if(state.data.questions.some(q=>q.status==='open'&&norm(q.text)===norm(clean)))return;
    try{
      const q=await createBackendQuestion(clean);
      state.data.questions.push({id:q.id,text:q.text,topics:[],status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin,created:formatBackendDate(q.created_at),createdISO:q.created_at,backendManaged:true});
      updateNav();
      showDialog(`<span class="eyebrow">Open question</span><h2 id="dialogTitle">Tracked without becoming a fact.</h2><p>${esc(clean)}</p><div class="dialog-actions"><button class="btn primary" data-action="go-questions">View Questions</button><button class="btn secondary" data-action="close-dialog">Continue</button></div>`);
    }catch(e){
      showDialog(`<span class="eyebrow">Couldn’t save question</span><h2 id="dialogTitle">Nothing was added.</h2><p>${esc(e.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
    }
  }

  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-action="dismiss-review-banner"]')){ state.reviewBannerDismissed=true; renderOverview(); return; }
    if(e.target.closest('[data-action="dismiss-nudge"]')){ const btn=e.target.closest('[data-action="dismiss-nudge"]'); state.dismissedNudges.add(btn.dataset.nudge); renderReview(); return; }
    const projectJump=e.target.closest('[data-project-jump]'); if(projectJump){const target=projectJump.dataset.projectJump;if(state.view!=='project-overview'){state.view='project-overview';render();requestAnimationFrame(()=>scrollProjectTarget(target));}else{updateNav();updateProjectSubnavActive(target);scrollProjectTarget(target);}return;}
    const relatedReview=e.target.closest('[data-action="open-related-review"]');
    if(relatedReview){
      const reviewId=relatedReview.dataset.reviewId;
      const existing=state.data.reviews.find(x=>x.id===reviewId);
      if(existing){ showDialog(`<span class="eyebrow">Pending Review</span><h2 id="dialogTitle">Related evidence may affect this Current State</h2>${reviewCard(existing,true,false)}`); return; }
      await refreshOpenReviews();
      const found=state.data.reviews.find(x=>x.id===reviewId);
      if(found) showDialog(`<span class="eyebrow">Pending Review</span><h2 id="dialogTitle">Related evidence may affect this Current State</h2>${reviewCard(found,true,false)}`);
      else showDialog(`<span class="eyebrow">Review unavailable</span><h2 id="dialogTitle">This review is no longer open</h2><p>It may have just been accepted, rejected, or changed since this answer was generated. Open Items now reflects the latest reviews.</p><div class="dialog-actions"><button class="btn primary" data-action="dismiss-and-open-items">Open Items →</button></div>`);
      return;
    }
        const topicHistory=e.target.closest('[data-action="view-topic-history"]'); if(topicHistory){if(!overlay.hidden)closeDialog();state.historyTopic=topicHistory.dataset.knowledgeId;navigateTo('history',{preserveHistoryTopic:true});window.STATE_HISTORY_NAV?.pushHistoryTopic?.(state.historyTopic);return;}
    const clearHistory=e.target.closest('[data-action="clear-history-topic"]'); if(clearHistory){state.historyTopic=null;renderHistory();window.STATE_HISTORY_NAV?.pushHistoryTopic?.(null);return;}
    const clearHistoryEvidence=e.target.closest('[data-action="clear-history-evidence"]'); if(clearHistoryEvidence){state.historyEvidenceId=null;renderHistory();window.STATE_HISTORY_NAV?.pushHistoryTopic?.(null);return;}
    const noteReviews=e.target.closest('[data-action="open-note-reviews"]'); if(noteReviews){
      const n=state.data.notes.find(x=>x.id===noteReviews.dataset.noteId); const ids=n?.reviewIds||[];
      if(ids.length===1){
        state.expandedReviewId=ids[0];state.openItemSections.reviews=false;navigateTo('open-items');
        root.querySelector(`[data-review-card="${CSS.escape(ids[0])}"]`)?.scrollIntoView({block:'center'});
      }
      else if(ids.length>1){const rows=ids.map(id=>state.data.reviews.find(r=>r.id===id)).filter(Boolean).map(r=>`<button class="related-review-choice" data-action="open-specific-review" data-review-id="${r.id}"><strong>${esc(r.summary||r.title)}</strong><span>${esc(r.whyConsequential||'Needs your decision')}</span></button>`).join('');showDialog(`<span class="eyebrow">In review</span><h2 id="dialogTitle">This note is connected to ${ids.length} Reviews.</h2><div class="related-review-list">${rows}</div><div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Close</button></div>`);}
      return;
    }
    const noteHistory=e.target.closest('[data-action="open-note-history"]'); if(noteHistory){const n=state.data.notes.find(x=>x.id===noteHistory.dataset.noteId);if(n?.evidenceId){state.historyEvidenceId=n.evidenceId;state.historyTopic=null;state.historySearch='';navigateTo('history',{preserveHistoryEvidence:true});window.STATE_HISTORY_NAV?.pushHistoryTopic?.(null);}return;}
    // A plain URL hash won't survive this: context-history.js's own click
    // listener rewrites location.hash back to the bare view route (e.g.
    // #settings) on every navigation, shortly after this handler returns.
    const v=e.target.closest('[data-view]'); if(v){ if(v.dataset.anchor) window.__stateScrollAnchor=v.dataset.anchor; navigateTo(v.dataset.view); return; }
    const dateFilter=e.target.closest('.notes-date-filters [data-date-filter]'); if(dateFilter){ state.notesDateFilter=dateFilter.dataset.dateFilter; renderNotes(); return; }
    const noteFilter=e.target.closest('.notes-filters [data-filter]'); if(noteFilter){ state.notesFilter=noteFilter.dataset.filter; renderNotes(); return; }
    const reviewFilter=e.target.closest('.review-filters [data-review-filter]'); if(reviewFilter){ state.reviewFilter=reviewFilter.dataset.reviewFilter; renderReview(); return; }
    const sectionToggle=e.target.closest('[data-action="toggle-open-item-section"]'); if(sectionToggle){ const key=sectionToggle.dataset.section; const reviews=uiPendingReviews(), questions=openQuestions(); const count=key==='reviews'?reviews.length:key==='blockers'?questions.filter(q=>q.blocking).length:questions.filter(q=>!q.blocking).length; const current=state.openItemSections[key]===null?(key==='questions'&&count>5):!!state.openItemSections[key]; state.openItemSections[key]=!current; renderOpenItems(); return; }
    const reviewToggle=e.target.closest('[data-action="toggle-review-card"]'); if(reviewToggle){ const id=reviewToggle.dataset.reviewId; const wasOpen=state.expandedReviewId===id; state.expandedReviewId=state.expandedReviewId===id?null:id; if(!wasOpen) window.StateAnalytics?.track('review_opened',{reviewId:id}); renderOpenItems(); return; }
    const provenanceToggle=e.target.closest('[data-action="toggle-provenance"]'); if(provenanceToggle){ const body=provenanceToggle.parentElement?.querySelector('.project-provenance-body'); if(body){ const expanded=!body.hidden; body.hidden=expanded; provenanceToggle.setAttribute('aria-expanded',String(!expanded)); provenanceToggle.textContent=expanded?'Why this is current →':'Hide why this is current'; if(!expanded) window.StateAnalytics?.track('provenance_opened'); } return; }
    const a=e.target.closest('[data-action]'); if(!a)return;
    const act=a.dataset.action;
    if(act==='open-specific-review'){
      closeDialog();
      const reviewId=a.dataset.reviewId;
      state.expandedReviewId=reviewId;
      state.openItemSections.reviews=false;
      navigateTo('open-items');
      // QA follow-up (2026-09-14): navigateTo() always scrolls to top, so
      // the review opened here (often well down the list) rendered
      // expanded but off-screen -- the user landed at the top of Open
      // Items with no visible sign that their click did anything.
      root.querySelector(`[data-review-card="${CSS.escape(reviewId)}"]`)?.scrollIntoView({block:'center'});
    }
    else if(act==='toggle-open-questions'){state.openQuestionsExpanded=!state.openQuestionsExpanded;renderOpenItems();}
    else if(act==='show-demo-help'){showDemoHelp();}
    else if(act==='demo-start-ask'){
      closeDialog();navigateTo('overview');
      // Ask no longer has an inline Workspace instance -- routes into the
      // Ask State drawer (context-product-polish.js) the same way its own
      // starter chips do, via a synthetic click on its data-review-batch-prompt
      // delegated listener.
      const proxy=document.createElement('button');proxy.type='button';proxy.dataset.reviewBatchPrompt='What should I know about this project?';document.body.appendChild(proxy);proxy.click();proxy.remove();
    }
    else if(act==='demo-start-note'){closeDialog();showAddDialog(state.data.sampleInformationOptions?.plan||state.data.sampleInformation||'');}
    else if(act==='demo-start-project'){closeDialog();navigateTo('project-overview');}
    else if(act==='project-settings')showProjectSettings();
    else if(act==='save-project-rule'){const text=document.getElementById('projectRuleText')?.value.trim();const category=document.getElementById('projectRuleCategory')?.value||'Interpretation';if(text){try{const rule=await API.createRule(text,category);if(!state.projectRules.some(x=>x.id===rule.id))state.projectRules.push(rule);showProjectSettings();}catch(err){showDialog(`<span class="eyebrow">Couldn’t save rule</span><h2 id="dialogTitle">Rule was not added.</h2><p>${esc(err.message)}</p>`);}}}
    else if(act==='delete-project-rule'){try{await API.deleteRule(a.dataset.ruleId);state.projectRules=state.projectRules.filter(x=>x.id!==a.dataset.ruleId);showProjectSettings();}catch(err){showDialog(`<span class="eyebrow">Couldn’t remove rule</span><h2 id="dialogTitle">Rule is still active.</h2><p>${esc(err.message)}</p>`);}}
    else if(act==='copy-result'){const text=state.result?.liveAsk&&ASK?.portableText?ASK.portableText(state.result.liveAsk,liveRecordStatus()):(document.querySelector('.answer-content')?.innerText||'');const label='Copy';navigator.clipboard?.writeText(text);a.textContent='Copied';setTimeout(()=>a.textContent=label,1200);}
    else if(act==='toggle-projects'){state.projectMenuOpen=!state.projectMenuOpen;updateNav();}
    else if(act==='switch-project'){
      const projectId=a.dataset.projectId;
      if(!projectId||projectId===state.data.project?.id){state.projectMenuOpen=false;render();return;}
      state.projectMenuOpen=false;
      state.isAnalyzing=true;
      showDialog(`<span class="eyebrow">Switching projects</span><h2 id="dialogTitle">Opening ${esc(a.textContent.replace('Current','').trim())}…</h2><p>Loading Current State, Reviews, Questions, History, and Rules for this project.</p>`);
      try{
        await activateProject(projectId);
        window.StateAnalytics?.track('project_switched',{projectId});
      }catch(err){
        state.isAnalyzing=false;
        showDialog(`<span class="eyebrow">Couldn't switch projects</span><h2 id="dialogTitle">The project was not changed.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      }
    }
    else if(act==='new-project'){
      state.projectMenuOpen=false;
      showDialog(`<span class="eyebrow">New project</span><h2 id="dialogTitle">Start a blank project</h2><p>Creates an empty project with no seeded Current State, Reviews, or Rules — a fresh place to build understanding from scratch.</p><label for="newProjectName" class="new-project-label">Project name</label><input id="newProjectName" class="dialog-input" type="text" maxlength="200" placeholder="e.g. AI Notes" autofocus /><div class="dialog-actions"><button class="btn primary" data-action="save-new-project">Create project</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);
    }
    else if(act==='save-new-project'){
      const name=document.getElementById('newProjectName')?.value.trim();
      if(!name)return;
      state.isAnalyzing=true;
      showDialog(`<span class="eyebrow">Creating project</span><h2 id="dialogTitle">Setting up ${esc(name)}…</h2>`);
      try{
        const project=await API.createProject(name);
        state.data.projects=[...(state.data.projects||[]),project];
        await activateProject(project.id);
        window.StateAnalytics?.track('project_created',{projectId:project.id});
      }catch(err){
        state.isAnalyzing=false;
        showDialog(`<span class="eyebrow">Couldn't create project</span><h2 id="dialogTitle">The project was not created.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      }
    }
    else if(act==='retry-hydration'){await hydrateBackend();}
    else if(act==='clear-note-filters'){state.notesDateFilter='all';state.notesFilter='all';state.notesSearch='';renderNotes();}
    else if(act==='clear-history-search'){state.historySearch='';renderHistory();}
    else if(act==='new-note'){state.noteComposerOpen=true;state.editingNoteId=null;renderNotes();}
    else if(act==='cancel-new-note'){state.noteComposerOpen=false;renderNotes();}
    else if(act==='save-new-note'){
      const title=document.getElementById('newNoteTitle')?.value||'Untitled note';
      const text=document.getElementById('newNoteText')?.value||'';
      try{if(await saveWorkingNote(title,text)){state.noteComposerOpen=false;renderNotes();}}catch(err){showDialog(`<span class="eyebrow">Couldn’t save draft</span><h2 id="dialogTitle">Your draft was not saved.</h2><p>${esc(err.message)}</p>`);}
    }
    else if(act==='toggle-note'){
      if(e.target.closest('button,input,textarea'))return;
      // The whole card is one clickable toggle target, so dragging to select
      // note text ends with a mouseup on that same target -- which still
      // fires a click. Without this guard, that click re-renders the list
      // (renderNotes() below) immediately after, which tears down the DOM
      // text nodes the selection was anchored to and wipes it out, making it
      // look like note text can never be selected at all.
      if(window.getSelection && String(window.getSelection()).length>0)return;
      const id=a.dataset.noteId;
      if(state.expandedNotes.has(id)){state.expandedNotes.delete(id);if(state.editingNoteId===id)state.editingNoteId=null;}
      else state.expandedNotes.add(id);
      renderNotes();
    }
    else if(act==='edit-note'){const n=state.data.notes.find(x=>x.id===a.dataset.noteId);if(n&&!n.backendManaged){state.expandedNotes.add(n.id);state.editingNoteId=n.id;renderNotes();}}
    else if(act==='cancel-note-edit'){state.editingNoteId=null;renderNotes();}
    else if(act==='save-note-edit'){
      const n=state.data.notes.find(x=>x.id===a.dataset.noteId);
      if(n&&!n.backendManaged){
        const title=(document.getElementById(`editNoteTitle-${n.id}`)?.value||n.title).trim()||'Untitled note';
        const content=(document.getElementById(`editNoteText-${n.id}`)?.value||n.text).trim();
        try{
          if(n.draftId){const updated=await API.updateDraft(n.draftId,title,content);n.title=updated.title;n.text=updated.content;n.date=formatBackendDate(updated.updated_at);n.dateISO=updated.updated_at;}
          else{n.title=title;n.text=content;}
          state.editingNoteId=null;renderNotes();
        }catch(err){showDialog(`<span class="eyebrow">Couldn’t save draft</span><h2 id="dialogTitle">Your changes were not saved.</h2><p>${esc(err.message)}</p>`);}
      }
    }
    else if(act==='send-note-review'){sendNoteToReview(a.dataset.noteId);}
    else if(act==='go-notes'){closeDialog();navigateTo('notes');}
    else if(act==='open-question'){ const q=state.data.questions.find(x=>x.id===a.dataset.questionId); if(q) showDialog(questionDialogHtml(q)); }
    else if(act==='mark-blocking'){const q=state.data.questions.find(x=>x.id===a.dataset.questionId);if(q)showDialog(`<span class="eyebrow">Blocking question</span><h2 id="dialogTitle">What does this block?</h2><p>A question is blocking only when a concrete project dependency cannot move without the answer.</p><p><strong>${esc(q.text)}</strong></p><input id="questionBlocks" class="dialog-input" aria-label="Blocked dependency" placeholder="Example: Security approval for pilot data flow"><div class="dialog-actions"><button class="btn primary" data-action="save-blocking" data-question-id="${q.id}">Mark blocking</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);}
    else if(act==='save-blocking'){const q=state.data.questions.find(x=>x.id===a.dataset.questionId);const blocks=document.getElementById('questionBlocks')?.value.trim();if(q&&blocks){try{const updated=await API.setQuestionBlocking(q.id,true,blocks);q.blocking=!!updated.blocking;q.blocks=updated.blocks||blocks;closeDialog();renderOpenItems();}catch(err){showDialog(`<span class="eyebrow">Couldn’t update question</span><h2 id="dialogTitle">Question is still open.</h2><p>${esc(err.message)}</p>`);}}}
    else if(act==='unmark-blocking'){const q=state.data.questions.find(x=>x.id===a.dataset.questionId);if(q){try{const updated=await API.setQuestionBlocking(q.id,false,null);q.blocking=!!updated.blocking;q.blocks=updated.blocks||null;closeDialog();renderOpenItems();}catch(err){showDialog(`<span class="eyebrow">Couldn’t update question</span><h2 id="dialogTitle">Blocking status was not changed.</h2><p>${esc(err.message)}</p>`);}}}
    else if(act==='answer-question'){ const q=state.data.questions.find(x=>x.id===a.dataset.questionId); if(q) showDialog(`<span class="eyebrow">Answer question</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>Add what you learned. It will go to Review before it can change current understanding.</p><textarea id="questionAnswer" rows="5" aria-label="Question answer" placeholder="What did you learn?"></textarea><div class="dialog-actions"><button class="btn primary" data-action="submit-question-answer" data-question-id="${q.id}">Submit for review</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`); }
    else if(act==='submit-question-answer'){
      const text=document.getElementById('questionAnswer')?.value.trim();
      const q=state.data.questions.find(x=>x.id===a.dataset.questionId);
      if(text&&q){
        state.isAnalyzing=true; showDialog(analyzingDialog()); startAnalysisClock();
        try{
          const result=await submitEvidence(text,`question_response:${q.id}`);
          const stamp=Date.now(), noteId='n-q-'+stamp;
          const apiReviews=(result.reviews||[]).map(r=>mapApiReview(r,text));
          state.data.notes.unshift({id:noteId,title:'Answer to: '+q.text,text,source:'Question response',date:todayLabel(),dateISO:todayISO(),topics:q.topics,status:apiReviews.length?'pending':'no_review_needed',reviewId:apiReviews[0]?.id||null,reviewIds:apiReviews.map(r=>r.id),evidenceId:result.evidence_id});
          apiReviews.forEach(r=>{r.evidenceId=noteId; upsertBackendReview(r);});
          state.reviewBannerDismissed=false; state.isAnalyzing=false; stopAnalysisClock(); updateNav();
          if(apiReviews.length) showDialog(`<span class="eyebrow">Added</span><h2 id="dialogTitle">Answer sent to Review.</h2><p>The question stays unresolved until you accept reviewed evidence that establishes an answer.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">Go to Review</button></div>`);
          else showDialog(`<span class="eyebrow">Reviewed</span><h2 id="dialogTitle">The question stays open.</h2><p>The evidence did not produce a State change, so it was not enough to resolve this question.</p>`);
        }catch(e){ await showAnalysisFailure(e,{draftMessage:'The question stays open.',safeContext:'Your question response'}); }
      }
    }
    else if(act==='close-result'||act==='new-ask'){const oldAskInput=document.getElementById('askInput');if(oldAskInput)oldAskInput.value='';state.result=null;state.resultQuery='';state.askInputDraft='';state.refinements=[];renderOverview();requestAnimationFrame(()=>document.getElementById('askInput')?.focus());}
    else if(act==='go-open-question'){const q=state.data.questions.find(x=>x.id===a.dataset.questionId);if(q)showDialog(questionDialogHtml(q));}
    else if(act==='add-info'||act==='suggest-update')showAddDialog();
    else if(act==='something-changed')showAddDialog('',{description:'What changed or what is incorrect? Add what you learned — State will compare it with Current State.'});
    else if(act==='confirm-demo-reset'){const projectName=state.data.project?.name||'this project';showDialog(`<span class="eyebrow">Reset to starting scenario</span><h2 id="dialogTitle">Restore the ${esc(projectName)} starting scenario?</h2><p>This removes everything created during testing and restores the same curated starting State, open Reviews, blockers, Questions, Notes, Rules, and History.</p><div class="dialog-actions"><button class="btn primary" data-action="reset-demo">Reset ${esc(projectName)}</button><button class="btn secondary" data-action="project-settings">Cancel</button></div>`);}
    else if(act==='reset-demo'){const projectName=state.data.project?.name||'this project';state.isAnalyzing=true;showDialog(`<span class="eyebrow">Resetting ${esc(projectName)}</span><h2 id="dialogTitle">Restoring ${esc(projectName)}…</h2><p>Rebuilding the curated starting scenario.</p>`);try{await API.resetDemo();await hydrateBackend();state.result=null;state.resultQuery='';state.askInputDraft='';state.isAnalyzing=false;closeDialog();navigateTo('overview');}catch(err){state.isAnalyzing=false;showDialog(`<span class="eyebrow">Reset failed</span><h2 id="dialogTitle">${esc(projectName)} was not reset.</h2><p>${esc(err.message)}</p><div class="dialog-actions">${err?.isTimeout?'<button class="btn primary" data-action="reload-page">Refresh page</button>':''}<button class="btn secondary" data-action="close-dialog">Close</button></div>`);}}
    else if(act==='confirm-delete-project'){const projectName=state.data.project?.name||'this project';showDialog(`<span class="eyebrow">Delete project</span><h2 id="dialogTitle">Permanently delete ${esc(projectName)}?</h2><p>This removes all of its Notes, Evidence, Reviews, Questions, Current State, and History. This cannot be undone.</p><div class="dialog-actions"><button class="btn primary" data-action="delete-project">Delete ${esc(projectName)}</button><button class="btn secondary" data-action="project-settings">Cancel</button></div>`);}
    else if(act==='delete-project'){
      const projectId=state.data.project?.id, projectName=state.data.project?.name||'this project';
      if(!projectId)return;
      state.isAnalyzing=true;
      showDialog(`<span class="eyebrow">Deleting</span><h2 id="dialogTitle">Deleting ${esc(projectName)}…</h2>`);
      try{
        const result=await API.deleteProject(projectId);
        state.data.projects=(state.data.projects||[]).filter(p=>p.id!==projectId);
        await activateProject(result.active.id);
        window.StateAnalytics?.track('project_deleted',{projectId});
      }catch(err){
        state.isAnalyzing=false;
        showDialog(`<span class="eyebrow">Couldn't delete project</span><h2 id="dialogTitle">${esc(projectName)} was not deleted.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      }
    }
    else if(act==='reload-page'){window.location.reload();}
    else if(act==='review-receipt-project'){const area=a.dataset.projectArea||'general';closeDialog();navigateTo('project-overview');requestAnimationFrame(()=>{scrollProjectTarget(`project-${area}`);const target=a.dataset.stateId?[...document.querySelectorAll('[data-state-id]')].find(el=>el.dataset.stateId===a.dataset.stateId)?.closest('.project-wiki-topic'):null;if(target){target.classList.add('is-recently-updated');setTimeout(()=>target.classList.remove('is-recently-updated'),2200);}});}
    else if(act==='close-dialog'){if(!state.isAnalyzing)closeDialog();}
    else if(act==='dismiss-and-open-items'){closeDialog();navigateTo('open-items');}
    else if(act==='retry-analysis'){ const evidenceId=a.dataset.evidenceId; state.isAnalyzing=true; showDialog(analyzingDialog()); startAnalysisClock(); try{await retryEvidenceAnalysis(evidenceId); state.isAnalyzing=false; stopAnalysisClock(); await hydrateBackend(); showDialog(`<span class="eyebrow">Done</span><h2 id="dialogTitle">Analysis complete.</h2><p>Open Items now reflects anything that needs your decision.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">View Open Items</button></div>`);}catch(err){state.isAnalyzing=false;stopAnalysisClock();showDialog(`<span class="eyebrow">Still unavailable</span><h2 id="dialogTitle">Your note is still safe.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);} }
    else if(act==='promote-evidence'){
      const evidenceId=a.dataset.evidenceId;
      state.isAnalyzing=true;
      showDialog(`<span class="eyebrow">Reconsidering</span><h2 id="dialogTitle">Asking State to reconsider this note…</h2><p>State will look again and decide what, if anything, belongs in Current State.</p>`);
      try{
        const result=await API.promoteEvidence(evidenceId);
        state.isAnalyzing=false;
        await hydrateBackend();
        if((result.reviews||[]).length){
          showDialog(`<span class="eyebrow">Review created</span><h2 id="dialogTitle">State found something to review.</h2><p>${result.reviews.length===1?'1 Review needs your decision.':`${result.reviews.length} Reviews need your decisions.`}</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">View Review</button></div>`);
        }else{
          showDialog(`<span class="eyebrow">Still no review</span><h2 id="dialogTitle">State still didn't find anything to propose.</h2><p>The note is preserved as Evidence either way. You can edit it to add more detail and try again, or leave it as reference material.</p>`);
        }
      }catch(err){
        state.isAnalyzing=false;
        showDialog(`<span class="eyebrow">Couldn't reconsider</span><h2 id="dialogTitle">This note is still safe.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      }
    }
    else if(act==='sample-info'){ const t=document.getElementById('addInfoText'); const samples=state.data.sampleInformationOptions||{}; const value=samples[a.dataset.sample]||state.data.sampleInformation; if(t){t.value=value;t.focus();t.setSelectionRange(t.value.length,t.value.length);} }
    else if(act==='save-info')saveInformation();
    else if(act==='go-review'){closeDialog();navigateTo('open-items');}
    else if(act==='review-now'){ const r=state.data.reviews.find(x=>x.id===a.dataset.review); if(r) showDialog(`<span class="eyebrow">Review, without leaving your answer</span><h2 id="dialogTitle">Review this change</h2>${reviewCard(r,true,false)}`); }
    else if(act==='continue-current'){ a.closest('.pending-notice')?.classList.add('acknowledged'); a.closest('.pending-notice')?.querySelector('p')?.replaceChildren(document.createTextNode('Continuing from current reviewed understanding. Pending evidence remains unreviewed.')); }
    else if(act==='track-question')addQuestion(a.dataset.question||state.resultQuery);
    else if(act==='go-questions'){closeDialog();navigateTo('open-items');}
    else if(act==='review-update'||act==='review-keep')decideReview(a.dataset.review,act==='review-update'?'update':'keep-current');
    else if(act==='confirm-review-update')executeReviewDecision(a.dataset.review,'update',false);
    else if(act==='review-acknowledge-risk'||act==='review-dismiss-risk')decideReview(a.dataset.review,act==='review-acknowledge-risk'?'acknowledge-risk':'dismiss-risk');
    else if(act==='open-adjust-review')openAdjustDialog(a.dataset.review);
    else if(act==='confirm-review-adjust')confirmReviewAdjust(a.dataset.review);
    else if(act==='add-question')showDialog(`<span class="eyebrow">Known unknown</span><h2 id="dialogTitle">Add a question</h2><input id="manualQuestion" class="dialog-input" aria-label="New project question" placeholder="What does the project still need to establish?"/><div class="dialog-actions"><button class="btn primary" data-action="save-question">Track question</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);
    else if(act==='save-question'){const t=document.getElementById('manualQuestion')?.value;closeDialog();addQuestion(t);}
    else if(act==='confirm-stop-question'){const q=state.data.questions.find(q=>q.id===a.dataset.questionId);if(q)showDialog(`<span class="eyebrow">Open question</span><h2 id="dialogTitle">Stop tracking this question?</h2><p>It will be removed from the open questions list. This does not change any reviewed project understanding.</p><div class="dialog-actions"><button class="btn primary" data-action="stop-question" data-question-id="${q.id}">Stop tracking</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);}
    else if(act==='stop-question'){const q=state.data.questions.find(q=>q.id===a.dataset.questionId);if(q?.backendManaged){try{await API.stopQuestion(q.id);q.status='stopped';}catch(err){showDialog(`<span class="eyebrow">Couldn’t stop tracking</span><h2 id="dialogTitle">Question is still open.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);return;}}else if(q)q.status='stopped';closeDialog();navigateTo('open-items');}
    else if(act==='copy-note'){const n=state.data.notes.find(x=>x.id===a.dataset.noteId);if(n){navigator.clipboard?.writeText(n.text);a.textContent='Copied';}}
    else if(act==='copy-draft'){navigator.clipboard?.writeText(a.closest('.answer-stage')?.querySelector('.draft')?.innerText || '');a.textContent='Copied';}
  });

  document.addEventListener('change',e=>{ if(e.target.id==='notesStatusFilter'){state.notesFilter=e.target.value;renderNotes();} else if(e.target.id==='uploadInfoFile'){const file=e.target.files&&e.target.files[0]; e.target.value=''; if(file)uploadInformation(file);} });

  document.addEventListener('input',e=>{
    if(e.target.id==='notesSearch'){
      state.notesSearch=e.target.value;
      const list=document.getElementById('notesList'); const notes=filteredNotes();
      if(list) list.innerHTML=notes.map(simpleNote).join('') || '<div class="empty-state"><h3>Nothing here.</h3><p>No notes match these filters.</p></div>';
      const count=document.querySelector('.notes-result-count'); if(count) count.textContent=`${notes.length} ${notes.length===1?'note':'notes'}`;
      const summary=document.getElementById('notesFilterSummary'); if(summary) summary.outerHTML=notesFilterSummary(notes);
    }
    if(e.target.id==='historySearch'){state.historySearch=e.target.value;updateHistoryResults();}
    if(e.target.id==='askInput'){state.askInputDraft=e.target.value;}
  });
  let projectScrollScheduled=false;
  window.addEventListener?.('scroll',()=>{
    if(state.view!=='project-overview'||projectScrollScheduled)return;
    projectScrollScheduled=true;
    requestAnimationFrame(()=>{projectScrollScheduled=false;updateProjectSubnavActive();});
  },{passive:true});

  document.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.note-index-row[data-action="toggle-note"]')){e.preventDefault();const id=e.target.dataset.noteId;if(state.expandedNotes.has(id))state.expandedNotes.delete(id);else state.expandedNotes.add(id);renderNotes();}
    if(e.key==='Escape'&&state.projectMenuOpen){state.projectMenuOpen=false;updateNav();document.getElementById('projectSwitcher')?.focus();return;}
    if(e.key==='Escape'&&!overlay.hidden && !state.isAnalyzing){closeDialog();return;}
    if(e.key==='Tab'&&!overlay.hidden){
      const dialog=document.querySelector('.dialog');
      const focusables=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
      if(!focusables.length){e.preventDefault();dialog.focus();return;}
      const first=focusables[0],last=focusables[focusables.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  // #projectMenu is reparented to document.body (see updateNav()) to escape
  // the sidebar's stacking context, so an outside-click check scoped only to
  // .sidebar-project would treat every click inside the now-detached menu
  // itself as "outside" and close it before a switch-project click could land.
  document.addEventListener('click',e=>{ if(state.projectMenuOpen && !e.target.closest('.sidebar-project') && !e.target.closest('#projectMenu') && !e.target.closest('[data-action="toggle-projects"]')){state.projectMenuOpen=false;updateNav();} });
  overlay.addEventListener('click',e=>{if(e.target===overlay && !state.isAnalyzing) closeDialog();});
  // Drag-and-drop onto the Add Evidence dialog, reusing the exact same
  // uploadInformation() path as the file-picker link -- no new backend or
  // upload logic, just another way to hand it a File. Scoped to whenever
  // #addInfoText is present (i.e. the Add Evidence dialog is open) rather
  // than a dedicated listener target, since dialogBody's contents are
  // fully replaced on every showDialog() call. dragenter/dragleave use a
  // counter (not a boolean) because both fire once per descendant element
  // as the pointer crosses it, not just once for the dialog as a whole --
  // a boolean would drop the highlight while still dragging over a child.
  let dragDepth=0;
  const dialogEl=()=>document.querySelector('.dialog');
  overlay.addEventListener('dragenter',e=>{
    if(!document.getElementById('addInfoText'))return;
    e.preventDefault();
    dragDepth++;
    dialogEl()?.classList.add('dialog-drag-over');
  });
  overlay.addEventListener('dragover',e=>{
    if(!document.getElementById('addInfoText'))return;
    e.preventDefault();
  });
  overlay.addEventListener('dragleave',e=>{
    if(!document.getElementById('addInfoText'))return;
    dragDepth=Math.max(0,dragDepth-1);
    if(dragDepth===0)dialogEl()?.classList.remove('dialog-drag-over');
  });
  overlay.addEventListener('drop',e=>{
    if(!document.getElementById('addInfoText'))return;
    e.preventDefault();
    dragDepth=0;
    dialogEl()?.classList.remove('dialog-drag-over');
    const files=e.dataTransfer?.files;
    if(!files||!files.length)return;
    if(files.length>1){
      showDialog(`<span class="eyebrow">One file at a time</span><h2 id="dialogTitle">Drop a single file.</h2><p>State can take one file per upload right now. Try dragging just one, or use the file picker to choose one at a time.</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      return;
    }
    uploadInformation(files[0]);
  });
  // The Slack "Connect Slack" OAuth round trip ends with the backend
  // redirecting the browser back here with ?slack_connect=success|error.
  // Land directly on Settings' Slack section with that result instead of
  // leaving the user on Workspace with an unexplained query string. Safe
  // to call navigateTo() directly now that render()'s views map has an
  // explicit no-op for 'settings' -- previously this raced with
  // hydrateBackend()'s async completion (in flight on every fresh page
  // load) falling back to Workspace content the moment it resolved, which
  // is the real bug that was fixed above, not anything specific to this
  // boot step.
  const bootParams=new URLSearchParams(location.search);
  const slackConnectResult=bootParams.get('slack_connect');
  if(slackConnectResult){
    window.__stateSlackConnectResult=slackConnectResult;
    window.__stateScrollAnchor='settings-slack';
    bootParams.delete('slack_connect');
    const cleanedSearch=bootParams.toString();
    history.replaceState(history.state,'',location.pathname+(cleanedSearch?`?${cleanedSearch}`:'')+'#settings');
    navigateTo('settings');
  }
  window.STATE_ASK_TEST_API={state,detectAskIntent,intentAskHtml,looksLikeQuestion,hasExplicitUpdateIntent,upsertBackendReview,replaceBackendOpenReviews,mapApiReview,linkedReviewFor,questionDialogHtml,renderOverview,renderOpenItems,refreshOpenReviews,historyType,syncApiHistory,addDialogHtml,historyEntry,hydrateBackend,showProjectSettings};
  // state.md #115: the live Ask State drawer (context-product-polish.js's
  // runAsk) is the only Ask surface a user actually reaches. Generic
  // inventory questions ("What needs review?") still need to route to a
  // compact Open Items card instead of spending a live backend Ask call, so
  // expose the detection+render step here (where detectAskIntent/
  // intentAskHtml/the real backend-hydrated review and question counts
  // already live) for the drawer to call before it ever calls the Ask
  // backend. detectAskIntent/intentAskHtml only handle those three routing
  // kinds now -- the much larger Northstar-specific legacy fallback layer
  // that used to live in this module (canned scenario answers, a vendor
  // contact, percentages, Tier-1/support/security narrative templates) was
  // dead code, unreachable from any live UI, and has been deleted rather
  // than generalized.
  window.STATE_ASK_ROUTING=Object.freeze({
    askRoutingCardHtml(raw){
      const kind=detectAskIntent(raw)?.kind;
      if(kind!=='pending'&&kind!=='open'&&kind!=='blockers')return null;
      return intentAskHtml({kind});
    }
  });
  // Called by context-history.js's popstate handler after it re-activates the
  // History tab, so a Back press that lands on a topic-detail browser-history
  // entry actually restores that topic filter instead of always landing on
  // the plain list. See context-history.js for the paired pushHistoryTopic().
  window.STATE_HISTORY_RESTORE=(topic)=>{ if(state.view!=='history')return; state.historyTopic=topic||null; renderHistory(); };
  render();
  hydrateBackend();
})();
