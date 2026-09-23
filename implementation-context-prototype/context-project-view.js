(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

  // state.md #113: the Project page's organization must come from project
  // data (each Current State item's own area_id/area_name, set server-side
  // -- see review_service.py's list_state()), not from areas/subsections/
  // keyword vocabulary hardcoded here for one specific project. A different
  // project changes its own facts and area assignments; this file never
  // needs to change.
  //
  // "Project stage" and "Project outcome" are the two universal facts every
  // project is expected to maintain (topic label match, not a fixed id --
  // any project's seed/authored data can supply them under these exact
  // topic names). They render in the page header instead of inside an area
  // group, the same as before generalization.
  const UNIVERSAL_TOPICS = new Set(['project stage','project outcome']);
  const isUniversalMeta = k => UNIVERSAL_TOPICS.has(norm(k.title||''));

  // knowledge is state.data.knowledge, passed in by the caller.
  function currentKnowledge(knowledge,areaId){ return knowledge.filter(k=>k.state==='current' && (!areaId || (!isUniversalMeta(k)&&(k.projectArea||'general')===areaId))); }

  // Areas themselves are derived from whatever facts are presently active --
  // no separate area-list fetch, and a project with zero facts in an area
  // never renders an empty section for it.
  function visibleAreas(knowledge){
    const byId=new Map();
    for(const k of knowledge){
      if(k.state!=='current'||isUniversalMeta(k)) continue;
      const id=k.projectArea||'general';
      if(!byId.has(id)) byId.set(id,{id,name:k.areaName||'General',description:k.areaDescription||'',sortOrder:k.areaSortOrder??999});
    }
    return [...byId.values()].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  }

  // pendingFor: context-app.js's pendingFor(topics) (backend-aware, so
  // injected rather than reimplemented here). history: state.data.history.
  function projectFact(k,pendingFor,history){
    const pending=pendingFor(k.topics||[]);
    const hasHistory=history.some(h=>h.knowledgeId===k.id || h.state_item_id===k.id);
    return `<li class="project-maintained-fact" data-state-id="${esc(k.id)}"><div><strong>${esc(k.title)}</strong><span>${esc(k.statement)}</span></div><div class="project-outline-actions">${pending.length?`<button class="project-pending" data-action="open-related-review" data-review-id="${pending[0].id}"><span class="status-dot"></span>Pending review</button>`:''}${hasHistory?`<button class="text-button project-history-link" data-action="view-topic-history" data-knowledge-id="${k.id}">History →</button>`:''}</div></li>`;
  }

  function projectWikiParagraphs(items){
    const statements=[];
    for(const item of items){
      const candidate=String(item.statement||'').trim();
      if(!candidate) continue;
      const candidateWords=new Set(norm(candidate).split(' ').filter(w=>w.length>3));
      const tooClose=statements.some(existing=>{
        const existingWords=new Set(norm(existing).split(' ').filter(w=>w.length>3));
        const intersection=[...candidateWords].filter(w=>existingWords.has(w)).length;
        const union=new Set([...candidateWords,...existingWords]).size||1;
        return intersection/union>.78;
      });
      if(!tooClose) statements.push(candidate);
    }
    const paragraphs=[];
    for(let i=0;i<statements.length;i+=3) paragraphs.push(statements.slice(i,i+3).join(' '));
    return paragraphs;
  }

  function projectOutlineSection(area,items,pendingFor,history){
    if(!items.length) return '';
    const paragraphs=projectWikiParagraphs(items);
    const maintained=`<details class="project-maintained-facts"><summary>Maintained from ${items.length} Current State ${items.length===1?'fact':'facts'}</summary><ul>${items.map(k=>projectFact(k,pendingFor,history)).join('')}</ul></details>`;
    return `<section class="project-outline-section project-wiki-section" id="project-${esc(area.id)}"><div class="project-section-sticky"><h3>${esc(area.name)}</h3></div>${area.description?`<p class="project-outline-description">${esc(area.description)}</p>`:''}<div class="project-wiki-prose">${paragraphs.map(text=>`<p>${esc(text)}</p>`).join('')}</div>${maintained}</section>`;
  }

  // Universal facts are matched by topic label (see UNIVERSAL_TOPICS), not a
  // fixed id, so a different project's own "Project stage"/"Project outcome"
  // facts work identically without editing this file. Current direction
  // falls back to a neutral message rather than assuming any project fact
  // describes a "direction" -- a project that hasn't authored one yet simply
  // shows no direction summary instead of a Northstar-shaped placeholder.
  function projectOrientation(knowledge){
    const byTopic=name=>knowledge.find(k=>k.state==='current'&&norm(k.title||'')===name);
    const stage=byTopic('project stage'), outcome=byTopic('project outcome');
    const current=knowledge.filter(k=>k.state==='current');
    return {
      stage: stage?.statement || 'Stage not yet established in Current State.',
      outcome: outcome?.statement || 'Outcome not yet established in Current State.',
      count: current.length
    };
  }

  // props: {backendState, projectName, knowledge, history, pendingFor}.
  // backendState is state.backendStatus.state. pendingFor is context-app.js's
  // backend-aware pendingFor(topics) function, injected so this module never
  // needs to know about API/state.backendStatus.reviews itself. Returns the
  // full Project page markup; the caller assigns it to #viewRoot and is
  // responsible for the decorateProjectProvenance()/updateProjectSubnavActive()
  // follow-up calls afterward (DOM side effects that stay in context-app.js).
  function render(props){
    const {backendState,projectName,knowledge,history,pendingFor}=props;
    if(backendState==='loading'){
      return `<article class="page project-page project-document"><div class="empty-state unavailable-state"><h2>Loading Current State…</h2><p>Opening the authoritative project understanding.</p></div></article>`;
    }
    if(backendState==='error'){
      return `<article class="page project-page project-document"><div class="empty-state unavailable-state"><h2>Current State is temporarily unavailable.</h2><p>State is not substituting placeholder facts while the authoritative project data cannot be loaded.</p><button class="btn secondary" data-action="retry-hydration">Try again</button></div></article>`;
    }
    const areas=visibleAreas(knowledge);
    const orientation=projectOrientation(knowledge);
    return `<article class="page project-page project-document"><header class="project-document-head" id="project-top"><div class="project-head-row"><div class="project-title-line"><h2>Current State</h2></div><button class="btn secondary project-head-copy-context" data-action="open-copy-context">Copy context</button><button class="btn secondary project-settings-button" data-action="project-settings">Project settings</button></div><p class="project-document-summary">The maintained project wiki: a readable view of what the team currently treats as true.</p><dl class="project-document-meta"><div><dt>Stage</dt><dd>${esc(orientation.stage)}</dd></div><div><dt>Outcome</dt><dd>${esc(orientation.outcome)}</dd></div></dl><div class="something-changed-cta"><div><strong>Something changed?</strong><span>Add new information and State will review whether Current State should change.</span></div><button class="btn secondary" data-action="something-changed">Add Evidence</button></div></header><div class="project-outline">${areas.map(area=>projectOutlineSection(area,currentKnowledge(knowledge,area.id),pendingFor,history)).join('')||'<div class="empty-state"><h3>No Current State yet.</h3><p>Reviewed project understanding will appear here as a clean outline.</p></div>'}</div></article>`;
  }

  window.STATE_PROJECT_VIEW = Object.freeze({render, visibleAreas});
})();
