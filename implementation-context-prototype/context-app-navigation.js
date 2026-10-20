// context-app-navigation.js: moved verbatim out of context-app.js (Oct 2026, pure-move split; no
// behavior change). Loaded before context-app.js, which calls install() once, passing the
// closure values these functions used to read directly, and gets the functions back.
// Routing and navigation chrome: render() (the view router), navigateTo(), the nav/subnav
// and project-switcher sync (updateNav), and Current State's jump-link scrolling.
window.STATE_APP_NAVIGATION=Object.freeze({install(ctx){
  const {ASK,PROJECT_VIEW,esc,openQuestions,renderHistory,renderNotes,renderOpenItems,renderOverview,renderProjectOverview,root,state,uiPendingReviews}=ctx;
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
  return {updateNav,updateProjectSubnavActive,render,navigateTo,scrollProjectTarget};
}});
