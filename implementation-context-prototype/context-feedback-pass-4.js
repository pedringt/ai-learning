(() => {


  function ensureResetButton(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form) return;
    let reset=form.querySelector('.state-ask-reset');
    if(!reset){
      reset=document.createElement('button');
      reset.type='button';
      reset.className='state-ask-reset';
      reset.setAttribute('aria-label','Clear answer and start a new Ask');
      reset.textContent='×';
      form.appendChild(reset);
    }
  }

  function syncAskControls(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form)return;
    ensureResetButton();
    const reset=form.querySelector('.state-ask-reset'),submit=form.querySelector('button[type="submit"]'),result=drawer.querySelector('#askStateDrawerResult');
    const hasAnswer=!!result?.querySelector('.ask-live-answer,.ask-answer-item') || (!!result?.textContent?.trim()&&!result?.querySelector('.ask-live-loading,.ask-live-error'));
    const generating=drawer.classList.contains('is-generating')||drawer.dataset.askPending==='1'||!!result?.querySelector('.ask-live-loading');
    drawer.classList.toggle('has-answer',hasAnswer&&!generating);
    if(reset){
      reset.style.setProperty('display',hasAnswer&&!generating?'block':'none','important');
      reset.style.setProperty('visibility',hasAnswer&&!generating?'visible':'hidden','important');
    }
    if(submit){
      submit.style.setProperty('display',hasAnswer&&!generating?'none':'grid','important');
      submit.style.setProperty('visibility',hasAnswer&&!generating?'hidden':'visible','important');
      submit.style.setProperty('pointer-events',hasAnswer&&!generating?'none':'auto','important');
    }
  }

  function restoreAskDiscovery(){
    const drawer=document.getElementById('askStateDrawer');if(!drawer)return;
    const input=drawer.querySelector('#askStateDrawerInput'),result=drawer.querySelector('#askStateDrawerResult');
    drawer.dataset.stateAskResetting='1';
    if(result)result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    delete drawer.dataset.askPending;
    drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    drawer.querySelectorAll('.state-ask-status').forEach(el=>{el.className='state-ask-status';el.textContent='';});
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;syncAskControls();});
  }

  function installAskControls(){
    if(document.documentElement.dataset.stateAskControlsR61==='1')return;
    document.documentElement.dataset.stateAskControlsR61='1';
    document.addEventListener('click',e=>{
      const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');
      if(!reset)return;
      e.preventDefault();e.stopImmediatePropagation();restoreAskDiscovery();
    },true);
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer .ask-state-drawer-form'))return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer){drawer.classList.remove('has-answer','is-editing-answer');drawer.dataset.askPending='1';}
      requestAnimationFrame(syncAskControls);
    },true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer?.dataset.stateAskResetting!=='1'&&drawer?.classList.contains('has-answer')) drawer.classList.add('is-editing-answer');
      requestAnimationFrame(syncAskControls);
    },true);
  }

  function cleanHistory(){
    document.querySelectorAll('.history-page .history-reason').forEach(el=>el.remove());
  }

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

  function run(){installAskControls();ensureResetButton();syncAskControls();cleanHistory();installEvidenceSync();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;ensureResetButton();syncAskControls();cleanHistory();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();