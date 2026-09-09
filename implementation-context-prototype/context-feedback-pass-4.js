(() => {
  const icons={
    overview:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>',
    'project-overview':'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    'open-items':'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    notes:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    history:'<svg viewBox="0 0 24 24"><path d="M4 7V3m0 4h4M4.5 7A9 9 0 1 1 3 15"/><path d="M12 7v5l3 2"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(2.25 0) scale(.8)"/></svg>'
  };

  function styles(){
    /* An older feedback layer already owns #state-final-feedback. Using the
       same id made this whole pass silently skip itself on the real page. */
    if(document.getElementById('state-final-feedback-r58'))return;
    const s=document.createElement('style');s.id='state-final-feedback-r58';s.textContent=`
      /* Stronger product chrome. Specificity intentionally beats older final-feedback rules. */
      html body:not(.v88-dark) .prototype-productbar{background:#dbe7f8!important;border-bottom-color:#c5d4eb!important}

      /* Workspace attention: one calm surface with dividers instead of white cards on pink. */
      html body .workspace-attention .attention-list{background:transparent!important;border:0!important;border-radius:0!important;overflow:visible!important}
      html body .workspace-attention .attention-item{background:transparent!important;border:0!important;border-top:1px solid #efdadd!important;border-radius:0!important;box-shadow:none!important}
      html body .workspace-attention .attention-item:first-child{border-top:0!important;border-radius:0!important}
      html body .workspace-attention .attention-item:last-child,html body .workspace-attention .attention-item:only-child{border-radius:0!important}
      html body .workspace-attention .attention-item:hover{background:rgba(255,255,255,.22)!important}

      /* Current State utility button should read as a real secondary action. */
      html body .project-page .project-head-copy-context{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:40px!important;padding:0 15px!important;border:1px solid #c8d6ea!important;border-radius:9px!important;background:#fff!important;color:#28558f!important;box-shadow:0 1px 2px rgba(16,26,49,.04)!important;font-size:12.5px!important;font-weight:750!important}
      html body .project-page .project-head-copy-context:hover{background:#f3f7fd!important;border-color:#aec4e3!important}

      /* Settings actions share one compact-but-obvious size. */
      html body .settings-page .settings-actions{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important}
      html body .settings-page .settings-slack .settings-actions .btn,html body .settings-page .settings-danger .settings-actions .btn,html body .settings-page .slack-preview-row .btn,html body .settings-page .slack-preview-row button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important;height:40px!important;min-height:40px!important;padding:0 14px!important;font-size:12px!important;line-height:1.2!important;font-weight:700!important;border-radius:9px!important}

      /* Reviews: supporting rationale should look supporting, not like another decision block. */
      html body .open-items-page details.reasoning{margin-top:8px!important;padding-top:8px!important}
      html body .open-items-page details.reasoning summary{font-size:11.5px!important;line-height:1.25!important;font-weight:700!important;color:#667085!important}
      html body .open-items-page details.reasoning p{margin:6px 0!important;font-size:12.5px!important;line-height:1.42!important;color:#4f5b70!important}
      html body .open-items-page details.reasoning p strong{font-size:inherit!important;color:#26344d!important}

      /* History is a flat readable decision log. Remove timeline rails, source links and hover effects. */
      html body .history-page .history-sources,html body .history-page .history-entry-link{display:none!important}
      html body .history-page #historyList,html body .history-page .history-list,html body .history-page .history-entry,html body .history-page .history-entry-body{border-left:0!important;border-inline-start:0!important;background-image:none!important;box-shadow:none!important;transform:none!important;transition:none!important}
      html body .history-page #historyList::before,html body .history-page #historyList::after,html body .history-page .history-list::before,html body .history-page .history-list::after,html body .history-page .history-entry::before,html body .history-page .history-entry::after,html body .history-page .history-entry-body::before,html body .history-page .history-entry-body::after{content:none!important;display:none!important}
      html body .history-page .history-entry:hover,html body .history-page .history-entry.is-linked:hover{background:transparent!important;background-image:none!important;box-shadow:none!important;transform:none!important;outline:0!important}

      /* Ask discovery controls. */
      html body #askStateDrawer .ask-quick-actions-polish{display:none!important}
      html body #askStateDrawer .ask-state-drawer-form input{height:44px!important;min-height:44px!important;max-height:44px!important}
      html body #askStateDrawer .ask-state-starters{display:grid!important;grid-template-columns:minmax(0,1fr)!important;width:100%!important;gap:2px!important}
      html body #askStateDrawer .ask-state-starters button{display:flex!important;align-items:center!important;width:100%!important;min-width:0!important;max-width:100%!important;gap:12px!important;white-space:normal!important;text-align:left!important}
      html body #askStateDrawer .ask-state-starters button:nth-of-type(5){display:none!important}
      html body #askStateDrawer .ask-state-starters button:nth-of-type(4) .ask-polish-icon{display:grid!important;place-items:center!important;flex:0 0 21px!important;width:21px!important;height:21px!important}
      html body #askStateDrawer .ask-state-starters button:nth-of-type(4) .ask-polish-icon svg{display:none!important}
      html body #askStateDrawer .ask-state-starters button:nth-of-type(4) .ask-polish-icon::before{content:'?';display:grid;place-items:center;width:18px;height:18px;border:1.7px solid currentColor;border-radius:50%;font-size:12px;font-weight:800;line-height:1}
      html body #askStateDrawer .ask-state-drawer-close{display:grid!important;place-items:center!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important;border:0!important;background:transparent!important;font-size:25px!important;line-height:1!important;appearance:none!important;-webkit-appearance:none!important}
      html body #askStateDrawer .ask-state-drawer-close::before,html body #askStateDrawer .ask-state-drawer-close::after{content:none!important;display:none!important}

      /* The older feedback layers create their own clear control. Keep it hidden
         in every answer state and own reset through the single r58 control. */
      html body #askStateDrawer .state-ask-clear,html body #askStateDrawer.has-answer .state-ask-clear,html body #askStateDrawer.has-answer:not(.is-editing-answer) .state-ask-clear{display:none!important}
      html body #askStateDrawer .state-ask-reset{display:none!important;position:absolute!important;right:6px!important;top:50%!important;transform:translateY(-50%)!important;width:30px!important;height:30px!important;border:0!important;border-radius:50%!important;padding:0!important;background:transparent!important;color:#677389!important;font:inherit!important;font-size:20px!important;line-height:30px!important;cursor:pointer!important;box-shadow:none!important;z-index:4!important}
      html body #askStateDrawer.has-answer:not(.is-editing-answer) .state-ask-reset{display:block!important}
      html body #askStateDrawer.has-answer:not(.is-editing-answer) .ask-state-drawer-form button[type="submit"]{display:none!important}
      html body #askStateDrawer.is-editing-answer .state-ask-reset{display:none!important}
      html body #askStateDrawer.is-editing-answer .ask-state-drawer-form button[type="submit"]{display:block!important}
      html body #askStateDrawer.is-editing-answer .ask-state-starters{display:none!important}

      /* Whole-project stale detection is too coarse: until relevance-aware invalidation exists, suppress the misleading warning. */
      html body #askStateDrawer .ask-state-stale{display:none!important}

      /* Ask answers: compact hierarchy and small utilities. */
      html body #askStateDrawer .ask-live-answer>h2,html body #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:20px!important;line-height:1.22!important;letter-spacing:-.015em!important;margin:7px 0 9px!important}
      html body #askStateDrawer .ask-live-answer .result-lede,html body #askStateDrawer .ask-live-answer .ask-answer-summary{font-size:13px!important;line-height:1.55!important}
      html body #askStateDrawer .ask-answer-section h3{font-size:13px!important;line-height:1.3!important}
      html body #askStateDrawer .ask-item-text{font-size:13px!important;line-height:1.48!important}
      html body #askStateDrawer .ask-item-detail{font-size:11.5px!important;line-height:1.4!important}
      html body #askStateDrawer .ask-item-action,html body #askStateDrawer .ask-item-link{font-size:10.5px!important;font-weight:700!important;white-space:nowrap!important}
      html body #askStateDrawer .ask-copy-answer{min-height:28px!important;height:28px!important;padding:0 8px!important;border-radius:7px!important;font-size:10.5px!important;line-height:1!important}
      html body #askStateDrawer .ask-state-actions{margin-top:16px!important;padding-top:12px!important}
      html body #askStateDrawer .ask-state-actions>.meta-label{font-size:9.5px!important;letter-spacing:.09em!important;color:#6b7280!important}
      html body #askStateDrawer .ask-state-actions>div{margin-top:5px!important;font-size:12px!important;line-height:1.4!important;color:#5c6678!important}
      html body #askStateDrawer .ask-state-actions .text-button{font-size:10.5px!important;font-weight:700!important}

      /* Secondary/meta typography sweep: keep utility text visually subordinate. */
      html body .review-source-meta,html body .open-question-meta,html body .quiet-meta,html body .blocking-detail{font-size:11.5px!important;line-height:1.4!important;color:#6b7280!important}
      html body .settings-page .settings-rule-copy span{font-size:12px!important;line-height:1.4!important;color:#4f5b70!important}
      html body .settings-page .settings-rule-copy strong{font-size:9.5px!important;letter-spacing:.08em!important}

      @media(max-width:760px){
        html body #askStateDrawer .ask-state-drawer-form{display:block!important;position:relative!important}
        html body #askStateDrawer .ask-state-drawer-form input{height:42px!important;min-height:42px!important;max-height:42px!important;padding:0 50px 0 12px!important;font-size:14px!important}
        html body #askStateDrawer .ask-state-drawer-form button[type="submit"]{position:absolute!important;right:5px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important}
        html body #askStateDrawer .state-ask-reset{right:5px!important;width:30px!important;height:30px!important;line-height:30px!important}
        html body #askStateDrawer .ask-state-drawer-close{position:relative!important;z-index:3!important;touch-action:manipulation!important}
        html body #askStateDrawer .ask-state-starters button{touch-action:manipulation!important;padding-left:8px!important;padding-right:8px!important}
        html body .settings-page .settings-actions{align-items:flex-start!important}
        html body .settings-page .settings-slack .settings-actions .btn,html body .settings-page .settings-danger .settings-actions .btn,html body .settings-page .slack-preview-row .btn,html body .settings-page .slack-preview-row button{height:40px!important;min-height:40px!important;align-self:flex-start!important}
        html body #askStateDrawer .ask-live-answer>h2,html body #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:18px!important}
        html body #askStateDrawer .ask-live-answer .result-lede,html body #askStateDrawer .ask-live-answer .ask-answer-summary,html body #askStateDrawer .ask-item-text{font-size:12.5px!important}
      }
    `;document.head.appendChild(s);
  }

  function fixNav(){document.querySelectorAll('.sidebar-nav .nav-item').forEach(b=>{let i=b.querySelector(':scope > .nav-icon');if(!i&&icons[b.dataset.view]){i=document.createElement('span');i.className='nav-icon';b.prepend(i)}if(i&&icons[b.dataset.view])i.innerHTML=icons[b.dataset.view]})}

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
    if(document.documentElement.dataset.stateAskMobileHardening==='2')return;document.documentElement.dataset.stateAskMobileHardening='2';
    document.addEventListener('pointerup',e=>{
      if(!matchMedia('(max-width:760px)').matches)return;
      const close=e.target.closest?.('#askStateDrawer .ask-state-drawer-close');
      if(close){e.preventDefault();e.stopImmediatePropagation();const d=document.getElementById('askStateDrawer'),l=document.getElementById('askStateLauncher');if(d)d.hidden=true;if(l)l.classList.remove('is-hidden');return}
      const starter=e.target.closest?.('#askStateDrawer [data-review-batch-prompt]');
      if(starter){e.preventDefault();e.stopImmediatePropagation();const input=document.getElementById('askStateDrawerInput'),form=document.querySelector('#askStateDrawer [data-review-batch-form="ask"]');if(!input||!form)return;input.value=starter.dataset.reviewBatchPrompt||starter.textContent.trim();input.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit()}
    },true);
  }

  function ensureResetButton(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');if(!drawer||!form)return;
    let reset=form.querySelector('.state-ask-reset');
    if(!reset){reset=document.createElement('button');reset.type='button';reset.className='state-ask-reset';reset.setAttribute('aria-label','Clear answer and start a new Ask');reset.textContent='×';form.appendChild(reset)}
  }

  function resetAsk(){
    const drawer=document.getElementById('askStateDrawer'),input=drawer?.querySelector('#askStateDrawerInput'),result=drawer?.querySelector('#askStateDrawerResult');if(!drawer)return;
    drawer.dataset.stateAskResetting='1';
    if(result)result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}
    delete drawer.dataset.askPending;
    drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;ensureResetButton()});
  }

  function askControlStates(){
    if(document.documentElement.dataset.stateAskControlStates==='2')return;document.documentElement.dataset.stateAskControlStates='2';
    document.addEventListener('click',e=>{const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');if(!reset)return;e.preventDefault();e.stopImmediatePropagation();resetAsk()},true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(!drawer||drawer.dataset.stateAskResetting==='1'||!drawer.classList.contains('has-answer'))return;
      const result=drawer.querySelector('#askStateDrawerResult');if(result)result.innerHTML='';drawer.classList.remove('has-answer');drawer.classList.add('is-editing-answer');
    });
    document.addEventListener('submit',e=>{if(!e.target.closest?.('#askStateDrawer [data-review-batch-form="ask"]'))return;const drawer=document.getElementById('askStateDrawer');drawer?.classList.remove('is-editing-answer');if(drawer)drawer.dataset.askPending='1'},true);
  }

  function evidenceSync(){
    if(document.documentElement.dataset.stateEvidenceCountSync==='1')return;document.documentElement.dataset.stateEvidenceCountSync='1';
    const start=()=>{const body=document.getElementById('dialogBody');if(!body)return;new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttentionFromApi,250)}).observe(body,{childList:true,subtree:true,characterData:true})};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function run(){styles();fixNav();mobileAsk();askControlStates();ensureResetButton();evidenceSync()}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;styles();fixNav();ensureResetButton()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();