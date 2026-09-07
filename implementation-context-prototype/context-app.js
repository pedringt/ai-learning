(() => {
  const D = window.PROJECT_CONTEXT_DATA;
  const API = window.STATE_API;
  const ASK = window.STATE_ASK;
  const NOTES_VIEW = window.STATE_NOTES_VIEW;
  const OPEN_ITEMS_VIEW = window.STATE_OPEN_ITEMS_VIEW;
  const PROJECT_VIEW = window.STATE_PROJECT_VIEW;
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
  const openQuestions = () => API
    ? (state.backendStatus.questions==='loaded' ? state.data.questions.filter(q => q.status === 'open' && q.backendManaged) : [])
    : state.data.questions.filter(q => q.status === 'open');
  const pendingReviews = () => API
    ? (state.backendStatus.reviews==='loaded' ? state.data.reviews.filter(r => r.status === 'pending' && r.backendReviewId) : [])
    : state.data.reviews.filter(r => r.status === 'pending');
  const uiPendingReviews = () => pendingReviews();
  const accessUpdated = () => state.data.reviews.find(r => r.id==='r-access')?.status === 'update';
  const securityUpdated = () => state.data.reviews.find(r => r.id==='r-security')?.status === 'update';
  const todayISO = () => { const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const todayLabel = () => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date());
  const isoValue = item => item?.dateISO || item?.createdISO || '';
  const sortDateAsc = (a,b) => isoValue(a).localeCompare(isoValue(b));
  const sortDateDesc = (a,b) => isoValue(b).localeCompare(isoValue(a));

  function updateNav(){
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===state.view));
    const projectActive=state.view==='project-overview';
    const projectToggle=document.querySelector('.project-nav-toggle'); if(projectToggle) projectToggle.classList.toggle('active',projectActive);
    const sub=document.getElementById('projectSubnav'); if(sub) sub.hidden=!projectActive;
    const actionCount=document.getElementById('openItemsActionCount'); if(actionCount){const n=uiPendingReviews().length+openQuestions().filter(q=>q.blocking).length;actionCount.textContent=n;actionCount.hidden=!n;actionCount.setAttribute('aria-label',`${n} items need attention`);}
    document.querySelectorAll('[data-project-area]').forEach(b=>{
      const area=b.dataset.projectArea;
      b.hidden=state.backendStatus.state!=='loaded'||currentKnowledge(area).length===0;
    });
    const pm=document.getElementById('projectMenu'), ps=document.getElementById('projectSwitcher'); if(pm)pm.hidden=!state.projectMenuOpen; if(ps)ps.setAttribute('aria-expanded',state.projectMenuOpen?'true':'false');
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

  function navigateTo(view,{preserveHistoryTopic=false,preserveHistoryEvidence=false}={}){
    state.view=view;
    if(view==='history'){
      if(!preserveHistoryTopic)state.historyTopic=null;
      if(!preserveHistoryEvidence)state.historyEvidenceId=null;
    }else{state.historyTopic=null;state.historyEvidenceId=null;}
    // Navigation is not a new Ask session. Keep the current answer/query so a
    // user can inspect Project, Open Items, Notes, or History and return to the
    // same working Ask. Explicit New ask / reset actions own session cleanup.
    render();
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
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


  const projectMetaIds=new Set(['k-stage','k-outcome']);
  function currentKnowledge(area){ return state.data.knowledge.filter(k=>k.state==='current' && (!area || (!projectMetaIds.has(k.id)&&k.projectArea===area))); }

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
    return `<div class="ask-live-loading${preview?.grounded?' has-grounded-preview':''}"><span class="ask-loading-mark" aria-hidden="true"></span><div><strong>${esc(label)}</strong><p>${esc(message)}</p><p class="ask-loading-note">Suggested prompts below answer instantly from what's already known -- this one runs a live check against the full project record.</p></div></div>`;
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
    const breakdownParts=[];
    if(reviews.length) breakdownParts.push(`${reviews.length} review${reviews.length===1?'':'s'}`);
    if(blockers.length) breakdownParts.push(`${blockers.length} blocking question${blockers.length===1?'':'s'}`);
    const rows=items.map(item=>`<button class="attention-item ${item.kind}" data-action="${item.kind==='review'?'open-specific-review':'go-open-question'}" ${item.kind==='review'?`data-review-id="${esc(item.id)}"`:`data-question-id="${esc(item.id)}"`}><span class="attention-item-copy"><span class="attention-kind">${esc(item.label)}</span><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></span><span class="attention-arrow" aria-hidden="true">→</span></button>`).join('');
    return `<section class="workspace-attention"><div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>${total===1?'1 item is waiting on you':`${total} items are waiting on you`}</h3><p class="attention-intro-text">${esc(breakdownParts.join(' · '))}</p></div><button class="text-button" data-view="open-items">Open Items →</button></div><div class="attention-list">${rows}</div></section>`;
  }
  // Answers "What actually changed?" -- up to 3 meaningful recent decisions,
  // led by the substance of the change (history's `after` text), not a
  // generic "X was updated" label. Not a second History feed: no
  // filtering/search here, just a link out. Rows have no trailing arrow --
  // the whole row is already the click target.
  function whatChangedHtml(){
    const entries=(state.data.history||[]).slice().sort(sortDateDesc).slice(0,3);
    if(!entries.length) return '';
    const rows=entries.map(h=>{
      const date=h.date||formatBackendDate(h.changed_at);
      const topic=h.knowledgeId?state.data.knowledge.find(k=>k.id===h.knowledgeId):null;
      const kicker=topic?`${topic.title} · ${date}`:date;
      const summary=h.after||h.type||historyType(h);
      const linkAttrs=h.knowledgeId?`data-action="view-topic-history" data-knowledge-id="${esc(h.knowledgeId)}"`:'data-view="history"';
      return `<button class="recent-update-row" ${linkAttrs}><strong>${esc(truncateText(summary,120))}</strong><span>${esc(kicker)}</span></button>`;
    }).join('');
    return `<section class="workspace-recent"><div class="workspace-recent-head"><span class="eyebrow">What changed</span><button class="text-button" data-view="history">History →</button></div><div class="recent-update-list">${rows}</div></section>`;
  }
  // Answers "Where does the project stand?" -- a Current State pulse across
  // three real dimensions: what's fresh (last change), how much is
  // established (decision count), and what's blocking (open questions).
  // Three genuine rows, not padding added to match What Changed's height.
  function currentStateHtml(){
    const last=(state.data.history||[]).slice().sort(sortDateDesc)[0];
    const lastUpdated=last?(last.date||formatBackendDate(last.changed_at)):null;
    const lastTopic=last?.knowledgeId?state.data.knowledge.find(k=>k.id===last.knowledgeId):null;
    const lastLabel=lastTopic?.title||last?.type||'';
    const decisionCount=(state.data.knowledge||[]).filter(k=>k.state==='current').length;
    const openCount=openQuestions().length;
    const openHeadline=openCount===0?'✓ No open questions':`${openCount} open question${openCount===1?'':'s'}`;
    return `<section class="workspace-status-card"><span class="eyebrow">Current State</span><div class="workspace-status-body">
      <div class="workspace-status-item"><strong class="workspace-status-value">${lastUpdated?`Updated ${esc(lastUpdated)}`:'Not yet established'}</strong><div class="workspace-status-row"><span>${lastLabel?esc(lastLabel):'Most recent change.'}</span></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value">${decisionCount} decision${decisionCount===1?'':'s'} recorded</strong><div class="workspace-status-row"><span>What the project currently treats as true.</span><button class="text-button" data-view="project-overview">Browse Current State →</button></div></div>
      <div class="workspace-status-item"><strong class="workspace-status-value${openCount===0?' is-clear':''}">${esc(openHeadline)}</strong><div class="workspace-status-row"><span>${openCount===0?'Nothing blocking progress.':'Waiting on a decision.'}</span><button class="text-button" data-view="open-items">Open Items →</button></div></div>
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
      <section class="overview-heading"><div class="overview-heading-row"><div><span class="eyebrow">Workspace</span><h2>Northstar</h2>${D.project?.stage?`<p class="overview-stage">${esc(D.project.stage)}</p>`:''}</div><button class="btn secondary overview-add" data-action="add-info">+ Add Evidence</button></div></section>
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

  function findScenario(query){
    const q=norm(query);
    if(!q) return null;
    let best=null, score=0;
    for(const s of state.data.askScenarios){
      for(const alias of s.aliases){
        const a=norm(alias);
        let n=0;
        if(q===a) n=100;
        else if(a.length>=12 && (q.includes(a)||a.includes(q))) n=82;
        else {
          const stop=new Set(['what','know','about','this','that','have','with','from','your','project','still','does','when','where','which','would','could','should','anything','something','into']);
          const words=a.split(' ').filter(w=>w.length>3&&!stop.has(w));
          const hits=words.filter(w=>q.split(' ').includes(w)).length;
          if(words.length>=2 && hits===words.length) n=72;
          else if(words.length>=3 && hits>=Math.ceil(words.length*.75)) n=60;
        }
        if(n>score){ score=n; best=s; }
      }
    }
    return score>=60?best:null;
  }

  const askTopicTerms={
    'feature-access':['feature access','plan access','entitlement','entitlements','grandfathered','plan matrix'],
    'automation':['automation','automate','automatically','autonomy','autonomous','auto send','auto-send','send replies','send responses'],
    'security':['security','human review','review boundary','unsafe','high risk','high-risk','read only','read-only','account changing','account-changing'],
    'success-metrics':['evaluation','evaluate','metrics','success metric','threshold','quality'],
    'data':['data','retention','deletion','logging','customer data','account changing','account-changing','write action','write actions','read only','read-only'],
    'vendor':['vendor','maya','retention','sub processor','sub-processor'],
    'operations':['training','enablement','implementation','rollout','feedback'],
    'scope':['pilot scope','scope','tier 1','tier1'],
    'workflow':['workflow','human review','draft','rep review'],
    'knowledge':['knowledge','grounding','source','sources','documentation','slack']
  };

  /* ----------------------------------------------------------------------
     Ask — intent and deterministic scenarios

     Routes a question to a known intent or fixture scenario. This is the
     no-backend path; it also backs the deterministic Ask behavior suite.
     ------------------------------------------------------------------- */
  function askTopics(q){
    return Object.entries(askTopicTerms).filter(([,terms])=>terms.some(t=>q.includes(t))).map(([topic])=>topic);
  }
  function overlapsTopics(item,topics){ return (item.topics||[]).some(t=>topics.includes(t)); }
  function structuredAskResult(raw){
    const q=norm(raw), topics=askTopics(q); if(!topics.length)return null;
    const wantsHistory=/\b(changed|change|history|historical|originally|original|previously|before|used to|why did|superseded|earlier)\b/.test(q) || (q.includes('why') && (q.includes('slack')||q.includes('auto send')||q.includes('autonomous')));
    const wantsNotes=/\b(note|notes|evidence|source|sources|find|show me|material)\b/.test(q);
    const wantsOpen=/\b(open|unresolved|unknown|pending|waiting|still need|not know)\b/.test(q);
    if(wantsHistory){
      const items=state.data.history.filter(h=>{
        if(h.knowledgeId) return overlapsTopics(state.data.knowledge.find(k=>k.id===h.knowledgeId)||{},topics);
        const text=norm(`${h.before} ${h.after} ${h.reason} ${h.type}`);
        return topics.some(topic=>(askTopicTerms[topic]||[topic]).some(term=>text.includes(norm(term))));
      });
      if(items.length)return {kind:'history',topics,items:items.slice().sort(sortDateAsc)};
    }
    if(wantsOpen){
      const questions=openQuestions().filter(x=>overlapsTopics(x,topics));
      const reviews=pendingReviews().filter(x=>overlapsTopics(x,topics));
      if(questions.length||reviews.length)return {kind:'open',topics,questions,reviews};
    }
    if(wantsNotes){
      const items=state.data.notes.filter(n=>overlapsTopics(n,topics));
      if(items.length)return {kind:'notes',topics,items:items.slice().sort(sortDateDesc).slice(0,6)};
    }
    const current=state.data.knowledge.filter(k=>k.state==='current'&&overlapsTopics(k,topics));
    if(current.length)return {kind:'current',topics,items:current.slice(0,5)};
    return null;
  }
  function structuredAskHtml(r){
    if(r.kind==='current') return `<div class="result-label">Current State</div><h2>What State currently knows</h2><div class="structured-results">${r.items.map(k=>`<article class="structured-result"><span class="knowledge-status current">Current State</span><h3>${esc(k.title)}</h3><p>${esc(k.statement)}</p></article>`).join('')}</div>`;
    if(r.kind==='notes') return `<div class="result-label">Project evidence</div><h2>Relevant notes</h2><p class="result-lede">Notes are evidence and working material; they are not automatically Current State.</p><div class="structured-results">${r.items.map(n=>`<article class="structured-result"><span class="knowledge-status ${n.status==='pending'?'pending':'evidence'}">${n.status==='pending'?'Pending Review':'Evidence'}</span><h3>${esc(n.title)}</h3><span class="note-source">${esc(n.source)} · ${esc(n.date)}</span><p>${esc(n.text)}</p></article>`).join('')}</div>`;
    if(r.kind==='open') return `<div class="result-label">Open Items</div><h2>What is not settled yet</h2><div class="structured-results">${r.reviews.map(x=>`<article class="structured-result"><span class="knowledge-status pending">Pending Review</span><h3>${esc(x.title)}</h3><p>${esc(x.unresolved)}</p></article>`).join('')}${r.questions.map(x=>`<article class="structured-result"><span class="knowledge-status question">Open Question</span><h3>${esc(x.text)}</h3><p>${esc(x.origin)}</p></article>`).join('')}</div>`;
    return `<div class="result-label">History</div><h2>How this understanding changed</h2><div class="structured-results">${r.items.map(h=>`<article class="structured-result"><span class="knowledge-status history">Historical</span><h3>${esc(h.type)}</h3><span class="note-source">${esc(h.date)} · ${esc(h.reason)}</span><p><strong>Before:</strong> ${esc(h.before)}</p><p><strong>After:</strong> ${esc(h.after)}</p></article>`).join('')}</div>`;
  }

  function detectAskIntent(raw){
    const q=norm(raw); if(!q)return null;
    const has=(re)=>re.test(q);
    const audience=has(/\b(support|support team|reps|agents)\b/)?'support':has(/\b(security|infosec)\b/)?'security':has(/\b(leadership|exec|executive|boss)\b/)?'leadership':'general';
    const channel=has(/\b(slack|channel|post)\b/)?'slack':has(/\b(email|e mail)\b/)?'email':has(/\b(standup|stand up)\b/)?'standup':has(/\b(tldr|tl dr|talking points)\b/)?'brief':'update';

    // Output job is separate from project topic so the same state can render differently by audience/channel.
    if(has(/\b(write|draft|turn|create|generate|summarize|summary|update|post)\b/) && has(/\b(slack|email|standup|status update|weekly update|project update|leadership update|support update|security update|talking points|tldr|tl dr)\b/)) return {kind:'artifact',audience,channel};

    // Correct a false premise before ordinary topic routing can accidentally reinforce it.
    if(has(/\b(why did we|when did we|did we|we decided|we agreed|decision was|target is)\b/) && has(/\b(50|fifty|0|zero)\b/) && has(/\b(automation|autonomy|autonomous|percent|percentage|resolution|target)\b/)) return {kind:'premise-correction',topic:'automation'};

    // Questions that ask State to predict, approve, prioritize, or invent a value become explicit unknowns with useful context.
    if(has(/\b(when is launch|launch date|when will we launch|how long until.*launch|when will.*ready|how long until.*ready)\b/)) return {kind:'unknown-context',unknownType:'launch-date'};
    if(has(/\b(what will roi be|what is roi|roi estimate|expected roi)\b/)) return {kind:'unknown-context',unknownType:'roi'};
    if(has(/\b(will security approve|will infosec approve|will security sign off)\b/)) return {kind:'unknown-context',unknownType:'security-approval'};
    if(has(/\b(will this work|will (this|the) pilot succeed|is the pilot going to succeed|will we succeed)\b/)) return {kind:'unknown-context',unknownType:'future-success'};
    if(has(/\b(is this safe|is the risk acceptable|are the risks acceptable|acceptable risk)\b/)) return {kind:'unknown-context',unknownType:'risk-acceptance'};
    if(has(/\b(can we ship|should we ship|can we launch|should we launch|go live now|ready to ship)\b/)) return {kind:'unknown-context',unknownType:'launch-decision'};
    if(has(/\b(should we automate|can this be autonomous|can we make this autonomous|should this be autonomous|remove human review)\b/)) return {kind:'unknown-context',unknownType:'autonomy-decision'};
    if(has(/\b(which source should we use|what source should we use|authoritative replacement|replacement source|which system.*authority)\b/) && has(/\b(feature|access|entitlement|authoritative|source)\b/)) return {kind:'unknown-context',unknownType:'authority-choice'};
    if(has(/\b(how accurate|accuracy threshold|what threshold|launch blocking thresholds?|launch-blocking thresholds?|how good does it need|what quality level)\b/)) return {kind:'unknown-context',unknownType:'thresholds'};
    if(has(/\b(who makes the final.*decision|who makes.*launch decision|who signs off|final approver|final approval owner)\b/)) return {kind:'unknown-context',unknownType:'signoff'};
    if(has(/\b(what will this cost|how much will this cost|what is the budget|whats the budget|budget for|cost estimate)\b/)) return {kind:'unknown-context',unknownType:'cost'};
    if(has(/\b(what is most important|whats most important|what should we prioritize|highest priority|top priority|what comes first)\b/)) return {kind:'unknown-context',unknownType:'priority'};
    if(has(/\b(are we on track|are we behind|are we ahead|schedule health|timeline health)\b/)) return {kind:'progress-inference'};

    if(has(/\b(blocker|blockers|blocking|blocked|holding us up|hold us up|in the way|stop us|stopping us|prevent us|waiting on|needs attention|need attention)\b/)) return {kind:has(/\b(who owns|owner|ownership)\b/)?'blocker-owners':'blockers'};
    if(has(/\b(needs review|need review|pending review|awaiting review|review first|evidence.*incorporated|new evidence)\b/)) return {kind:'pending'};
    if(has(/\b(current status|where are we|catch me up|what should i know|project status|status of|overall status|summarize the project|summarize project|project summary|what are we building|what are we making)\b/)) return {kind:'status'};
    if(has(/\b(open questions|still open|unresolved|unknowns|dont know|do not know|havent figured|have not figured|what havent we figured out|still need to figure|assumptions.*validated|what isnt decided|what is not decided)\b/)) return {kind:'open'};
    if(has(/\b(what have we decided|what did we decide|decisions|decision about|agreed on|established about)\b/)) return {kind:'decisions'};
    if(has(/\b(original plan|how did we get here|what changed our minds|superseded|used to|history|historical|previously|originally|how.*change|before vs|before versus|different now)\b/)) return {kind:'history'};
    if(has(/\b(in scope|out of scope|scope|must haves|must have|can wait|requires a human|require a human|account changes|send directly|send to customers|what arent we doing|what are we not doing|what shouldnt.*do|what should not.*do)\b/)) return {kind:'scope'};
    if(has(/\b(who is this for|how will reps|how do reps|human review happen|if the ai is wrong|training|workflow)\b/)) return {kind:'workflow'};
    if(has(/\b(prepare|prep|brief me|meeting|questions to ask|decisions needed)\b/) && has(/\b(security|support|leadership|meeting)\b/)) return {kind:'meeting',audience};
    if(has(/\b(what does security care about|what does infosec care about|security|safety|governance|high risk|high-risk|guardrail|sensitive|escalation rule|human review)\b/)) return {kind:'security'};
    if(has(/\b(who owns|who needs to approve|who approves|who are we waiting on|stakeholder|what does .* care about)\b/)) return {kind:'stakeholders'};
    if(has(/\b(automation target|autonomy target|autonomous resolution|how autonomous|how much.*automate|percent.*automate|percentage.*automate|trying for [0-9]+|targeting [0-9]+|[0-9]+ percent|0 target|0 the target|zero percent)\b/)) return {kind:'automation'};
    if(has(/\b(authoritative|authoritative source|grounding|source of truth|needed data|what data|read only|read-only|plan rules|account exceptions|slack.*source|source conflict)\b/)) return {kind:'data'};
    if(has(/\b(success|metrics|evaluate|evaluation|what good looks like|what does good look like|response time|reviewer edits|unsupported claims|failure severity|stop criteria|expand criteria)\b/)) return {kind:'evaluation'};
    if(has(/\b(ready to build|ready to pilot|ready to launch|ready for implementation|whats next|what is next|what should we do next|what do we do next|next steps|resolve first|started tomorrow|start tomorrow)\b/)) return {kind:'readiness'};
    if(has(/\b(contradiction|contradictions|conflict|conflicts|outdated|superseded|disagree|disagreement|reconcile)\b/)) return {kind:'compare'};
    if(has(/\b(how do we know|where did that come from|confirmed|assumption|confidence|provenance|what evidence|was this reviewed)\b/)) return {kind:'provenance'};
    if(has(/\b(who knows|who reviews|who approves|who unblocks|contact|owner)\b/)) return {kind:'contacts'};
    if(has(/\b(find|show me|where did we discuss|pull up|retrieve)\b/)) return {kind:'retrieve'};
    return null;
  }

  function unresolvedBundle(){ return {questions:openQuestions(),reviews:pendingReviews()}; }
  function compactOpenHtml(title,lede){
    const {questions,reviews}=unresolvedBundle();
    return `<div class="result-label">Open Items</div><h2>${esc(title)}</h2><p class="result-lede">${esc(lede)}</p><div class="structured-results">${reviews.slice(0,4).map(x=>`<article class="structured-result"><span class="knowledge-status pending">Pending Review</span><h3>${esc(x.title)}</h3><p>${esc(x.unresolved)}</p></article>`).join('')}${questions.slice(0,5).map(x=>`<article class="structured-result"><span class="knowledge-status question">Open Question</span><h3>${esc(x.text)}</h3><p>${esc(x.origin)}</p></article>`).join('')}</div>`;
  }
  function artifactHtml(intent){
    const support=intent.audience==='support', security=intent.audience==='security', leadership=intent.audience==='leadership';
    const label=`Draft · ${support?'support team ':security?'security ':leadership?'leadership ':''}${intent.channel==='slack'?'Slack update':intent.channel==='email'?'email':intent.channel==='standup'?'standup update':intent.channel==='brief'?'talking points':'project update'}`;
    if(intent.channel==='slack') return `<div class="result-label">${esc(label)}</div><div class="draft polished-draft"><p><strong>Northstar update</strong></p><ul><li>Discovery is nearly complete; first implementation remains Tier 1 troubleshooting with human review.</li><li>Still unresolved: authoritative feature-access source, vendor retention terms, and launch-blocking evaluation thresholds.</li><li>No autonomous-resolution target is established; the earlier 50% request is not a commitment.</li><li>Next: review pending evidence and turn settled discovery into the implementation backlog.</li></ul></div><button class="btn secondary" data-action="copy-draft">Copy draft</button>`;
    if(support) return scenarioResult({topics:['automation','operations'],output:'support-draft'});
    if(leadership) return scenarioResult({topics:['automation','security','feature-access','operations'],output:'draft'});
    if(security) return `<div class="result-label">${esc(label)}</div><div class="draft polished-draft"><p><strong>Northstar security update</strong></p><p>The first implementation remains read-only and human-reviewed. Account-changing actions are out of scope. High-risk failures are being treated separately from average quality.</p><p>Open items are the authoritative account-level source for feature access, confirmation of vendor retention/deletion terms, and explicit launch-blocking evaluation thresholds. No safe autonomous-resolution percentage has been established.</p></div><button class="btn secondary" data-action="copy-draft">Copy draft</button>`;
    return scenarioResult({topics:['automation','security','feature-access','operations'],output:'summary'});
  }
  function reasoningFrame({label='Not established',title,known,implication,resolve}){
    return `<div class="result-label">${esc(label)}</div><h2>${esc(title)}</h2><div class="answer-prose reasoning-frame"><p><strong>What State knows:</strong> ${esc(known)}</p><p><strong>What that means:</strong> ${esc(implication)}</p><p><strong>What would resolve it:</strong> ${esc(resolve)}</p></div>`;
  }

  function unknownContextHtml(type){
    const frames={
      'launch-date':{
        title:'There is no accepted launch date yet.',
        known:'Implementation planning can proceed with the bounded Tier 1, human-reviewed use case.',
        implication:'State cannot honestly judge a launch date or schedule variance while feature-access authority, vendor retention terms, and launch-blocking evaluation thresholds remain unresolved.',
        resolve:'Agree the remaining launch gates and record an accepted implementation and launch plan.'
      },
      'roi':{
        title:'ROI has not been established.',
        known:'The pilot has workflow and quality measures, including response time, reviewer edits, escalation behavior, unsupported claims, and failure severity.',
        implication:'Those measures can show whether the pilot is useful and safe, but State does not have accepted production volume, cost, or realized-effort data needed for a reliable ROI estimate.',
        resolve:'Define the cost model and collect enough pilot or production usage evidence to calculate value against it.'
      },
      'security-approval':{
        title:'Future Security approval is not known.',
        known:'The pilot is read-only, human-reviewed, excludes account-changing actions, and Security has asked for high-risk failure categories and evidence.',
        implication:'Those controls describe the current boundary; they do not establish that Security will approve launch or a future reduction in human review.',
        resolve:'Close the retention and evaluation-threshold questions, test the agreed high-risk categories, and record Security’s decision.'
      },
      'future-success':{
        title:'The pilot outcome is not known yet.',
        known:'The team has defined a bounded workflow and a multi-dimensional evaluation approach rather than a single automation metric.',
        implication:'State can describe how success will be evaluated, but it cannot predict whether the pilot will meet those measures before evidence exists.',
        resolve:'Run the pilot against the agreed measures and compare the results with explicit launch or expansion criteria.'
      },
      'risk-acceptance':{
        title:'Risk acceptance has not been recorded.',
        known:'The first implementation is read-only and human-reviewed; sensitive account actions are out of scope, and unsupported claims are treated as high-risk failures.',
        implication:'Those safeguards reduce exposure, but State should not convert safeguards into a judgment that the remaining risk is acceptable.',
        resolve:'Define the unacceptable failure categories and thresholds, test against them, and record the responsible reviewer’s risk decision.'
      },
      'launch-decision':{
        title:'No launch decision is recorded.',
        known:'Implementation planning can proceed, but launch criteria still require explicit thresholds and several security/data questions remain open.',
        implication:'The project is far enough along to plan implementation, not far enough for State to recommend or declare launch.',
        resolve:'Close the launch gates, review the pilot evidence, and record the human launch decision.'
      },
      'autonomy-decision':{
        title:'No decision to make the pilot autonomous is established.',
        known:'Leadership asked whether 50% autonomous resolution might be achievable, while the current pilot still requires human review.',
        implication:'A leadership question is not an autonomy target, and current safeguards should not be silently relaxed because a percentage was discussed.',
        resolve:'Collect evidence across agreed high-risk failure categories and explicitly review whether any workflow can safely move beyond human review.'
      },
      'authority-choice':{
        title:'No authoritative replacement source has been selected yet.',
        known:'Plan rules are a useful input, but account-level exceptions mean plan alone cannot determine effective feature access.',
        implication:'State can explain why the old authority model is insufficient, but it should not invent which system becomes authoritative.',
        resolve:'Identify and validate the account-level source that reliably reflects effective entitlements, then record that source as Current State.'
      },
      'thresholds':{
        title:'Launch-blocking quality thresholds are not established yet.',
        known:'The pilot will evaluate response time, reviewer edits, escalation behavior, unsupported claims, and failure severity, with high-risk failures treated separately.',
        implication:'The evaluation dimensions are known, but there is not yet an accepted numeric or categorical boundary that State can call “good enough to launch.”',
        resolve:'Agree which failure categories block launch and the acceptable limits for each, then record those thresholds.'
      },
      'signoff':{
        title:'A final launch decision owner is not established in State.',
        known:'Support owns frontline workflow and feedback; Security owns risk and data-boundary review; Leadership is asking about eventual autonomy.',
        implication:'Known stakeholder responsibilities do not prove who has final launch authority.',
        resolve:'Assign and record the final decision right, including any required Security or operational approvals.'
      },
      'cost':{
        title:'No accepted budget or cost estimate is recorded.',
        known:'State has the bounded pilot workflow and the operational/evaluation work still required.',
        implication:'That is enough to discuss implementation scope, not enough to invent vendor, model, engineering, support, or review costs.',
        resolve:'Define the expected usage, technical architecture, vendor/model pricing, implementation effort, and ongoing human-review load.'
      },
      'priority':{
        title:'No explicit priority ranking is recorded.',
        known:'The unresolved items with direct launch implications are feature-access authority, vendor retention terms, and launch-blocking evaluation thresholds.',
        implication:'State can surface impact and dependencies, but it should not silently turn them into a ranked roadmap.',
        resolve:'Have the project owner rank the remaining work or record a sequencing decision based on dependencies and risk.'
      }
    };
    return reasoningFrame(frames[type]||{title:'That is not established yet.',known:'State has related project context.',implication:'The available context does not support the requested conclusion.',resolve:'Record the missing decision or evidence before treating it as known.'});
  }

  function premiseCorrectionHtml(i){
    if(i.topic==='automation') return `<div class="result-label">Premise correction</div><h2>We did not decide on a 50% or 0% automation target.</h2><div class="answer-prose"><p><strong>Current State:</strong> Leadership asked whether 50% autonomous resolution was achievable, but that request did not become a commitment. “Not established” also does not mean 0%.</p><p><strong>Why this matters:</strong> The first implementation remains human-reviewed, and any future autonomy decision depends on evidence across agreed high-risk failure categories.</p></div>${sourceDisclosure(['n-leadership-followup','n-security-workshop'])}`;
    return fallbackResult();
  }

  function progressInferenceHtml(){
    return reasoningFrame({
      label:'Cannot determine from current state',
      title:'State cannot honestly say whether the project is ahead or behind.',
      known:'Discovery is nearly complete and implementation planning is next; the bounded Tier 1 workflow is established, while several launch-critical questions remain unresolved.',
      implication:'There is meaningful progress, but no accepted launch date or complete delivery baseline exists to compare against.',
      resolve:'Record an implementation schedule or launch baseline; then State can compare actual progress with it.'
    });
  }

  function blockerOwnersHtml(){
    return `<div class="result-label">Open dependencies</div><h2>Likely constraints and the ownership State can actually support</h2><div class="structured-results"><article class="structured-result"><span class="knowledge-status question">Open Question</span><h3>Authoritative feature-access source</h3><p><strong>Ownership:</strong> not fully assigned. Support can validate workflow reality; Security has a dependency because customer/account data is involved.</p></article><article class="structured-result"><span class="knowledge-status pending">Pending Review</span><h3>Vendor retention and deletion terms</h3><p><strong>Ownership:</strong> Security/Legal confirmation is still needed; the vendor contact can supply source material but cannot make the internal decision.</p></article><article class="structured-result"><span class="knowledge-status question">Open Question</span><h3>Launch-blocking evaluation thresholds</h3><p><strong>Ownership:</strong> Security has defined the risk requirement, but State does not record one final owner for setting the launch threshold.</p></article></div><p class="result-lede">State is deliberately not inventing a single owner where the project record only shows shared dependencies.</p>`;
  }

  function intentAskHtml(i){
    if(i.kind==='artifact')return artifactHtml(i);
    if(i.kind==='unknown-context')return unknownContextHtml(i.unknownType);
    if(i.kind==='premise-correction')return premiseCorrectionHtml(i);
    if(i.kind==='progress-inference')return progressInferenceHtml();
    if(i.kind==='blocker-owners')return blockerOwnersHtml();
    if(i.kind==='blockers')return compactOpenHtml('Items that may be blocking or constraining progress','State does not know that every unresolved item is a confirmed blocker. These are the unresolved dependencies and review items most likely to constrain implementation.');
    if(i.kind==='pending')return compactOpenHtml('What needs review','Pending evidence has not changed Current State yet.');
    if(i.kind==='open')return compactOpenHtml('What is not settled yet','These questions and pending reviews are intentionally preserved as unresolved.');
    if(i.kind==='status')return scenarioResult({topics:['automation','security','feature-access','success-metrics','operations'],output:'summary'});
    if(i.kind==='decisions')return `<div class="result-label">Current State</div><h2>Decisions currently reflected in the project</h2><div class="structured-results">${state.data.knowledge.filter(k=>k.state==='current').slice(0,8).map(k=>`<article class="structured-result"><span class="knowledge-status current">Current State</span><h3>${esc(k.title)}</h3><p>${esc(k.statement)}</p></article>`).join('')}</div>`;
    if(i.kind==='history')return structuredAskHtml({kind:'history',items:state.data.history.slice().sort(sortDateAsc)});
    if(i.kind==='scope')return `<div class="result-label">Scope & requirements</div><h2>The first implementation is deliberately bounded.</h2><div class="answer-prose"><p>It is a Tier 1 troubleshooting assistant that assembles context and drafts a response. A rep reviews before anything customer-facing is sent.</p><p><strong>Out of scope:</strong> account-changing actions, autonomous customer sends, and Slack as a retrieval source until governance is resolved.</p></div>${sourceDisclosure(['n-scope','n-data-flow'])}`;
    if(i.kind==='workflow')return `<div class="result-label">Users & workflow</div><h2>Support reps stay in the decision loop.</h2><div class="answer-prose"><p>The assistant is for Tier 1 support reps. It retrieves approved context and drafts; the rep verifies, edits if needed, and sends. Training is task-based around the workflow and escalation boundaries.</p></div>${sourceDisclosure(['n-scope','n-training'])}`;
    if(i.kind==='stakeholders'||i.kind==='contacts')return `<div class="result-label">Stakeholders & ownership</div><h2>Known owners and dependencies</h2><div class="answer-prose"><p>Support owns the frontline workflow and feedback. Security owns risk and data-boundary review. Leadership is asking about eventual autonomy but has not established a delivery target. Maya Chen is the vendor support contact for access and sandbox questions.</p></div>${sourceDisclosure(['n-contact','n-security-workshop','n-leadership-followup'])}`;
    if(i.kind==='security')return scenarioResult({topics:['security','data','feature-access'],output:'meeting'});
    if(i.kind==='automation')return scenarioResult({topics:['automation'],output:'unknown'});
    if(i.kind==='data')return `<div class="result-label">Data & grounding</div><h2>Use minimum, read-only data and keep authority explicit.</h2><div class="answer-prose"><p>Approved knowledge and selected account context are the intended grounding sources. Plan rules alone are not sufficient for effective feature access once account-level exceptions are considered; the authoritative replacement source is still unresolved.</p><p>Slack is excluded from the first retrieval set until ownership, freshness, and governance are resolved.</p></div>${pendingNotice(pendingFor(['data','feature-access']))}${sourceDisclosure(['n-data-flow','n-discovery'])}`;
    if(i.kind==='evaluation')return `<div class="result-label">Evaluation & success</div><h2>Success is not a single automation metric.</h2><div class="answer-prose"><p>The pilot is being evaluated on response time, reviewer edits, escalation behavior, unsupported claims, and failure severity. High-risk categories need explicit launch-blocking thresholds before launch.</p></div>${pendingNotice(pendingFor(['success-metrics','security']))}${sourceDisclosure(['n-test-cases','n-security-workshop'])}`;
    if(i.kind==='readiness')return scenarioResult({topics:['operations','scope'],output:'pilot-start'});
    if(i.kind==='meeting')return i.audience==='security'?scenarioResult({topics:['security','data','feature-access'],output:'meeting'}):`<div class="result-label">Meeting prep</div><h2>Carry the settled state, the unresolved decisions, and the asks.</h2>${compactOpenHtml('Decisions still needed','Use these open items to shape the meeting agenda.')}`;
    if(i.kind==='compare')return `<div class="result-label">Reconcile project knowledge</div><h2>The main known tension is feature-access authority.</h2><div class="answer-prose"><p>Earlier work treated plan rules as sufficient. Later ticket evidence showed account-level exceptions can make nominal plan and effective access diverge. That older assumption is historical, not current truth.</p><p>Pending evidence remains visibly separate until review; rejected or superseded ideas should not silently re-enter Current State.</p></div>${sourceDisclosure(['n-discovery','n-support'])}`;
    if(i.kind==='provenance')return `<div class="result-label">Evidence & provenance</div><h2>State separates reviewed understanding from evidence and unresolved material.</h2><div class="answer-prose"><p>Current State is the maintained reviewed layer. Notes are evidence or working material. Pending Review can challenge Current State without changing it. History preserves what used to be believed and why it changed.</p></div>${sourceDisclosure(['n-discovery','n-security-workshop'])}`;
    if(i.kind==='retrieve'){ const q=norm(state.resultQuery),topics=askTopics(q); const notes=state.data.notes.filter(n=>!topics.length||overlapsTopics(n,topics)).slice().sort(sortDateDesc).slice(0,8); return `<div class="result-label">Find & retrieve</div><h2>${notes.length?'Relevant project material':'No matching project material found'}</h2>${notes.length?`<div class="result-note-list">${notes.map(simpleNote).join('')}</div>`:'<p class="result-lede">State does not have a reliable matching note for that request.</p>'}`; }
    return fallbackResult();
  }

  function pendingFor(topics){
    return pendingReviews().filter(r => r.topics.some(t=>topics.includes(t)));
  }

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

  async function submitAsk(query){
    const raw=(query ?? document.getElementById('askInput')?.value ?? state.askInputDraft ?? '').trim(); if(!raw)return;
    state.askInputDraft='';
    if(!looksLikeQuestion(raw) && hasExplicitUpdateIntent(raw)){
      showAddDialog(raw); return;
    }
    const previousLive=state.result?.liveAsk||null;
    const followupMode=ASK?.followupMode?.(raw,previousLive)||'new';
    // A fresh/topic-shift question must not show the old answer while the new
    // one is loading -- otherwise the stale answer sits on screen for the
    // entire wait, which reads as State "falling back" to it even though the
    // final swap (driven by the backend's own followup_mode) was always correct.
    const visiblePrevious=followupMode==='new'?null:previousLive;
    if(ASK?.canHandle(raw,previousLive)){
      state.resultQuery=raw;
      if(ASK.canStream?.(raw)){
        state.result={liveAskStreaming:true,liveAskStreamRaw:'',liveAskPreview:null,previousLive:visiblePrevious,pendingInput:''};
        renderOverview();
        try{
          const payload=await ASK.submitStream(raw,previousLive,{
            preview: preview=>{
              if(state.result?.liveAskStreaming){
                state.result={...state.result,liveAskPreview:preview};
                paintStreamingAsk();
              }
            },
            delta: event=>{
              if(state.result?.liveAskStreaming){
                state.result={...state.result,liveAskStreamRaw:(state.result.liveAskStreamRaw||'')+(event?.text||'')};
                paintStreamingAsk();
              }
            },
          });
          const answerTop=root.querySelector('.answer-content')?.getBoundingClientRect().top ?? null;
          state.result={liveAsk:payload,previousLive:(payload?.followup_mode||(previousLive?'append':'new'))==='append'?previousLive:null};
          state.refinements=[];
          renderOverview();
          if(answerTop!==null){
            requestAnimationFrame(()=>{
              const nextTop=root.querySelector('.answer-content')?.getBoundingClientRect().top;
              if(typeof nextTop==='number') window.scrollBy(0,nextTop-answerTop);
            });
          }
          return;
        }catch(err){
          // A streamed draft is not authoritative until final validation succeeds.
          // If finalization fails after useful text has already streamed, retry once
          // through the normal grounded Ask path instead of dropping the user into
          // an error immediately.
          const streamedDraft=state.result?.liveAskStreamRaw||'';
          if(streamedDraft.trim()){
            state.result={...state.result,liveAskRetrying:true,liveAskPreview:{...(state.result?.liveAskPreview||{}),retrying:true}};
            paintStreamingAsk();
            try{
              const payload=await ASK.submit(raw,previousLive);
              const answerTop=root.querySelector('.answer-content')?.getBoundingClientRect().top ?? null;
              state.result={liveAsk:payload,previousLive:(payload?.followup_mode||(previousLive?'append':'new'))==='append'?previousLive:null};
              state.refinements=[];
              renderOverview();
              if(answerTop!==null){
                requestAnimationFrame(()=>{
                  const nextTop=root.querySelector('.answer-content')?.getBoundingClientRect().top;
                  if(typeof nextTop==='number') window.scrollBy(0,nextTop-answerTop);
                });
              }
              return;
            }catch(fallbackErr){
              err=fallbackErr;
            }
          }
          state.result={liveAskError:err?.message||'State could not produce a grounded answer. Please try again.',previousLive:visiblePrevious};
        }
        renderOverview();
        return;
      }
      state.result={liveAskLoading:true,liveAskPreview:null,previousLive:visiblePrevious,pendingInput:''};
      renderOverview();
      try{
        const payload=await ASK.submit(raw,previousLive);
        state.result={liveAsk:payload,previousLive:(payload?.followup_mode||(previousLive?'append':'new'))==='append'?previousLive:null};
        state.refinements=[];
      }catch(err){
        state.result={liveAskError:err?.message||'State could not produce a grounded answer. Please try again.',previousLive:visiblePrevious};
      }
      renderOverview();
      return;
    }
    state.resultQuery=raw; state.refinements=[];
    const q=norm(raw);
    const intent=detectAskIntent(raw);
    const explicitStructured=/\b(changed|change|history|historical|originally|original|previously|before|used to|superseded|earlier|note|notes|evidence|source|sources|find|show me|material|open|unresolved|unknown|pending|waiting|still need|not know)\b/.test(q);
    let structured=intent?null:(explicitStructured?structuredAskResult(raw):null);
    let scenario=(intent||structured)?null:findScenario(raw);
    if(!intent && !scenario && !structured) structured=structuredAskResult(raw);
    if(!scenario && !structured && state.lastScenario && /\b(shorter|shorten|brief|focus|evidence|sources|slack|email|executive)\b/.test(q)){
      let kind=q.includes('short')||q.includes('brief')?'shorter':q.includes('evidence')||q.includes('source')?'evidence':'exec';
      state.refinements=[kind]; scenario=state.lastScenario;
    }
    state.result=intent?{intent}:scenario?{scenario}:structured?{structured}:{fallback:true}; if(scenario)state.lastScenario=scenario;
    renderOverview();
  }



  /* ----------------------------------------------------------------------
     Ask — submission and results

     Sends the question, manages the loading and refinement states, and renders
     what comes back. followup_mode from the backend decides replace vs append.
     ------------------------------------------------------------------- */
  function sourceDisclosure(ids){
    const notes=ids.map(id=>state.data.notes.find(n=>n.id===id)).filter(Boolean);
    return `<details class="evidence"><summary>Supporting evidence · ${notes.length}</summary>${notes.map(n=>`<article><strong>${esc(n.title)}</strong><span>${esc(n.source)} · ${esc(n.date)}</span><p>${esc(n.text)}</p></article>`).join('')}</details>`;
  }

  function pendingNotice(items){
    if(!items.length)return '';
    return `<aside class="pending-notice"><div><span class="status-dot"></span><strong>There is unreviewed information relevant to this response.</strong><p>It has not been used as established project knowledge.</p></div><div class="inline-actions"><button class="btn small primary" data-action="review-now" data-review="${items[0].id}">Review now</button><button class="btn small secondary" data-action="continue-current">Continue as is</button></div></aside>`;
  }

  function scenarioResult(s){
    const pending=pendingFor(s.topics);
    const refined=state.refinements[state.refinements.length-1];
    if(refined) return refinedResult(refined,s,pending);
    if(s.output==='unknown') { const autonomy=state.data.knowledge.find(k=>k.id==='k-autonomy'); const m=autonomy?.statement?.match(/(?:target(?:ing)?|target is|target should be)\s+(\d+)%/i); const pct=m?m[1]:null; if(pct) return `<div class="result-label">Current State</div><h2>${esc(pct)}% autonomous resolution is the accepted pilot target.</h2><div class="answer-prose"><p>${esc(autonomy.statement)}</p></div>${pendingNotice(pending)}${sourceDisclosure(autonomy.support||[])}`; return `<div class="result-label">Based on current reviewed understanding</div><h2>Not established</h2><div class="answer-prose"><p>The project has not established what percentage of troubleshooting can safely be automated. Troubleshooting is the leading pilot direction, but no supported automation percentage has been established yet.</p><p><strong>Unknown is not 0%.</strong> The project is deliberately keeping that distinction unresolved.</p></div>${pendingNotice(pending)}<button class="text-button result-action" data-action="track-question" data-question="What percentage of troubleshooting can safely be automated?">Track as open question →</button>${sourceDisclosure(['n-discovery','n-leadership'])}`; }
    if(s.output==='contact') return `<div class="result-label">Project contact</div><h2>Maya Chen</h2><div class="answer-prose"><p>Maya is the vendor support contact for the pilot. She coordinates access and sandbox questions and can pull in engineering for integration issues.</p><p>The weekly vendor check-in is Thursday at 10:00 AM during discovery.</p></div>${sourceDisclosure(['n-contact','n-cadence'])}`;
    if(s.output==='pilot-start') return `<div class="result-label">Implementation readiness</div><h2>Discovery is nearly complete; implementation planning is next.</h2><div class="answer-prose"><p>The project has a bounded Tier 1 use case, a read-only/human-reviewed operating model, an initial data-flow, an evaluation approach, and a training outline.</p><p><strong>Still blocking a final implementation backlog:</strong> authoritative feature-access source, Security confirmation of vendor retention terms, and agreed launch-blocking evaluation cases. A committed pilot launch date is not recorded in the workspace.</p></div>${pendingNotice(pending)}${sourceDisclosure(['n-implementation-readiness','n-handoff','n-weekly'])}`;
    if(s.output==='answer'){
      const text=accessUpdated()?'Plan rules alone are not sufficient to determine effective customer feature access. A Senior Support Rep reported temporary and grandfathered exceptions; the authoritative account-level source is still unresolved.':'The current reviewed understanding uses standard plan rules as a troubleshooting input when checking feature access.';
      return `<div class="result-label">Based on current reviewed understanding</div><h2>${accessUpdated()?'Plan rules are only part of the answer.':'Plan rules are the current working input.'}</h2><p class="result-lede">${esc(text)}</p>${pendingNotice(pending)}${sourceDisclosure(accessUpdated()?['n-discovery','n-support']:['n-discovery'])}`;
    }
    if(s.output==='meeting') return `<div class="result-label">Security meeting briefing</div><h2>What to carry into the Security conversation</h2>${pendingNotice(pending)}<div class="answer-prose"><h3>Current direction</h3><p>The first implementation is assistive and read-only: Tier 1 troubleshooting drafts, approved knowledge, selected account context, and a human review before anything customer-facing is sent. Account-changing actions remain out of scope.</p><h3>What Security has already established</h3><p>High-risk failures need to be evaluated separately from average quality. Wrong-account data exposure, unsafe security guidance, unsupported entitlement claims, and fabricated policy/exception guidance are launch-sensitive categories.</p><h3>What still needs resolution</h3><p>${accessUpdated()?'Plan rules alone are not sufficient to determine effective customer feature access; the authoritative account-level source is still unresolved.':'New Support evidence may weaken the plan-rules assumption, but it is still awaiting review.'} Vendor retention/deletion terms also still need confirmation against the actual agreement.</p><p>The project has <strong>not</strong> established a safe automation percentage. The current question is whether the human-reviewed pilot is safe enough to implement, not how quickly review can be removed.</p></div>${sourceDisclosure(accessUpdated()?['n-security-workshop','n-data-flow','n-vendor-security','n-support']:['n-security-workshop','n-data-flow','n-vendor-security'])}`;
    if(s.output==='summary') return `<div class="result-label">Weekly project summary · Aug 24–29</div><h2>Discovery is nearly complete; the remaining work is implementation readiness.</h2>${pendingNotice(pending)}<div class="deliverable-section"><h3>What changed</h3><ul class="generated-list"><li>The pilot scope is now a human-reviewed, read-only Tier 1 troubleshooting assistant rather than a broad support-automation effort.</li><li>The team sketched the minimum data path and agreed not to include account-write actions or Slack ingestion in the first implementation.</li><li>Representative evaluation cases are being written around documented how-to, ambiguity, stale documentation, access mismatches, unsafe actions, and cases where escalation is the correct answer.</li></ul><h3>Current decisions</h3><ul class="generated-list"><li>Human review remains required before customer-facing responses.</li><li>Success will be judged with response time, reviewer edits, escalation behavior, unsupported-claim checks, and failure severity, not a single automation-rate metric.</li><li>The 50% autonomy idea remains an aspirational leadership question, not an implementation commitment.</li></ul><h3>Still unresolved</h3><ul class="generated-list"><li>${accessUpdated()?'Plan rules are confirmed as insufficient by themselves; the authoritative account-level source still needs to be named.':'Feature-access authority is still unsettled, and new Support evidence is waiting for review.'}</li><li>Vendor retention/deletion terms need Security confirmation against the agreement.</li><li>Launch-blocking evaluation thresholds still need to be set.</li></ul><h3>Next based on the information recorded here</h3><p>Review the two pending evidence items, finish the high-risk evaluation cases, confirm vendor data terms, and turn the settled discovery into an implementation backlog. The workspace does not record a committed pilot launch date.</p></div>${sourceDisclosure(['n-weekly','n-implementation-readiness','n-test-cases','n-handoff','n-leadership-followup'])}`;
    if(s.output==='change') return `<div class="result-label">What changed this week</div><h2>The project moved from broad discovery toward implementation readiness.</h2><div class="answer-prose"><p>The team finalized a narrow human-reviewed Tier 1 pilot direction, sketched the read-only data flow, started turning discovery into evaluation cases, and drafted the implementation handoff.</p><p>${accessUpdated()?'A consequential access assumption also changed after review: plan rules alone are no longer treated as sufficient for effective feature access.':'Two consequential pieces of new evidence are still waiting for review, so they have not changed maintained understanding yet.'}</p><p>The 50% autonomy idea remains aspirational rather than a delivery requirement.</p></div>${pendingNotice(pending)}${sourceDisclosure(['n-weekly','n-implementation-readiness','n-test-cases','n-handoff'])}`;
    if(s.output==='draft') return `<div class="result-label">Draft · leadership update</div><div class="draft polished-draft"><p><strong>Northstar implementation update</strong></p><p>Discovery is nearing completion. We have narrowed the first implementation to a read-only Tier 1 troubleshooting assistant with human review before customer-facing responses. The team has also aligned on the initial data path, evaluation approach, and representative test categories.</p><p>The main remaining implementation-readiness items are feature-access authority, confirmation of vendor retention terms, and launch-blocking evaluation thresholds. ${accessUpdated()?'Reviewed Support evidence confirms that plan rules alone are not sufficient for effective access decisions; the authoritative account source still needs to be established.':'New Support evidence may change the feature-access assumption, but it is still awaiting review and is not being presented here as settled project truth.'}</p><p>The earlier 50% autonomy idea remains an aspirational question rather than a delivery commitment. The immediate goal is to prove value and quality in a bounded human-reviewed pilot, then make any autonomy decision from evidence.</p></div>${pendingNotice(pending)}<button class="btn secondary" data-action="copy-draft">Copy draft</button>${sourceDisclosure(['n-weekly','n-leadership-followup','n-implementation-readiness'])}`;
    if(s.output==='support-draft') return `<div class="result-label">Draft · support team update</div><div class="draft polished-draft"><p><strong>Pilot update for Support</strong></p><p>We’re close to wrapping discovery for the Northstar project. The first version is still scoped to Tier 1 troubleshooting, will remain read-only, and will require a rep to review anything before it goes to a customer.</p><p>We’re now turning the discovery work into test cases and implementation requirements. The biggest open item for Support is feature access: plan rules are useful, but we still need to confirm what source should win when an account has an exception. We’re also finalizing the feedback path so reps can flag bad suggestions without creating a separate process if the existing QA workflow can handle it.</p><p>No autonomous-send target has been committed for the first pilot.</p></div><button class="btn secondary" data-action="copy-draft">Copy draft</button>${sourceDisclosure(['n-scope','n-training','n-implementation-readiness'])}`;
    if(s.output==='questions') return `<div class="result-label">Known unknowns</div><h2>${openQuestions().length} open questions</h2><div class="compact-list">${openQuestions().slice(0,6).map(q=>`<article><strong>${esc(q.text)}</strong><span>${esc(q.origin)}</span></article>`).join('')}</div><button class="btn secondary" data-view="open-items">Open Items →</button>`;
    if(s.output==='retrieve') return `<div class="result-label">Notes · feature access</div><h2>Project material about plan and feature access</h2>${pendingNotice(pending)}<div class="result-note-list">${state.data.notes.filter(n=>n.topics.includes('feature-access')).map(simpleNote).join('')}</div>`;
    return fallbackResult();
  }

  function refinedResult(kind,s,pending){
    if(kind==='shorter') return `<div class="result-label">Refined result</div><h2>Short version</h2><p class="result-lede">${s.output==='meeting'?'Human review stays. Safe autonomy is unknown. Feature-access authority is unresolved.':'The current answer has been shortened without changing project knowledge.'}</p>${pendingNotice(pending)}`;
    if(kind==='auth') return `<div class="result-label">Refined result · authentication focus</div><h2>Authentication and access boundaries</h2><p class="result-lede">Login issues can have multiple causes, while consequential account changes remain human-controlled. Feature-access authority is ${accessUpdated()?'explicitly unresolved after review':'potentially challenged by pending Support evidence'}.</p>${pendingNotice(pending)}`;
    if(kind==='evidence') return `<div class="result-label">Evidence view</div><h2>What this result is based on</h2>${sourceDisclosure(accessUpdated()?['n-discovery','n-security','n-support']:['n-discovery','n-security'])}`;
    return `<div class="result-label">Refined result</div><h2>Executive version</h2><p class="result-lede">Troubleshooting remains the pilot focus, but the project is preserving unresolved safety and authority questions rather than turning them into assumptions.</p>${pendingNotice(pending)}`;
  }

  function fallbackResult(){
    const statusRank={pending:0,accepted:1,reviewed:2,no_review_needed:3};
    const topics=askTopics(norm(state.resultQuery));
    const notes=topics.length?state.data.notes.filter(n=>overlapsTopics(n,topics)).slice().sort((a,b)=>{
      const ra=statusRank[a.status]??99, rb=statusRank[b.status]??99;
      return ra!==rb?ra-rb:sortDateDesc(a,b);
    }).slice(0,3):[];
    const trackActions=`<div class="inline-actions"><button class="btn primary" data-action="track-question" data-question="${esc(state.resultQuery)}">Track as open question →</button><button class="btn secondary" data-view="notes">Browse Notes</button></div>`;
    if(notes.length) return `<div class="result-label">Related material</div><h2>Ask didn’t find an exact match, but here’s what State knows about that topic.</h2><div class="result-note-list">${notes.map(simpleNote).join('')}</div>${trackActions}`;
    const examples=['What changed this week?','What needs review right now?','Show me security notes','What’s unresolved?'];
    return `<div class="result-label">Project knowledge</div><h2>Ask doesn’t recognize that phrasing yet.</h2><p class="result-lede">I’d rather leave this unresolved than route you to an unrelated canned answer. Try one of these instead:</p><div class="ask-example-list">${examples.map(x=>`<button class="prompt" data-action="example-prompt" data-prompt="${esc(x)}">${esc(x)}</button>`).join('')}</div>${trackActions}`;
  }

  function refine(){ const v=norm(document.getElementById('refineInput')?.value||''); if(!v)return; let kind='exec'; if(v.includes('short'))kind='shorter'; else if(v.includes('auth'))kind='auth'; else if(v.includes('evidence')||v.includes('support'))kind='evidence'; state.refinements.push(kind); renderOverview(); }

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
  const demoEvidenceDates={
    'demo-review-access-evidence':'2026-08-27T16:10:00',
    'demo-review-launch-evidence':'2026-08-28T09:30:00',
    'demo-review-escalation-evidence':'2026-08-28T13:45:00',
    'demo-review-retention-evidence':'2026-08-29T10:20:00'
  };
  function evidenceDisplayTimestamp(e){return e?.source_type==='demo_seed'&&demoEvidenceDates[e.id]?demoEvidenceDates[e.id]:e?.submitted_at;}

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
    const decision=h.decision||'Human accepted this change';
    return `<article class="history-entry${linked?' is-linked':''}"${linked?` data-action="view-topic-history" data-knowledge-id="${h.knowledgeId}" tabindex="0" role="button" aria-label="View topic history for ${esc(state.data.knowledge.find(k=>k.id===h.knowledgeId)?.title||h.type)}"`:''}><div class="history-entry-date">${esc(h.date||formatBackendDate(h.changed_at))}</div><div class="history-entry-body"><span class="history-reason">${historyHighlight(reason)}</span><h3>${historyHighlight(h.type||historyType(h))}</h3><div class="history-change"><p><span>Before</span>${historyHighlight(before)}</p><p><span>Now</span>${historyHighlight(after)}</p></div><p class="decision-line">${historyHighlight(decision)}</p>${historySources(h)}${linked?'<span class="history-entry-link">View this topic →</span>':''}</div></article>`;
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
  function renderOpenItems(){ root.innerHTML=OPEN_ITEMS_VIEW.render(openItemsProps()); }
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

  // A consequential update (real proposals, not a generic "evidence noted"
  // review) confirms before mutating anything -- Current State is what the
  // project treats as true, so changing it deserves an explicit step. Keep
  // decisions and generic evidence-only outcomes never change Current State,
  // so they skip the confirmation and use lighter feedback (a toast, no
  // interstitial loading modal) instead.
  function decideReview(id,decision){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    const isGeneric=r.id?.startsWith('r-info-') || (Array.isArray(r.proposals) && r.proposals.length===0);
    if(decision==='update' && !isGeneric){
      const proposalText=(r.proposals||[]).map(p=>p.proposed_statement).filter(Boolean).join(' • ') || r.proposed || '';
      showDialog(`<span class="eyebrow">Review decision</span><h2 id="dialogTitle">Update Current State?</h2><p>This changes what the project currently treats as true and records the decision in History.</p>${proposalText?`<div class="review-confirm-change"><span>Change</span><strong>${esc(truncateText(proposalText,210))}</strong></div>`:''}<div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-review-update" data-review="${esc(id)}">Update Current State</button></div>`);
      return;
    }
    executeReviewDecision(id,decision,isGeneric);
  }

  async function executeReviewDecision(id,decision,isGeneric){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    state.lastReviewGeneric=isGeneric;
    state.expandedReviewId=null;
    const lightweight=decision!=='update'||isGeneric;

    if(r.backendReviewId){
      const previousStatus=r.status;
      r.status=decision;
      render();
      if(!lightweight) showDialog(`<span class="eyebrow">Updating</span><h2 id="dialogTitle">Updating Current State…</h2><p>Saving the reviewed decision to the project record.</p>`);
      try{
        const apiDecision=decision==='update'?'accept':'keep';
        const result=await API.resolveReview(r.backendReviewId,apiDecision);
        const note=state.data.notes.find(n=>n.id===r.evidenceId);
        if(note)note.status=decision==='update'?'accepted':'reviewed';
        if(decision==='update'){
          for(const p of (r.proposals||[])) if(p.operation==='retire'&&p.state_item_id){ const k=state.data.knowledge.find(x=>x.id===p.state_item_id); if(k)k.state='retired'; }
          syncApiState(result.state||[]);
          const resolvedQuestionIds=r.resolvesQuestionIds?.length?r.resolvesQuestionIds:(r.resolvesQuestionId?[r.resolvesQuestionId]:[]);
          if((r.proposals||[]).length) resolvedQuestionIds.forEach(questionId=>{const q=state.data.questions.find(q=>q.id===questionId);if(q){q.status='resolved';q.resolution='Resolved by reviewed evidence';}});
        }
        const receiptItems=[];
        if(decision==='update'){
          for(const proposal of (r.proposals||[])){
            if(proposal.operation==='retire') continue;
            const text=proposal.proposed_statement||'';
            const matched=(result.state||[]).find(item=>norm(item.statement)===norm(text)) || (proposal.state_item_id?(result.state||[]).find(item=>item.id===proposal.state_item_id):null);
            if(matched) receiptItems.push({id:matched.id,statement:matched.statement,area:inferProjectArea(matched)||matched.projectArea||'product'});
            else if(text) receiptItems.push({id:proposal.state_item_id||'',statement:text,area:'product'});
          }
        }
        updateNav(); render();
        if(lightweight) closeDialog(); // no interstitial was shown for these outcomes
        if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':'Current State left unchanged. Evidence is preserved.');
        else showDecisionComplete({items:receiptItems});
        // Resolution response is authoritative; revalidate deterministically after it has rendered.
        await hydrateBackend();
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
    if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':'Current State left unchanged. Evidence is preserved.');
    else showDecisionComplete({items:receiptItems});
  }

  function showDecisionComplete({items=[]}={}){
    const primary=items[0];
    const line=primary?truncateText(primary.statement,180):'The reviewed change is now part of Current State.';
    showDialog(`<span class="eyebrow">Review complete</span><h2 id="dialogTitle">Current State updated</h2><p>${esc(line)}</p><div class="dialog-actions"><button class="btn primary" data-action="review-receipt-project" data-project-area="${esc(primary?.area||'product')}" data-state-id="${esc(primary?.id||'')}">View Current State</button>${primary?.id?`<button class="btn secondary" data-action="view-topic-history" data-knowledge-id="${esc(primary.id)}">View History</button>`:'<button class="btn secondary" data-view="history">View History</button>'}</div>`);
  }


  function showDemoHelp(){
    const steps=[
      ['1. Add','Add Evidence. Capture a finding, decision, or meeting update. Approved Slack conversations can also become Evidence automatically.'],
      ['2. State interprets','AI compares new Evidence with Current State and identifies possible changes or unresolved Questions.'],
      ['3. Review & decide','Review proposed changes. Accept, reject/leave unchanged, or keep uncertainty open before Current State changes.'],
      ['4. Know','Accepted changes update Current State. Previous decisions remain in History.'],
      ['5. Ask','Use Ask State to understand the project without changing it.']
    ];
    showDialog(`<span class="eyebrow">How this works</span><h2 id="dialogTitle">State keeps accepted understanding separate from new information.</h2><div class="state-help-steps">${steps.map(([title,body])=>`<div class="state-help-step"><strong>${esc(title)}</strong><span>${esc(body)}</span></div>`).join('')}</div><p class="demo-flow-principle">AI interprets → software enforces → people decide</p><div class="demo-start"><span class="meta-label">Good places to start</span><button class="demo-start-action" data-action="demo-start-ask"><strong>Ask about Northstar</strong><span>Put a useful project question in Ask →</span></button><button class="demo-start-action" data-action="demo-start-note"><strong>Add a sample note</strong><span>Try new project information and see how Review handles it →</span></button><button class="demo-start-action" data-action="demo-start-project"><strong>Explore Current State</strong><span>Read the maintained view of what the project currently treats as true →</span></button></div><div class="demo-reset-help"><div><strong>Want to start over?</strong><span>Restore the curated Northstar starting scenario. You can also reset Northstar from Settings.</span></div><button class="text-button demo-reset-link" data-action="confirm-demo-reset">Reset example data →</button></div><div class="dialog-actions demo-help-actions"><button class="btn primary" data-action="close-dialog">Got it</button></div>`);
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
    showDialog(`<span class="eyebrow">Project settings</span><h2 id="dialogTitle">Rules</h2><p>Rules tell State how to interpret evidence and when to interrupt you. They are not Current State and State cannot change them on its own.</p><p class="settings-note">Rules apply to future analysis. Existing Reviews are not reinterpreted automatically.</p><div class="project-rule-list">${rows}</div>${form}<div class="demo-reset-zone"><span class="eyebrow">Example data</span><p>Restore Northstar to the curated starting scenario with open Reviews, blockers, Questions, Notes, and History.</p><button class="btn secondary danger-light" data-action="confirm-demo-reset">Reset example data</button></div>`);
  }

  function showAddDialog(prefill=''){ showDialog(`<span class="eyebrow">Evidence</span><h2 id="dialogTitle">Add Evidence</h2><p>Add project information State should evaluate. It is preserved as Evidence first and cannot change Current State without Review.</p><textarea id="addInfoText" rows="7" aria-label="Evidence" placeholder="Paste a finding, decision, meeting update, or other project information...">${esc(prefill)}</textarea><div class="note-example-picker"><span class="meta-label">Try an example</span><div class="note-example-chips"><button type="button" data-action="sample-info" data-sample="plan">New plan</button><button type="button" data-action="sample-info" data-sample="research">Research finding</button><button type="button" data-action="sample-info" data-sample="constraint">Decision / constraint</button></div></div><div class="dialog-actions"><button class="btn primary" data-action="save-info">Add Evidence</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`); }

  function reviewTypeTitle(type){
    if(type==='state_at_risk') return 'Current State may be at risk';
    if(type==='missing_understanding') return 'More understanding is needed';
    return 'Review needed';
  }

  function proposedText(proposals){
    if(!proposals?.length) return 'Review the evidence and decide whether Current State should change.';
    return proposals.map(p=>p.operation==='retire' ? `Retire current understanding${p.state_item_id?` (${p.state_item_id})`:''}` : p.proposed_statement).join(' • ');
  }

  // toFront defaults to true for the live "I just submitted evidence and it
  // produced a Review" call sites, where showing the newest review first is
  // the right UX. Bulk hydration passes toFront:false -- appending in the
  // order the loop encounters them (the backend's own consequentiality
  // order, see list_reviews) -- because calling this per-review with the
  // default unshift inside a hydration loop silently reverses that order:
  // Workspace's attention list then disagreed with Ask about what mattered
  // most, since Ask fetches reviews fresh and never goes through this
  // reversal. Found via live QA 2026-09-07.
  function upsertBackendReview(review,{toFront=true}={}){
    const existingIndex=state.data.reviews.findIndex(x=>x.id===review.id);
    if(existingIndex>=0){
      state.data.reviews[existingIndex]={...state.data.reviews[existingIndex],...review};
      return state.data.reviews[existingIndex];
    }
    if(toFront) state.data.reviews.unshift(review); else state.data.reviews.push(review);
    return review;
  }

  function replaceBackendOpenReviews(rawReviews){
    const openIds=new Set((rawReviews||[]).map(r=>r.id));
    state.data.reviews=state.data.reviews.filter(r=>!r.backendReviewId || openIds.has(r.backendReviewId));
  }

  function mapApiReview(r, fallbackEvidence='', extras={}){
    const proposals=(r.proposals||[]).filter(p=>!p.status || p.status==='pending');
    const affected=r.affected_state_items||[];
    const current=affected.length
      ? affected.map(x=>x.statement).join(' • ')
      : proposals.some(p=>p.operation==='create')
        ? 'No matching Current State item exists yet.'
        : 'No Current State change has been applied yet.';
    const unresolved=r.review_type==='proposed_update'
      ? 'Nothing beyond this proposed change is established by the evidence.'
      : r.decision_question;
    const rationale=proposals.map(p=>p.rationale).filter(Boolean).join(' ');
    return {
      id:r.id,
      backendReviewId:r.id,
      evidenceId:r.evidence_id,
      topics:affected.map(x=>x.topic).filter(Boolean),
      status:'pending',
      title:reviewTypeTitle(r.review_type),
      summary:r.decision_question,
      proposed:proposedText(proposals),
      unresolved,
      current,
      evidence:r.evidence_content||fallbackEvidence,
      evidenceSourceType:r.evidence_source_type||'',
      // Only an explicit backend resolves_question_ids (or a hardcoded local
      // fixture relationship via `extras`) counts as a resolving link -- a
      // review is never inferred to resolve a question just because its
      // evidence happened to come from answering one. "Answer found ·
      // Awaiting review" must only appear when the backend actually says so.
      resolvesQuestionIds:(r.resolves_question_ids||[]).length ? [...r.resolves_question_ids] : (extras.resolvesQuestionIds||extras.resolvesQuestionId?[extras.resolvesQuestionId].filter(Boolean):[]),
      resolvesQuestionId:(r.resolves_question_ids||[])[0] || extras.resolvesQuestionId,
      establishes:rationale||r.why_consequential,
      doesNot:r.review_type==='proposed_update'
        ? 'The proposed change does not become Current State until you accept it.'
        : 'The evidence does not automatically resolve the uncertainty or change Current State.',
      whyConsequential:r.why_consequential,
      reviewType:r.review_type,
      proposals,
      affectedStateItems:affected,
      ...extras
    };
  }


  /* ----------------------------------------------------------------------
     Backend mapping and sync

     Translates API payloads into the client's shape and reconciles them with
     local state. Nothing here decides anything; it only mirrors the server.
     ------------------------------------------------------------------- */
  function inferProjectArea(item){
    const text=norm(`${item.topic||''} ${item.statement||''}`);
    if(/security|risk|data|privacy|human review|sensitive|claim|read only|readonly|account change|refund|ownership change|autonomy|vip/.test(text)) return 'safety';
    if(/evaluation|metric|launch|rollout|timeline|phase|pilot date|threshold/.test(text)) return 'evaluation';
    return 'product';
  }

  function titleForStateItem(item){
    if(item.topic && item.topic!=='uncategorized') return item.topic;
    const first=String(item.statement||'').split(/[.!?]/)[0].trim();
    return first.length && first.length<=64 ? first : 'Reviewed understanding';
  }

  function formatBackendDate(value){
    if(!value)return '';
    const d=new Date(value); if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  function sourceLabel(source){
    if((source||'').startsWith('question_response:'))return 'Question response';
    if(source==='working_note')return 'Working note';
    if(source==='demo_history'||source==='demo_seed')return 'Project note';
    if(source==='manual_note')return 'Project update';
    return String(source||'Note').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  // topicName is looked up from state.data.knowledge (may be a retired item
  // by the time this renders, but syncApiState marks items retired rather
  // than deleting them, so the topic label survives). A generic fallback
  // headline like "Current understanding updated" told a scanning user
  // nothing about what actually changed -- every entry looked the same.
  // Found via live QA 2026-09-07.
  function historyType(item,topicName){
    const verb=item.transition_type==='created'?'established':item.transition_type==='retired'?'retired':'updated';
    return topicName?`${topicName} ${verb}`:`Current understanding ${verb}`;
  }
  function syncApiHistory(items){
    // Internal record ids (k-rollout, q-retention, ...) must never reach
    // user-facing History copy -- reuses the same stripping OPEN_ITEMS_VIEW
    // already applies to review text, rather than a third duplicate regex.
    const clean=value=>OPEN_ITEMS_VIEW?.cleanReviewCopy?OPEN_ITEMS_VIEW.cleanReviewCopy(value):String(value||'');
    const backend=(items||[]).map(h=>{
      const topicName=state.data.knowledge.find(k=>k.id===h.state_item_id)?.title;
      return {
        ...h, id:h.id, backendManaged:true, knowledgeId:h.state_item_id,
        date:formatBackendDate(h.changed_at), dateISO:h.changed_at, type:historyType(h,topicName),
        before:clean(h.old_statement)||'Not previously established', after:clean(h.new_statement),
        reason:clean(h.decision_question||h.proposal_rationale)||'Reviewed project evidence',
        decision:'Human accepted this change', evidenceItems:h.evidence_items||[]
      };
    });
    state.data.history=backend;
    const byEvidence=new Map();
    for(const h of backend){
      for(const e of (h.evidenceItems||h.evidence_items||[])){
        const links=byEvidence.get(e.id)||[]; links.push(h); byEvidence.set(e.id,links);
      }
    }
    for(const n of state.data.notes){
      if(!n.evidenceId)continue;
      const links=byEvidence.get(n.evidenceId)||[];
      n.historyIds=links.map(h=>h.id);
      n.historyKnowledgeIds=[...new Set(links.map(h=>h.knowledgeId).filter(Boolean))];
      if(links.length && n.status==='reviewed')n.status='accepted';
    }
  }
  function syncApiEvidence(items,openReviews,resolvedReviews){
    const collect=(reviews)=>{
      const map=new Map();
      for(const r of (reviews||[]))for(const e of (r.evidence_items||[])){const rows=map.get(e.id)||[];rows.push(r);map.set(e.id,rows);}
      return map;
    };
    const openByEvidence=collect(openReviews);
    const resolvedByEvidence=collect(resolvedReviews);
    const backendNotes=(items||[]).map(e=>{
      const open=openByEvidence.get(e.id)||[], resolved=resolvedByEvidence.get(e.id)||[];
      const reviewStatusKnown=Array.isArray(openReviews)&&Array.isArray(resolvedReviews);
      // 'reviewed' means a human actually looked at a Review for this
      // evidence (resolved.length>0), whether or not it changed Current
      // State. That's distinct from 'no_review_needed': the model judged
      // the evidence non-consequential and no Review was ever created, so
      // no human was ever involved. Collapsing these into one status/label
      // (as this used to) reads as "a human reviewed and approved this"
      // for evidence nobody ever reviewed -- exactly the interpret/
      // authorize distinction State's authority model exists to preserve.
      const status=e.processing_status==='failed'?'failed'
        :!reviewStatusKnown?'unknown'
        :open.length?'pending'
        :resolved.some(r=>r.resolution==='updated')?'accepted'
        :resolved.length?'reviewed'
        :e.processing_status==='processed'?'no_review_needed'
        :'working';
      const displayTime=evidenceDisplayTimestamp(e);
      return {id:`api-note-${e.id}`,title:sourceLabel(e.source_type),text:e.content,source:sourceLabel(e.source_type),date:formatBackendDate(displayTime),dateISO:displayTime,submittedISO:displayTime,topics:[],status,reviewId:open[0]?.id||null,reviewIds:open.map(r=>r.id),resolvedReviewIds:resolved.map(r=>r.id),historyIds:[],historyKnowledgeIds:[],evidenceId:e.id,backendManaged:true};
    });
    const local=state.data.notes.filter(n=>!n.backendManaged && !n.evidenceId);
    state.data.notes=[...backendNotes,...local];
  }

  function syncApiState(items){
    const incoming=items||[];
    const activeIds=new Set(incoming.map(item=>item.id));
    // A non-empty backend State response is authoritative. Fixture knowledge is
    // an offline/demo fallback only; never merge absent fixture facts into a
    // live backend Current State, because that creates two competing truths.
    for(const k of state.data.knowledge){
      if(!activeIds.has(k.id)) k.state='retired';
    }
    for(const item of incoming){
      let k=state.data.knowledge.find(x=>x.id===item.id);
      if(k){
        k.statement=item.statement;
        k.state='current';
        k.backendManaged=true;
        k.lastConfirmed=formatBackendDate(item.updated_at||item.created_at);
        k.lastConfirmedISO=item.updated_at||item.created_at||todayISO();
      }else{
        state.data.knowledge.push({
          id:item.id,
          projectArea:inferProjectArea(item),
          title:titleForStateItem(item),
          topics:item.topic&&item.topic!=='uncategorized'?[norm(item.topic).replace(/\s+/g,'-')]:[],
          statement:item.statement,
          support:[],
          state:'current',
          lastConfirmed:formatBackendDate(item.updated_at||item.created_at),
          lastConfirmedISO:item.updated_at||item.created_at||todayISO(),
          backendManaged:true
        });
      }
    }
  }

  function questionTextKey(value){ return norm(value); }

  function remapQuestionReferences(oldId,newId){
    if(!oldId || !newId || oldId===newId)return;
    for(const review of state.data.reviews){
      if(review.resolvesQuestionId===oldId) review.resolvesQuestionId=newId;
      if(Array.isArray(review.resolvesQuestionIds)) review.resolvesQuestionIds=review.resolvesQuestionIds.map(id=>id===oldId?newId:id);
    }
  }

  function syncApiQuestions(items){
    const previous=[...state.data.questions];
    const backendTexts=new Set((items||[]).map(q=>questionTextKey(q.text)));
    const backend=(items||[]).map(q=>{
      const fixture=previous.find(x=>!x.backendManaged && questionTextKey(x.text)===questionTextKey(q.text));
      if(fixture) remapQuestionReferences(fixture.id,q.id);
      return {
        id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,
        origin:q.origin||fixture?.origin||'Added from Workspace',
        created:fixture?.created||formatBackendDate(q.created_at),createdISO:fixture?.createdISO||q.created_at,
        topics:fixture?.topics?.length?fixture.topics:askTopics(norm(q.text)),backendManaged:true
      };
    });
    state.data.questions=backend;
  }


  async function createBackendQuestion(text){ return API.createQuestion(text,{origin:'Added from Workspace',blocking:false}); }

  async function submitEvidence(text, sourceType='manual_note'){
    return API.submitEvidence(text,sourceType);
  }

  async function retryEvidenceAnalysis(evidenceId){ return API.retryEvidenceAnalysis(evidenceId); }

  async function hydrateBackend(){
    if(!API)return;
    const loadStatus=document.getElementById('appLoadStatus');
    if(loadStatus){loadStatus.textContent='Opening Northstar…';loadStatus.hidden=false;}
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
    }).catch(attentionError=>{
      console.warn('Fast attention load unavailable; full Workspace load will continue.',attentionError);
    });
    const keys=['state','evidence','open','resolved','history','questions','rules','drafts'];
    let byKey;
    try{
      const payload=await API.getBootstrap();
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

  function syncApiDrafts(items){
    const drafts=(items||[]).map(d=>({id:`draft-${d.id}`,draftId:d.id,title:d.title,text:d.content,source:'Working note',date:formatBackendDate(d.updated_at||d.created_at),dateISO:d.updated_at||d.created_at,topics:[],status:'working',backendDraft:true}));
    const others=state.data.notes.filter(n=>!n.backendDraft);
    state.data.notes=[...drafts,...others];
  }

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
    const relatedReview=e.target.closest('[data-action="open-related-review"]'); if(relatedReview){ const r=state.data.reviews.find(x=>x.id===relatedReview.dataset.reviewId); if(r) showDialog(`<span class="eyebrow">Pending Review</span><h2 id="dialogTitle">Related evidence may affect this Current State</h2>${reviewCard(r,true,false)}`); return;}
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
    const v=e.target.closest('[data-view]'); if(v){ navigateTo(v.dataset.view); if(v.dataset.anchor) window.__stateScrollAnchor=v.dataset.anchor; return; }
    const dateFilter=e.target.closest('.notes-date-filters [data-date-filter]'); if(dateFilter){ state.notesDateFilter=dateFilter.dataset.dateFilter; renderNotes(); return; }
    const noteFilter=e.target.closest('.notes-filters [data-filter]'); if(noteFilter){ state.notesFilter=noteFilter.dataset.filter; renderNotes(); return; }
    const reviewFilter=e.target.closest('.review-filters [data-review-filter]'); if(reviewFilter){ state.reviewFilter=reviewFilter.dataset.reviewFilter; renderReview(); return; }
    const sectionToggle=e.target.closest('[data-action="toggle-open-item-section"]'); if(sectionToggle){ const key=sectionToggle.dataset.section; const reviews=uiPendingReviews(), questions=openQuestions(); const count=key==='reviews'?reviews.length:key==='blockers'?questions.filter(q=>q.blocking).length:questions.filter(q=>!q.blocking).length; const current=state.openItemSections[key]===null?(key==='questions'&&count>5):!!state.openItemSections[key]; state.openItemSections[key]=!current; renderOpenItems(); return; }
    const reviewToggle=e.target.closest('[data-action="toggle-review-card"]'); if(reviewToggle){ const id=reviewToggle.dataset.reviewId; state.expandedReviewId=state.expandedReviewId===id?null:id; renderOpenItems(); return; }
    const provenanceToggle=e.target.closest('[data-action="toggle-provenance"]'); if(provenanceToggle){ const body=provenanceToggle.parentElement?.querySelector('.project-provenance-body'); if(body){ const expanded=!body.hidden; body.hidden=expanded; provenanceToggle.setAttribute('aria-expanded',String(!expanded)); provenanceToggle.textContent=expanded?'Why this is current →':'Hide why this is current'; } return; }
    const p=e.target.closest('[data-prompt]'); if(p){ submitAsk(p.dataset.prompt); return; }
    const a=e.target.closest('[data-action]'); if(!a)return;
    const act=a.dataset.action;
    if(act==='ask-submit')submitAsk();
    else if(act==='open-specific-review'){closeDialog();state.expandedReviewId=a.dataset.reviewId;state.openItemSections.reviews=false;navigateTo('open-items');}
    else if(act==='toggle-open-questions'){state.openQuestionsExpanded=!state.openQuestionsExpanded;renderOpenItems();}
    else if(act==='show-demo-help')showDemoHelp();
    else if(act==='demo-start-ask'){
      closeDialog();navigateTo('overview');
      // Ask no longer has an inline Workspace instance -- routes into the
      // Ask State drawer (context-product-polish.js) the same way its own
      // starter chips do, via a synthetic click on its data-review-batch-prompt
      // delegated listener.
      const proxy=document.createElement('button');proxy.type='button';proxy.dataset.reviewBatchPrompt='What should I know about the Northstar pilot?';document.body.appendChild(proxy);proxy.click();proxy.remove();
    }
    else if(act==='demo-start-note'){closeDialog();showAddDialog(state.data.sampleInformationOptions?.plan||state.data.sampleInformation||'');}
    else if(act==='demo-start-project'){closeDialog();navigateTo('project-overview');}
    else if(act==='project-settings')showProjectSettings();
    else if(act==='save-project-rule'){const text=document.getElementById('projectRuleText')?.value.trim();const category=document.getElementById('projectRuleCategory')?.value||'Interpretation';if(text){try{const rule=await API.createRule(text,category);if(!state.projectRules.some(x=>x.id===rule.id))state.projectRules.push(rule);showProjectSettings();}catch(err){showDialog(`<span class="eyebrow">Couldn’t save rule</span><h2 id="dialogTitle">Rule was not added.</h2><p>${esc(err.message)}</p>`);}}}
    else if(act==='delete-project-rule'){try{await API.deleteRule(a.dataset.ruleId);state.projectRules=state.projectRules.filter(x=>x.id!==a.dataset.ruleId);showProjectSettings();}catch(err){showDialog(`<span class="eyebrow">Couldn’t remove rule</span><h2 id="dialogTitle">Rule is still active.</h2><p>${esc(err.message)}</p>`);}}
    else if(act==='example-prompt'){const q=a.dataset.prompt;closeDialog();navigateTo('overview');submitAsk(q);}
    else if(act==='copy-result'){const text=state.result?.liveAsk&&ASK?.portableText?ASK.portableText(state.result.liveAsk,liveRecordStatus()):(document.querySelector('.answer-content')?.innerText||'');const label='Copy';navigator.clipboard?.writeText(text);a.textContent='Copied';setTimeout(()=>a.textContent=label,1200);}
    else if(act==='refresh-answer'){const q=state.resultQuery;if(!q)return;state.result=null;await submitAsk(q);}


    else if(act==='toggle-projects'){state.projectMenuOpen=!state.projectMenuOpen;render();}
    else if(act==='ask-result')submitAsk(document.getElementById('resultAskInput')?.value);
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
          const apiReviews=(result.reviews||[]).map(r=>mapApiReview(r,text,{resolvesQuestionId:q.id}));
          state.data.notes.unshift({id:noteId,title:'Answer to: '+q.text,text,source:'Question response',date:todayLabel(),dateISO:todayISO(),topics:q.topics,status:apiReviews.length?'pending':'no_review_needed',reviewId:apiReviews[0]?.id||null,reviewIds:apiReviews.map(r=>r.id),evidenceId:result.evidence_id});
          apiReviews.forEach(r=>{r.evidenceId=noteId; upsertBackendReview(r);});
          state.reviewBannerDismissed=false; state.isAnalyzing=false; stopAnalysisClock(); updateNav();
          if(apiReviews.length) showDialog(`<span class="eyebrow">Added</span><h2 id="dialogTitle">Answer sent to Review.</h2><p>The question stays unresolved until you accept reviewed evidence that establishes an answer.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">Go to Review</button></div>`);
          else showDialog(`<span class="eyebrow">Reviewed</span><h2 id="dialogTitle">The question stays open.</h2><p>The evidence did not produce a State change, so it was not enough to resolve this question.</p>`);
        }catch(e){ await showAnalysisFailure(e,{draftMessage:'The question stays open.',safeContext:'Your question response'}); }
      }
    }
    else if(act==='close-result'||act==='new-ask'){const oldAskInput=document.getElementById('askInput');if(oldAskInput)oldAskInput.value='';state.result=null;state.resultQuery='';state.askInputDraft='';state.refinements=[];renderOverview();requestAnimationFrame(()=>document.getElementById('askInput')?.focus());}
    else if(act==='refine-submit')refine();
    else if(act==='go-open-question'){const q=state.data.questions.find(x=>x.id===a.dataset.questionId);if(q)showDialog(questionDialogHtml(q));}
    else if(act==='add-info'||act==='suggest-update')showAddDialog();
    else if(act==='confirm-demo-reset'){showDialog(`<span class="eyebrow">Reset to starting scenario</span><h2 id="dialogTitle">Restore the Northstar starting scenario?</h2><p>This removes everything created during testing and restores the same curated starting State, open Reviews, blockers, Questions, Notes, Rules, and History.</p><div class="dialog-actions"><button class="btn primary" data-action="reset-demo">Reset Northstar</button><button class="btn secondary" data-action="project-settings">Cancel</button></div>`);}
    else if(act==='reset-demo'){state.isAnalyzing=true;showDialog(`<span class="eyebrow">Resetting Northstar</span><h2 id="dialogTitle">Restoring Northstar…</h2><p>Rebuilding the curated starting scenario.</p>`);try{await API.resetDemo();await hydrateBackend();state.result=null;state.resultQuery='';state.askInputDraft='';state.isAnalyzing=false;closeDialog();navigateTo('overview');}catch(err){state.isAnalyzing=false;showDialog(`<span class="eyebrow">Reset failed</span><h2 id="dialogTitle">Northstar was not reset.</h2><p>${esc(err.message)}</p><div class="dialog-actions">${err?.isTimeout?'<button class="btn primary" data-action="reload-page">Refresh page</button>':''}<button class="btn secondary" data-action="close-dialog">Close</button></div>`);}}
    else if(act==='reload-page'){window.location.reload();}
    else if(act==='review-receipt-project'){const area=a.dataset.projectArea||'product';closeDialog();navigateTo('project-overview');requestAnimationFrame(()=>{scrollProjectTarget(`project-${area}`);const target=a.dataset.stateId?[...document.querySelectorAll('[data-state-id]')].find(el=>el.dataset.stateId===a.dataset.stateId)?.closest('.project-wiki-topic'):null;if(target){target.classList.add('is-recently-updated');setTimeout(()=>target.classList.remove('is-recently-updated'),2200);}});}
    else if(act==='close-dialog'){if(!state.isAnalyzing)closeDialog();}
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
    else if(act==='ask-access-again'){closeDialog();navigateTo('overview');state.resultQuery='What determines customer feature access?';state.result={scenario:state.data.askScenarios.find(s=>s.id==='access')};renderOverview();}
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
    if(e.key==='Enter'&&e.target.id==='askInput')submitAsk();
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
  window.STATE_ASK_TEST_API={state,detectAskIntent,findScenario,structuredAskResult,scenarioResult,intentAskHtml,submitAsk,upsertBackendReview,replaceBackendOpenReviews,mapApiReview,looksLikeQuestion,hasExplicitUpdateIntent,linkedReviewFor,questionDialogHtml,renderOverview,historyType,syncApiHistory};
  // Called by context-history.js's popstate handler after it re-activates the
  // History tab, so a Back press that lands on a topic-detail browser-history
  // entry actually restores that topic filter instead of always landing on
  // the plain list. See context-history.js for the paired pushHistoryTopic().
  window.STATE_HISTORY_RESTORE=(topic)=>{ if(state.view!=='history')return; state.historyTopic=topic||null; renderHistory(); };
  render();
  hydrateBackend();
})();
