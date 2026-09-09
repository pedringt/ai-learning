(() => {
  const STYLE_ID='state-final-feedback-r60';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      html body:not(.v88-dark) .prototype-productbar{background:#c6d7ec!important;border-bottom-color:#afc5df!important}

      /* Workspace: calm attention surface with blue evidence icons. */
      html body .workspace-attention{background:#fff!important;border:1px solid #e1e5eb!important;border-top:4px solid #d9a7ae!important;box-shadow:none!important}
      html body .workspace-attention .workspace-attention-head p{display:none!important}
      html body .workspace-attention .attention-list{background:transparent!important;border:0!important;border-radius:0!important;overflow:visible!important}
      html body .workspace-attention .attention-item{background:transparent!important;border:0!important;border-top:1px solid #e6e8ee!important;border-radius:0!important;box-shadow:none!important;transition:none!important}
      html body .workspace-attention .attention-item:first-child{border-top:0!important}
      html body .workspace-attention .attention-item:hover{background:#fafbfc!important;transform:none!important;box-shadow:none!important}
      html body .workspace-attention .attention-row-icon{background:#eaf2ff!important;color:#1769e8!important;border-color:#d8e6fb!important}
      html body .workspace-attention .attention-row-icon svg{stroke:currentColor!important}

      html body .project-page .project-head-copy-context{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:40px!important;padding:0 16px!important;border:1px solid #b9cbe4!important;border-radius:9px!important;background:#fff!important;color:#24568f!important;box-shadow:0 1px 2px rgba(16,26,49,.05)!important;font-size:13px!important;font-weight:750!important}

      /* Open Items: task list, not a stack of colorful cards. */
      html body .open-items-page .open-items-sections{display:grid!important;gap:28px!important}
      html body .open-items-page .open-items-section{background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important}
      html body .open-items-page .open-items-section-head{padding:0 0 12px!important;background:transparent!important;border:0!important;border-bottom:1px solid #dfe4eb!important;border-radius:0!important;min-height:0!important}
      html body .open-items-page .open-items-section-head:hover{background:transparent!important}
      html body .open-items-page .open-items-kicker{font-size:10.5px!important;letter-spacing:.09em!important;color:#7b8495!important}
      html body .open-items-page .open-items-section-title{font-size:18px!important;line-height:1.25!important;color:#15213a!important}
      html body .open-items-page .open-items-section-count{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:22px!important;height:22px!important;padding:0 6px!important;border-radius:999px!important;background:#f0f2f5!important;color:#596579!important;font-size:11px!important}
      html body .open-items-page .open-items-section-description{font-size:12.5px!important;line-height:1.45!important;color:#687386!important;max-width:680px!important}
      html body .open-items-page .open-items-section-body{padding:0!important;background:transparent!important}
      html body .open-items-page .review-card,html body .open-items-page .compact-review{margin:0!important;background:#fff!important;border:0!important;border-bottom:1px solid #e4e8ee!important;border-radius:0!important;box-shadow:none!important}
      html body .open-items-page .review-card-toggle{padding:16px 4px!important;background:transparent!important;border:0!important}
      html body .open-items-page .review-card-toggle:hover{background:#fafbfc!important}
      html body .open-items-page .review-kicker{font-size:10.5px!important;letter-spacing:.06em!important;color:#6b5aa6!important}
      html body .open-items-page .review-card-title{font-size:15px!important;line-height:1.4!important;color:#17223a!important}
      html body .open-items-page .review-card-body{padding:0 4px 18px!important;background:transparent!important}
      html body .open-items-page .review-decision-context{gap:10px!important}
      html body .open-items-page .review-context-block{background:#f8f9fb!important;border:1px solid #e4e8ee!important;border-radius:9px!important;padding:12px 14px!important}
      html body .open-items-page .review-context-block span{font-size:10px!important;letter-spacing:.08em!important;color:#727b8c!important}
      html body .open-items-page .review-context-block p{font-size:13px!important;line-height:1.45!important}
      html body .open-items-page .open-question-list{border:0!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
      html body .open-items-page .open-question-row{padding:15px 4px!important;background:#fff!important;border:0!important;border-bottom:1px solid #e4e8ee!important;border-radius:0!important;box-shadow:none!important}
      html body .open-items-page .open-question-row:hover{background:#fafbfc!important;transform:none!important}
      html body .open-items-page .open-question-row.is-blocking{background:#fff!important;border-left:3px solid #d7a15c!important;padding-left:12px!important}
      html body .open-items-page .open-item-label{display:inline-flex!important;width:auto!important;padding:2px 7px!important;border-radius:999px!important;font-size:9.5px!important;letter-spacing:.06em!important}
      html body .open-items-page .open-item-label.blocking{background:#fff4e5!important;color:#9a5c14!important}
      html body .open-items-page .open-item-label.question{background:#edf4ff!important;color:#315f9a!important}
      html body .open-items-page .open-question-title{font-size:14px!important;line-height:1.42!important;color:#17223a!important}
      html body .open-items-page .open-question-meta{font-size:11.5px!important;line-height:1.4!important;color:#788295!important}
      html body .open-items-page details.reasoning{margin-top:8px!important;padding-top:8px!important}
      html body .open-items-page details.reasoning summary{font-size:11.5px!important;line-height:1.25!important;font-weight:700!important;color:#667085!important}
      html body .open-items-page details.reasoning p{margin:6px 0!important;font-size:12.5px!important;line-height:1.42!important;color:#4f5b70!important}

      /* Settings: quiet preferences page, separated by whitespace/dividers. */
      html body .settings-page{max-width:900px!important}
      html body .settings-page .settings-section{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:22px 0!important;margin:0!important;border-bottom:1px solid #e1e5eb!important}
      html body .settings-page .settings-section:first-of-type{padding-top:8px!important}
      html body .settings-page .settings-section:last-child{border-bottom:0!important}
      html body .settings-page .settings-quiet{background:transparent!important}
      html body .settings-page .settings-section-head{margin-bottom:12px!important}
      html body .settings-page .settings-section h3{font-size:16px!important}
      html body .settings-page .settings-section p{font-size:12.5px!important;line-height:1.45!important}
      html body .settings-page .settings-behavior-list{margin-top:10px!important;gap:7px 24px!important}
      html body .settings-page .settings-behavior-list li{font-size:12.5px!important;color:#344054!important}
      html body .settings-page .settings-project-name{max-width:360px!important}
      html body .settings-page .settings-project-name input{padding:9px 10px!important;background:#f8f9fb!important}
      html body .settings-page .settings-rules{margin-top:14px!important;border:1px solid #e1e5eb!important;border-radius:9px!important;background:#fff!important}
      html body .settings-page .settings-rules summary{padding:10px 12px!important;font-size:13px!important}
      html body .settings-page .settings-rule-list li{padding:9px 10px!important;background:#fff!important;border:0!important;border-top:1px solid #e6e9ee!important;border-radius:0!important}
      html body .settings-page .settings-rule-copy span{font-size:12px!important;line-height:1.4!important;color:#4f5b70!important}
      html body .settings-page .slack-preview,html body .settings-page .source-list{margin-top:10px!important}
      html body .settings-page .slack-preview-row,html body .settings-page .source-row{padding:10px 0!important}
      html body .settings-page .settings-actions .btn,html body .settings-page .slack-preview-row button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:112px!important;height:40px!important;min-height:40px!important;padding:0 14px!important;font-size:12.5px!important;line-height:1.2!important;font-weight:700!important;border-radius:9px!important}

      /* History: chronological authorized changes, without timeline decoration. */
      html body .history-page .history-sources,html body .history-page .history-entry-link{display:none!important}
      html body .history-page .history-list{position:static!important;background:none!important;border:0!important}
      html body .history-page .history-list::before,html body .history-page .history-list::after,html body .history-page .history-entry::before,html body .history-page .history-entry::after,html body .history-page .history-entry-body::before,html body .history-page .history-entry-body::after{content:none!important;display:none!important;border:0!important;background:none!important}
      html body .history-page .history-entry,html body .history-page .history-entry-body{border-left:0!important;border-inline-start:0!important;background-image:none!important;box-shadow:none!important;transform:none!important;transition:none!important}
      html body .history-page .history-entry{border-bottom:1px solid #dfe4eb!important;padding:0 0 30px!important;margin:0 0 30px!important}
      html body .history-page .history-entry:last-child{border-bottom:0!important}
      html body .history-page .history-entry:hover,html body .history-page .history-entry.is-linked:hover{background:transparent!important;border-left:0!important;box-shadow:none!important;transform:none!important;outline:0!important}
      html body .history-page .history-entry-date{display:inline-flex!important;align-items:center!important;width:auto!important;padding:3px 8px!important;border-radius:999px!important;background:#f0f3f7!important;color:#657187!important;font-size:10.5px!important;font-weight:750!important}
      html body .history-page .history-entry h3{font-size:19px!important;line-height:1.25!important;margin-top:10px!important}
      html body .history-page .history-before{background:#f8f9fb!important}
      html body .history-page .history-after,html body .history-page .history-now{background:#eef8f3!important;border-color:#cce6d8!important}

      /* Ask: exactly one composer control. Runtime below also enforces this inline. */
      html body #askStateDrawer .ask-quick-actions-polish{display:none!important}
      html body #askStateDrawer .ask-state-drawer-form{position:relative!important}
      html body #askStateDrawer .ask-state-drawer-form input{height:44px!important;min-height:44px!important;max-height:44px!important;padding-right:50px!important}
      html body #askStateDrawer .state-ask-clear{display:none!important}
      html body #askStateDrawer .state-ask-reset{position:absolute!important;right:7px!important;top:50%!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;padding:0!important;border:0!important;background:transparent!important;color:#677389!important;font-size:22px!important;line-height:32px!important;z-index:20!important;cursor:pointer!important}
      html body #askStateDrawer.has-answer .ask-state-starters,html body #askStateDrawer.is-generating .ask-state-starters{display:none!important}
      html body #askStateDrawer .ask-state-stale{display:none!important}
      html body #askStateDrawer .ask-state-starters{grid-template-columns:minmax(0,1fr)!important;width:100%!important}
      html body #askStateDrawer .ask-state-starters button{width:100%!important;min-width:0!important;max-width:100%!important;white-space:normal!important;text-align:left!important}
      html body #askStateDrawer .ask-copy-answer{min-height:28px!important;height:28px!important;padding:0 8px!important;font-size:10.5px!important}
      html body #askStateDrawer .ask-live-answer>h2,html body #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:20px!important;line-height:1.22!important}
      html body #askStateDrawer .ask-live-answer .result-lede,html body #askStateDrawer .ask-live-answer .ask-answer-summary,html body #askStateDrawer .ask-item-text{font-size:13px!important;line-height:1.5!important}
      html body #askStateDrawer .ask-item-action,html body #askStateDrawer .ask-item-link,html body #askStateDrawer .ask-state-actions .text-button{font-size:10.5px!important;font-weight:700!important}
      html body .review-source-meta,html body .open-question-meta,html body .quiet-meta,html body .blocking-detail{font-size:11.5px!important;line-height:1.4!important;color:#6b7280!important}
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
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form) return;
    let reset=form.querySelector('.state-ask-reset');
    if(!reset){reset=document.createElement('button');reset.type='button';reset.className='state-ask-reset';reset.setAttribute('aria-label','Clear answer and start a new Ask');reset.textContent='×';form.appendChild(reset);}
  }

  function syncAskControls(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form)return;
    ensureResetButton();
    const reset=form.querySelector('.state-ask-reset'),submit=form.querySelector('button[type="submit"]'),result=drawer.querySelector('#askStateDrawerResult');
    const hasAnswer=!!result?.querySelector('.ask-live-answer,.ask-answer-item') || drawer.classList.contains('has-answer');
    const generating=drawer.classList.contains('is-generating')||drawer.dataset.askPending==='1';
    if(reset){reset.style.setProperty('display',hasAnswer&&!generating?'block':'none','important');reset.style.setProperty('visibility',hasAnswer&&!generating?'visible':'hidden','important');}
    if(submit){submit.style.setProperty('display',hasAnswer&&!generating?'none':'grid','important');submit.style.setProperty('visibility',hasAnswer&&!generating?'hidden':'visible','important');submit.style.setProperty('pointer-events',hasAnswer&&!generating?'none':'auto','important');}
  }

  function restoreAskDiscovery(){
    const drawer=document.getElementById('askStateDrawer');if(!drawer)return;
    const input=drawer.querySelector('#askStateDrawerInput'),result=drawer.querySelector('#askStateDrawerResult');
    drawer.dataset.stateAskResetting='1';if(result)result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    delete drawer.dataset.askPending;drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    drawer.querySelectorAll('.state-ask-status').forEach(el=>{el.className='state-ask-status';el.textContent='';});
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;syncAskControls();});
  }

  function installAskControls(){
    if(document.documentElement.dataset.stateAskControlsR60==='1')return;document.documentElement.dataset.stateAskControlsR60='1';
    document.addEventListener('click',e=>{const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');if(!reset)return;e.preventDefault();e.stopImmediatePropagation();restoreAskDiscovery();},true);
    document.addEventListener('input',e=>{if(e.target?.id!=='askStateDrawerInput')return;const drawer=document.getElementById('askStateDrawer');if(!drawer||drawer.dataset.stateAskResetting==='1')return;const result=drawer.querySelector('#askStateDrawerResult');if(result?.textContent?.trim()){result.innerHTML='';drawer.classList.remove('has-answer');drawer.classList.add('is-editing-answer');}syncAskControls();},true);
    document.addEventListener('submit',e=>{if(!e.target.closest?.('#askStateDrawer .ask-state-drawer-form'))return;const drawer=document.getElementById('askStateDrawer');if(drawer){drawer.classList.remove('has-answer','is-editing-answer');drawer.dataset.askPending='1';requestAnimationFrame(syncAskControls);}},true);
  }

  function syncAttention(){
    const API=window.STATE_API,app=window.STATE_ASK_TEST_API;if(!API?.getAttention||!app?.state)return;
    API.getAttention().then(payload=>{const incoming=Array.isArray(payload?.questions)?payload.questions:[];app.state.data.questions=incoming.map(q=>({id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',topics:[],backendManaged:true}));const reviews=Array.isArray(payload?.open_reviews)?payload.open_reviews.length:0;const blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length;const count=reviews+blockers;document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`);});const title=document.querySelector('.workspace-attention .workspace-attention-head h3');if(title&&count)title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;}).catch(()=>{});
  }

  function installEvidenceSync(){
    if(document.documentElement.dataset.stateEvidenceSyncR60==='1')return;document.documentElement.dataset.stateEvidenceSyncR60='1';
    const start=()=>{const body=document.getElementById('dialogBody');if(!body)return;new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttention,250);}).observe(body,{childList:true,subtree:true,characterData:true});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function run(){installStyles();ensureResetButton();installAskControls();installEvidenceSync();syncAskControls();}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;installStyles();syncAskControls();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();