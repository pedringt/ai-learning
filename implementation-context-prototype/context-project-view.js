(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

  const projectAreas = {
    product:{name:'Product & Workflow', description:'What the assistant currently does, where it fits, and how the support workflow is expected to work.'},
    safety:{name:'Safety & Constraints', description:'The current boundaries that keep the first implementation controlled and reviewable.'},
    evaluation:{name:'Evaluation & Rollout', description:'How the pilot will be judged and what needs to be true before broader use.'}
  };

  // Duplicated from context-app.js's own currentKnowledge()/projectMetaIds
  // (which updateNav() there still needs) rather than shared -- this is a
  // two-line pure filter, and the two call sites don't need to stay in sync
  // through a shared reference. knowledge is state.data.knowledge, passed in
  // by the caller.
  const projectMetaIds=new Set(['k-stage','k-outcome']);
  function currentKnowledge(knowledge,area){ return knowledge.filter(k=>k.state==='current' && (!area || (!projectMetaIds.has(k.id)&&k.projectArea===area))); }

  function projectGroup(k,area){
    const text=norm(`${k.title||''} ${k.statement||''} ${(k.topics||[]).join(' ')}`);
    if(area==='product'){
      if(/scope|pilot|tier 1|tier 2|password|login/.test(text)) return 'Scope';
      if(/access|ground|knowledge|source|entitlement/.test(text)) return 'Knowledge & access';
      return 'Workflow';
    }
    if(area==='safety'){
      if(/data|privacy|retention|slack|source/.test(text)) return 'Data & sources';
      if(/human review|autonomy|sensitive|read.only|vip|account change/.test(text)) return 'Control boundaries';
      return 'Risk controls';
    }
    if(/launch|rollout|training|enablement/.test(text)) return 'Rollout';
    if(/feedback|monitor|sample|metric|evaluation|claim|failure/.test(text)) return 'Measurement';
    return 'Readiness';
  }

  const projectWikiTopics={
    product:[
      {id:'pilot-workflow',title:'Pilot scope & workflow',description:'What the first pilot is for and how it fits into support.',matches:k=>['k-pilot','k-entry','k-login','k-password'].includes(k.id)||projectGroup(k,'product')==='Scope'},
      {id:'knowledge-access',title:'Knowledge & access',description:'What the assistant can rely on when it answers and how access is determined.',matches:k=>['k-grounding','k-access'].includes(k.id)||projectGroup(k,'product')==='Knowledge & access'},
      {id:'escalation-handoff',title:'Escalation & handoff',description:'What happens when the assistant cannot safely carry the case forward.',matches:k=>['k-escalation','k-handoff'].includes(k.id)||projectGroup(k,'product')==='Workflow'},
    ],
    safety:[
      {id:'human-control',title:'Human control',description:'Where human judgment remains required and what would be needed to revisit that boundary.',matches:k=>['k-security','k-autonomy'].includes(k.id)},
      {id:'action-boundaries',title:'Action boundaries',description:'What the assistant is and is not allowed to do in the first implementation.',matches:k=>['k-readonly','k-sensitive','k-vip'].includes(k.id)||projectGroup(k,'safety')==='Control boundaries'},
      {id:'data-sources',title:'Data & sources',description:'The current rules for customer data and approved retrieval sources.',matches:k=>['k-data','k-slack'].includes(k.id)||projectGroup(k,'safety')==='Data & sources'},
    ],
    evaluation:[
      {id:'success',title:'How success is judged',description:'The evidence the team will use to decide whether the pilot is working safely and usefully.',matches:k=>['k-eval','k-feedback','k-sample','k-monitoring','k-claims'].includes(k.id)||projectGroup(k,'evaluation')==='Measurement'},
      {id:'readiness',title:'Launch readiness',description:'What still has to be true before the pilot is ready to launch.',matches:k=>['k-launch'].includes(k.id)||projectGroup(k,'evaluation')==='Readiness'},
      {id:'rollout',title:'Rollout & enablement',description:'How the pilot expands and how reps are prepared to use it.',matches:k=>['k-training','k-rollout'].includes(k.id)||projectGroup(k,'evaluation')==='Rollout'},
    ]
  };

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

  function projectWikiTopic(topic,items,pendingFor,history){
    if(!items.length) return '';
    const paragraphs=projectWikiParagraphs(items);
    const maintained=`<details class="project-maintained-facts"><summary>Maintained from ${items.length} Current State ${items.length===1?'fact':'facts'}</summary><ul>${items.map(k=>projectFact(k,pendingFor,history)).join('')}</ul></details>`;
    return `<section class="project-wiki-topic" id="project-topic-${topic.id}" data-state-ids="${items.map(x=>esc(x.id)).join(' ')}"><div class="project-wiki-topic-head"><h4>${esc(topic.title)}</h4><p>${esc(topic.description)}</p></div><div class="project-wiki-prose">${paragraphs.map(text=>`<p>${esc(text)}</p>`).join('')}</div>${maintained}</section>`;
  }

  function projectOutlineSection(id,a,knowledge,pendingFor,history){
    const items=currentKnowledge(knowledge,id);
    if(!items.length)return '';
    const topics=projectWikiTopics[id]||[];
    const assigned=new Set();
    const blocks=[];
    for(const topic of topics){
      const matched=items.filter(k=>!assigned.has(k.id)&&topic.matches(k));
      matched.forEach(k=>assigned.add(k.id));
      if(matched.length) blocks.push(projectWikiTopic(topic,matched,pendingFor,history));
    }
    const leftover=items.filter(k=>!assigned.has(k.id));
    if(leftover.length) blocks.push(projectWikiTopic({id:`${id}-other`,title:'Additional maintained understanding',description:'Other reviewed facts that belong to this part of the project.'},leftover,pendingFor,history));
    return `<section class="project-outline-section project-wiki-section" id="project-${id}"><div class="project-section-sticky"><h3>${esc(a.name)}</h3></div><p class="project-outline-description">${esc(a.description)}</p>${blocks.join('')}</section>`;
  }

  function projectOrientation(knowledge){
    const byId=id=>knowledge.find(k=>k.id===id&&k.state==='current');
    const pilot=byId('k-pilot'), stage=byId('k-stage'), outcome=byId('k-outcome');
    const current=knowledge.filter(k=>k.state==='current');
    const direction=pilot?.statement || 'Reviewed project direction has not been established yet.';
    return {
      description: stage ? `${direction} ${stage.statement}` : direction,
      direction,
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
    const visible=Object.entries(projectAreas).filter(([id])=>currentKnowledge(knowledge,id).length);
    const orientation=projectOrientation(knowledge);
    const directionParts=orientation.direction.split(/(?<=[.!?])\s+/).filter(Boolean);
    const directionLabel=text=>/two weeks|support reps|pilot runs/i.test(text)?'Pilot':/reviews?|customer-facing|human/i.test(text)?'Guardrail':'Focus';
    const directionSummary=directionParts.map(text=>`<li><strong>${directionLabel(text)}</strong><span>${esc(text)}</span></li>`).join('');
    return `<article class="page project-page project-document"><header class="project-document-head" id="project-top"><div class="project-head-row"><div class="project-title-line"><h2>${esc(projectName)}</h2></div><button class="btn secondary project-head-copy-context" data-action="open-copy-context">Copy context</button><button class="btn secondary project-settings-button" data-action="project-settings">Project settings</button></div><p class="project-document-summary">The maintained project wiki: a readable view of what the team currently treats as true.</p><dl class="project-document-meta"><div><dt>Stage</dt><dd>${esc(orientation.stage)}</dd></div><div><dt>Outcome</dt><dd>${esc(orientation.outcome)}</dd></div></dl></header><section class="project-document-intro" aria-labelledby="currentDirectionTitle"><strong id="currentDirectionTitle">Current direction</strong><ul class="current-direction-list">${directionSummary}</ul></section><div class="project-outline">${visible.map(([id,a])=>projectOutlineSection(id,a,knowledge,pendingFor,history)).join('')||'<div class="empty-state"><h3>No Current State yet.</h3><p>Reviewed project understanding will appear here as a clean outline.</p></div>'}</div></article>`;
  }

  window.STATE_PROJECT_VIEW = Object.freeze({render});
})();
