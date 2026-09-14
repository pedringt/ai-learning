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
    addedSample:false, pendingCreated:false, reviewBannerDismissed:false, dialogReturnFocus:null, expandedNotes:new Set(), noteComposerOpen:false, editingNoteId:null, dismissedNudges:new Set(), historyTopic:null, historyEvidenceId:null, historySearch:'', notesFilter:'all', notesDateFilter:'all', notesSearch:'', isAnalyzing:false, openQuestionsExpanded:false, expandedReviewId:null, openItemSections:{reviews:false,blockers:false,drafts:true,questions:null}, projectRules:[], workspaceAttentionStatus:'loading', backendStatus:{state:'loading',evidence:'loading',reviews:'loading',history:'loading',questions:'loading',rules:'loading',drafts:'loading'}
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
    if(label&&label.dataset&&label.dataset.name!==name){
      label.dataset.name=name;
      label.innerHTML=`${esc(name)} <span>⌄</span>`;
    }
    const menu=document.getElementById('projectMenu');
    if(!menu||!menu.dataset)return;
    const projects=state.data.projects||[];
    const activeId=state.data.project?.id;
    const signature=projects.map(p=>p.id).join(',')+'|'+activeId;
    if(menu.dataset.signature===signature)return;
    menu.dataset.signature=signature;
    menu.innerHTML=projects.map(p=>`<button data-action="switch-project" data-project-id="${esc(p.id)}"${p.id===activeId?' class="active"':''}>${esc(p.name)}${p.id===activeId?' <span>Current</span>':''}</button>`).join('');
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
    const entries=(state.data.history||[]).slice().sort(sortDateDesc).slice(0,3);
    if(!entries.length) return '';
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
    return `<section class="workspace-status-card"><span class="eyebrow">Current State</span><div class="workspace-status-body">
      <div class="workspace-status-item"><strong class="workspace-status-value">${!historyLoaded?(state.backendStatus.history==='error'?'Recent change unavailable':'…'):lastUpdated?`Updated ${esc(lastUpdated)}`:'Not yet established'}</strong><div class="workspace-status-row"><span>${!historyLoaded&&state.backendStatus.history!=='error'?'Loading most recent change…':lastLabel?esc(lastLabel):'Most recent change.'}</span></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value">${stateLoaded?`${establishedCount} established fact${establishedCount===1?'':'s'}`:state.backendStatus.state==='error'?'Established facts unavailable':'… established facts'}</strong><div class="workspace-status-row"><span>What the project currently treats as true.</span><button class="text-button" data-view="project-overview">Browse Current State →</button></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value${questionsLoaded&&openCount===0?' is-clear':''}">${esc(openHeadline)}</strong><div class="workspace-status-row"><span>${openSupportText}</span><button class="text-button" data-view="open-items">Open Items →</button></div></div>
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
      <section class="overview-heading"><div class="overview-heading-row"><div><span class="eyebrow">Workspace</span><h2>${esc(state.data.project?.name||'Project')}</h2>${currentProjectStage()?`<p class="overview-stage">${esc(currentProjectStage())}</p>`:''}</div><button class="btn secondary overview-add" data-action="add-info">+ Add Evidence</button></div></section>
      ${workspaceAttentionHtml()}
      <div class="workspace-below-grid">
        ${whatChangedHtml()}
        ${currentStateHtml()}
      </div>
    </section>`;
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
    return `<div class="result-label">Open Items</div><div class="ask-routing-card"><div class="ask-routing-card-head"><span class="ask-routing-category">${esc(category)}</span><span class="ask-routing-count">${count}</span></div><p class="ask-routing-sentence">${esc(sentence)}</p>${detail?`<p class="ask-routing-detail">${esc(detail)}</p>`:''}<button class="btn primary" data-view="${esc(view)}" data-anchor="${esc(anchor)}">Open Items →</button></div>`;
  }
  function intentAskHtml(i){
    if(i.kind==='blockers'){ const n=openQuestions().filter(q=>q.blocking).length; return routingCardHtml({category:'Blockers',sentence:n===1?'1 question is blocking progress.':`${n} questions are blocking progress.`,detail:'Resolve these to keep the project moving.',count:n,view:'open-items',anchor:'open-items-blockers'}); }
    if(i.kind==='pending'){ const n=pendingReviews().length; return routingCardHtml({category:'Reviews',sentence:n===1?'1 review is waiting on a decision.':`${n} reviews are waiting on a decision.`,detail:'Waiting on a decision from you.',count:n,view:'open-items',anchor:'open-items-reviews'}); }
    if(i.kind==='open'){ const n=openQuestions().length; return routingCardHtml({category:'Questions',sentence:n===1?'1 question is open.':`${n} questions are open.`,detail:'Not yet answered in the project record.',count:n,view:'open-items',anchor:'open-items-questions'}); }
    return null;
  }

  function pendingFor(topics){
    return pendingReviews().filter(r => r.topics.some(t=>topics.includes(t)));
  }

  // Also live (via STATE_ASK_TEST_API -> context-product-polish.js's APP()):
  // runAsk() calls these two through explicitMutationIntent() to decide
  // whether typed Ask input should open the read-only "use Add Evidence"
  // message instead of asking. They look like leftovers from the deleted
  // legacy submitAsk() pipeline -- they used to live right next to it -- but
  // they are a real, separate live dependency; do not delete them assuming
  // they died with it.
  //
  // A question mark, or a leading interrogative word, is enough to treat
  // input as a question. Anything that looks like a question must never be
  // redirected into the update flow, no matter what other words it contains.
  function looksLikeQuestion(text){
    const q=text.trim();
    if(/\?\s*$/.test(q))return true;
    return /^(who|what|when|where|why|how|which|did|does|do|is|are|was|were|can|could|should|would|will|has|have|had)\b/i.test(q);
  }
  // Only explicit update intent should route input into "Add a project
  // update" -- Ask is the default for everything else, including plain
  // statements with no imperative marker. The old heuristic (any past-tense
  // "approved"/"confirmed"/etc. plus a topic word) fired on ordinary
  // questions like "Did Security confirm retention terms?" and opened the
  // update dialog instead of answering.
  function hasExplicitUpdateIntent(text){
    return /\b(add (this|that|it)|please add|update (the )?(current )?state|record (this|that)|please record|note that|for the record|log (this|that))\b/i.test(text);
  }



  /* ----------------------------------------------------------------------
     Notes

     Rendering (filtering, the note/draft row markup, and the composer) lives
     in context-notes-view.js -- these are thin wrappers that gather the
     relevant slice of `state` and hand it to that module's frozen API, so
     every existing call site below (renderNotes(), simpleNote(n), etc.) is
     unchanged.
     ------------------------------------------------------------------- */
  function notesUiState(){
    return {noteComposerOpen:state.noteComposerOpen,notesFilter:state.notesFilter,notesDateFilter:state.notesDateFilter,notesSearch:state.notesSearch,expandedNotes:state.expandedNotes,editingNoteId:state.editingNoteId,evidenceStatus:state.backendStatus.evidence,draftsStatus:state.backendStatus.drafts};
  }
  function filteredNotes(){ return NOTES_VIEW.filteredNotes(state.data.notes,notesUiState()); }
  function notesFilterSummary(notes){ return NOTES_VIEW.notesFilterSummary(notes,state.data.notes.length,notesUiState()); }
  function simpleNote(n){ return NOTES_VIEW.simpleNote(n,state.expandedNotes,state.editingNoteId); }
  function draftNoteRow(n){ return NOTES_VIEW.draftNoteRow(n); }
  function renderNotes(){ root.innerHTML=NOTES_VIEW.render(state.data.notes,notesUiState()); }

  function historySearchText(h){
    const evidence=(h.evidenceItems||h.evidence_items||[]).map(e=>e.content||'').join(' ');
    return `${h.type||''} ${h.before??h.old_statement??''} ${h.after??h.new_statement??''} ${h.reason||''} ${h.decision_question||''} ${h.proposal_rationale||''} ${h.why_consequential||''} ${evidence}`;
  }
  function historyEntries(){
    const all=state.data.history.slice().sort(sortDateDesc);
    const topic=state.historyTopic;
    const evidenceId=state.historyEvidenceId;
    let scoped=topic?all.filter(h=>h.knowledgeId===topic):all;
    if(evidenceId) scoped=scoped.filter(h=>(h.evidenceItems||h.evidence_items||[]).some(e=>e.id===evidenceId));
    const q=norm(state.historySearch);
    return q?scoped.filter(h=>norm(historySearchText(h)).includes(q)):scoped;
  }
  function historyHighlight(value){
    const raw=String(value??'');
    const query=state.historySearch.trim();
    if(!query)return esc(raw);
    const escaped=esc(raw);
    const safeQuery=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(!safeQuery)return escaped;
    return escaped.replace(new RegExp(`(${safeQuery})`,'ig'),'<mark>$1</mark>');
  }
  function evidenceDisplayTimestamp(e){ return BACKEND_SYNC.evidenceDisplayTimestamp(e); }

  function historySources(h){
    const items=h.evidenceItems||h.evidence_items||[];
    if(!items.length)return '';
    return `<details class="history-sources"><summary>Source notes · ${items.length}</summary><div class="history-source-list">${items.map(e=>`<article><span>${esc(formatBackendDate(evidenceDisplayTimestamp(e)))} · ${esc(sourceLabel(e.source_type))}</span><p>${historyHighlight(e.content)}</p></article>`).join('')}</div></details>`;
  }
  function historyEntry(h, topicMode=false){
    const linked=!!h.knowledgeId&&!topicMode;
    const before=h.before??h.old_statement??'Not previously established';
    const after=h.after??h.new_statement??'';
    const reason=h.reason||h.decision_question||h.proposal_rationale||'Reviewed project evidence';
    const decision=h.decision||(h.accepted_as_adjusted?'Human adjusted and accepted this change':'Human accepted this change');
    // state.md #106/#109: the only distinction from an ordinary transition --
    // no diff viewer, just the two wordings side by side. new_statement
    // (rendered as "Now" above and "Human approved" here) stays the only
    // authoritative current value in both blocks.
    const adjustedProvenance=h.accepted_as_adjusted&&h.aiProposed
      ? `<div class="history-change history-adjusted-provenance"><p><span>State proposed</span>${historyHighlight(h.aiProposed)}</p><p><span>Human approved</span>${historyHighlight(after)}</p></div>`
      : '';
    return `<article class="history-entry${linked?' is-linked':''}"${linked?` data-action="view-topic-history" data-knowledge-id="${h.knowledgeId}" tabindex="0" role="button" aria-label="View topic history for ${esc(state.data.knowledge.find(k=>k.id===h.knowledgeId)?.title||h.type)}"`:''}><div class="history-entry-date">${esc(h.date||formatBackendDate(h.changed_at))}</div><div class="history-entry-body"><span class="history-reason">${historyHighlight(reason)}</span><h3>${historyHighlight(h.type||historyType(h))}</h3><div class="history-change"><p><span>Before</span>${historyHighlight(before)}</p><p><span>Now</span>${historyHighlight(after)}</p></div>${adjustedProvenance}<p class="decision-line">${historyHighlight(decision)}</p>${historySources(h)}${linked?'<span class="history-entry-link">View this topic →</span>':''}</div></article>`;
  }
  function updateHistoryResults(){
    const list=document.getElementById('historyList');
    const entries=historyEntries();
    const topicKnowledge=state.historyTopic?state.data.knowledge.find(k=>k.id===state.historyTopic):null;
    if(list) list.innerHTML=entries.length?entries.map(h=>historyEntry(h,!!topicKnowledge)).join(''):(state.historySearch?'<div class="empty-state"><h3>No matching changes.</h3><p>Try a broader History search.</p></div>':'<div class="empty-state"><h3>No Current State changes yet.</h3><p>When reviewed Notes change the Project, that transition will appear here.</p></div>');
    const count=document.getElementById('historyResultCount');
    const total=(state.historyEvidenceId?state.data.history.filter(h=>(h.evidenceItems||h.evidence_items||[]).some(e=>e.id===state.historyEvidenceId)):state.historyTopic?state.data.history.filter(h=>h.knowledgeId===state.historyTopic):state.data.history).length;
    if(count) count.textContent=`${entries.length} of ${total} changes`;
    const clear=document.getElementById('clearHistorySearch'); if(clear) clear.hidden=!state.historySearch.trim();
  }

  function renderHistory(){
    if(state.backendStatus.history==='error'){
      root.innerHTML=`<section class="page collection-page history-page"><div class="empty-state unavailable-state"><h2>History is temporarily unavailable.</h2><p>Accepted project changes cannot be loaded right now.</p><button class="btn secondary" data-action="retry-hydration">Try again</button></div></section>`;
      return;
    }
    if(state.backendStatus.history!=='loaded'){
      root.innerHTML=`<section class="page collection-page history-page"><div class="page-head"><div><h2>History</h2><p role="status">Loading History…</p></div></div></section>`;
      return;
    }
    const entries=historyEntries();
    const topic=state.historyTopic;
    const topicKnowledge=topic?state.data.knowledge.find(k=>k.id===topic):null;
    const evidenceNote=state.historyEvidenceId?state.data.notes.find(n=>n.evidenceId===state.historyEvidenceId):null;
    const total=(state.historyEvidenceId?state.data.history.filter(h=>(h.evidenceItems||h.evidence_items||[]).some(e=>e.id===state.historyEvidenceId)):topic?state.data.history.filter(h=>h.knowledgeId===topic):state.data.history).length;
    root.innerHTML=`<section class="page collection-page history-page"><div class="page-head"><div><span class="eyebrow">From notes to Current State</span><h2>History</h2><p>${topicKnowledge?`How project evidence changed the maintained understanding of ${esc(topicKnowledge.title)}.`:'The meaningful changes extracted from Notes and accepted into Current State. This is the bridge between what came in and what the Project says now.'}</p></div></div>${evidenceNote?`<div class="history-context"><strong>From note: ${esc(evidenceNote.title)}</strong><span>${total} accepted change${total===1?'':'s'}</span><button class="text-button" data-action="clear-history-evidence">View all history →</button></div>`:topicKnowledge?`<div class="history-context"><strong>${esc(topicKnowledge.title)}</strong><span>${total} recorded change${total===1?'':'s'}</span><button class="text-button" data-action="clear-history-topic">View all history →</button></div>`:''}<div class="history-toolbar"><input class="history-search" id="historySearch" type="search" placeholder="Search history" aria-label="Search accepted project changes" value="${esc(state.historySearch)}"><span class="history-result-count" id="historyResultCount" aria-live="polite">${entries.length} of ${total} changes</span><button class="text-button" id="clearHistorySearch" data-action="clear-history-search"${state.historySearch?'':' hidden'}>Clear search</button></div><div class="history-list" id="historyList">${entries.length?entries.map(h=>historyEntry(h,!!topicKnowledge)).join(''):(state.historySearch?'<div class="empty-state"><h3>No matching changes.</h3><p>Try a broader History search.</p></div>':'<div class="empty-state"><h3>No Current State changes yet.</h3><p>When reviewed Notes change the Project, that transition will appear here.</p></div>')}</div></section>`;
  }

  /* ----------------------------------------------------------------------
     Open Items and Reviews

     Rendering (review/question cards, section collapsing, the page itself)
     lives in context-open-items-view.js -- see the comment above the Notes
     wrappers for why. decideReview() below is where a human decision
     becomes a State change; it stays here since it mutates `state` and
     talks to the backend, which the view module deliberately never does.
     ------------------------------------------------------------------- */
  function openItemsProps(){
    return {
      reviewsStatus:state.backendStatus.reviews,questionsStatus:state.backendStatus.questions,draftsStatus:state.backendStatus.drafts,
      reviews:uiPendingReviews(),questions:openQuestions(),
      draftNotes:state.data.notes.filter(n=>n.status==='working'||n.status==='draft'||!!n.backendDraft),
      notes:state.data.notes,
      openQuestionsExpanded:state.openQuestionsExpanded,expandedReviewId:state.expandedReviewId,openItemSections:state.openItemSections,
      renderDraftNote:n=>NOTES_VIEW.draftNoteRow(n)
    };
  }
  // An Ask routing card ("What needs review?") can ask to land directly on
  // one Open Items section instead of the top of the page, via
  // window.__stateScrollAnchor (same mechanism the Settings Slack banner
  // uses) -- cleared once consumed so it only fires for the navigation that
  // requested it.
  function renderOpenItems(){
    const anchor=window.__stateScrollAnchor;
    const section=anchor&&anchor.startsWith('open-items-')?anchor.slice('open-items-'.length):null;
    // Force-expand unconditionally, not just when already truthy -- the
    // stored value starts out `null` (meaning "use the default collapse
    // rule"), and Open Questions defaults to collapsed once there are more
    // than 5, so a `null` check alone left the target section collapsed.
    if(section) state.openItemSections[section]=false;
    root.innerHTML=OPEN_ITEMS_VIEW.render(openItemsProps());
    if(section){
      delete window.__stateScrollAnchor;
      setTimeout(()=>document.querySelector(`.open-items-${section}`)?.scrollIntoView({block:'start'}),60);
    }
  }
  function renderReview(){ return renderOpenItems(); }
  function reviewCard(r,expanded=true,accordion=false){ return OPEN_ITEMS_VIEW.reviewCard(r,expanded,accordion,state.data.notes.find(n=>n.id===r.evidenceId)); }
  function linkedReviewFor(questionId){
    return state.data.reviews.find(r=>r.status==='pending' && (r.resolvesQuestionIds?.includes(questionId) || r.resolvesQuestionId===questionId));
  }
  function questionDialogHtml(q){ return OPEN_ITEMS_VIEW.questionDialogHtml(q,linkedReviewFor(q.id)); }

  function truncateText(value,max=190){
    const text=String(value||'').replace(/\s+/g,' ').trim();
    return text.length>max?`${text.slice(0,max-1).replace(/\s+\S*$/,'')}…`:text;
  }
  function showToast(message){
    document.querySelector('.state-toast')?.remove();
    const toast=document.createElement('div');
    toast.className='state-toast';toast.setAttribute('role','status');toast.textContent=message;
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),2600);
  }

  // state.md #107: decision tokens beyond the schema-level accept/keep/reject
  // -- 'acknowledge-risk'/'dismiss-risk' (checkOnly/state_at_risk reviews) and
  // 'keep-current' (ordinary Leave unchanged) all map to a real backend
  // decision (see REVIEW_API_DECISION below); 'adjust' is handled separately
  // by openAdjustDialog/confirmReviewAdjust since it opens a dialog first
  // rather than resolving immediately.
  const REVIEW_API_DECISION={update:'accept','keep-current':'keep','acknowledge-risk':'keep','dismiss-risk':'reject'};
  // #111: "Keep tracking" must persist the uncertainty as a real Question, not
  // just resolve the Review, so the toast reflects the server's actual outcome
  // (question_created/question_linked) rather than assuming a fixed message.
  function reviewDecisionToast(decision,result){
    if(decision==='acknowledge-risk'){
      if(result?.resolution==='question_created')return 'Added as an open question to keep tracking. Current State was not changed.';
      if(result?.resolution==='question_linked')return 'Linked to an existing open question. Current State was not changed.';
      return 'Reviewed. Still flagged as uncertain — Current State was not changed.';
    }
    if(decision==='dismiss-risk')return 'Dismissed. No longer tracked as an open question. Current State was not changed.';
    return 'Current State left unchanged. Evidence is preserved.';
  }

  // A consequential update (real proposals, not a checkOnly/uncertainty-only
  // review) confirms before mutating anything -- Current State is what the
  // project treats as true, so changing it deserves an explicit step. Every
  // other decision (Leave unchanged, and the checkOnly acknowledge/dismiss
  // pair) never changes Current State, so it skips the confirmation and uses
  // lighter feedback (a toast, no interstitial loading modal) instead.
  function decideReview(id,decision){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    if(r.reviewType==='open_question'){executeQuestionReviewDecision(id,decision);return;}
    const checkOnly=!Array.isArray(r.proposals)||r.proposals.length===0;
    window.StateAnalytics?.track(decision==='update'?'review_accepted':decision==='dismiss-risk'?'review_rejected':'review_kept',{reviewId:id});
    if(decision==='update' && !checkOnly){
      const proposalText=(r.proposals||[]).map(p=>p.proposed_statement).filter(Boolean).join(' • ') || r.proposed || '';
      showDialog(`<span class="eyebrow">Review decision</span><h2 id="dialogTitle">Update Current State?</h2><p>This changes what the project currently treats as true and records the decision in History.</p>${proposalText?`<div class="review-confirm-change"><span>Change</span><strong>${esc(truncateText(proposalText,210))}</strong></div>`:''}<div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-review-update" data-review="${esc(id)}">Update Current State</button></div>`);
      return;
    }
    executeReviewDecision(id,decision,checkOnly);
  }

  function openAdjustDialog(id){
    const r=state.data.reviews.find(x=>x.id===id);
    if(r&&r.status==='pending') showDialog(OPEN_ITEMS_VIEW.adjustDialogHtml(r));
  }

  // #107: Leave unchanged normally just resolves the Review. The one
  // exception is a Review that, if accepted, would have resolved a specific
  // open Question -- leaving it unchanged means that Question's answer
  // didn't pan out, so it's worth a lightweight, optional check on whether
  // it's still worth tracking. Scoped to exactly one linked Question; a
  // Review spanning several linked Questions skips this rather than
  // building a multi-question chooser (state.md #107: no giant correction
  // form). Reuses the existing "Stop tracking" Question action verbatim.
  function maybeOfferToStopTrackingResolvedQuestion(r){
    const questionIds=r.resolvesQuestionIds||[];
    if(questionIds.length!==1)return;
    const q=state.data.questions.find(x=>x.id===questionIds[0]);
    if(!q||q.status!=='open')return;
    showDialog(`<span class="eyebrow">Still unresolved</span><h2 id="dialogTitle">Keep tracking this question?</h2><p>This evidence didn't establish an answer after all.</p><p><strong>${esc(q.text)}</strong></p><div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Yes, keep tracking</button><button class="btn primary" data-action="stop-question" data-question-id="${esc(q.id)}">No, close it</button></div>`);
  }

  const pendingQuestionDecisions=new Set();
  async function executeQuestionReviewDecision(id,decision){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending'||pendingQuestionDecisions.has(id))return;
    const proposal=r.questionToCreate;
    if(!r.backendReviewId||!proposal?.id||proposal.status!=='pending'){
      showToast('Question suggestion unavailable. Refresh and review it again.');return;
    }
    pendingQuestionDecisions.add(id);
    const buttons=[...document.querySelectorAll('[data-review]')].filter(b=>b.dataset.review===id);
    buttons.forEach(b=>{b.disabled=true;});
    let result;
    try{
      result=await API.resolveReview(r.backendReviewId,decision==='update'?'accept':'keep',{
        questionProposalId:proposal.id,existingQuestionId:proposal.existing_question_id||null
      });
    }catch(error){
      // A timeout can happen after the server commits. Never claim that nothing
      // changed or optimistically retry a write whose outcome is unknown.
      showToast(error?.status===409?'This Review changed. Refresh and review it again.':'Could not confirm the result. Refresh before trying again.');
      if(error?.status===409)await hydrateBackend();
      return;
    }finally{
      pendingQuestionDecisions.delete(id);
      buttons.forEach(b=>{b.disabled=false;});
    }
    // Publish only server-confirmed effects. The existing Question collection
    // feeds Open Items, Workspace counts and Ask; never invent a local Question.
    r.status=decision;
    if(Array.isArray(result.questions))syncApiQuestions(result.questions);
    if(Array.isArray(result.open_reviews))replaceBackendOpenReviews(result.open_reviews);
    const note=state.data.notes.find(n=>n.id===r.evidenceId);
    if(note){
      note.reviewIds=(note.reviewIds||[]).filter(reviewId=>reviewId!==id);
      note.reviewId=note.reviewIds[0]||null;
      note.status=note.reviewIds.length?'pending':'reviewed';
    }
    state.expandedReviewId=null;
    if(result.question){state.openItemSections.questions=false;state.openQuestionsExpanded=true;}
    closeDialog();render();
    showToast(result.resolution==='question_created'?'Question created. Current State was not changed.':result.resolution==='question_linked'?'Linked to the existing Question. Current State was not changed.':'Review complete. No Question was created.');
    window.StateAnalytics?.track('review_decision',{reviewId:id,outcome:result.resolution,kind:'open_question'});
    // Ask stays read-only; an already visible answer is a snapshot, so flag it
    // for refresh immediately rather than leaving a closed Review as current.
    document.dispatchEvent(new Event('state-project-record-changed'));
    try{await hydrateBackend();}catch(error){console.warn('Review saved; refresh needed.',error);}
  }

  async function executeReviewDecision(id,decision,checkOnly,adjustments){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    state.expandedReviewId=null;
    const lightweight=decision!=='update'||checkOnly;

    if(r.backendReviewId){
      const previousStatus=r.status;
      r.status=decision;
      render();
      if(!lightweight) showDialog(`<span class="eyebrow">Updating</span><h2 id="dialogTitle">Updating Current State…</h2><p>Saving the reviewed decision to the project record.</p>`);
      try{
        const apiDecision=REVIEW_API_DECISION[decision]||'keep';
        const result=await API.resolveReview(r.backendReviewId,apiDecision,adjustments?.length?{adjustments}:{});
        // result.questions is the authoritative post-resolution open-Questions
        // list (see api.py). A #106 materially-adjusted accept can correctly
        // leave a linked Question open, so this full replacement is the only
        // source of truth for Question status here -- no local re-marking on
        // top of it, which would silently overwrite a Question the backend
        // deliberately left open.
        if(Array.isArray(result.questions))syncApiQuestions(result.questions);
        const note=state.data.notes.find(n=>n.id===r.evidenceId);
        if(note)note.status=decision==='update'?'accepted':'reviewed';
        if(decision==='update'){
          for(const p of (r.proposals||[])) if(p.operation==='retire'&&p.state_item_id){ const k=state.data.knowledge.find(x=>x.id===p.state_item_id); if(k)k.state='retired'; }
          syncApiState(result.state||[]);
        }
        const receiptItems=[];
        if(decision==='update'){
          for(const proposal of (r.proposals||[])){
            if(proposal.operation==='retire') continue;
            const adjusted=adjustments?.find(a=>a.proposal_id===proposal.id)?.adjusted_statement;
            const text=adjusted||proposal.proposed_statement||'';
            const matched=(result.state||[]).find(item=>norm(item.statement)===norm(text)) || (proposal.state_item_id?(result.state||[]).find(item=>item.id===proposal.state_item_id):null);
            if(matched) receiptItems.push({id:matched.id,statement:matched.statement,area:matched.area_id||'general'});
            else if(text) receiptItems.push({id:proposal.state_item_id||'',statement:text,area:'general'});
          }
        }
        if(decision==='acknowledge-risk'&&result.question){state.openItemSections.questions=false;state.openQuestionsExpanded=true;}
        updateNav(); render();
        if(lightweight) closeDialog(); // no interstitial was shown for these outcomes
        if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':reviewDecisionToast(decision,result));
        else showDecisionComplete({items:receiptItems});
        // Resolution response is authoritative; revalidate deterministically after it has rendered.
        await hydrateBackend();
        if(decision==='keep-current') maybeOfferToStopTrackingResolvedQuestion(r);
      }catch(e){
        r.status=previousStatus;
        render();
        showDialog(`<span class="eyebrow">Couldn’t complete review</span><h2 id="dialogTitle">Nothing was changed.</h2><p>${esc(e.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
      }
      return;
    }

    r.status=decision;
    const note=state.data.notes.find(n=>n.id===r.evidenceId); if(note)note.status=decision==='update'?'accepted':'reviewed';
    const receiptItems=[];
    if(decision==='update'){
      if(r.id==='r-access'){ const k=state.data.knowledge.find(k=>k.id==='k-access'); if(k){k.statement=k.afterReview;receiptItems.push({id:k.id,statement:k.statement,area:k.projectArea||'product'});} }
      if(r.questionToCreate && !state.data.questions.some(q=>q.id===r.questionToCreate.id)) state.data.questions.push(clone(r.questionToCreate));
      if(r.resolvesQuestionId){ const q=state.data.questions.find(q=>q.id===r.resolvesQuestionId); if(q){ q.status='resolved'; q.resolution='Resolved by reviewed Security follow-up'; } }
      state.data.history.unshift({id:'h-'+Date.now(),date:todayLabel(),dateISO:todayISO(),knowledgeId:r.id==='r-access'?'k-access':(r.id==='r-security'?'k-security':null),type:r.resolvesQuestionId?'Current understanding updated · open question resolved':(r.id.startsWith('r-info-')?'Evidence accepted without state change':'Current understanding updated'),before:r.current,after:r.id.startsWith('r-info-')?r.current:r.proposed,reason:r.id==='r-security'?'Security follow-up':r.id.startsWith('r-info-')?'Added project information':'Senior Support Rep interview',decision:'Human chose Update understanding'});
    } else state.data.history.unshift({id:'h-'+Date.now(),date:todayLabel(),dateISO:todayISO(),type:'Current understanding kept',before:r.current,after:r.current,reason:'Senior Support Rep interview preserved as evidence',decision:'Human chose Leave understanding unchanged'});
    render();
    if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':reviewDecisionToast(decision));
    else showDecisionComplete({items:receiptItems});
  }

  async function confirmReviewAdjust(id){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    const textareas=[...document.querySelectorAll('.adjust-proposal-text')];
    const adjustments=textareas
      .map(t=>({proposal_id:t.dataset.proposalId,adjusted_statement:t.value.trim()}))
      .filter(a=>a.adjusted_statement);
    if(!adjustments.length){showToast('Add a revision before updating.');return;}
    closeDialog();
    await executeReviewDecision(id,'update',false,adjustments);
  }

  function showDecisionComplete({items=[]}={}){
    const primary=items[0];
    const line=primary?truncateText(primary.statement,180):'The reviewed change is now part of Current State.';
    showDialog(`<span class="eyebrow">Review complete</span><h2 id="dialogTitle">Current State updated</h2><p>${esc(line)}</p><div class="dialog-actions"><button class="btn primary" data-action="review-receipt-project" data-project-area="${esc(primary?.area||'general')}" data-state-id="${esc(primary?.id||'')}">View Current State</button>${primary?.id?`<button class="btn secondary" data-action="view-topic-history" data-knowledge-id="${esc(primary.id)}">View History</button>`:'<button class="btn secondary" data-view="history">View History</button>'}</div>`);
  }


  function showDemoHelp(){
    window.StateAnalytics?.track('orientation_opened');
    const steps=[
      ['1. Add','Add Evidence. Capture a finding, decision, or meeting update. Approved Slack conversations can also become Evidence automatically.'],
      ['2. State interprets','AI compares new Evidence with Current State and identifies possible changes or unresolved Questions.'],
      ['3. Review & decide','Review proposed changes. Accept, reject/leave unchanged, or keep uncertainty open before Current State changes.'],
      ['4. Know','Accepted changes update Current State. Previous decisions remain in History.'],
      ['5. Ask','Use Ask State to understand the project without changing it.']
    ];
    const projectName=state.data.project?.name||'this project';
    showDialog(`<span class="eyebrow">How this works</span><h2 id="dialogTitle">State keeps accepted understanding separate from new information.</h2><div class="state-help-steps">${steps.map(([title,body])=>`<div class="state-help-step"><strong>${esc(title)}</strong><span>${esc(body)}</span></div>`).join('')}</div><p class="demo-flow-principle">AI interprets → software enforces → people decide</p><div class="demo-start"><span class="meta-label">Good places to start</span><button class="demo-start-action" data-action="demo-start-ask"><strong>Ask about ${esc(projectName)}</strong><span>Put a useful project question in Ask →</span></button><button class="demo-start-action" data-action="demo-start-note"><strong>Add a sample note</strong><span>Try new project information and see how Review handles it →</span></button><button class="demo-start-action" data-action="demo-start-project"><strong>Explore Current State</strong><span>Read the maintained view of what the project currently treats as true →</span></button><button class="demo-start-action" data-action="show-reviewer-guide"><strong>Take the quick tour</strong><span>Bring back the Workspace walkthrough banner →</span></button></div><div class="demo-reset-help"><div><strong>Want to start over?</strong><span>Restore the curated ${esc(projectName)} starting scenario. You can also reset ${esc(projectName)} from Settings.</span></div><button class="text-button demo-reset-link" data-action="confirm-demo-reset">Reset example data →</button></div><div class="dialog-actions demo-help-actions"><button class="btn primary" data-action="close-dialog">Got it</button></div>`);
  }

  function showDialog(html){
    if(overlay.hidden) state.dialogReturnFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Showing any new dialog invalidates a previous auto-close timer (if any)
    // so it can never fire against a different, later dialog. Callers that
    // want this one to auto-close call autoCloseDialog() right after.
    state.autoCloseToken=null;
    dialogBody.innerHTML=html; overlay.hidden=false; overlay.scrollTop=0; document.body.classList.add('modal-open');
    const dialog=document.querySelector('.dialog');
    if(dialog) dialog.scrollTop=0;
    const closeButton=dialog?.querySelector('.dialog-close');
    if(closeButton){ closeButton.disabled=!!state.isAnalyzing; closeButton.hidden=!!state.isAnalyzing; }
    requestAnimationFrame(()=>{
      overlay.scrollTop=0; if(dialog) dialog.scrollTop=0;
      const first=dialog?.querySelector('[autofocus], input:not([type="hidden"]), textarea, select');
      (first||dialog)?.focus({preventScroll:true});
      overlay.scrollTop=0; if(dialog) dialog.scrollTop=0;
    });
  }
  function closeDialog(){
    overlay.hidden=true; dialogBody.innerHTML=''; document.body.classList.remove('modal-open');
    state.autoCloseToken=null;
    const target=state.dialogReturnFocus; state.dialogReturnFocus=null;
    if(target && document.contains(target)) requestAnimationFrame(()=>target.focus());
  }
  // Info-only confirmations (no action buttons) otherwise sit on top of the
  // page indefinitely: their full-screen backdrop silently absorbs the
  // user's next click as a dismiss instead of letting it reach whatever was
  // actually clicked underneath (e.g. a sidebar nav tab), so it looks like
  // that first click did nothing. Auto-close after a readable delay instead
  // of requiring an explicit dismissal for dialogs with nothing to act on.
  function autoCloseDialog(delay=2200){
    const token=Symbol();
    state.autoCloseToken=token;
    setTimeout(()=>{ if(state.autoCloseToken===token && !overlay.hidden) closeDialog(); },delay);
  }
  function showProjectSettings(){
    const rulesStatus=state.backendStatus.rules;
    const rows=rulesStatus==='error'?'<div class="open-items-empty unavailable-inline">Project Rules could not be loaded. Try again before making changes.</div>':state.projectRules.length?state.projectRules.map(rule=>`<div class="project-rule-row"><div><span class="open-item-label question">${esc(rule.category)}</span><p>${esc(rule.text)}</p></div><button class="text-button" data-action="delete-project-rule" data-rule-id="${rule.id}">Remove</button></div>`).join(''):'<div class="open-items-empty">No project-specific rules yet.</div>';
    const form=rulesStatus==='error'?'':`<div class="project-rule-form"><label for="projectRuleCategory">Category</label><select id="projectRuleCategory"><option>Authority</option><option>Review</option><option>Sources</option><option selected>Interpretation</option></select><label for="projectRuleText">New rule</label><textarea id="projectRuleText" rows="3" placeholder="Example: Slack is supporting evidence, not authoritative approval."></textarea><button class="btn primary" data-action="save-project-rule">Add rule</button></div>`;
    showDialog(`<span class="eyebrow">Project settings</span><h2 id="dialogTitle">Rules</h2><p>Rules tell State how to interpret evidence and when to interrupt you. They are not Current State and State cannot change them on its own.</p><p class="settings-note">Rules apply to future analysis. Existing Reviews are not reinterpreted automatically.</p><div class="project-rule-list">${rows}</div>${form}<div class="demo-reset-zone"><span class="eyebrow">Example data</span><p>Restore ${esc(state.data.project?.name||'this project')} to the curated starting scenario with open Reviews, blockers, Questions, Notes, Rules, and History.</p><button class="btn secondary danger-light" data-action="confirm-demo-reset">Reset example data</button></div>`);
  }

  // state.md #108: entering Add Evidence from Current State's "Something
  // changed?" CTA uses the exact same dialog/flow/endpoint as every other
  // entry point -- only the guiding description line changes, and only as
  // UI copy. No prefill, no special correction object, no direct edit.
  // addDialogHtml is a pure function (same pattern as context-open-items-
  // view.js's questionDialogHtml) so it's directly testable without a DOM.
  function addDialogHtml(prefill='',{description}={}){
    const desc=description||'Add project information State should evaluate. It is preserved as Evidence first and cannot change Current State without Review.';
    return `<span class="eyebrow">Evidence</span><h2 id="dialogTitle">Add Evidence</h2><p>${esc(desc)}</p><textarea id="addInfoText" rows="7" aria-label="Evidence" placeholder="Paste a finding, decision, meeting update, or other project information...">${esc(prefill)}</textarea><div class="note-example-picker"><span class="meta-label">Try an example</span><div class="note-example-chips"><button type="button" data-action="sample-info" data-sample="plan">New plan</button><button type="button" data-action="sample-info" data-sample="research">Research finding</button><button type="button" data-action="sample-info" data-sample="constraint">Decision / constraint</button></div></div><div class="dialog-actions"><button class="btn primary" data-action="save-info">Add Evidence</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`;
  }
  function showAddDialog(prefill='',options={}){ showDialog(addDialogHtml(prefill,options)); }

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

  async function hydrateBackend(){
    if(!API)return;
    ensureProjectsList();
    const loadStatus=document.getElementById('appLoadStatus');
    if(loadStatus){loadStatus.textContent=`Opening ${state.data.project?.name||'the project'}…`;loadStatus.hidden=false;}
    state.workspaceAttentionStatus='loading';
    renderWorkspaceAttentionOnly();
    // Load the first action layer separately while the rest of the project opens.
    API.getAttention().then(payload=>{
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
      // state.md #114: the active project's identity comes from the backend
      // on every hydration -- never assumed to still be Northstar. Falls
      // back to whatever state.data.project already held (the static
      // pre-hydration placeholder, or the last-known project) if this
      // particular payload didn't carry one.
      if(payload.project) state.data.project={...state.data.project,...payload.project};
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

  let analysisClock=null;

  /* ----------------------------------------------------------------------
     Hydration

     Loads the project on open. getAttention() is a deliberate fast path so the
     attention row can render before the rest of the project arrives.
     ------------------------------------------------------------------- */
  function analyzingDialog(){
    return `<div class="analysis-state"><div class="analysis-orbit" aria-hidden="true"><span></span><span></span><span></span></div><span class="eyebrow">Analyzing evidence</span><h2 id="dialogTitle">Working out what this changes…</h2><p>Comparing the note with Current State and deciding whether anything needs your review.</p><div class="analysis-progress"><span class="analysis-pulse" aria-hidden="true"></span><span id="analysisElapsed">Starting analysis…</span></div><p class="analysis-patience">A thorough comparison can take around 10–20 seconds.</p></div>`;
  }
  function startAnalysisClock(){
    clearInterval(analysisClock);
    const started=Date.now();
    const update=()=>{
      const el=document.getElementById('analysisElapsed');
      if(!el)return;
      const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
      el.textContent=seconds<2?'Starting analysis…':`Analyzing… ${seconds}s`;
    };
    update(); analysisClock=setInterval(update,1000);
  }
  function stopAnalysisClock(){ clearInterval(analysisClock); analysisClock=null; }
  async function showAnalysisFailure(error,{draftMessage='This update needs another try.',safeContext='Your note'}={}){
    state.isAnalyzing=false; stopAnalysisClock();
    if(error?.evidenceId){
      await hydrateBackend();
      showDialog(`<span class="eyebrow">Saved, but not analyzed</span><h2 id="dialogTitle">${esc(safeContext)} is safe.</h2><p>The Evidence was saved, but analysis did not finish. Retry analysis without submitting it again.</p><div class="dialog-actions"><button class="btn primary" data-action="retry-analysis" data-evidence-id="${esc(error.evidenceId)}">Retry analysis</button><button class="btn secondary" data-action="close-dialog">Close</button></div>`);
      return;
    }
    showDialog(`<span class="eyebrow">Couldn’t analyze</span><h2 id="dialogTitle">${esc(draftMessage)}</h2><p>${esc(error?.message||'Analysis failed.')}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
  }

  async function saveInformation(){
    const text=document.getElementById('addInfoText')?.value.trim();
    if(!text)return;
    state.isAnalyzing=true;
    showDialog(analyzingDialog());
    startAnalysisClock();
    try{
      const result=await submitEvidence(text,'manual_note');
      const stamp=Date.now(), noteId='n-'+stamp;
      const apiReviews=(result.reviews||[]).map(r=>mapApiReview(r,text));
      state.data.notes.unshift({id:noteId,title:'Project update',text,source:'Update',date:todayLabel(),dateISO:todayISO(),topics:[],status:apiReviews.length?'pending':'no_review_needed',reviewId:apiReviews[0]?.id||null,reviewIds:apiReviews.map(r=>r.id),evidenceId:result.evidence_id});
      apiReviews.forEach(r=>{r.evidenceId=noteId; upsertBackendReview(r);});
      state.reviewBannerDismissed=false;
      state.isAnalyzing=false; stopAnalysisClock();
      updateNav();
      if(apiReviews.length){
        showDialog(`<span class="eyebrow">Evidence added</span><h2 id="dialogTitle">Evidence added</h2><p>${apiReviews.length===1?'1 Review needs your decision.':`${apiReviews.length} Reviews need your decisions.`}</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">View Review</button></div>`);
      }else{
        showDialog(`<span class="eyebrow">Evidence added</span><h2 id="dialogTitle">Evidence added</h2><p>Added as Evidence. Current State did not need a Review.</p>`);
      }
    }catch(e){ await showAnalysisFailure(e); }
  }


  /* ----------------------------------------------------------------------
     Actions and events

     The click/keyboard surface. Every user action funnels through here.
     ------------------------------------------------------------------- */
  async function saveWorkingNote(title,text){
    const clean=(text||'').trim(); if(!clean)return null;
    const cleanTitle=(title||'Untitled note').trim()||'Untitled note';
    const draft=await API.createDraft(cleanTitle,clean);
    const note={id:`draft-${draft.id}`,draftId:draft.id,title:draft.title,text:draft.content,source:'Working note',date:formatBackendDate(draft.updated_at||draft.created_at),dateISO:draft.updated_at||draft.created_at,topics:[],status:'working',backendDraft:true};
    state.data.notes=state.data.notes.filter(n=>n.draftId!==draft.id);
    state.data.notes.unshift(note);
    return note.id;
  }

  function syncApiDrafts(items){ state.data.notes=BACKEND_SYNC.syncApiDrafts(state.data.notes,items); }

  async function sendNoteToReview(id){
    const n=state.data.notes.find(x=>x.id===id); if(!n||n.status==='pending')return;
    state.isAnalyzing=true; showDialog(analyzingDialog()); startAnalysisClock();
    try{
      const result=await submitEvidence(n.text,'working_note');
      const apiReviews=(result.reviews||[]).map(r=>mapApiReview(r,n.text));
      if(n.draftId){try{await API.deleteDraft(n.draftId);}catch(err){console.warn('Evidence saved but draft cleanup failed:',err);}}
      n.backendDraft=false; n.draftId=null; n.backendManaged=true; n.status=apiReviews.length?'pending':'no_review_needed'; n.reviewId=apiReviews[0]?.id||null; n.reviewIds=apiReviews.map(r=>r.id); n.evidenceId=result.evidence_id;
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
      if(ids.length===1){state.expandedReviewId=ids[0];state.openItemSections.reviews=false;navigateTo('open-items');}
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
    if(act==='open-specific-review'){closeDialog();state.expandedReviewId=a.dataset.reviewId;state.openItemSections.reviews=false;navigateTo('open-items');}
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
    else if(act==='toggle-projects'){state.projectMenuOpen=!state.projectMenuOpen;render();}
    else if(act==='switch-project'){
      const projectId=a.dataset.projectId;
      if(!projectId||projectId===state.data.project?.id){state.projectMenuOpen=false;render();return;}
      state.projectMenuOpen=false;
      state.isAnalyzing=true;
      showDialog(`<span class="eyebrow">Switching projects</span><h2 id="dialogTitle">Opening ${esc(a.textContent.replace('Current','').trim())}…</h2><p>Loading Current State, Reviews, Questions, History, and Rules for this project.</p>`);
      try{
        const summary=await API.switchProject(projectId);
        state.data.project={...state.data.project,...summary};
        // Clear every locally-held record before re-hydrating -- never fall
        // back to context-data.js's static Northstar fixture here, or its
        // placeholder facts would flash on screen while the new project's
        // real data loads. The same "never let a stale project's records
        // leak into the next one" guarantee syncApiState() already gives a
        // single project, extended across a project switch.
        state.data.knowledge=[];
        state.data.reviews=[];
        state.data.questions=[];
        state.data.notes=[];
        state.data.history=[];
        state.data.drafts=[];
        state.projectRules=[];
        state.view='overview';
        state.result=null;state.resultQuery='';state.expandedReviewId=null;
        state.backendStatus={state:'loading',evidence:'loading',reviews:'loading',history:'loading',questions:'loading',rules:'loading',drafts:'loading'};
        state.isAnalyzing=false;
        closeDialog();
        render();
        await hydrateBackend();
        window.StateAnalytics?.track('project_switched',{projectId});
      }catch(err){
        state.isAnalyzing=false;
        showDialog(`<span class="eyebrow">Couldn't switch projects</span><h2 id="dialogTitle">The project was not changed.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);
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
    else if(act==='reload-page'){window.location.reload();}
    else if(act==='review-receipt-project'){const area=a.dataset.projectArea||'general';closeDialog();navigateTo('project-overview');requestAnimationFrame(()=>{scrollProjectTarget(`project-${area}`);const target=a.dataset.stateId?[...document.querySelectorAll('[data-state-id]')].find(el=>el.dataset.stateId===a.dataset.stateId)?.closest('.project-wiki-topic'):null;if(target){target.classList.add('is-recently-updated');setTimeout(()=>target.classList.remove('is-recently-updated'),2200);}});}
    else if(act==='close-dialog'){if(!state.isAnalyzing)closeDialog();}
    else if(act==='dismiss-and-open-items'){closeDialog();navigateTo('open-items');}
    else if(act==='retry-analysis'){ const evidenceId=a.dataset.evidenceId; state.isAnalyzing=true; showDialog(analyzingDialog()); startAnalysisClock(); try{await retryEvidenceAnalysis(evidenceId); state.isAnalyzing=false; stopAnalysisClock(); await hydrateBackend(); showDialog(`<span class="eyebrow">Done</span><h2 id="dialogTitle">Analysis complete.</h2><p>Open Items now reflects anything that needs your decision.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">View Open Items</button></div>`);}catch(err){state.isAnalyzing=false;stopAnalysisClock();showDialog(`<span class="eyebrow">Still unavailable</span><h2 id="dialogTitle">Your note is still safe.</h2><p>${esc(err.message)}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Close</button></div>`);} }
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

  document.addEventListener('change',e=>{ if(e.target.id==='notesStatusFilter'){state.notesFilter=e.target.value;renderNotes();} });

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
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.history-entry.is-linked[data-action="view-topic-history"]')){e.preventDefault();e.target.click();}
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
  document.addEventListener('click',e=>{ if(state.projectMenuOpen && !e.target.closest('.sidebar-project') && !e.target.closest('[data-action="toggle-projects"]')){state.projectMenuOpen=false;updateNav();} });
  overlay.addEventListener('click',e=>{if(e.target===overlay && !state.isAnalyzing) closeDialog();});
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
  window.STATE_ASK_TEST_API={state,detectAskIntent,intentAskHtml,looksLikeQuestion,hasExplicitUpdateIntent,upsertBackendReview,replaceBackendOpenReviews,mapApiReview,linkedReviewFor,questionDialogHtml,renderOverview,renderOpenItems,refreshOpenReviews,historyType,syncApiHistory,addDialogHtml,historyEntry};
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