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


  function evidenceSync(){
    if(document.documentElement.dataset.stateEvidenceCountSync==='1')return;document.documentElement.dataset.stateEvidenceCountSync='1';
    const start=()=>{const body=document.getElementById('dialogBody');if(!body)return;new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttentionFromApi,250)}).observe(body,{childList:true,subtree:true,characterData:true})};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  // Sidebar nav icons are static markup in index.html now, and the Ask controls moved to
  // context-ask-controls.js (#450).
  function run(){evidenceSync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();