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

  // sourceNote: the note this review's evidence came from (state.data.notes
  // resolved by evidenceId), or undefined. Passed in rather than looked up
  // here so this module never needs the whole notes array just for one field.
  //
  // state.md #107: every Review type gets wording for its OWN real decision
  // instead of forcing everything through one interaction shape.
  //   - open_question: Create/Link Question, Dismiss suggestion (unchanged).
  //   - checkOnly (state_at_risk, or any Review that reached here with no
  //     proposal to act on): a human check on an uncertainty, never a
  //     generic "Mark reviewed" acknowledgment -- the two actions answer the
  //     Review's own decision_question directly.
  //   - everything else (proposed_update / missing_understanding with at
  //     least one proposal): Update Current State / Adjust / Leave unchanged.
  function reviewCard(r,expanded=true,accordion=false,sourceNote){
    const isQuestionReview=r.reviewType==='open_question';
    const proposals=Array.isArray(r.proposals)?r.proposals:[];
    const checkOnly=!isQuestionReview && proposals.length===0;
    const adjustableCount=proposals.filter(p=>p.operation!=='retire').length;
    const questionProposal=r.questionToCreate;
    const questionReady=!!questionProposal?.id&&questionProposal.status==='pending';
    const meaningfulUnresolved=r.unresolved && !/^nothing beyond this proposed change/i.test(cleanReviewCopy(r.unresolved));
    const sourceMeta=sourceNote?`${sourceNote.date} · ${sourceNote.source}`:'';
    const chevron=accordion&&expanded?'⌃':'›';
    const head=`<span class="open-question-copy"><span class="open-item-label blocking">Review</span><span class="open-question-title">${esc(r.summary)}</span>${sourceMeta?`<span class="open-question-meta">Evidence · ${esc(sourceMeta)}</span>`:''}</span><span class="question-card-chevron" aria-hidden="true">${chevron}</span>`;
    const rowStyle='width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;box-sizing:border-box';
    const recordStyle='width:100%;max-width:none;margin:12px 0 0;padding:0;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none';
    if(accordion&&!expanded) return `<article class="review-record is-collapsed" style="${recordStyle}" data-review-card="${r.id}"><button type="button" class="open-question-row review-record-toggle" style="${rowStyle}" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="false">${head}</button></article>`;
    const actions=isQuestionReview
      ? `<button class="btn primary" data-action="review-update" data-review="${r.id}"${questionReady?'':' disabled'}>${questionProposal?.existing_question_id?'Link existing Question':'Create Question'}</button><button class="btn secondary" data-action="review-keep" data-review="${r.id}"${questionReady?'':' disabled'}>Dismiss suggestion</button>`
      : checkOnly
      ? `<button class="btn primary" data-action="review-acknowledge-risk" data-review="${r.id}">Keep tracking</button><button class="btn secondary" data-action="review-dismiss-risk" data-review="${r.id}">Dismiss concern</button>`
      : `<button class="btn primary" data-action="review-update" data-review="${r.id}">Update</button>${adjustableCount?`<button class="btn secondary" data-action="open-adjust-review" data-review="${r.id}">Adjust</button>`:''}<button class="btn secondary" data-action="review-keep" data-review="${r.id}">Leave unchanged</button>`;
    // A related open Review is a structural pointer only (same State item or
    // Question as this one) -- never a claim that the two are the same
    // decision. Shown plainly, not as an action, so the human decides
    // whether it changes anything here.
    const relatedBlock=(r.relatedOpenReviews||[]).length
      ? `<div class="review-context-block review-related-block"><span>${r.relatedOpenReviews.length>1?'Related open reviews':'Related open review'}</span>${r.relatedOpenReviews.map(x=>`<p>&ldquo;${esc(x.decisionQuestion)}&rdquo;</p>`).join('')}</div>`
      : '';
    const body=`<div class="review-decision-context"><div class="review-context-block"><span>Current understanding</span><p>${esc(cleanReviewCopy(r.current))}</p></div><div class="review-context-block review-evidence-block"><span>${isQuestionReview?(questionProposal?.existing_question_id?'Already tracked':'Question to track'):checkOnly?'What the evidence says':'Proposed change'}</span><p>${esc(isQuestionReview?(questionReady?questionProposal.existing_question_text||questionProposal.text:'Question suggestion unavailable. Refresh and review it again.'):checkOnly?cleanReviewCopy(r.evidence):cleanReviewCopy(r.proposed))}</p></div>${!checkOnly&&meaningfulUnresolved?`<div class="review-context-block"><span>Still unresolved</span><p>${esc(cleanReviewCopy(r.unresolved))}</p></div>`:''}${relatedBlock}</div><div class="review-actions">${actions}</div><details class="reasoning"><summary>Why / source</summary><p><strong>Evidence:</strong> ${esc(r.evidence)}</p><p><strong>Establishes:</strong> ${esc(r.establishes)}</p>${r.doesNot?`<p><strong>Does not establish:</strong> ${esc(r.doesNot)}</p>`:''}</details>`;
    if(accordion) return `<article class="review-record is-expanded" style="${recordStyle}" data-review-card="${r.id}"><button type="button" class="open-question-row review-record-toggle" style="${rowStyle}" data-action="toggle-review-card" data-review-id="${r.id}" aria-expanded="true">${head}</button><div class="review-card-body" style="padding:0 16px 16px 16px!important;box-sizing:border-box">${body}</div></article>`;
    return `<article class="review-card compact-review" data-review-card="${r.id}"><span class="review-row-head open-question-copy"><span class="open-item-label review">Review</span><span class="review-card-title open-question-title">${esc(r.summary)}</span>${sourceMeta?`<span class="review-source-meta open-question-meta">Evidence · ${esc(sourceMeta)}</span>`:''}</span><div class="review-card-body">${body}</div></article>`;
  }

  // #107 Adjust flow: correcting State's interpretation before it becomes
  // Current State, never editing Current State directly. Each adjustable
  // proposal (anything but a retirement, which has no wording to revise)
  // shows the original AI text plainly next to an editable revision, so the
  // human always sees what changed and what didn't.
  function adjustDialogHtml(r){
    const proposals=(Array.isArray(r.proposals)?r.proposals:[]).filter(p=>p.operation!=='retire');
    const blocks=proposals.map(p=>{
      const aiText=p.proposed_statement||'';
      const label=p.operation==='create'?'New understanding':'Proposed change';
      return `<div class="adjust-proposal-block"><span class="adjust-proposal-label">${esc(label)}</span><div class="adjust-ai-text"><span class="adjust-ai-tag">State proposed</span><p>${esc(aiText)}</p></div><label class="adjust-textarea-label" for="adjust-${esc(p.id)}">Your revision</label><textarea id="adjust-${esc(p.id)}" class="adjust-proposal-text" data-proposal-id="${esc(p.id)}" rows="3">${esc(aiText)}</textarea></div>`;
    }).join('');
    return `<span class="eyebrow">Adjust State's interpretation</span><h2 id="dialogTitle">Revise before updating Current State</h2><p>Correct what State understood from the evidence — this is not a direct edit to Current State. The original AI interpretation stays on record either way.</p>${blocks}<div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-review-adjust" data-review="${esc(r.id)}">Update</button></div>`;
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
    // QA follow-up (2026-09-14): the one-sentence explainer covered
    // Update/Adjust/Leave unchanged but not the other real review shapes
    // (state_at_risk's Keep tracking/Dismiss concern, open_question's
    // Create Question/Link existing Question) -- flagged as needing clearer
    // coverage without turning into a text dump above every Review. A
    // native <details> keeps the default view to one sentence and puts the
    // full breakdown one click away instead of always on screen.
    const reviewHelp=`<details class="review-help"><summary>What do these decisions mean?</summary><dl><dt>Update</dt><dd>Accept the proposed change -- Current State changes and the decision is recorded in History.</dd><dt>Adjust</dt><dd>Correct the wording before it becomes Current State, rather than accepting it as proposed.</dd><dt>Leave unchanged</dt><dd>Current State stays as it is. The evidence is kept on record even though nothing changed.</dd><dt>Keep tracking / Dismiss concern</dt><dd>For a Review flagging that existing Current State may be unreliable: keep the uncertainty tracked as an open Question, or dismiss the concern.</dd><dt>Create Question / Link existing Question</dt><dd>For a Review about a new unknown rather than a fact: start tracking it as a Question, or attach this evidence to one already being tracked.</dd></dl></details>`;
    return `<section class="page collection-page open-items-page"><div class="page-head"><div><div class="review-title-row"><h2>Open Items</h2>${actionTotal?`<span class="count-badge review-page-count" aria-label="${actionTotal} items need attention">${actionTotal}</span>`:''}</div><p>Review what State thinks new information means, then decide what happens to Current State.</p>${reviewHelp}</div><button class="btn secondary" data-action="add-question">+ Add question</button></div><div class="open-items-sections">${openItemSection('Needs your review',reviewUnavailable?'Unavailable':reviews.length,'reviews',reviewBody,!reviews.length&&!reviewUnavailable,openItemSections)}${openItemSection('Blocking questions',questionUnavailable?'Unavailable':blockers.length,'blockers',blockerBody,!blockers.length&&!questionUnavailable,openItemSections)}${openItemSection('Open questions',questionUnavailable?'Unavailable':waiting.length,'questions',questionBody,!waiting.length&&!questionUnavailable,openItemSections)}${openItemSection('Draft notes',draftsLoading?'…':draftsUnavailable?'Unavailable':draftNotes.length,'drafts',draftBody,draftsStatus==='loaded'&&!draftNotes.length,openItemSections)}</div></section>`;
  }

  window.STATE_OPEN_ITEMS_VIEW = Object.freeze({render,reviewCard,adjustDialogHtml,questionDialogHtml,cleanReviewCopy});
})();