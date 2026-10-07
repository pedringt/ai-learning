(() => {

  function syncAttentionFromApi(){
    const API=window.STATE_API,app=window.STATE_ASK_TEST_API;if(!API?.getAttention||!app?.state)return;
    API.getAttention().then(payload=>{
      const state=app.state,incoming=Array.isArray(payload?.questions)?payload.questions:[];
      state.data.questions=incoming.map(q=>({id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',topics:[],backendManaged:true}));
      const reviews=Array.isArray(payload?.open_reviews)?payload.open_reviews.length:0,blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length,count=reviews+blockers;
      document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`)});
      const attention=document.querySelector('.workspace-attention'),title=attention?.querySelector('.workspace-attention-head h3'),support=attention?.querySelector('.workspace-attention-head p');
      if(title&&count)title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;
      if(support&&count)support.textContent=`${reviews} ${reviews===1?'review':'reviews'} · ${blockers} blocking ${blockers===1?'question':'questions'}`;
    }).catch(()=>{});
  }

  function mobileAsk(){
    if(document.documentElement.dataset.stateAskMobileHardening==='1')return;document.documentElement.dataset.stateAskMobileHardening='1';
    document.addEventListener('pointerup',e=>{
      if(!matchMedia('(max-width:760px)').matches)return;
      const close=e.target.closest?.('#askStateDrawer .ask-state-drawer-close');
      if(close){e.preventDefault();e.stopImmediatePropagation();const d=document.getElementById('askStateDrawer'),l=document.getElementById('askStateLauncher');if(d)d.hidden=true;if(l)l.classList.remove('is-hidden');return}
      const starter=e.target.closest?.('#askStateDrawer [data-review-batch-prompt]');
      // Re-fire a real click on the same element rather than reimplementing
      // "fill the input and submit" here: that reimplementation used
      // form.requestSubmit(), which only ever reaches runAsk() through the
      // plain form-submit handler in context-product-polish.js -- the one
      // that (correctly) treats untrusted text through the classifier. The
      // starter's own click handler passes {skipRouting:true} for exactly
      // this text; on mobile, this pointerup handler's preventDefault +
      // stopImmediatePropagation was suppressing that click handler from
      // ever running at all, so tapping a starter here on mobile always
      // hit the classifier fresh and (for 3 of the 5 starters, whose
      // instruction wording trips it -- see state-ask-starter-routing-
      // tests.js) rendered the static Open Items card instead of a real
      // answer, unlike the same tap on desktop.
      if(starter){e.preventDefault();e.stopImmediatePropagation();starter.click();return}
    },true);
  }

  function askControlStates(){
    if(document.documentElement.dataset.stateAskControlStates==='1')return;document.documentElement.dataset.stateAskControlStates='1';
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(!drawer?.classList.contains('has-answer'))return;
      if(!e.target.value.trim()){
        drawer.classList.remove('is-editing-answer');
        return;
      }
      drawer.classList.add('is-editing-answer');
    });
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer [data-review-batch-form="ask"]'))return;
      document.getElementById('askStateDrawer')?.classList.remove('is-editing-answer');
    },true);
    document.addEventListener('click',e=>{
      if(!e.target.closest?.('#askStateDrawer .state-ask-clear'))return;
      setTimeout(()=>{
        const drawer=document.getElementById('askStateDrawer');
        drawer?.classList.remove('is-editing-answer','has-answer','is-generating');
      },0);
    },true);
  }

  function evidenceSync(){
    if(document.documentElement.dataset.stateEvidenceCountSync==='1')return;document.documentElement.dataset.stateEvidenceCountSync='1';
    const start=()=>{const body=document.getElementById('dialogBody');if(!body)return;new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttentionFromApi,250)}).observe(body,{childList:true,subtree:true,characterData:true})};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  // Sidebar nav icons are static markup in index.html now (#450); fixNav and its every-frame
  // MutationObserver loop are gone.
  function run(){mobileAsk();askControlStates();evidenceSync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();