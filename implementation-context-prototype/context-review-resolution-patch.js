(() => {
  const reviewQuestionIds = review => Array.isArray(review?.resolvesQuestionIds)
    ? review.resolvesQuestionIds.filter(Boolean)
    : (review?.resolvesQuestionId ? [review.resolvesQuestionId] : []);

  function classifyReview(review){
    const proposals=Array.isArray(review?.proposals)?review.proposals:[];
    const questionIds=reviewQuestionIds(review);
    if(proposals.length) return {kind:'state_change',questionIds};
    if(review?.reviewType==='state_at_risk') return {kind:'state_at_risk',questionIds};
    if(review?.reviewType==='missing_understanding' && !questionIds.length) return {kind:'missing_understanding_open',questionIds};
    if(questionIds.length) return {kind:'question_only',questionIds};
    return {kind:'review_only',questionIds};
  }

  function replaceLegacyQuestionCopy(root=document){
    root.querySelectorAll?.('#dialogBody p').forEach(p=>{
      const text=p.textContent.trim();
      if(text==='The question stays unresolved until you accept reviewed evidence that establishes an answer.'){
        p.textContent='The question stays unresolved until you confirm reviewed evidence establishes an answer.';
      }
      if(text==='The evidence did not produce a State change, so it was not enough to resolve this question.'){
        p.textContent='State did not identify reviewed evidence that establishes an answer, so the question stays open.';
      }
    });
  }

  function install(){
    const APP=window.STATE_ASK_TEST_API;
    const API=window.STATE_API;
    const VIEW=window.STATE_OPEN_ITEMS_VIEW;
    if(!APP || !API || !VIEW || document.documentElement?.dataset?.reviewResolutionPatch==='installed') return false;
    if(document.documentElement) document.documentElement.dataset.reviewResolutionPatch='installed';

    const state=APP.state;
    const root=document.getElementById('viewRoot');

    const showToast=message=>{
      document.querySelector('.state-toast')?.remove();
      const toast=document.createElement('div');
      toast.className='state-toast';
      toast.setAttribute('role','status');
      toast.textContent=message;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(),2600);
    };

    const closeOverlay=()=>{
      const overlay=document.getElementById('overlay');
      const body=document.getElementById('dialogBody');
      if(overlay) overlay.hidden=true;
      if(body) body.innerHTML='';
      document.body.classList.remove('modal-open');
    };

    const pendingReviews=()=>API
      ? state.data.reviews.filter(r=>r.status==='pending'&&r.backendReviewId)
      : state.data.reviews.filter(r=>r.status==='pending');
    const openQuestions=()=>API
      ? state.data.questions.filter(q=>q.status==='open'&&q.backendManaged)
      : state.data.questions.filter(q=>q.status==='open');

    const refreshNavCount=()=>{
      const count=pendingReviews().length+openQuestions().filter(q=>q.blocking).length;
      document.querySelectorAll('#openItemsActionCount, #mobileOpenItemsCount').forEach(el=>{
        el.textContent=String(count);
        el.hidden=!count;
        el.setAttribute('aria-label',`${count} items need attention`);
      });
    };

    const renderOpenItems=()=>{
      if(!root) return;
      const draftNotes=state.data.notes.filter(n=>n.status==='working'||n.status==='draft'||!!n.backendDraft);
      root.innerHTML=VIEW.render({
        reviewsStatus:state.backendStatus.reviews,
        questionsStatus:state.backendStatus.questions,
        draftsStatus:state.backendStatus.drafts,
        reviews:pendingReviews(),
        questions:openQuestions(),
        draftNotes,
        notes:state.data.notes,
        openQuestionsExpanded:state.openQuestionsExpanded,
        expandedReviewId:state.expandedReviewId,
        openItemSections:state.openItemSections,
        renderDraftNote:n=>window.STATE_NOTES_VIEW?.draftNoteRow?.(n)||'',
      });
    };

    const refreshVisibleSurface=()=>{
      refreshNavCount();
      if(['open-items','questions','review'].includes(state.view)) renderOpenItems();
      else if(state.view==='overview') APP.renderOverview?.();
    };

    const markLinkedQuestionsResolved=(review,sourceEvidenceId)=>{
      for(const questionId of reviewQuestionIds(review)){
        const q=state.data.questions.find(item=>item.id===questionId);
        if(!q) continue;
        q.status='resolved';
        q.resolution='Resolved by reviewed evidence';
        if(sourceEvidenceId) q.sourceEvidenceId=sourceEvidenceId;
      }
    };

    async function resolveNonStateReview(button,review,decision,kind){
      const originalText=button.textContent;
      button.disabled=true;
      button.textContent=decision==='accept'?'Confirming…':'Saving…';
      try{
        if(review.backendReviewId) await API.resolveReview(review.backendReviewId,decision);
        review.status=decision==='accept'?'update':'keep-current';
        const note=state.data.notes.find(n=>n.id===review.evidenceId);
        if(note) note.status='reviewed';
        if(kind==='question_only' && decision==='accept') markLinkedQuestionsResolved(review,note?.evidenceId||null);
        state.expandedReviewId=null;
        closeOverlay();
        refreshVisibleSurface();
        if(kind==='question_only'){
          const count=reviewQuestionIds(review).length;
          showToast(decision==='accept'
            ? `Answer confirmed. ${count===1?'The question is':`${count} questions are`} resolved. Current State was not changed.`
            : `${count===1?'Question':'Questions'} kept open. Current State was not changed.`);
          window.StateAnalytics?.track?.('review_decision',{reviewId:review.id,outcome:decision==='accept'?'question_resolved':'question_kept_open'});
        }else{
          showToast('Review recorded. Current State was not changed.');
          window.StateAnalytics?.track?.('review_decision',{reviewId:review.id,outcome:'reviewed_no_state_change'});
        }
      }catch(error){
        button.disabled=false;
        button.textContent=originalText;
        showToast(`Could not complete Review: ${error?.message||'Please try again.'}`);
      }
    }

    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-action="review-update"], [data-action="review-keep"]');
      if(!button) return;
      const review=state.data.reviews.find(r=>r.id===button.dataset.review);
      if(!review || review.status!=='pending') return;
      const classification=classifyReview(review);
      if(classification.kind==='state_change' || classification.kind==='state_at_risk' || classification.kind==='missing_understanding_open') return;
      const action=button.dataset.action;
      const shouldIntercept=classification.kind==='question_only' || (classification.kind==='review_only' && action==='review-update');
      if(!shouldIntercept) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const decision=action==='review-update'?'accept':'keep';
      resolveNonStateReview(button,review,decision,classification.kind);
    },true);

    const observer=new MutationObserver(()=>replaceLegacyQuestionCopy(document));
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    replaceLegacyQuestionCopy(document);
    return true;
  }

  window.STATE_REVIEW_RESOLUTION_PATCH=Object.freeze({classifyReview,reviewQuestionIds,replaceLegacyQuestionCopy,install});

  if(!install()){
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      if(install()||attempts>=40) clearInterval(timer);
    },50);
  }
})();
