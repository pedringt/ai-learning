(() => {
  const D = window.PROJECT_CONTEXT_DATA;
  const clone = x => JSON.parse(JSON.stringify(x));
  const initial = clone(D);
  const state = {
    data: clone(D), view:'overview', result:null, resultQuery:'', projectMenuOpen:false, refinements:[], lastScenario:null,
    addedSample:false, pendingCreated:false, reviewBannerDismissed:false, dialogReturnFocus:null, expandedNotes:new Set(), noteComposerOpen:false, editingNoteId:null
  };

  const root = document.getElementById('viewRoot');
  const overlay = document.getElementById('overlay');
  const dialogBody = document.getElementById('dialogBody');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const openQuestions = () => state.data.questions.filter(q => q.status === 'open');
  const pendingReviews = () => state.data.reviews.filter(r => r.status === 'pending');
  const accessUpdated = () => state.data.reviews.find(r => r.id==='r-access')?.status === 'update';
  const securityUpdated = () => state.data.reviews.find(r => r.id==='r-security')?.status === 'update';

  function updateNav(){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view===state.view));
    document.getElementById('reviewCountNav').textContent = pendingReviews().length || '';
    const pm=document.getElementById('projectMenu'), ps=document.getElementById('projectSwitcher'); if(pm)pm.hidden=!state.projectMenuOpen; if(ps)ps.setAttribute('aria-expanded',state.projectMenuOpen?'true':'false');
  }

  function render(){ updateNav(); ({overview:renderOverview,notes:renderNotes,questions:renderQuestions,review:renderReview}[state.view]||renderOverview)(); }

  function renderOverview(){
    const resultBody = state.result ? (state.result.fallback ? fallbackResult() : scenarioResult(state.result.scenario)) : '';
    const reviewBanner = pendingReviews().length && !state.reviewBannerDismissed ? `<aside class="review-banner" data-view="review" role="link" tabindex="0"><div><strong>${pendingReviews().length} items need review</strong><span>New information may change the project’s current understanding.</span></div><div><button class="text-button" data-view="review">Review →</button><button class="banner-close" data-action="dismiss-review-banner" aria-label="Dismiss review reminder">×</button></div></aside>` : '';
    root.innerHTML = `<section class="overview pristine">
      <section class="overview-heading"><div class="overview-heading-row"><div><h2>Northstar</h2></div><button class="btn primary overview-add" data-action="add-info">+ Add project update</button></div></section>
      ${reviewBanner}
      <section class="ask-panel compact-ask unboxed-ask"><div class="ask-title-row"><div><label for="askInput">Work with this project</label><p>Ask, summarize, prepare, draft, or find something using reviewed project knowledge.</p></div></div>
        <div class="ask-input-row"><input id="askInput" autocomplete="off" placeholder="${state.result?'Ask a follow-up or create something else…':'What do you want to know or make?'}"/><button class="btn primary" data-action="ask-submit">Ask</button></div>
        <div class="prompt-suggestions single-suggestion"><button class="examples-link" data-action="show-examples">See what you can ask →</button></div>
        <div class="answer-stage ${state.result?'has-result':'is-empty'}" aria-live="polite">${state.result?`<div class="result-toolbar"><div class="result-query-line"><span class="meta-label">You asked</span><strong>${esc(state.resultQuery)}</strong></div><div class="result-utilities"><button class="text-button" data-action="copy-result">Copy</button><button class="text-button" data-action="save-result-note">Save to notes</button></div></div><div class="answer-content">${resultBody}</div>`:`<div class="answer-empty"><span class="answer-empty-icon">⌕</span><strong>Work from what the project currently knows</strong><p>Find a project detail, understand what changed, prepare for a meeting, or create an update.</p><div class="empty-suggestions"><button data-prompt="What changed about feature access?">Understand a change</button><button data-prompt="What is still unresolved?">Find what is unresolved</button><button data-prompt="Prepare me for the security meeting">Prepare for a meeting</button></div></div>`}</div>
      </section></section>`;
  }

  function findScenario(query){
    const q=norm(query);
    if(!q) return null;
    let best=null, score=0;
    for(const s of state.data.aiScenarios){
      for(const alias of s.aliases){
        const a=norm(alias);
        let n=0;
        if(q===a) n=100; else if(q.includes(a)||a.includes(q)) n=70;
        else { const words=a.split(' ').filter(w=>w.length>2); n=words.filter(w=>q.includes(w)).length * 8; }
        if(n>score){ score=n; best=s; }
      }
    }
    return score>=16?best:null;
  }

  function pendingFor(topics){
    return pendingReviews().filter(r => r.topics.some(t=>topics.includes(t)));
  }

  function submitAsk(query){
    const raw=(query ?? document.getElementById('askInput')?.value ?? '').trim(); if(!raw)return;
    if(/\b(approved|confirmed|decided|agreed|learned|yesterday|today)\b/i.test(raw) && /\b(security|okta|support|customer|plan|feature|team)\b/i.test(raw)){
      showAddDialog(raw); return;
    }
    state.resultQuery=raw; state.refinements=[];
    const q=norm(raw); let scenario=findScenario(raw);
    if(!scenario && state.lastScenario && /\b(shorter|shorten|brief|focus|evidence|sources|slack|email|executive)\b/.test(q)){
      let kind=q.includes('short')||q.includes('brief')?'shorter':q.includes('evidence')||q.includes('source')?'evidence':'exec';
      state.refinements=[kind]; scenario=state.lastScenario;
    }
    state.result=scenario?{scenario}: {fallback:true}; if(scenario)state.lastScenario=scenario;
    renderOverview();
  }


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
    if(s.output==='unknown') return `<div class="result-label">Based on current reviewed understanding</div><h2>Not established</h2><div class="answer-prose"><p>The project has not established what percentage of troubleshooting can safely be automated. Troubleshooting is the leading pilot direction, but no supported automation percentage has been established yet.</p><p><strong>Unknown is not 0%.</strong> The project is deliberately keeping that distinction unresolved.</p></div><button class="text-button result-action" data-action="track-question" data-question="What percentage of troubleshooting can safely be automated?">Track as open question →</button>${sourceDisclosure(['n-discovery','n-leadership'])}`;
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
    if(s.output==='questions') return `<div class="result-label">Known unknowns</div><h2>${openQuestions().length} open questions</h2><div class="compact-list">${openQuestions().slice(0,6).map(q=>`<article><strong>${esc(q.text)}</strong><span>${esc(q.origin)}</span></article>`).join('')}</div><button class="btn secondary" data-view="questions">Open Questions →</button>`;
    if(s.output==='retrieve') return `<div class="result-label">Notes · feature access</div><h2>Project material about plan and feature access</h2>${pendingNotice(pending)}<div class="result-note-list">${state.data.notes.filter(n=>n.topics.includes('feature-access')).map(simpleNote).join('')}</div>`;
    return fallbackResult();
  }

  function refinedResult(kind,s,pending){
    if(kind==='shorter') return `<div class="result-label">Refined result</div><h2>Short version</h2><p class="result-lede">${s.output==='meeting'?'Human review stays. Safe autonomy is unknown. Feature-access authority is unresolved.':'The current answer has been shortened without changing project knowledge.'}</p>${pendingNotice(pending)}`;
    if(kind==='auth') return `<div class="result-label">Refined result · authentication focus</div><h2>Authentication and access boundaries</h2><p class="result-lede">Login issues can have multiple causes, while consequential account changes remain human-controlled. Feature-access authority is ${accessUpdated()?'explicitly unresolved after review':'potentially challenged by pending Support evidence'}.</p>${pendingNotice(pending)}`;
    if(kind==='evidence') return `<div class="result-label">Evidence view</div><h2>What this result is based on</h2>${sourceDisclosure(accessUpdated()?['n-discovery','n-security','n-support']:['n-discovery','n-security'])}`;
    return `<div class="result-label">Refined result</div><h2>Executive version</h2><p class="result-lede">Troubleshooting remains the pilot focus, but the project is preserving unresolved safety and authority questions rather than turning them into assumptions.</p>${pendingNotice(pending)}`;
  }

  function fallbackResult(){ return `<div class="result-label">Project knowledge</div><h2>I don't have a reliable answer for that from the project knowledge available in this prototype.</h2><p class="result-lede">I’d rather leave this unresolved than route you to an unrelated canned answer.</p><div class="inline-actions"><button class="btn primary" data-action="track-question" data-question="${esc(state.resultQuery)}">Track as open question →</button><button class="btn secondary" data-view="notes">Browse Notes</button></div>`; }

  function refine(){ const v=norm(document.getElementById('refineInput')?.value||''); if(!v)return; let kind='exec'; if(v.includes('short'))kind='shorter'; else if(v.includes('auth'))kind='auth'; else if(v.includes('evidence')||v.includes('support'))kind='evidence'; state.refinements.push(kind); renderOverview(); }

  function simpleNote(n){
    const expanded=state.expandedNotes.has(n.id);
    const target=120+((n.id.charCodeAt(2)||7)*17)%111;
    const preview=n.text.length>target?n.text.slice(0,Math.max(80,target-3)).replace(/\s+\S*$/,'')+'…':n.text;
    const editing=state.editingNoteId===n.id;
    const body=editing
      ? `<div class="note-inline-editor"><input class="dialog-input" id="editNoteTitle-${n.id}" value="${esc(n.title)}" aria-label="Note title"><textarea id="editNoteText-${n.id}" rows="8" aria-label="Note text">${esc(n.text)}</textarea><div class="inline-actions"><button class="btn primary" data-action="save-note-edit" data-note-id="${n.id}">Save changes</button><button class="btn secondary" data-action="cancel-note-edit" data-note-id="${n.id}">Cancel</button></div></div>`
      : expanded
        ? `<p class="note-full-text">${esc(n.text)}</p><div class="inline-actions note-actions"><button class="text-button" data-action="edit-note" data-note-id="${n.id}">Edit</button><button class="text-button" data-action="send-note-review" data-note-id="${n.id}">${n.status==='pending'?'In review':'Send to review'}</button><button class="text-button" data-action="copy-note" data-note-id="${n.id}">Copy</button></div>`
        : `<p>${esc(preview)}</p><span class="note-expand-label">Open note →</span>`;
    return `<article class="simple-note note-index-row ${expanded?'is-expanded':''}" data-action="toggle-note" data-note-id="${n.id}" tabindex="0"><span class="note-date">${esc(n.date)}</span><div><h3>${esc(n.title)}</h3><span class="note-source">${esc(n.source)}</span>${body}</div></article>`;
  }

  function renderNotes(){
    const composer=state.noteComposerOpen?`<section class="note-composer"><input id="newNoteTitle" class="dialog-input" placeholder="Note title" aria-label="Note title"><textarea id="newNoteText" rows="8" placeholder="Write anything you want to keep with the project. Saving a note does not change project state."></textarea><div class="inline-actions"><button class="btn primary" data-action="save-new-note">Save note</button><button class="btn secondary" data-action="cancel-new-note">Cancel</button></div></section>`:'';
    root.innerHTML=`<section class="page collection-page notes-page"><div class="page-head"><div><span class="eyebrow">Working notes</span><h2>Notes</h2><p>Your working space for project notes. Saving something here does not make it part of the project's reviewed understanding.</p><p class="notes-disclosure">This demo uses a mix of notes adapted from my real discovery/product work and simulated project notes created to demonstrate retrieval, review, and maintained-context workflows.</p></div><button class="btn primary notes-add" data-action="new-note">+ New note</button></div>${composer}<div class="notes-toolbar"><input class="notes-search" id="notesSearch" type="search" placeholder="Search notes" aria-label="Search notes"></div><div class="note-results simple-notes" id="notesList">${state.data.notes.map(simpleNote).join('')}</div></section>`;
  }

  function renderQuestions(){ root.innerHTML=`<section class="page collection-page"><div class="page-head"><div><span class="eyebrow">Known unknowns</span><h2>Questions</h2><p>Things the project is deliberately keeping unresolved until evidence establishes an answer.</p><p class="questions-staleness-note">This is the place to see everything the project is still waiting on. Questions can also surface where they matter in Workspace answers.</p></div><button class="btn secondary" data-action="add-question">+ Add question</button></div><div class="question-cards">${openQuestions().map(q=>`<article class="question-card" data-action="open-question" data-question-id="${q.id}" tabindex="0" role="button"><div><span>${esc(q.origin)} · Open</span><h3>${esc(q.text)}</h3><button class="text-button question-answer" data-action="answer-question" data-question-id="${q.id}">Answer question →</button></div></article>`).join('') || '<div class="empty">No open questions.</div>'}</div></section>`; }

  function showDemoHelp(){
    showDialog(`<span class="eyebrow">How this demo works</span><h2 id="dialogTitle">Try the core State interaction</h2><p>State is a fixed behavioral prototype exploring one idea: new information can enter a project without automatically changing what the project treats as current.</p><div class="demo-help-steps"><div><strong>Try the core flow</strong><p>Choose Add project update → load the sample update → send it to Review → review the new access information → ask Workspace what determines feature access.</p></div><div><strong>What is simulated</strong><p>The project data and recognized answer paths are fixed so the behavior is repeatable. There is no live AI model or production backend.</p></div></div><div class="dialog-actions demo-help-actions"><a class="text-button" href="../implementation-context.html">Read the case study →</a><button class="btn primary" data-action="close-dialog">Start exploring</button></div>`);
  }

  function renderReview(){
    const pending=pendingReviews();
    root.innerHTML=`<section class="page collection-page"><div class="page-head"><div><span class="eyebrow">Decision inbox</span><h2>Review</h2><p>New evidence does not become project truth until a person decides what it changes.</p></div></div>${pending.length?pending.map(reviewCard).join(''):`<div class="empty-state"><h3>Nothing waiting for review.</h3><p>Reviewed information remains preserved in Notes and available to the Workspace when relevant.</p></div>`}</section>`;
  }

  function reviewCard(r){ const generic=r.id.startsWith('r-info-'); return `<article class="review-card compact-review" data-review-card="${r.id}"><div class="review-row-head"><div><span class="review-kicker">${esc(r.title)}</span><h3>${esc(r.summary)}</h3></div></div><details class="review-focus"><summary>${generic?'Review this evidence →':'Review this change →'}</summary><div class="review-summary single-column"><div><span>Current understanding</span><p>${esc(r.current)}</p></div><div><span>${generic?'Review question':'Proposed change'}</span><p><strong>${esc(r.proposed)}</strong></p></div><div><span>Still unresolved</span><p>${esc(r.unresolved)}</p></div></div><div class="review-actions"><button class="btn primary" data-action="review-update" data-review="${r.id}">${generic?'Accept as reviewed evidence':'Update understanding'}</button><button class="btn secondary" data-action="review-keep" data-review="${r.id}">Leave unchanged</button></div><details class="reasoning"><summary>Why is this being proposed?</summary><p><strong>New evidence:</strong> ${esc(r.evidence)}</p><p><strong>What it establishes:</strong> ${esc(r.establishes)}</p><p><strong>What it does not establish:</strong> ${esc(r.doesNot)}</p></details></details></article>`; }

  function decideReview(id,decision){ const r=state.data.reviews.find(x=>x.id===id); state.lastReviewGeneric=!!r?.id?.startsWith('r-info-'); if(!r||r.status!=='pending')return; r.status=decision; const note=state.data.notes.find(n=>n.id===r.evidenceId); if(note)note.status=decision==='update'?'accepted':'reviewed'; if(decision==='update'){
      if(r.id==='r-access'){ const k=state.data.knowledge.find(k=>k.id==='k-access'); if(k)k.statement=k.afterReview; }
      if(r.questionToCreate && !state.data.questions.some(q=>q.id===r.questionToCreate.id)) state.data.questions.push(clone(r.questionToCreate));
      if(r.resolvesQuestionId){ const q=state.data.questions.find(q=>q.id===r.resolvesQuestionId); if(q){ q.status='resolved'; q.resolution='Resolved by reviewed Security follow-up'; } }
      state.data.history.unshift({id:'h-'+Date.now(),date:'Aug 29',type:r.resolvesQuestionId?'Current understanding updated · open question resolved':(r.id.startsWith('r-info-')?'Evidence accepted without state change':'Current understanding updated'),before:r.current,after:r.id.startsWith('r-info-')?r.current:r.proposed,reason:r.id==='r-security'?'Security follow-up':r.id.startsWith('r-info-')?'Added project information':'Senior Support Rep interview',decision:'Human chose Update understanding'});
    } else state.data.history.unshift({id:'h-'+Date.now(),date:'Aug 29',type:'Current understanding kept',before:r.current,after:r.current,reason:'Senior Support Rep interview preserved as evidence',decision:'Human chose Leave understanding unchanged'});
    render(); showDecisionComplete(decision);
  }

  function showDecisionComplete(decision){ showDialog(`<span class="eyebrow">Review complete</span><h2 id="dialogTitle">${decision==='update'?(state.lastReviewGeneric?'Evidence reviewed.':'Current understanding updated.'):'Understanding left unchanged.'}</h2><p>${decision==='update'?'The reviewed evidence has been applied to current understanding. Any question it directly establishes has been resolved; unresolved residue stays open.':'The evidence is preserved, but downstream work continues using the prior reviewed understanding.'}</p><div class="dialog-actions"><button class="btn primary" data-action="close-dialog">Done</button></div>`); }


  function showExamples(){
    const groups=[['Find something',['Who is my support rep contact?','What did we decide about pilot access?','Find notes about plan access']],['Understand the project',['What changed this week?','What are we still waiting on?','What percentage can we safely automate?']],['Prepare & summarize',['Prepare for security meeting','Summarize what changed this week','Are we ready for implementation?']],['Create something',['Draft a leadership update','Write a short status update for the support team','Turn the current project state into a Slack update']]];
    showDialog(`<span class="eyebrow">Workspace examples</span><h2 id="dialogTitle">What can I ask?</h2><p><strong>Ask whatever you want about the project.</strong> These are only ideas to show the range of what the workspace can do with the information it has.</p><div class="example-groups static-examples">${groups.map(([g,items])=>`<section><h3>${g}</h3>${items.map(x=>`<div class="example-row static-example">${esc(x)}</div>`).join('')}</section>`).join('')}</div>`);
  }

  function showDialog(html){
    if(overlay.hidden) state.dialogReturnFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogBody.innerHTML=html; overlay.hidden=false; document.body.classList.add('modal-open');
    const dialog=document.querySelector('.dialog');
    requestAnimationFrame(()=>{
      const first=dialog?.querySelector('input, textarea, select, button:not(.dialog-close), [href], [tabindex]:not([tabindex="-1"])');
      (first||dialog)?.focus();
    });
  }
  function closeDialog(){
    overlay.hidden=true; dialogBody.innerHTML=''; document.body.classList.remove('modal-open');
    const target=state.dialogReturnFocus; state.dialogReturnFocus=null;
    if(target && document.contains(target)) requestAnimationFrame(()=>target.focus());
  }
  function showAddDialog(prefill=''){ showDialog(`<span class="eyebrow">Project update</span><h2 id="dialogTitle">Add a project update</h2><p>Use this for new information that may change what the project currently understands. It goes to Review first.</p><textarea id="addInfoText" rows="7" placeholder="Paste a finding, decision, meeting update, or other new project information...">${esc(prefill)}</textarea><button class="sample-link" data-action="sample-info">Try sample update</button><div class="dialog-actions"><button class="btn primary" data-action="save-info">Send to Review</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`); }

  function saveInformation(){
    const text=document.getElementById('addInfoText')?.value.trim(); if(!text)return;
    const sample=/temporary access|grandfathered/i.test(text);
    if(sample){
      let n=state.data.notes.find(n=>n.id==='n-support');
      if(n){ n.status='pending'; n.reviewId='r-access'; }
      if(!state.data.reviews.some(r=>r.id==='r-access')){
        state.data.reviews.unshift({
          id:'r-access', evidenceId:'n-support', topics:['feature-access','security'], status:'pending',
          title:'New evidence weakens the current access assumption',
          summary:'The Support interview documents temporary, grandfathered, and commercial exceptions, so plan tier alone cannot reliably represent effective access.',
          proposed:'Plan rules alone are insufficient to determine effective customer feature access because account-level exceptions exist.',
          unresolved:'Which account-level source or field should be authoritative across exception types.',
          current:'Standard plan rules are used as one troubleshooting input when checking feature access.',
          evidence:text,
          establishes:'Real account-level exceptions exist, so the plan matrix is not sufficient by itself.',
          doesNot:'It does not establish a single replacement source or prove that any specific backend field is authoritative.',
          resolvesQuestionId:'q-authority-seed'
        });
      }
      state.addedSample=true;
    } else {
      const stamp=Date.now(), noteId='n-added-'+stamp, reviewId='r-info-'+stamp;
      state.data.notes.unshift({id:noteId,title:'New project update',text,source:'Project update',date:'Aug 29',topics:[],status:'pending',reviewId});
      state.data.reviews.unshift({id:reviewId,evidenceId:noteId,topics:[],status:'pending',title:'New project update needs review',summary:text.length>180?text.slice(0,177).replace(/\s+\S*$/,'')+'…':text,proposed:'Decide whether this update should change current understanding.',unresolved:'What, if anything, should be added to maintained project understanding.',current:'This information is not part of the current reviewed understanding.',evidence:text,establishes:'New project information has been supplied for human review.',doesNot:'It does not become established project knowledge simply because it was added.'});
    }
    state.reviewBannerDismissed=false; closeDialog(); updateNav(); showDialog(`<span class="eyebrow">Added</span><h2 id="dialogTitle">Update sent to Review.</h2><p>Current project understanding has not changed yet.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">Go to Review →</button><button class="btn secondary" data-action="close-dialog">Done</button></div>`);
  }

  function saveWorkingNote(title,text,source='Working note'){
    const clean=(text||'').trim(); if(!clean)return null;
    const stamp=Date.now(), id='n-user-'+stamp;
    state.data.notes.unshift({id,title:(title||'Untitled note').trim()||'Untitled note',text:clean,source,date:'Aug 29',topics:[],status:'working'});
    return id;
  }

  function sendNoteToReview(id){
    const n=state.data.notes.find(x=>x.id===id); if(!n||n.status==='pending')return;
    const stamp=Date.now(), reviewId='r-info-note-'+stamp;
    n.status='pending'; n.reviewId=reviewId;
    state.data.reviews.unshift({id:reviewId,evidenceId:n.id,topics:n.topics||[],status:'pending',title:'Working note sent for review',summary:n.text.length>180?n.text.slice(0,177).replace(/\s+\S*$/,'')+'…':n.text,proposed:'Decide whether anything in this note should change current project understanding.',unresolved:'What, if anything, belongs in maintained project understanding.',current:'This note is working material and is not currently treated as project truth.',evidence:n.text,establishes:'The note contains information the user wants reviewed.',doesNot:'Saving or sending the note does not make its contents true until Review.'});
    state.reviewBannerDismissed=false;
    renderNotes();
  }

  function addQuestion(text){ const clean=(text||'').trim(); if(!clean)return; if(!state.data.questions.some(q=>q.status==='open'&&norm(q.text)===norm(clean))) state.data.questions.push({id:'q-'+Date.now(),text:clean,topics:[],status:'open',origin:'AI suggestion',created:'Aug 29'}); updateNav(); showDialog(`<span class="eyebrow">Open question</span><h2 id="dialogTitle">Tracked without becoming a fact.</h2><p>${esc(clean)}</p><div class="dialog-actions"><button class="btn primary" data-action="go-questions">View Questions</button><button class="btn secondary" data-action="close-dialog">Continue</button></div>`); }

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-action="dismiss-review-banner"]')){ state.reviewBannerDismissed=true; renderOverview(); return; }
    const v=e.target.closest('[data-view]'); if(v){ state.view=v.dataset.view; state.result=null; render(); return; }
    const filter=e.target.closest('[data-filter]'); if(filter){ document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===filter)); const f=filter.dataset.filter; const notes=f==='all'?state.data.notes:state.data.notes.filter(n=>f==='reviewed'?(n.status==='accepted'||n.status==='reviewed'):n.status==='pending'); const list=document.getElementById('notesList'); if(list)list.innerHTML=notes.map(simpleNote).join(''); return; }
    const p=e.target.closest('[data-prompt]'); if(p){ submitAsk(p.dataset.prompt); return; }
    const a=e.target.closest('[data-action]'); if(!a)return;
    const act=a.dataset.action;
    if(act==='ask-submit')submitAsk();
    else if(act==='show-examples')showExamples();
    else if(act==='show-demo-help')showDemoHelp();
    else if(act==='example-prompt'){const q=a.dataset.prompt;closeDialog();state.view='overview';submitAsk(q);}
    else if(act==='copy-result'){navigator.clipboard?.writeText(document.querySelector('.answer-content')?.innerText||'');a.textContent='Copied';setTimeout(()=>a.textContent='Copy',1200);}
    else if(act==='save-result-note'){
      const body=document.querySelector('.answer-content')?.innerText?.trim()||'';
      const id=saveWorkingNote(state.resultQuery?`Workspace: ${state.resultQuery}`:'Workspace result',body,'Saved from Workspace');
      if(id) showDialog(`<span class="eyebrow">Saved</span><h2 id="dialogTitle">Saved to Notes.</h2><p>This is working material only. It has not changed project understanding.</p><div class="dialog-actions"><button class="btn primary" data-action="go-notes">View Notes</button><button class="btn secondary" data-action="close-dialog">Done</button></div>`);
    }


    else if(act==='toggle-projects'){state.projectMenuOpen=!state.projectMenuOpen;render();}
    else if(act==='ask-result')submitAsk(document.getElementById('resultAskInput')?.value);
    else if(act==='new-note'){state.noteComposerOpen=true;state.editingNoteId=null;renderNotes();}
    else if(act==='cancel-new-note'){state.noteComposerOpen=false;renderNotes();}
    else if(act==='save-new-note'){
      const title=document.getElementById('newNoteTitle')?.value||'Untitled note';
      const text=document.getElementById('newNoteText')?.value||'';
      if(saveWorkingNote(title,text)){state.noteComposerOpen=false;renderNotes();}
    }
    else if(act==='toggle-note'){
      if(e.target.closest('button,input,textarea'))return;
      const id=a.dataset.noteId;
      if(state.expandedNotes.has(id)){state.expandedNotes.delete(id);if(state.editingNoteId===id)state.editingNoteId=null;}
      else state.expandedNotes.add(id);
      renderNotes();
    }
    else if(act==='edit-note'){state.expandedNotes.add(a.dataset.noteId);state.editingNoteId=a.dataset.noteId;renderNotes();}
    else if(act==='cancel-note-edit'){state.editingNoteId=null;renderNotes();}
    else if(act==='save-note-edit'){
      const n=state.data.notes.find(x=>x.id===a.dataset.noteId);
      if(n){
        n.title=(document.getElementById(`editNoteTitle-${n.id}`)?.value||n.title).trim()||'Untitled note';
        n.text=(document.getElementById(`editNoteText-${n.id}`)?.value||n.text).trim();
        state.editingNoteId=null;renderNotes();
      }
    }
    else if(act==='send-note-review'){sendNoteToReview(a.dataset.noteId);}
    else if(act==='go-notes'){closeDialog();state.view='notes';render();}
    else if(act==='open-question'){ const q=state.data.questions.find(x=>x.id===a.dataset.questionId); if(q) showDialog(`<span class="eyebrow">Open question</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>This stays unresolved until reviewed evidence establishes an answer.</p><div class="dialog-actions"><button class="btn primary" data-action="answer-question" data-question-id="${q.id}">Add what you learned</button><button class="btn secondary" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button><button class="btn secondary" data-action="close-dialog">Close</button></div>`); }
    else if(act==='answer-question'){ const q=state.data.questions.find(x=>x.id===a.dataset.questionId); if(q) showDialog(`<span class="eyebrow">Answer question</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>Add what you learned. It will go to Review before it can change current understanding.</p><textarea id="questionAnswer" rows="5" placeholder="What did you learn?"></textarea><div class="dialog-actions"><button class="btn primary" data-action="submit-question-answer" data-question-id="${q.id}">Submit for review</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`); }
    else if(act==='submit-question-answer'){ const text=document.getElementById('questionAnswer')?.value.trim(); const q=state.data.questions.find(x=>x.id===a.dataset.questionId); if(text&&q){ const stamp=Date.now(), noteId='n-q-'+stamp, reviewId='r-q-'+stamp; state.data.notes.unshift({id:noteId,title:'Answer to: '+q.text,text,source:'Question response',date:'Aug 29',topics:q.topics,status:'pending',reviewId}); state.data.reviews.unshift({id:reviewId,evidenceId:noteId,topics:q.topics,status:'pending',title:'New information may resolve an open question',summary:text,proposed:text,unresolved:'Whether this evidence is sufficient to close the question.',current:'This question is currently unresolved.',evidence:text,establishes:'A proposed answer has been supplied for human review.',doesNot:'It does not become established project knowledge until Review.',resolvesQuestionId:q.id}); state.reviewBannerDismissed=false; closeDialog(); updateNav(); showDialog(`<span class="eyebrow">Added</span><h2 id="dialogTitle">Answer sent to Review.</h2><p>The question stays unresolved until someone reviews what this information establishes.</p><div class="dialog-actions"><button class="btn primary" data-action="go-review">Go to Review</button><button class="btn secondary" data-action="close-dialog">Done</button></div>`); }}
    else if(act==='close-result'){state.result=null;state.resultQuery='';renderOverview();}
    else if(act==='refine-submit')refine();
    else if(act==='add-info'||act==='suggest-update')showAddDialog();
    else if(act==='close-dialog')closeDialog();
    else if(act==='sample-info'){ const t=document.getElementById('addInfoText'); if(t)t.value=state.data.sampleInformation; }
    else if(act==='save-info')saveInformation();
    else if(act==='go-review'){closeDialog();state.view='review';state.result=null;render();}
    else if(act==='review-now'){ const r=state.data.reviews.find(x=>x.id===a.dataset.review); if(r) showDialog(`<span class="eyebrow">Review, without leaving your answer</span><h2 id="dialogTitle">Review this change</h2>${reviewCard(r)}`); }
    else if(act==='continue-current'){ a.closest('.pending-notice')?.classList.add('acknowledged'); a.closest('.pending-notice')?.querySelector('p')?.replaceChildren(document.createTextNode('Continuing from current reviewed understanding. Pending evidence remains unreviewed.')); }
    else if(act==='track-question')addQuestion(a.dataset.question||state.resultQuery);
    else if(act==='go-questions'){closeDialog();state.view='questions';render();}
    else if(act==='review-update'||act==='review-keep')decideReview(a.dataset.review,act==='review-update'?'update':'keep-current');
    else if(act==='ask-access-again'){closeDialog();state.view='overview';state.resultQuery='What determines customer feature access?';state.result={scenario:state.data.aiScenarios.find(s=>s.id==='access')};render();}
    else if(act==='add-question')showDialog(`<span class="eyebrow">Known unknown</span><h2 id="dialogTitle">Add a question</h2><input id="manualQuestion" class="dialog-input" placeholder="What does the project still need to establish?"/><div class="dialog-actions"><button class="btn primary" data-action="save-question">Track question</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);
    else if(act==='save-question'){const t=document.getElementById('manualQuestion')?.value;closeDialog();addQuestion(t);}
    else if(act==='confirm-stop-question'){const q=state.data.questions.find(q=>q.id===a.dataset.questionId);if(q)showDialog(`<span class="eyebrow">Open question</span><h2 id="dialogTitle">Stop tracking this question?</h2><p>It will be removed from the open questions list. This does not change any reviewed project understanding.</p><div class="dialog-actions"><button class="btn primary" data-action="stop-question" data-question-id="${q.id}">Stop tracking</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`);}
    else if(act==='stop-question'){const q=state.data.questions.find(q=>q.id===a.dataset.questionId);if(q)q.status='stopped';closeDialog();state.view='questions';render();}
    else if(act==='copy-note'){const n=state.data.notes.find(x=>x.id===a.dataset.noteId);if(n){navigator.clipboard?.writeText(n.text);a.textContent='Copied';}}
    else if(act==='copy-draft'){navigator.clipboard?.writeText(a.closest('.answer-stage')?.querySelector('.draft')?.innerText || '');a.textContent='Copied';}
  });

  document.addEventListener('input',e=>{ if(e.target.id==='notesSearch'){ const q=norm(e.target.value); const list=document.getElementById('notesList'); if(list) list.innerHTML=state.data.notes.filter(n=>!q||norm(`${n.title} ${n.text} ${n.source}`).includes(q)).map(simpleNote).join('') || '<div class="empty">No matching notes.</div>'; } });
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.id==='askInput')submitAsk();
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('.note-index-row[data-action="toggle-note"]')){e.preventDefault();const id=e.target.dataset.noteId;if(state.expandedNotes.has(id))state.expandedNotes.delete(id);else state.expandedNotes.add(id);renderNotes();}
    if(e.key==='Escape'&&state.projectMenuOpen){state.projectMenuOpen=false;updateNav();document.getElementById('projectSwitcher')?.focus();return;}
    if(e.key==='Escape'&&!overlay.hidden){closeDialog();return;}
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
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeDialog();});
  render();
})();
