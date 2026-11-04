(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanReviewCopy=value=>String(value||'').replace(/\*\*/g,'').replace(/\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b/gi,'').replace(/\s*\((?:\s*(?:k|q|jq)-[a-z0-9-]+\s*[,;]?)+\)/g,'').replace(/(?<![A-Za-z0-9_-])(?:q|jq)-[a-z0-9-]+\b/g,'the linked Question').replace(/(?<![A-Za-z0-9_-])k-[a-z0-9-]+\b/g,'the related Current State item').replace(/\b(?:ask-evidence|state|question|evidence|review|proposal)-[a-z0-9-]+\b/gi,'').replace(/\s+([,.;:])/g,'$1').replace(/\s{2,}/g,' ').trim();

  // #593: a short quote of the stored source Evidence beside the proposed change, so the basis for
  // the proposal is visible at the decision point. It quotes only Evidence records the backend
  // returned (r.evidenceItems, newest first) -- never the AI rationale, which stays under Why /
  // source -- and is cut at a word boundary with a visible "…" plus a note that the full text is
  // under Why / source. No list at all (undefined) claims nothing; an empty list says so plainly.
  const SOURCE_EXCERPT_CHARS=220;
  function sourceExcerpt(text){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    if(clean.length<=SOURCE_EXCERPT_CHARS)return {text:clean,truncated:false};
    const cut=clean.slice(0,SOURCE_EXCERPT_CHARS),space=cut.lastIndexOf(' ');
    return {text:(space>SOURCE_EXCERPT_CHARS*0.6?cut.slice(0,space):cut).replace(/[\s,;:.–—-]+$/,''),truncated:true};
  }
  function recordedSources(r){
    return Array.isArray(r.evidenceItems)?r.evidenceItems.filter(e=>String(e?.content||'').trim()):null;
  }
  // Nov 3: "Read full note" opens the complete text of the quoted Evidence record (the same id) in
  // the Notes view; a read-only navigation. Shown wherever the excerpt is.
  function sourceLinkHtml(r,source){
    if(!source?.id)return '';
    return `<p class="review-source-actions"><button type="button" class="text-button review-source-link" data-action="open-review-source" data-evidence-id="${esc(source.id)}" data-review-id="${esc(r.id)}">Read full note</button></p>`;
  }
  function sourceExcerptHtml(r,simple=false){
    const sources=recordedSources(r);
    if(!sources)return '';
    if(!sources.length)return '<figure class="review-source-excerpt is-missing"><figcaption>Source</figcaption><p>No source evidence is recorded for this Review.</p></figure>';
    const first=sources[0],excerpt=sourceExcerpt(first.content),more=sources.length-1;
    const notes=[excerpt.truncated?'Shortened':'',more?`${more} more ${more===1?'source':'sources'}`:''].filter(Boolean);
    // A simple Review has no Why / source block, so it doesn't point there.
    const note=!simple&&notes.length?`<p class="review-source-note">${esc(notes.join(' · '))}. Full text under Why / source.</p>`:'';
    return `<figure class="review-source-excerpt"><figcaption>Source${first.label?` · ${esc(first.label)}`:''}</figcaption><blockquote><p>&ldquo;${esc(excerpt.text)}${excerpt.truncated?'&hellip;':''}&rdquo;</p></blockquote>${note}${sourceLinkHtml(r,first)}</figure>`;
  }

  // Nov 3 (Paige): a straightforward Review shows the proposed change, one source excerpt and a
  // "Read full note" link, without the Why / source block, when that block would only repeat them.
  // Conservative: any sign the decision needs more than proposal + source keeps the reasoning.
  //   - one pending create/update proposal (no retirement, no grouped proposals, no Question Review,
  //     no check-only / at-risk Review);
  //   - exactly one recorded source Evidence record (several may disagree; none is the
  //     missing-source case, which keeps its existing layout);
  //   - no linked Question it would resolve, no related open Review, no "Still unresolved" or
  //     "Does not establish" text;
  //   - the rationale ("Establishes") adds nothing: at least 80% of its content words already
  //     appear in the proposal or the source text.
  const STOP_WORDS=new Set('a an and are as at be been by for from has have in into is it its of on or that the this to was were will with which who what'.split(' '));
  function contentWords(text){
    return cleanReviewCopy(text).toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w&&!STOP_WORDS.has(w));
  }
  function addsNothingBeyond(text,...refs){
    const words=contentWords(text);
    if(!words.length)return true;
    const known=new Set(refs.flatMap(contentWords));
    return words.filter(w=>known.has(w)).length/words.length>=0.8;
  }
  // #482 (QA-11): "Still unresolved" that only restates the card's title adds nothing.
  function hasMeaningfulUnresolved(r){
    const plain=v=>cleanReviewCopy(v).toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    const unresolvedText=plain(r.unresolved), titleText=plain(r.summary);
    const repeatsTitle=!!unresolvedText&&!!titleText&&(unresolvedText===titleText||unresolvedText.includes(titleText)||titleText.includes(unresolvedText));
    return !!(r.unresolved && !repeatsTitle && !/^nothing beyond this proposed change/i.test(cleanReviewCopy(r.unresolved)));
  }
  function isStraightforwardReview(r){
    if(r.reviewType==='open_question'||r.reviewType==='state_at_risk')return false;
    const proposals=Array.isArray(r.proposals)?r.proposals:[];
    if(proposals.length!==1||!['create','update'].includes(proposals[0].operation))return false;
    const sources=recordedSources(r);
    if(!sources||sources.length!==1)return false;
    if((r.resolvesQuestionIds||[]).length||(r.relatedOpenReviews||[]).length)return false;
    if(hasMeaningfulUnresolved(r)||String(r.doesNot||'').trim())return false;
    return addsNothingBeyond(r.establishes,r.proposed,proposals[0].proposed_statement,sources[0].content);
  }
  function fullSourcesHtml(r){
    const sources=recordedSources(r);
    if(!sources)return `<p><strong>Evidence:</strong> ${esc(r.evidence)}</p>`;
    if(!sources.length)return '<p><strong>Evidence:</strong> No source evidence is recorded for this Review.</p>';
    return sources.map(e=>`<p class="review-source-full"><strong>Source${e.label?` (${esc(e.label)})`:''}:</strong> ${esc(e.content)}</p>`).join('');
  }

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
    // A Review whose source Evidence is known to be missing can't change Current State (the server
    // refuses it too); it stays readable and can still be left unchanged. Unknown (null) blocks nothing.
    const sourceMissing=!isQuestionReview&&!checkOnly&&recordedSources(r)?.length===0;
    const blockedId=`review-blocked-${r.id}`;
    const blocked=sourceMissing?` disabled aria-describedby="${blockedId}"`:'';
    const questionProposal=r.questionToCreate;
    const questionReady=!!questionProposal?.id&&questionProposal.status==='pending';
    const meaningfulUnresolved=hasMeaningfulUnresolved(r);
    // Nov 3: a straightforward Review drops the Why / source block that would only repeat it.
    const simple=!isQuestionReview&&!checkOnly&&!sourceMissing&&isStraightforwardReview(r);
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
      // QA follow-up (2026-09-14): Adjust used to simply disappear for a
      // retire-only review (nothing left to reword once every proposal is
      // "remove this fact"), leaving the three-button row silently down to
      // two with no explanation -- flagged as confusing, since a person
      // can't tell whether that's intentional or something failed to load.
      // Keeping the button always present (disabled + a title on the
      // retire-only case) keeps the row's shape predictable across every
      // Review of this type.
      : `<button class="btn primary" data-action="review-update" data-review="${r.id}"${blocked}>Update Current State</button><button class="btn secondary" data-action="open-adjust-review" data-review="${r.id}"${sourceMissing?blocked:adjustableCount?'':' disabled title="Nothing to adjust -- every proposal here retires a fact rather than proposing wording."'}>Adjust</button><button class="btn secondary" data-action="review-keep" data-review="${r.id}" title="Do not apply this evidence to Current State.">Leave unchanged</button>`;
    // A related open Review is a structural pointer only (same State item or
    // Question as this one) -- never a claim that the two are the same
    // decision. Shown plainly, not as an action, so the human decides
    // whether it changes anything here.
    const relatedBlock=(r.relatedOpenReviews||[]).length
      ? `<div class="review-context-block review-related-block"><span>${r.relatedOpenReviews.length>1?'Related open reviews':'Related open review'}</span>${r.relatedOpenReviews.map(x=>`<p>&ldquo;${esc(x.decisionQuestion)}&rdquo;</p>`).join('')}</div>`
      : '';
    const body=`<div class="review-decision-context"><div class="review-context-block"><span>Current understanding</span><p>${esc(cleanReviewCopy(r.current))}</p></div><div class="review-context-block review-evidence-block"><span>${isQuestionReview?(questionProposal?.existing_question_id?'Already tracked':'Question to track'):checkOnly?'What the evidence says':'Proposed change'}</span><p>${esc(isQuestionReview?(questionReady?questionProposal.existing_question_text||questionProposal.text:'Question suggestion unavailable. Refresh and review it again.'):checkOnly?cleanReviewCopy(r.evidence):cleanReviewCopy(r.proposed))}</p>${checkOnly?'':sourceExcerptHtml(r,simple)}</div>${!checkOnly&&meaningfulUnresolved?`<div class="review-context-block"><span>Still unresolved</span><p>${esc(cleanReviewCopy(r.unresolved))}</p></div>`:''}${relatedBlock}</div>${sourceMissing?`<p class="review-blocked-note" id="${blockedId}">No source Evidence is recorded, so this Review can&rsquo;t change Current State. You can still leave it unchanged.</p>`:''}<div class="review-actions">${actions}</div>${simple?'':`<details class="reasoning"><summary>Why / source</summary>${fullSourcesHtml(r)}<p><strong>Establishes:</strong> ${esc(cleanReviewCopy(r.establishes))}</p>${r.doesNot?`<p><strong>Does not establish:</strong> ${esc(r.doesNot)}</p>`:''}</details>`}`;
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

  function questionCard(q,linkedReview,open=false){
    const blocking=!!q.blocking;
    const evidenceSummary=linkedReview?(cleanReviewCopy(linkedReview.evidence)||cleanReviewCopy(linkedReview.summary)||''):'';
    // With no evidence text to show, say plainly that the answer still needs review (#450, from
    // context-feedback-pass-3.js styleEvidenceCallout, which rewrote the old fallback line).
    const evidenceLine=evidenceSummary?`<p>${esc(evidenceSummary)}</p>`:'<p class="evidence-answer-callout">New evidence may answer this question. Review it before State treats the question as resolved.</p>';
    const body=linkedReview
      ? `<div class="open-question-inline-state"><span class="eyebrow">Answer found · Awaiting review</span>${evidenceLine}<p class="blocking-detail">Current State has not changed yet because this still needs your review.</p></div><div class="open-question-actions"><button class="text-button" data-action="open-specific-review" data-review-id="${linkedReview.id}">Review proposed update →</button><button class="text-button muted" data-action="answer-question" data-question-id="${q.id}">Add something else</button></div>`
      : `<div class="open-question-inline-state"><p>This stays unresolved until reviewed evidence establishes an answer.</p>${linkedEvidenceHtml(q)}${blocking&&q.blocks?`<p class="blocking-detail"><strong>Blocks:</strong> ${esc(q.blocks)}</p>`:''}</div><div class="open-question-actions"><button class="text-button" data-action="answer-question" data-question-id="${q.id}">Add what you learned →</button>${blocking?`<button class="text-button muted" data-action="unmark-blocking" data-question-id="${q.id}">No longer blocking</button>`:`<button class="text-button muted" data-action="mark-blocking" data-question-id="${q.id}">Mark as blocking</button>`}<button class="text-button muted" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button></div>`;
    return `<details class="open-question-item${blocking?' is-blocking':''}" style="margin:10px 0 0;padding:0 0 6px;border:0;border-top:1px solid var(--line)" data-question-id="${q.id}"${open?' open':''}><summary class="open-question-row${blocking?' is-blocking':''}" style="border-bottom:0;padding-top:17px;padding-bottom:14px" aria-label="Question: ${esc(q.text)}"><span class="open-question-copy"><span class="open-item-label ${blocking?'blocking':'question'}">${blocking?'Blocking question':'Open question'}</span><span class="open-question-title">${esc(q.text)}</span><span class="open-question-meta">${esc(q.origin)}${q.created?` · ${esc(q.created)}`:''}${blocking&&q.blocks?` · Blocks: ${esc(q.blocks)}`:''}</span></span><span class="question-card-chevron" aria-hidden="true">›</span></summary><div class="open-question-inline-body">${body}</div></details>`;
  }

  // #481: what a reviewer attached to this Question (Keep tracking / Link existing Question).
  function linkedEvidenceHtml(q){
    const items=q.linkedEvidence||[];
    if(!items.length)return '';
    return `<div class="question-linked-evidence"><span class="meta-label">Linked evidence</span><ul>${items.map(x=>`<li>${x.date?`<span class="question-linked-date">${esc(x.date)}</span> `:''}${esc(x.excerpt)}</li>`).join('')}</ul></div>`;
  }

  function questionDialogHtml(q,linkedReview){
    if(linkedReview){
      const evidenceSummary=cleanReviewCopy(linkedReview.evidence)||cleanReviewCopy(linkedReview.summary)||'New evidence may answer this question.';
      return `<span class="eyebrow">Answer found · Awaiting review</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>${esc(evidenceSummary)}</p><p class="blocking-detail">Current State has not changed yet because this still needs your review.</p><div class="dialog-actions"><button class="btn primary" data-action="open-specific-review" data-review-id="${linkedReview.id}">Review proposed update →</button><button class="btn secondary" data-action="answer-question" data-question-id="${q.id}">Add something else</button></div>`;
    }
    return `<span class="eyebrow">${q.blocking?'Blocking question':'Open question'}</span><h2 id="dialogTitle">${esc(q.text)}</h2><p>This stays unresolved until reviewed evidence establishes an answer.</p>${linkedEvidenceHtml(q)}${q.blocking&&q.blocks?`<p class="blocking-detail"><strong>Blocks:</strong> ${esc(q.blocks)}</p>`:''}<div class="dialog-actions"><button class="btn primary" data-action="answer-question" data-question-id="${q.id}">Add what you learned</button>${q.blocking?`<button class="btn secondary" data-action="unmark-blocking" data-question-id="${q.id}">No longer blocking</button>`:`<button class="btn secondary" data-action="mark-blocking" data-question-id="${q.id}">Mark as blocking</button>`}<button class="btn secondary" data-action="confirm-stop-question" data-question-id="${q.id}">Stop tracking</button></div>`;
  }

  function openItemSection(title,count,key,body,empty,openItemSections){
    const defaultCollapsed=key==='questions' && count>5;
    const stored=openItemSections[key];
    const collapsed=stored===null?defaultCollapsed:!!stored;
    return `<section class="open-items-section open-items-${key}${collapsed?' is-collapsed':''}${empty?' is-empty':''}"><button type="button" class="open-items-section-head" data-action="toggle-open-item-section" data-section="${key}" aria-expanded="${collapsed?'false':'true'}"><span class="open-items-section-copy"><span class="open-items-section-title">${esc(title)} <span class="open-items-section-count">${count}</span></span></span><span class="open-items-section-chevron" aria-hidden="true">${collapsed?'⌄':'⌃'}</span></button>${collapsed?'':`<div class="open-items-section-body">${body}</div>`}</section>`;
  }

  // props: {reviewsStatus, questionsStatus, draftsStatus, reviews, questions,
  // draftNotes, notes, openQuestionsExpanded, expandedReviewId,
  // openItemSections, renderDraftNote, openQuestionIds}. `openQuestionIds` is
  // the Set of question rows the user has open, kept across re-renders (#487). `reviews`/`questions` are already the
  // backend-confirmed open sets (state.data filtered by uiPendingReviews()/
  // openQuestions() -- computed by the caller, not here). `notes` is
  // state.data.notes, used only to resolve each review's source-evidence
  // note. `renderDraftNote` is context-notes-view.js's draftNoteRow,
  // injected so this module never needs to reach into another view module
  // directly.
  function render(props){
    const {reviewsStatus,questionsStatus,draftsStatus,reviews,questions,draftNotes,notes,openQuestionsExpanded,expandedReviewId,openItemSections,renderDraftNote,hasCurrentState=true,openQuestionIds=new Set()}=props;
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
    const reviewBody=reviewUnavailable?'<div class="open-items-empty unavailable-inline">Reviews could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':reviews.length?reviews.map(reviewCardFor).join(''):'<div class="open-items-empty">'+(hasCurrentState?'Nothing needs review. Current State is up to date with accepted evidence.':'Nothing needs review yet. Current State has not been set up.')+'</div>';
    const blockerBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Blocking questions could not be loaded.</div>':blockers.length?`<div class="open-question-list" style="border-top:0">${blockers.map(q=>questionCard(q,linkedReviewFor(q),openQuestionIds.has(q.id))).join('')}</div>`:'<div class="open-items-empty">Nothing is blocking the project right now.</div>';
    const draftsLoading=draftsStatus!=='loaded'&&draftsStatus!=='error';
    const draftsUnavailable=draftsStatus==='error';
    const draftBody=draftsLoading?'<div class="open-items-empty" role="status">Loading drafts…</div>':draftsUnavailable?'<div class="open-items-empty unavailable-inline">Draft notes could not be loaded.</div>':draftNotes.length?`<div class="open-question-list">${draftNotes.map(renderDraftNote).join('')}</div>`:'<div class="open-items-empty">No draft notes waiting to be submitted.</div>';
    const questionBody=questionUnavailable?'<div class="open-items-empty unavailable-inline">Open questions could not be loaded. <button class="text-button" data-action="retry-hydration">Try again</button></div>':waiting.length?`<div class="open-question-list" style="border-top:0">${visibleWaiting.map(q=>questionCard(q,linkedReviewFor(q),openQuestionIds.has(q.id))).join('')}</div>${waiting.length>5?`<button class="open-questions-more" data-action="toggle-open-questions" aria-expanded="${openQuestionsExpanded?'true':'false'}">${openQuestionsExpanded?'Show fewer questions':`Show ${remaining} more questions`} <span aria-hidden="true">${openQuestionsExpanded?'↑':'↓'}</span></button>`:''}`:'<div class="open-items-empty">Nothing else is unresolved right now.</div>';
    const actionTotal=(reviewUnavailable?0:reviews.length)+(questionUnavailable?0:blockers.length);
    // QA follow-up (2026-09-14): the one-sentence explainer covered
    // Update/Adjust/Leave unchanged but not the other real review shapes
    // (state_at_risk's Keep tracking/Dismiss concern, open_question's
    // Create Question/Link existing Question) -- flagged as needing clearer
    // coverage without turning into a text dump above every Review. A
    // native <details> keeps the default view to one sentence and puts the
    // full breakdown one click away instead of always on screen.
    // Hover (or keyboard focus, for anyone who can't hover) reveals the
    // table instead of requiring a click to expand -- same content as the
    // earlier <details> version, lighter to reach.
    const reviewHelp=`<span class="review-help" tabindex="0"><span class="review-help-trigger">What do these decisions mean?</span><table class="review-help-panel"><tbody><tr><th>Update Current State</th><td>Accept the proposed change -- Current State changes and the decision is recorded in History.</td></tr><tr><th>Adjust</th><td>Correct the wording before it becomes Current State, rather than accepting it as proposed.</td></tr><tr><th>Leave unchanged</th><td>Current State stays as it is. The evidence is kept on record even though nothing changed.</td></tr><tr><th>Keep tracking / Dismiss concern</th><td>For a Review flagging that existing Current State may be unreliable: keep the uncertainty tracked as an open Question, or dismiss the concern.</td></tr><tr><th>Create Question / Link existing Question</th><td>For a Review about a new unknown rather than a fact: start tracking it as a Question, or attach this evidence to one already being tracked.</td></tr></tbody></table></span>`;
    // Count line above the intro (#450, from context-quickwins.js); omitted while a list is unavailable.
    const countSummary=reviewUnavailable||questionUnavailable?'':`<strong class="open-items-count-summary">${reviews.length} ${reviews.length===1?'needs review':'need review'} · ${blockers.length} blocking · ${waiting.length} ${waiting.length===1?'other question':'other questions'}</strong><br>`;
    return `<section class="page collection-page open-items-page"><div class="page-head"><div><div class="review-title-row"><h2>Open Items</h2>${actionTotal?`<span class="count-badge review-page-count" aria-label="${actionTotal} items need attention">${actionTotal}</span>`:''}</div><p>${countSummary}Review what State thinks new information means, then decide what happens to Current State.</p>${reviewHelp}</div><button class="btn secondary" data-action="add-question">+ Add question</button></div><div class="open-items-sections">${openItemSection('Needs your review',reviewUnavailable?'Unavailable':reviews.length,'reviews',reviewBody,!reviews.length&&!reviewUnavailable,openItemSections)}${openItemSection('Blocking questions',questionUnavailable?'Unavailable':blockers.length,'blockers',blockerBody,!blockers.length&&!questionUnavailable,openItemSections)}${openItemSection('Open questions',questionUnavailable?'Unavailable':waiting.length,'questions',questionBody,!waiting.length&&!questionUnavailable,openItemSections)}${openItemSection('Draft notes',draftsLoading?'…':draftsUnavailable?'Unavailable':draftNotes.length,'drafts',draftBody,draftsStatus==='loaded'&&!draftNotes.length,openItemSections)}</div></section>`;
  }

  window.STATE_OPEN_ITEMS_VIEW = Object.freeze({render,reviewCard,isStraightforwardReview,adjustDialogHtml,questionDialogHtml,cleanReviewCopy});
})();
