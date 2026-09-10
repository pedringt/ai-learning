/* Consequence-specific Review actions that the legacy context-app controller
   cannot express without conflating zero-proposal Reviews with "generic
   evidence". This module owns only question-only Review outcomes; proposed
   Current State changes and keep-current decisions remain in context-app.js.

   Level 3 (qualified/uncertain Current State as a first-class domain outcome)
   is intentionally deferred. */
(() => {
  'use strict';

  const API = window.STATE_API;
  const APP = () => window.STATE_ASK_TEST_API;

  function linkedQuestionIds(review){
    if(Array.isArray(review?.resolvesQuestionIds)) return review.resolvesQuestionIds.filter(Boolean);
    return review?.resolvesQuestionId ? [review.resolvesQuestionId] : [];
  }

  function showToast(message){
    document.querySelector('.state-toast')?.remove();
    const toast=document.createElement('div');
    toast.className='state-toast';
    toast.setAttribute('role','status');
    toast.textContent=message;
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),2600);
  }

  function closeOverlay(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(overlay) overlay.hidden=true;
    if(body) body.innerHTML='';
    document.body.classList.remove('modal-open');
  }

  function rerenderCurrentView(){
    const state=APP()?.state;
    const view=state?.view||'open-items';
    const selector=view==='open-items'
      ? '.sidebar-nav [data-view="open-items"],.mobile-primary-nav [data-view="open-items"]'
      : `.sidebar-nav [data-view="${view}"],.mobile-primary-nav [data-view="${view}"]`;
    const target=document.querySelector(selector);
    if(target){ target.click(); return; }
    // The question-only actions are normally used from Open Items. If a
    // reviewer reached one through a modal from another surface and that
    // surface has no matching nav target, at least refresh Open Items so the
    // resolved Review/Question cannot remain visibly stale.
    document.querySelector('.sidebar-nav [data-view="open-items"],.mobile-primary-nav [data-view="open-items"]')?.click();
  }

  function markLocalOutcome(review,{confirmAnswer}){
    const state=APP()?.state;
    if(!state||!review)return;
    review.status=confirmAnswer?'update':'keep-current';
    const note=state.data.notes.find(n=>n.id===review.evidenceId);
    // No Current State transition happened, so this Evidence was reviewed,
    // not accepted into Current State.
    if(note) note.status='reviewed';
    if(confirmAnswer){
      linkedQuestionIds(review).forEach(questionId=>{
        const question=state.data.questions.find(q=>q.id===questionId);
        if(question){
          question.status='resolved';
          question.resolution='Resolved by reviewed evidence';
        }
      });
    }
  }

  async function resolveQuestionOnlyReview(button,confirmAnswer){
    const state=APP()?.state;
    const review=state?.data?.reviews?.find(r=>r.id===button.dataset.review);
    if(!review||review.status!=='pending')return;
    const questions=linkedQuestionIds(review);
    // Defense in depth: these specialized actions are only valid for a
    // zero-proposal, non-state_at_risk Review with an explicit Question link.
    if((review.proposals||[]).length || review.reviewType==='state_at_risk' || !questions.length){
      showToast('This Review needs a different decision path. Nothing was changed.');
      return;
    }

    const oldText=button.textContent;
    button.disabled=true;
    button.textContent=confirmAnswer?'Confirming…':'Saving…';
    try{
      if(review.backendReviewId){
        if(!API?.resolveReview) throw new Error('Review service is unavailable');
        await API.resolveReview(review.backendReviewId,confirmAnswer?'accept':'keep');
      }
      markLocalOutcome(review,{confirmAnswer});
      window.StateAnalytics?.track('review_decision',{
        reviewId:review.id,
        outcome:confirmAnswer?'question_resolved':'question_kept_open',
        questionCount:questions.length,
      });
      closeOverlay();
      rerenderCurrentView();
      if(confirmAnswer){
        showToast(questions.length===1
          ? 'Answer confirmed. The question is resolved. Current State was not changed.'
          : `Answer confirmed. ${questions.length} questions are resolved. Current State was not changed.`);
      }else{
        showToast(questions.length===1
          ? 'Question left open. Evidence is preserved. Current State was not changed.'
          : 'Questions left open. Evidence is preserved. Current State was not changed.');
      }
    }catch(error){
      button.disabled=false;
      button.textContent=oldText;
      showToast(`Couldn’t complete review. Nothing was changed.${error?.message?` ${error.message}`:''}`);
    }
  }

  // context-app.js still owns the Question submission flow. Keep the two
  // legacy explanatory sentences aligned with the consequence model without
  // duplicating that submission logic here. These are exact-copy replacements
  // only; they never alter state or decide whether a Review is created.
  function syncQuestionSubmissionCopy(){
    const body=document.getElementById('dialogBody');
    if(!body)return;
    body.querySelectorAll('p').forEach(p=>{
      const text=p.textContent.trim();
      if(text==='The question stays unresolved until you accept reviewed evidence that establishes an answer.'){
        p.textContent='The question stays unresolved until you confirm reviewed evidence that establishes an answer.';
      }else if(text==='The evidence did not produce a State change, so it was not enough to resolve this question.'){
        p.textContent='State did not identify reviewed evidence that establishes an answer, so the question stays open.';
      }
    });
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-action="review-confirm-answer"],[data-action="review-keep-question"]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    resolveQuestionOnlyReview(button,button.dataset.action==='review-confirm-answer');
  },true);

  const dialogBody=document.getElementById('dialogBody');
  if(dialogBody){
    new MutationObserver(syncQuestionSubmissionCopy).observe(dialogBody,{childList:true,subtree:true,characterData:true});
    syncQuestionSubmissionCopy();
  }

  window.STATE_REVIEW_OUTCOMES_TEST_API=Object.freeze({linkedQuestionIds,markLocalOutcome,syncQuestionSubmissionCopy});
})();