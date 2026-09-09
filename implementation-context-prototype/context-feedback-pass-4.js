(() => {
  const STYLE_ID='state-final-feedback-r59';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      html body:not(.v88-dark) .prototype-productbar{background:#ccdbee!important;border-bottom-color:#b8cbe4!important}

      /* Workspace attention: neutral surface, restrained attention accent. */
      html body .workspace-attention{background:#fff!important;border:1px solid #eadde0!important;border-top:4px solid #d9a7ae!important;box-shadow:none!important}
      html body .workspace-attention .workspace-attention-head p{display:none!important}
      html body .workspace-attention .attention-list{background:transparent!important;border:0!important;border-radius:0!important;overflow:visible!important}
      html body .workspace-attention .attention-item{background:transparent!important;border:0!important;border-top:1px solid #e6e8ee!important;border-radius:0!important;box-shadow:none!important;transition:none!important}
      html body .workspace-attention .attention-item:first-child{border-top:0!important}
      html body .workspace-attention .attention-item:hover{background:#fafbfc!important;transform:none!important;box-shadow:none!important}
      html body .workspace-attention .attention-row-icon{background:#f1f3f6!important;color:#687386!important;border-color:#e1e5eb!important}
      html body .workspace-attention .attention-row-icon svg{stroke:currentColor!important}

      /* Current State copy context is a visible secondary button. */
      html body .project-page .project-head-copy-context{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:40px!important;padding:0 16px!important;border:1px solid #b9cbe4!important;border-radius:9px!important;background:#fff!important;color:#24568f!important;box-shadow:0 1px 2px rgba(16,26,49,.05)!important;font-size:13px!important;font-weight:750!important}

      /* Settings actions use the same visual weight. */
      html body .settings-page .settings-actions .btn,html body .settings-page .slack-preview-row button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important;height:41px!important;min-height:41px!important;padding:0 15px!important;font-size:12.5px!important;line-height:1.2!important;font-weight:700!important;border-radius:9px!important}

      /* Review rationale is supporting detail. */
      html body .open-items-page details.reasoning{margin-top:8px!important;padding-top:8px!important}
      html body .open-items-page details.reasoning summary{font-size:11.5px!important;line-height:1.25!important;font-weight:700!important;color:#667085!important}
      html body .open-items-page details.reasoning p{margin:6px 0!important;font-size:12.5px!important;line-height:1.42!important;color:#4f5b70!important}

      /* History is a flat decision log. No timeline rails, dots, curved accents or hover movement. */
      html body .history-page .history-sources,html body .history-page .history-entry-link{display:none!important}
      html body .history-page .history-list{position:static!important;background:none!important;border:0!important}
      html body .history-page .history-list::before,html body .history-page .history-list::after,
      html body .history-page .history-entry::before,html body .history-page .history-entry::after,
      html body .history-page .history-entry-body::before,html body .history-page .history-entry-body::after{content:none!important;display:none!important;border:0!important;background:none!important}
      html body .history-page .history-entry,html body .history-page .history-entry-body{border-left:0!important;border-inline-start:0!important;background-image:none!important;box-shadow:none!important;transform:none!important;transition:none!important}
      html body .history-page .history-entry{border-bottom:1px solid #e1e5eb!important;padding-bottom:28px!important;margin-bottom:28px!important}
      html body .history-page .history-entry:last-child{border-bottom:0!important}
      html body .history-page .history-entry:hover,html body .history-page .history-entry.is-linked:hover{background:transparent!important;border-left:0!important;box-shadow:none!important;transform:none!important;outline:0!important}

      /* Ask owns one composer control at a time. */
      html body #askStateDrawer .ask-quick-actions-polish{display:none!important}
      html body #askStateDrawer .ask-state-drawer-form{position:relative!important}
      html body #askStateDrawer .ask-state-drawer-form input{height:44px!important;min-height:44px!important;max-height:44px!important;padding-right:50px!important}
      html body #askStateDrawer .state-ask-clear{display:none!important}
      html body #askStateDrawer .state-ask-reset{display:none!important;position:absolute!important;right:7px!important;top:50%!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;padding:0!important;border:0!important;background:transparent!important;color:#677389!important;font-size:22px!important;line-height:32px!important;z-index:20!important;cursor:pointer!important}
      html body #askStateDrawer.has-answer:not(.is-editing-answer) .state-ask-reset{display:block!important}
      html body #askStateDrawer.has-answer:not(.is-editing-answer) .ask-state-drawer-form button[type="submit"]{display:none!important;visibility:hidden!important;pointer-events:none!important}
      html body #askStateDrawer:not(.has-answer) .state-ask-reset,html body #askStateDrawer.is-editing-answer .state-ask-reset{display:none!important}
      html body #askStateDrawer:not(.has-answer) .ask-state-drawer-form button[type="submit"],html body #askStateDrawer.is-editing-answer .ask-state-drawer-form button[type="submit"]{display:grid!important;visibility:visible!important;pointer-events:auto!important}
      html body #askStateDrawer.has-answer .ask-state-starters,html body #askStateDrawer.is-generating .ask-state-starters{display:none!important}
      html body #askStateDrawer .ask-state-stale{display:none!important}
      html body #askStateDrawer .ask-state-starters{grid-template-columns:minmax(0,1fr)!important;width:100%!important}
      html body #askStateDrawer .ask-state-starters button{width:100%!important;min-width:0!important;max-width:100%!important;white-space:normal!important;text-align:left!important}
      html body #askStateDrawer .ask-copy-answer{min-height:28px!important;height:28px!important;padding:0 8px!important;font-size:10.5px!important}
      html body #askStateDrawer .ask-live-answer>h2,html body #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:20px!important;line-height:1.22!important}
      html body #askStateDrawer .ask-live-answer .result-lede,html body #askStateDrawer .ask-live-answer .ask-answer-summary,html body #askStateDrawer .ask-item-text{font-size:13px!important;line-height:1.5!important}
      html body #askStateDrawer .ask-item-action,html body #askStateDrawer .ask-item-link,html body #askStateDrawer .ask-state-actions .text-button{font-size:10.5px!important;font-weight:700!important}

      html body .review-source-meta,html body .open-question-meta,html body .quiet-meta,html body .blocking-detail{font-size:11.5px!important;line-height:1.4!important;color:#6b7280!important}
      html body .settings-page .settings-rule-copy span{font-size:12px!important;line-height:1.4!important;color:#4f5b70!important}

      @media(max-width:760px){
        html body #askStateDrawer .ask-state-drawer-form input{height:42px!important;min-height:42px!important;max-height:42px!important;padding-right:48px!important;font-size:14px!important}
        html body #askStateDrawer .ask-state-drawer-form button[type="submit"]{position:absolute!important;right:5px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important}
        html body #askStateDrawer .state-ask-reset{right:5px!important;width:32px!important;height:32px!important;line-height:32px!important}
        html body #askStateDrawer .ask-state-starters button{padding-left:8px!important;padding-right:8px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureResetButton(){
    const drawer=document.getElementById('askStateDrawer');
    const form=drawer?.querySelector('.ask-state-drawer-form');
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

  function restoreAskDiscovery(){
    const drawer=document.getElementById('askStateDrawer');
    if(!drawer) return;
    const input=drawer.querySelector('#askStateDrawerInput');
    const result=drawer.querySelector('#askStateDrawerResult');
    drawer.dataset.stateAskResetting='1';
    if(result) result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    delete drawer.dataset.askPending;
    drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    drawer.querySelectorAll('.state-ask-status').forEach(el=>{el.className='state-ask-status';el.textContent='';});
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;ensureResetButton();});
  }

  function installAskControls(){
    if(document.documentElement.dataset.stateAskControlsR59==='1') return;
    document.documentElement.dataset.stateAskControlsR59='1';
    document.addEventListener('click',e=>{
      const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');
      if(!reset) return;
      e.preventDefault();e.stopImmediatePropagation();restoreAskDiscovery();
    },true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput') return;
      const drawer=document.getElementById('askStateDrawer');
      if(!drawer||drawer.dataset.stateAskResetting==='1'||!drawer.classList.contains('has-answer')) return;
      const result=drawer.querySelector('#askStateDrawerResult');
      if(result) result.innerHTML='';
      drawer.classList.remove('has-answer');
      drawer.classList.add('is-editing-answer');
    },true);
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer .ask-state-drawer-form')) return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer){drawer.classList.remove('has-answer','is-editing-answer');drawer.dataset.askPending='1';}
    },true);
  }

  function syncAttention(){
    const API=window.STATE_API,app=window.STATE_ASK_TEST_API;
    if(!API?.getAttention||!app?.state) return;
    API.getAttention().then(payload=>{
      const incoming=Array.isArray(payload?.questions)?payload.questions:[];
      app.state.data.questions=incoming.map(q=>({id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',topics:[],backendManaged:true}));
      const reviews=Array.isArray(payload?.open_reviews)?payload.open_reviews.length:0;
      const blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length;
      const count=reviews+blockers;
      document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`);});
      const title=document.querySelector('.workspace-attention .workspace-attention-head h3');
      if(title&&count) title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;
    }).catch(()=>{});
  }

  function installEvidenceSync(){
    if(document.documentElement.dataset.stateEvidenceSyncR59==='1') return;
    document.documentElement.dataset.stateEvidenceSyncR59='1';
    const start=()=>{
      const body=document.getElementById('dialogBody');if(!body)return;
      new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttention,250);}).observe(body,{childList:true,subtree:true,characterData:true});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function run(){installStyles();ensureResetButton();installAskControls();installEvidenceSync();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;installStyles();ensureResetButton();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();