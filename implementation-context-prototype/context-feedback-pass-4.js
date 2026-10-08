(() => {




  function syncAttention(){
    const API=window.STATE_API,app=window.STATE_ASK_TEST_API;if(!API?.getAttention||!app?.state)return;
    API.getAttention().then(payload=>{
      const incoming=Array.isArray(payload?.questions)?payload.questions:[];
      app.state.data.questions=incoming.map(q=>({id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',topics:[],backendManaged:true}));
      const reviews=Array.isArray(payload?.open_reviews)?payload.open_reviews.length:0,blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length,count=reviews+blockers;
      document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`);});
      const title=document.querySelector('.workspace-attention .workspace-attention-head h3');if(title&&count)title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;
    }).catch(()=>{});
  }

  function installEvidenceSync(){
    if(document.documentElement.dataset.stateEvidenceSyncR61==='1')return;
    document.documentElement.dataset.stateEvidenceSyncR61='1';
    const body=document.getElementById('dialogBody');if(!body)return;
    new MutationObserver(()=>{
      const text=(body.textContent||'').replace(/\s+/g,' ').trim();
      if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttention,250);
    }).observe(body,{childList:true,subtree:true,characterData:true});
  }

  // The Ask reset button and control visibility moved to context-ask-controls.js (#450).
  function run(){installEvidenceSync();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
