(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanReviewCopy=value=>String(value||'').replace(/\*\*/g,'').replace(/\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b/gi,'').replace(/\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b/gi,'').replace(/\s+([,.;:])/g,'$1').replace(/\s{2,}/g,' ').trim();

  // sourceNote: the note this review's evidence came from (state.data.notes
  // resolved by evidenceId), or undefined. Passed in rather than looked up
  // here so this module never needs the whole notes array just for one field.
  function reviewCard(r,expanded=true,accordion=false,sourceNote){
    const generic=r.id.startsWith('r-info-') || (Array.isArray(r.proposals) && r.proposals.length===0);
    const meaningfulUnresolved=r.unresolved && !/^nothing beyond this proposed change/i.test(cleanReviewCopy(r.unresolved));
    const sourceMeta=sourceNote?`${sourceNote.date} · ${sourceNote.source}`:'';
    const head=`<span class="review-row-head"><span class="review-row-copy"><span class="review-kicker">${esc(r.title)}</span><span class="review-card-title">${esc(r.summary)}</span>${sourceMeta?`<span class="review-source-meta">Evidence · ${esc(sourceMeta)}</span>`:''}</span></span>`;
    if(accordion&&!expanded) return `<article class="review-card compact-review is-collapsed" data-review-card="${r.id}"><button type="button" class="review-card-toggle" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="false">${head}</button></article>`;
    const body=`<div class="review-decision-context"><div class="review-context-block"><span>Current understanding</span><p>${esc(cleanReviewCopy(r.current))}</p></div><div class="review-context-block review-evidence-block"><span>${generic?'What the evidence says':'Proposed change'}</span><p>${esc(generic?cleanReviewCopy(r.evidence):cleanReviewCopy(r.proposed))}</p></div>${!generic&&meaningfulUnresolved?`<div class="review-context-block"><span>Still unresolved</span><p>${esc(cleanReviewCopy(r.unresolved))}</p></div>`:''}</div><div class="review-actions"><button class="btn primary" data-action="review-update" data-review="${r.id}">${generic?'Accept as reviewed evidence':'Update understanding'}</button><button class="btn secondary" data-action="review-keep" data-review="${r.id}">Leave unchanged</button></div><details class="reasoning"><summary>Why / source</summary><p><strong>Evidence:</strong> ${esc(r.evidence)}</p><p><strong>Establishes:</strong> ${esc(r.establishes)}</p>${r.doesNot?`<p><strong>Does not establish:</strong> ${esc(r.doesNot)}</p>`:''}</details>`;
    return `<article class="review-card compact-review${accordion?' is-expanded':''}" data-review-card="${r.id}">${accordion?`<button type="button" class="review-card-toggle" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="true">${head}</button>`:head}<div class="review-card-body">${body}</div></article>`;
  }

  function questionCard(q){
    const blocking=!!q.blocking;
    return `<button type="button" class="open-question-row${blocking?' is-blocking':''}" data-action="open-question" data-question-id="${q.id}" aria-label="Open question: ${esc(q.text)}"><span class="open-question-copy"><span class="open-item-label ${blocking?'blocking':'question'}">${blocking?'Blocking question':'Open question'}</span><span class="open-question-title">${esc(q.text)}</span><span class="open-question-meta">${esc(q.origin)}${q.created?` · ${esc(q.created)}`:''}${blocking&&q.blocks?` · Blocks: ${esc(q.blocks)}`:''}</span></span><span class="question-card-chevron" aria-hidden="true">›</span></button>`;
  }

  // linkedReview: the open Review whose resolvesQuestionIds names this
  // question, if any (state.data.reviews, looked up by the caller). When
  // present, the dialog must not dead-end on "Add what you learned" -- State
  // already has a candidate answer waiting on a human decision, so the
  // primary action is going to that Review, not re-submitting evidence.
  function questionDialogHtml(q,linkedReview){
    if(linkedReview){
      const evidenceSummary=cleanReviewCopy(linkedReview.evidence)||cleanReviewCopy(linkedReview.summary)||'New evidence may answer this question.';
      return `<span class="eyebrow">Answer found · Awaiting review</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>${esc(evidenceSummary)}</p><p class="blocking-detail">Current State has not changed yet because this still needs your review.</p><div class="dialog-actions"><button class="btn primary" data-action="open-specific-review" data-review-id="${linkedReview.id}">Review proposed update →</button><button class="btn secondary" data-action="answer-question" data-question-id="${q.id}">Add something else</button></div>`;
    }
    return `<span class="eyebrow">${q.blocking?'Blocking question':'Open question'}</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>This stays unresolved until reviewed evidence establishes an answer.</p>${q.blocking&&q.blocks?`<p class="blocking-detail"><strong>Blocks:</strong> ${esc(q.blocks)}</p>`:''}<div class="dialog-actions"><button class="btn primary" data-action="answer-question" data-question-id="${q.id}">Add what you learned</button>${q.blocking?`<button class="btn secondary" data-action="unmark-blocking" data-question-id="${q.id}">No longer blocking</button>`:`<button class="btn secondary" data-action="mark-blocking" data-question-id="${q.id}">Mark as blocking</button>`}<button class="btn secondary" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button></div>`;
  }

  // openItemSections: state.openItemSections (per-section collapsed override, or null for default).
  function openItemSection(title,kicker,description,count,key,body,empty,openItemSections){
    const defaultCollapsed=key==='questions' && count>5;
    const stored=openItemSections[key];
    const collapsed=stored===null?defaultCollapsed:!!stored;
    return `<section class="open-items-section open-items-${key}${collapsed?' is-collapsed':''}${empty?' is-empty':''}"><button type="button" class="open-items-section-head" data-action="toggle-open-item-section" data-section="${key}" aria-expanded="${collapsed?'false':'true'}"><span class="open-items-section-copy"><span class="open-items-kicker">${esc(kicker)}</span><span class="open-items-section-title">${esc(title)} <span class="open-items-section-count">${count}</span></span><span class="open-items-section-description">${esc(description)}</span></span><span class="open-items-section-chevron" aria-hidden="true">${collapsed?'⌄':'⌃'}</span></button>${collapsed?'':`<div class="open-items-section-body">${body}</div>`}</section>`;
  }

  // props: {reviewsStatus, questionsStatus, draftsStatus, reviews, questions,
  // draftNotes, notes, openQuestionsExpanded, expandedReviewId,
  // openItemSections, renderDraftNote}. `reviews`/`questions` are already the
  // backend-confirmed open sets (state.data filtered by uiPendingReviews()/
  // openQuestions() -- computed by the caller, not here). `notes` is
  // state.data.notes, used only to resolve each review's source-evidence
  // note. `renderDraftNote` is context-notes-view.js's draftNoteRow,
  // injected so this module never needs to reach into another view module
  // directly.
  function render(props){
    const {reviewsStatus,questionsStatus,draftsStatus,reviews,questions,draftNotes,notes,openQuestionsExpanded,expandedReviewId,openItemSections,renderDraftNote}=props;
    if(reviewsStatus==='loading' || questionsStatus==='loading'){
      return `<section class="page collection-page open-items-page"><div class="empty-state unavailable-state"><h2>Loading Open Items…</h2><p>Checking Reviews and Questions that need attention.</p></div></section>`;
    }
    if(reviewsStatus==='error' && questionsStatus==='error'){
      return `<section class="page collection-page open-items-page"><div class="empty-state unavailable-state"><h2>Open Items are temporarily unavailable.</h2><p>State will not substitute fixture Reviews or Questions while authoritative attention data cannot be loaded.</p><button class="btn secondary" data-action="retry-hydration">Try again</button></div></section>`;
    }
    const blockers=questions.filter(q=>q.blocking);
    const waiting=questions.filter(q=>!q.blocking).sort((a,b)=>{
      const reviewTopics=new Set(reviews.flatMap(r=>r.topics||[]));
      const score=q=>(q.topics||[]).some(t=>reviewTopics.has(t))?1:0;
      return score(b)-score(a) || String(b.createdISO||b.created||'').localeCompare(String(a.createdISO||a.created||''));
    });
    const visibleWaiting=openQuestionsExpanded?waiting:waiting.slice(0,5);
    const remaining=Math.max(0,waiting.length-visibleWaiting.length);
    const reviewUnavailable=reviewsStatus==='error';
    const questionUnavailable=questionsStatus==='error';
    const reviewCardFor=r=>reviewCard(r,reviews.length===1||expandedReviewId===r.id,true,notes.find(n=>n.id===r.evidenceId));
    const reviewBody=reviewUnavailable?'<div class="open-items-empty unavailable-inline">Reviews could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':reviews.length?reviews.map(reviewCardFor).join(''):'<div class="open-items-empty">Nothing needs your decision right now.</div>';
    const blockerBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Blocking questions could not be loaded.</div>':blockers.length?`<div class="open-question-list">${blockers.map(questionCard).join('')}</div>`:'<div class="open-items-empty">Nothing is currently blocked on an answer.</div>';
    const draftsUnavailable=draftsStatus==='error';
    const draftBody=draftsUnavailable?'<div class="open-items-empty unavailable-inline">Draft notes could not be loaded.</div>':draftNotes.length?`<div class="open-question-list">${draftNotes.map(renderDraftNote).join('')}</div>`:'<div class="open-items-empty">No draft notes waiting to be sent.</div>';
    const questionBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Open questions could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':waiting.length?`<div class="open-question-list">${visibleWaiting.map(questionCard).join('')}</div>${waiting.length>5?`<button class="open-questions-more" data-action="toggle-open-questions" aria-expanded="${openQuestionsExpanded?'true':'false'}">${openQuestionsExpanded?'Show fewer questions':`Show ${remaining} more questions`} <span aria-hidden="true">${openQuestionsExpanded?'↑':'↓'}</span></button>`:''}`:'<div class="open-items-empty">No other open questions.</div>';
    const actionTotal=(reviewUnavailable?0:reviews.length)+(questionUnavailable?0:blockers.length);
    return `<section class="page collection-page open-items-page"><div class="page-head"><div><span class="eyebrow">What still needs attention</span><div class="review-title-row"><h2>Open Items</h2>${actionTotal?`<span class="count-badge review-page-count" aria-label="${actionTotal} items need attention">${actionTotal}</span>`:''}</div><p>Decide what is ready now, see what is blocking progress, and keep important unknowns visible without turning this into another archive.</p></div><button class="btn secondary" data-action="add-question">+ Add question</button></div><div class="open-items-sections">${openItemSection('Needs your review','Act now','Decisions waiting on you. Current State changes only after you approve them.',reviewUnavailable?'Unavailable':reviews.length,'reviews',reviewBody,!reviews.length&&!reviewUnavailable,openItemSections)}${openItemSection('Blocking questions','Resolve soon','A concrete project dependency is waiting on an answer.',questionUnavailable?'Unavailable':blockers.length,'blockers',blockerBody,!blockers.length&&!questionUnavailable,openItemSections)}${openItemSection('Open questions','Keep in mind','Important unknowns that can wait for relevant evidence.',questionUnavailable?'Unavailable':waiting.length,'questions',questionBody,!waiting.length&&!questionUnavailable,openItemSections)}${openItemSection('Draft notes','Finish up',"Notes you've started but haven't submitted as Evidence yet.",draftsUnavailable?'Unavailable':draftNotes.length,'drafts',draftBody,!draftNotes.length&&!draftsUnavailable,openItemSections)}</div></section>`;
  }

  window.STATE_OPEN_ITEMS_VIEW = Object.freeze({render,reviewCard,questionDialogHtml,cleanReviewCopy});
})();
