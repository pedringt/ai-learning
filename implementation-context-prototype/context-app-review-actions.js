// context-app-review-actions.js: moved verbatim out of context-app.js (Oct 2026, pure-move split; no
// behavior change). Loaded before context-app.js, which calls install() once, passing the
// closure values these functions used to read directly, and gets the functions back.
// Review decisions: where a human decision becomes a State change (decideReview,
// executeReviewDecision, the open_question path, Adjust), plus their dialogs and toasts.
window.STATE_APP_REVIEW_ACTIONS=Object.freeze({install(ctx){
  const {API,OPEN_ITEMS_VIEW,clone,esc,norm,questionDialogHtml,state,todayISO,todayLabel,truncateText,showToast,showDialog,closeDialog,updateNav,render,replaceBackendOpenReviews,syncApiState,syncApiQuestions,hydrateBackend}=ctx;
  // state.md #107: decision tokens beyond the schema-level accept/keep/reject
  // -- 'acknowledge-risk'/'dismiss-risk' (checkOnly/state_at_risk reviews) and
  // 'keep-current' (ordinary Leave unchanged) all map to a real backend
  // decision (see REVIEW_API_DECISION below); 'adjust' is handled separately
  // by openAdjustDialog/confirmReviewAdjust since it opens a dialog first
  // rather than resolving immediately.
  const REVIEW_API_DECISION={update:'accept','keep-current':'keep','acknowledge-risk':'keep','dismiss-risk':'reject'};
  // #111: "Keep tracking" must persist the uncertainty as a real Question, not
  // just resolve the Review, so the toast reflects the server's actual outcome
  // (question_created/question_linked) rather than assuming a fixed message.
  function reviewDecisionToast(decision,result){
    if(decision==='acknowledge-risk'){
      if(result?.resolution==='question_created')return 'Added as an open question to keep tracking. Current State was not changed.';
      if(result?.resolution==='question_linked')return 'Linked to an existing open question. Current State was not changed.';
      return 'Reviewed. Still flagged as uncertain — Current State was not changed.';
    }
    if(decision==='dismiss-risk')return 'Dismissed. This concern will not be tracked. Current State was not changed.';
    return 'Current State left unchanged. Evidence is preserved.';
  }

  // A consequential update (real proposals, not a checkOnly/uncertainty-only
  // review) confirms before mutating anything -- Current State is what the
  // project treats as true, so changing it deserves an explicit step. Every
  // other decision (Leave unchanged, and the checkOnly acknowledge/dismiss
  // pair) never changes Current State, so it skips the confirmation and uses
  // lighter feedback (a toast, no interstitial loading modal) instead.
  function decideReview(id,decision){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    if(r.reviewType==='open_question'){executeQuestionReviewDecision(id,decision);return;}
    const checkOnly=!Array.isArray(r.proposals)||r.proposals.length===0;
    window.StateAnalytics?.track(decision==='update'?'review_accepted':decision==='dismiss-risk'?'review_rejected':'review_kept',{reviewId:id});
    if(decision==='update' && !checkOnly){
      const proposalText=(r.proposals||[]).map(p=>p.proposed_statement).filter(Boolean).join(' • ') || r.proposed || '';
      showDialog(`<span class="eyebrow">Review decision</span><h2 id="dialogTitle">Update Current State?</h2><p>This changes what the project currently treats as true and records the decision in History.</p>${proposalText?`<div class="review-confirm-change"><span>Change</span><strong>${esc(truncateText(proposalText,210))}</strong></div>`:''}<div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="confirm-review-update" data-review="${esc(id)}">Update</button></div>`);
      return;
    }
    executeReviewDecision(id,decision,checkOnly);
  }

  function openAdjustDialog(id){
    const r=state.data.reviews.find(x=>x.id===id);
    if(r&&r.status==='pending') showDialog(OPEN_ITEMS_VIEW.adjustDialogHtml(r));
  }

  // #107: Leave unchanged normally just resolves the Review. The one
  // exception is a Review that, if accepted, would have resolved a specific
  // open Question -- leaving it unchanged means that Question's answer
  // didn't pan out, so it's worth a lightweight, optional check on whether
  // it's still worth tracking. Scoped to exactly one linked Question; a
  // Review spanning several linked Questions skips this rather than
  // building a multi-question chooser (state.md #107: no giant correction
  // form). Reuses the existing "Stop tracking" Question action verbatim.
  function maybeOfferToStopTrackingResolvedQuestion(r){
    const questionIds=r.resolvesQuestionIds||[];
    if(questionIds.length!==1)return;
    const q=state.data.questions.find(x=>x.id===questionIds[0]);
    if(!q||q.status!=='open')return;
    showDialog(`<span class="eyebrow">Still unresolved</span><h2 id="dialogTitle">Keep tracking this question?</h2><p>This evidence didn't establish an answer after all.</p><p><strong>${esc(q.text)}</strong></p><div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Yes, keep tracking</button><button class="btn primary" data-action="stop-question" data-question-id="${esc(q.id)}">No, close it</button></div>`);
  }

  const pendingQuestionDecisions=new Set();
  async function executeQuestionReviewDecision(id,decision){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending'||pendingQuestionDecisions.has(id))return;
    const proposal=r.questionToCreate;
    if(!r.backendReviewId||!proposal?.id||proposal.status!=='pending'){
      showToast('Question suggestion unavailable. Refresh and review it again.');return;
    }
    pendingQuestionDecisions.add(id);
    const buttons=[...document.querySelectorAll('[data-review]')].filter(b=>b.dataset.review===id);
    buttons.forEach(b=>{b.disabled=true;});
    let result;
    try{
      result=await API.resolveReview(r.backendReviewId,decision==='update'?'accept':'keep',{
        questionProposalId:proposal.id,existingQuestionId:proposal.existing_question_id||null
      });
    }catch(error){
      // A timeout can happen after the server commits. Never claim that nothing
      // changed or optimistically retry a write whose outcome is unknown.
      showToast(error?.status===409?'This Review changed. Refresh and review it again.':'Could not confirm the result. Refresh before trying again.');
      if(error?.status===409)await hydrateBackend();
      return;
    }finally{
      pendingQuestionDecisions.delete(id);
      buttons.forEach(b=>{b.disabled=false;});
    }
    // Publish only server-confirmed effects. The existing Question collection
    // feeds Open Items, Workspace counts and Ask; never invent a local Question.
    r.status=decision;
    if(Array.isArray(result.questions))syncApiQuestions(result.questions);
    if(Array.isArray(result.open_reviews))replaceBackendOpenReviews(result.open_reviews);
    const note=state.data.notes.find(n=>n.id===r.evidenceId);
    if(note){
      note.reviewIds=(note.reviewIds||[]).filter(reviewId=>reviewId!==id);
      note.reviewId=note.reviewIds[0]||null;
      note.status=note.reviewIds.length?'pending':'reviewed';
    }
    state.expandedReviewId=null;
    if(result.question){state.openItemSections.questions=false;state.openQuestionsExpanded=true;}
    closeDialog();render();
    const toastMessage=result.resolution==='question_created'?'Question created. Current State was not changed.':result.resolution==='question_linked'?'Linked to the existing Question. Current State was not changed.':'Review complete. No Question was created.';
    const landedQuestion=result.question&&state.data.questions.find(x=>x.id===result.question.id);
    showToast(toastMessage,landedQuestion?{label:'View',onClick:()=>showDialog(questionDialogHtml(landedQuestion))}:null);
    window.StateAnalytics?.track('review_decision',{reviewId:id,outcome:result.resolution,kind:'open_question'});
    // Ask stays read-only; an already visible answer is a snapshot, so flag it
    // for refresh immediately rather than leaving a closed Review as current.
    document.dispatchEvent(new Event('state-project-record-changed'));
    try{await hydrateBackend();}catch(error){console.warn('Review saved; refresh needed.',error);}
  }

  async function executeReviewDecision(id,decision,checkOnly,adjustments){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    state.expandedReviewId=null;
    const lightweight=decision!=='update'||checkOnly;

    if(r.backendReviewId){
      const previousStatus=r.status;
      r.status=decision;
      render();
      if(!lightweight) showDialog(`<span class="eyebrow">Updating</span><h2 id="dialogTitle">Updating Current State…</h2><p>Saving the reviewed decision to the project record.</p>`);
      try{
        const apiDecision=REVIEW_API_DECISION[decision]||'keep';
        const result=await API.resolveReview(r.backendReviewId,apiDecision,adjustments?.length?{adjustments}:{});
        // result.questions is the authoritative post-resolution open-Questions
        // list (see api.py). A #106 materially-adjusted accept can correctly
        // leave a linked Question open, so this full replacement is the only
        // source of truth for Question status here -- no local re-marking on
        // top of it, which would silently overwrite a Question the backend
        // deliberately left open.
        if(Array.isArray(result.questions))syncApiQuestions(result.questions);
        const note=state.data.notes.find(n=>n.id===r.evidenceId);
        if(note)note.status=decision==='update'?'accepted':'reviewed';
        if(decision==='update'){
          for(const p of (r.proposals||[])) if(p.operation==='retire'&&p.state_item_id){ const k=state.data.knowledge.find(x=>x.id===p.state_item_id); if(k)k.state='retired'; }
          syncApiState(result.state||[]);
        }
        const receiptItems=[];
        if(decision==='update'){
          for(const proposal of (r.proposals||[])){
            if(proposal.operation==='retire') continue;
            const adjusted=adjustments?.find(a=>a.proposal_id===proposal.id)?.adjusted_statement;
            const text=adjusted||proposal.proposed_statement||'';
            const matched=(result.state||[]).find(item=>norm(item.statement)===norm(text)) || (proposal.state_item_id?(result.state||[]).find(item=>item.id===proposal.state_item_id):null);
            if(matched) receiptItems.push({id:matched.id,statement:matched.statement,area:matched.area_id||'general'});
            else if(text) receiptItems.push({id:proposal.state_item_id||'',statement:text,area:'general'});
          }
        }
        if(decision==='acknowledge-risk'&&result.question){state.openItemSections.questions=false;state.openQuestionsExpanded=true;}
        updateNav(); render();
        if(lightweight) closeDialog(); // no interstitial was shown for these outcomes
        if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':reviewDecisionToast(decision,result));
        else showDecisionComplete({items:receiptItems});
        // Resolution response is authoritative; revalidate deterministically after it has rendered.
        await hydrateBackend();
        if(decision==='keep-current') maybeOfferToStopTrackingResolvedQuestion(r);
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
    if(lightweight) showToast(decision==='update'?'Added as Evidence. Current State did not need a Review.':reviewDecisionToast(decision));
    else showDecisionComplete({items:receiptItems});
  }

  async function confirmReviewAdjust(id){
    const r=state.data.reviews.find(x=>x.id===id);
    if(!r||r.status!=='pending')return;
    const textareas=[...document.querySelectorAll('.adjust-proposal-text')];
    const adjustments=textareas
      .map(t=>({proposal_id:t.dataset.proposalId,adjusted_statement:t.value.trim()}))
      .filter(a=>a.adjusted_statement);
    if(!adjustments.length){showToast('Add a revision before updating.');return;}
    closeDialog();
    await executeReviewDecision(id,'update',false,adjustments);
  }

  function showDecisionComplete({items=[]}={}){
    const primary=items[0];
    const line=primary?truncateText(primary.statement,180):'The reviewed change is now part of Current State.';
    showDialog(`<span class="eyebrow">Review complete</span><h2 id="dialogTitle">Current State updated</h2><p>${esc(line)}</p><div class="dialog-actions"><button class="btn primary" data-action="review-receipt-project" data-project-area="${esc(primary?.area||'general')}" data-state-id="${esc(primary?.id||'')}">View Current State</button>${primary?.id?`<button class="btn secondary" data-action="view-topic-history" data-knowledge-id="${esc(primary.id)}">View History</button>`:'<button class="btn secondary" data-view="history">View History</button>'}</div>`);
  }
  return {decideReview,openAdjustDialog,executeReviewDecision,confirmReviewAdjust};
}});
