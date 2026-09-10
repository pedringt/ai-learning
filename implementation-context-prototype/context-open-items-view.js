(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanReviewCopy=value=>String(value||'').replace(/\*\*/g,'').replace(/\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b/gi,'').replace(/\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b/gi,'').replace(/\s+([,.;:])/g,'$1').replace(/\s{2,}/g,' ').trim();

  // Keep the Workspace orientation banner visually distinct from the pale app
  // canvas without introducing another heavy card treatment. The banner is
  // added by late product-polish code, so locate it by its stable CTA rather
  // than coupling this module to that helper's internal class name.
  function polishExploringBanner(){
    const trigger=[...document.querySelectorAll('button,a')].find(el=>String(el.textContent||'').includes('Start with Open Items'));
    if(!trigger)return;
    let banner=trigger.parentElement;
    while(banner&&banner!==document.body&&!String(banner.textContent||'').includes('Exploring State?')) banner=banner.parentElement;
    if(!banner||banner===document.body)return;
    banner.style?.setProperty?.('background','#fff','important');
    trigger.style?.setProperty?.('border','0','important');
    trigger.style?.setProperty?.('background','transparent','important');
    trigger.style?.setProperty?.('box-shadow','none','important');
    trigger.style?.setProperty?.('border-radius','0','important');
    trigger.style?.setProperty?.('padding','4px 0','important');
    trigger.style?.setProperty?.('min-height','0','important');
    trigger.style?.setProperty?.('color','#1769e8','important');
  }
  document.addEventListener('DOMContentLoaded',polishExploringBanner,{once:true});
  setTimeout(polishExploringBanner,0);
  setTimeout(polishExploringBanner,250);

  // The legacy Review controller still uses the evidence-submission toast for
  // zero-proposal Reviews. Keep the underlying Review resolution untouched and
  // correct only the user-facing confirmation after "Mark reviewed" succeeds.
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-action="review-update"]');
    if(!trigger||String(trigger.textContent||'').trim()!=='Mark reviewed')return;
    const oldCopy='Added as Evidence. Current State did not need a Review.';
    const observer=new MutationObserver(()=>{
      const toast=document.querySelector('.state-toast');
      if(toast&&String(toast.textContent||'').trim()===oldCopy){
        toast.textContent='Reviewed. Current State was not changed.';
        observer.disconnect();
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    setTimeout(()=>observer.disconnect(),5000);
  },true);

  // sourceNote: the note this review's evidence came from (state.data.notes
  // resolved by evidenceId), or undefined. Passed in rather than looked up
  // here so this module never needs the whole notes array just for one field.
  function reviewCard(r,expanded=true,accordion=false,sourceNote){
    const generic=r.id.startsWith('r-info-') || (Array.isArray(r.proposals) && r.proposals.length===0);
    const meaningfulUnresolved=r.unresolved && !/^nothing beyond this proposed change/i.test(cleanReviewCopy(r.unresolved));
    const sourceMeta=sourceNote?`${sourceNote.date} · ${sourceNote.source}`:'';
    const chevron=accordion&&expanded?'⌃':'›';
    const head=`<span class="open-question-copy"><span class="open-item-label blocking">Review</span><span class="open-question-title">${esc(r.summary)}</span>${sourceMeta?`<span class="open-question-meta">Evidence · ${esc(sourceMeta)}</span>`:''}</span><span class="question-card-chevron" aria-hidden="true">${chevron}</span>`;
    const rowStyle='width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;box-sizing:border-box';
    const recordStyle='width:100%;max-width:none;margin:12px 0 0;padding:0;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none';
    if(accordion&&!expanded) return `<article class="review-record is-collapsed" style="${recordStyle}" data-review-card="${r.id}"><button type="button" class="open-question-row review-record-toggle" style="${rowStyle}" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="false">${head}</button></article>`;
    const actions=generic
      ? `<button class="btn primary" data-action="review-update" data-review="${r.id}">Mark reviewed</button>`
      : `<button class="btn primary" data-action="review-update" data-review="${r.id}">Update Current State</button><button class="btn secondary" data-action="review-keep" data-review="${r.id}">Keep Current State</button>`;
    const body=`<div class="review-decision-context"><div class="review-context-block"><span>Current understanding</span><p>${esc(cleanReviewCopy(r.current))}</p></div><div class="review-context-block review-evidence-block"><span>${generic?'What the evidence says':'Proposed change'}</span><p>${esc(generic?cleanReviewCopy(r.evidence):cleanReviewCopy(r.proposed))}</p></div>${!generic&&meaningfulUnresolved?`<div class="review-context-block"><span>Still unresolved</span><p>${esc(cleanReviewCopy(r.unresolved))}</p></div>`:''}</div><div class="review-actions">${actions}</div><details class="reasoning"><summary>Why / source</summary><p><strong>Evidence:</strong> ${esc(r.evidence)}</p><p><strong>Establishes:</strong> ${esc(r.establishes)}</p>${r.doesNot?`<p><strong>Does not establish:</strong> ${esc(r.doesNot)}</p>`:''}</details>`;
    if(accordion) return `<article class="review-record is-expanded" style="${recordStyle}" data-review-card="${r.id}"><button type="button" class="open-question-row review-record-toggle" style="${rowStyle}" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="true">${head}</button><div class="review-card-body" style="padding:0 16px 16px 16px!important;box-sizing:border-box">${body}</div></article>`;
    return `<article class="review-card compact-review" data-review-card="${r.id}"><span class="review-row-head open-question-copy"><span class="open-item-label review">Review</span><span class="review-card-title open-question-title">${esc(r.summary)}</span>${sourceMeta?`<span class="review-source-meta open-question-meta">Evidence · ${esc(sourceMeta)}</span>`:''}</span><div class="review-card-body">${body}</div></article>`;
  }

  function questionCard(q,linkedReview){
    const blocking=!!q.blocking;
    const evidenceSummary=linkedReview?(cleanReviewCopy(linkedReview.evidence)||cleanReviewCopy(linkedReview.summary)||'New evidence may answer this question.'):'';
    const body=linkedReview
      ? `<div class="open-question-inline-state"><span class="eyebrow">Answer found · Awaiting review</span><p>${esc(evidenceSummary)}</p><p class="blocking-detail">Current State has not changed yet because this still needs your review.</p></div><div class="open-question-actions"><button class="text-button" data-action="open-specific-review" data-review-id="${linkedReview.id}">Review proposed update →</button><button class="text-button muted" data-action="answer-question" data-question-id="${q.id}">Add something else</button></div>`
      : `<div class="open-question-inline-state"><p>This stays unresolved until reviewed evidence establishes an answer.</p>${blocking&&q.blocks?`<p class="blocking-detail"><strong>Blocks:</strong> ${esc(q.blocks)}</p>`:''}</div><div class="open-question-actions"><button class="text-button" data-action="answer-question" data-question-id="${q.id}">Add what you learned →</button>${blocking?`<button class="text-button muted" data-action="unmark-blocking" data-question-id="${q.id}">No longer blocking</button>`:`<button class="text-button muted" data-action="mark-blocking" data-question-id="${q.id}">Mark as blocking</button>`}<button class="text-button muted" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button></div>`;
    return `<details class="open-question-item${blocking?' is-blocking':''}" style="margin:10px 0 0;padding:0 0 6px;border:0;border-top:1px solid var(--line)" data-question-id="${q.id}"><summary class="open-question-row${blocking?' is-blocking':''}" style="border-bottom:0;padding-top:17px;padding-bottom:14px" aria-label="Question: ${esc(q.text)}"><span class="open-question-copy"><span class="open-item-label ${blocking?'blocking':'question'}">${blocking?'Blocking question':'Open question'}</span><span class="open-question-title">${esc(q.text)}</span><span class="open-question-meta">${esc(q.origin)}${q.created?` · ${esc(q.created)}`:''}${blocking&&q.blocks?` · Blocks: ${esc(q.blocks)}`:''}</span></span><span class="question-card-chevron" aria-hidden="true">›</span></summary><div class="open-question-inline-body">${body}</div></details>`;
  }

  function questionDialogHtml(q,linkedReview){
    if(linkedReview){
      const evidenceSummary=cleanReviewCopy(linkedReview.evidence)||cleanReviewCopy(linkedReview.summary)||'New evidence may answer this question.';
      return `<span class="eyebrow">Answer found · Awaiting review</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>${esc(evidenceSummary)}</p><p class="blocking-detail">Current State has not changed yet because this still needs your review.</p><div class="dialog-actions"><button class="btn primary" data-action="open-specific-review" data-review-id="${linkedReview.id}">Review proposed update →</button><button class="btn secondary" data-action="answer-question" data-question-id="${q.id}">Add something else</button></div>`;
    }
    return `<span class="eyebrow">${q.blocking?'Blocking question':'Open question'}</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>This stays unresolved until reviewed evidence establishes an answer.</p>${q.blocking&&q.blocks?`<p class="blocking-detail"><strong>Blocks:</strong> ${esc(q.blocks)}</p>`:''}<div class="dialog-actions"><button class="btn primary" data-action="answer-question" data-question-id="${q.id}">Add what you learned</button>${q.blocking?`<button class="btn secondary" data-action="unmark-blocking" data-question-id="${q.id}">No longer blocking</button>`:`<button class="btn secondary" data-action="mark-blocking" data-question-id="${q.id}">Mark as blocking</button>`}<button class="btn secondary" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button></div>`;
  }

  function openItemSection(title,count,key,body,empty,openItemSections){
    const defaultCollapsed=key==='questions' && count>5;
    const stored=openItemSections[key];
    const collapsed=stored===null?defaultCollapsed:!!stored;
    return `<section class="open-items-section open-items-${key}${collapsed?' is-collapsed':''}${empty?' is-empty':''}"><button type="button" class="open-items-section-head" data-action="toggle-open-item-section" data-section="${key}" aria-expanded="${collapsed?'false':'true'}"><span class="open-items-section-copy"><span class="open-items-section-title">${esc(title)} <span class="open-items-section-count">${count}</span></span></span><span class="open-items-section-chevron" aria-hidden="true">${collapsed?'⌄':'⌃'}</span></button>${collapsed?'':`<div class="open-items-section-body">${body}</div>`}</section>`;
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
    const linkedReviewFor=q=>reviews.find(r=>r.status==='pending' && (r.resolvesQuestionIds?.includes(q.id) || r.resolvesQuestionId===q.id));
    const visibleWaiting=openQuestionsExpanded?waiting:waiting.slice(0,5);
    const remaining=Math.max(0,waiting.length-visibleWaiting.length);
    const reviewUnavailable=reviewsStatus==='error';
    const questionUnavailable=questionsStatus==='error';
    const reviewCardFor=r=>reviewCard(r,reviews.length===1||expandedReviewId===r.id,true,notes.find(n=>n.id===r.evidenceId));
    const reviewBody=reviewUnavailable?'<div class="open-items-empty unavailable-inline">Reviews could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':reviews.length?reviews.map(reviewCardFor).join(''):'<div class="open-items-empty">Nothing needs your decision right now.</div>';
    const blockerBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Blocking questions could not be loaded.</div>':blockers.length?`<div class="open-question-list" style="border-top:0">${blockers.map(q=>questionCard(q,linkedReviewFor(q))).join('')}</div>`:'<div class="open-items-empty">Nothing is currently blocked on an answer.</div>';
    const draftsLoading=draftsStatus!=='loaded'&&draftsStatus!=='error';
    const draftsUnavailable=draftsStatus==='error';
    const draftBody=draftsLoading?'<div class="open-items-empty" role="status">Loading drafts…</div>':draftsUnavailable?'<div class="open-items-empty unavailable-inline">Draft notes could not be loaded.</div>':draftNotes.length?`<div class="open-question-list">${draftNotes.map(renderDraftNote).join('')}</div>`:'<div class="open-items-empty">No draft notes waiting to be submitted.</div>';
    const questionBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Open questions could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':waiting.length?`<div class="open-question-list" style="border-top:0">${visibleWaiting.map(q=>questionCard(q,linkedReviewFor(q))).join('')}</div>${waiting.length>5?`<button class="open-questions-more" data-action="toggle-open-questions" aria-expanded="${openQuestionsExpanded?'true':'false'}">${openQuestionsExpanded?'Show fewer questions':`Show ${remaining} more questions`} <span aria-hidden="true">${openQuestionsExpanded?'↑':'↓'}</span></button>`:''}`:'<div class="open-items-empty">No other open questions.</div>';
    const actionTotal=(reviewUnavailable?0:reviews.length)+(questionUnavailable?0:blockers.length);
    return `<section class="page collection-page open-items-page"><div class="page-head"><div><div class="review-title-row"><h2>Open Items</h2>${actionTotal?`<span class="count-badge review-page-count" aria-label="${actionTotal} items need attention">${actionTotal}</span>`:''}</div><p>Reviews may propose a Current State change or simply need a human check. Blocking and open questions stay visible here too.</p></div><button class="btn secondary" data-action="add-question">+ Add question</button></div><div class="open-items-sections">${openItemSection('Needs your review',reviewUnavailable?'Unavailable':reviews.length,'reviews',reviewBody,!reviews.length&&!reviewUnavailable,openItemSections)}${openItemSection('Blocking questions',questionUnavailable?'Unavailable':blockers.length,'blockers',blockerBody,!blockers.length&&!questionUnavailable,openItemSections)}${openItemSection('Open questions',questionUnavailable?'Unavailable':waiting.length,'questions',questionBody,!waiting.length&&!questionUnavailable,openItemSections)}${openItemSection('Draft notes',draftsLoading?'…':draftsUnavailable?'Unavailable':draftNotes.length,'drafts',draftBody,draftsStatus==='loaded'&&!draftNotes.length,openItemSections)}</div></section>`;
  }

  window.STATE_OPEN_ITEMS_VIEW = Object.freeze({render,reviewCard,questionDialogHtml,cleanReviewCopy});
})();