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

  // Older Baseline confirmations stored this setup-process text as an area description. It is not
  // project truth, so it is never rendered as Current State content (#450, from context-baseline-polish.js).
  const LEGACY_BASELINE_AREA_DESCRIPTION='Baseline section created from human-authorized project material.';
  // #678 / DEC-026: Current State keeps its prose; items past their re-check interval are listed in a box under
  // their area (Paige, Nov 15: layout B). "Show dates" lists every item with its date, its own interval and
  // "Still true". Nothing here changes an item.
  const RECHECK_CHOICES=[30,60,90,180];
  function recheckChip(k){return `<span class="recheck-chip">Needs re-check · last confirmed ${esc(k.lastConfirmed||'')}</span>`;}
  function recheckActions(k,{suggest=true}={}){
    return `<button type="button" class="text-button" data-action="state-still-true" data-state-id="${esc(k.id)}">Still true</button>${suggest?`<button type="button" class="text-button" data-action="suggest-recheck-question" data-state-id="${esc(k.id)}">Suggest a re-check question</button>`:''}`;
  }
  function recheckBox(items){
    const flagged=items.filter(k=>k.needsRecheck);
    if(!flagged.length) return '';
    return `<div class="recheck-box"><p class="recheck-box-head">${flagged.length} ${flagged.length===1?'item needs':'items need'} a re-check</p><ul>${flagged.map(k=>`<li data-state-id="${esc(k.id)}"><p class="recheck-statement">“${esc(k.statement)}”</p>${recheckChip(k)}<div class="recheck-actions">${recheckActions(k)}</div></li>`).join('')}</ul></div>`;
  }
  function intervalSelect(k){
    const current=k.recheckDays??'';
    return `<label class="recheck-interval">Re-check every <select data-action="set-item-recheck" data-state-id="${esc(k.id)}"><option value=""${current===''?' selected':''}>Project default</option>${RECHECK_CHOICES.map(d=>`<option value="${d}"${current===d?' selected':''}>${d} days</option>`).join('')}</select></label>`;
  }
  function datedItems(items){
    return `<ul class="current-state-dated">${items.map(k=>`<li data-state-id="${esc(k.id)}"><p>${esc(k.statement)}</p>${k.needsRecheck?recheckChip(k):`<p class="state-date-line">Confirmed ${esc(k.lastConfirmed||'')}</p>`}<div class="recheck-actions">${recheckActions(k,{suggest:!!k.needsRecheck})}${intervalSelect(k)}</div></li>`).join('')}</ul>`;
  }
  function recheckCount(knowledge){return knowledge.filter(k=>k.state==='current'&&k.needsRecheck).length;}

  function projectOutlineSection(area,items,pendingFor,history,view={}){
    if(!items.length) return '';
    if(view.recheckOnly&&!items.some(k=>k.needsRecheck)) return '';
    const paragraphs=projectWikiParagraphs(items);
    // Hidden: the prose above is the Current State reading surface (#450, from context-feedback-pass-3.js / context-quickwins.js).
    const maintained=`<details class="project-maintained-facts" hidden><summary>See ${items.length} maintained Current State ${items.length===1?'fact':'facts'}</summary><ul>${items.map(k=>projectFact(k,pendingFor,history)).join('')}</ul></details>`;
    return `<section class="project-outline-section project-wiki-section" id="project-${esc(area.id)}"><div class="project-section-sticky"><h3>${esc(area.name)}</h3></div>${area.description&&area.description.trim()!==LEGACY_BASELINE_AREA_DESCRIPTION?`<p class="project-outline-description">${esc(area.description)}</p>`:''}${view.showDates?datedItems(items):`<div class="project-wiki-prose">${paragraphs.map(text=>`<p>${esc(text)}</p>`).join('')}</div>${recheckBox(items)}`}${maintained}</section>`;
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
    const {backendState,projectName,knowledge,history,pendingFor,recheckDays=null,showDates=false,recheckOnly=false}=props;
    if(backendState==='loading'){
      return `<article class="page project-page project-document"><div class="empty-state unavailable-state"><h2>Loading Current State…</h2><p>Opening the authoritative project understanding.</p></div></article>`;
    }
    if(backendState==='error'){
      return `<article class="page project-page project-document"><div class="empty-state unavailable-state"><h2>Current State is temporarily unavailable.</h2><p>State is not substituting placeholder facts while the authoritative project data cannot be loaded.</p><button class="btn secondary" data-action="retry-hydration">Try again</button></div></article>`;
    }
    const areas=visibleAreas(knowledge);
    const orientation=projectOrientation(knowledge);
    const needing=recheckCount(knowledge);
    const view={showDates,recheckOnly:recheckOnly&&needing>0};
    const datesToggle=`<button type="button" class="btn secondary" data-action="toggle-show-dates" aria-pressed="${showDates?'true':'false'}">${showDates?'Hide dates':'Show dates'}</button>`;
    const recheckPointer=recheckDays?'':`<p class="recheck-pointer">Re-check reminders are off. <button type="button" class="text-button" data-action="open-recheck-settings">Turn them on in Settings.</button></p>`;
    const recheckMeta=needing?`<div><dt>Re-check</dt><dd>${needing} ${needing===1?'item needs':'items need'} a re-check</dd></div>`:'';
    const recheckFilter=view.recheckOnly?`<div class="recheck-filter-banner"><span>Showing the ${needing} ${needing===1?'item that needs':'items that need'} a re-check</span><button type="button" class="text-button" data-action="clear-recheck-filter">Show all Current State</button></div>`:'';
    return `<article class="page project-page project-document"><header class="page-head project-page-head current-state-page-head" id="project-top"><div><span class="eyebrow">Maintained project understanding</span><h2>Current State</h2><p class="project-document-summary">The team’s current shared understanding of ${esc(projectName)}: what is settled enough to use, what remains constrained, and what should not be treated as decided yet.</p></div><div class="current-state-page-actions">${datesToggle}<button class="btn secondary project-head-copy-context" data-action="open-copy-context">Copy context</button>${recheckPointer}</div></header><dl class="project-document-meta"><div><dt>Stage</dt><dd>${esc(orientation.stage)}</dd></div><div><dt>Outcome</dt><dd>${esc(orientation.outcome)}</dd></div>${recheckMeta}</dl>${recheckFilter}<div class="something-changed-cta"><div><strong>Something changed?</strong><span>Add new information and State will review whether Current State should change.</span></div><button class="btn secondary" data-action="something-changed">Add Evidence</button></div><div class="project-outline">${areas.map(area=>projectOutlineSection(area,currentKnowledge(knowledge,area.id),pendingFor,history,view)).join('')||'<div class="empty-state"><h3>No Current State yet.</h3><p>Reviewed project understanding will appear here as a clean outline.</p></div>'}</div></article>`;
  }

  window.STATE_PROJECT_VIEW = Object.freeze({render, visibleAreas, recheckCount});
})();
