(() => {
  function addStyles(){
    if(document.getElementById('state-feedback-pass-4')) return;
    const s=document.createElement('style');
    s.id='state-feedback-pass-4';
    s.textContent=`
      /* Slightly stronger product chrome. */
      .prototype-productbar{background:#e7effc!important;border-bottom-color:#cfdbef!important}

      /* Copy context should read as an action without becoming a primary CTA. */
      .project-page .project-head-copy-context{padding:7px 11px!important;border:1px solid #c8d6ea!important;border-radius:9px!important;background:#fff!important;color:#28558f!important;box-shadow:0 1px 2px rgba(16,26,49,.04)!important}
      .project-page .project-head-copy-context:hover{background:#f3f7fd!important;border-color:#aec4e3!important}

      /* Settings actions: compact and aligned. */
      .settings-page .settings-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}
      .settings-page .settings-actions .btn,.settings-page .source-row .btn,.settings-page [data-action="connect-slack"],.settings-page [data-action="disable-slack"]{min-height:32px!important;padding:6px 10px!important;font-size:11px!important;line-height:1.2!important}

      /* Quick actions duplicated the useful starter prompts and were a dead-end surface. */
      #askStateDrawer .ask-quick-actions-polish{display:none!important}

      /* Ask composer + close control. */
      #askStateDrawer .ask-state-drawer-form input{height:44px!important;min-height:44px!important;max-height:44px!important}
      #askStateDrawer .ask-state-drawer-close{display:grid!important;place-items:center!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important;border:0!important;background:transparent!important;font-size:25px!important;line-height:1!important;appearance:none!important;-webkit-appearance:none!important}
      #askStateDrawer .ask-state-drawer-close::before,#askStateDrawer .ask-state-drawer-close::after{content:none!important;display:none!important}
      #askStateDrawer .ask-state-drawer-close svg{display:none!important}

      /* Generated Ask output should feel like a compact project briefing. */
      #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:20px!important;line-height:1.22!important;letter-spacing:-.015em!important}
      #askStateDrawer .ask-live-answer .ask-answer-head p,#askStateDrawer .ask-live-answer .ask-answer-summary{font-size:13px!important;line-height:1.55!important}
      #askStateDrawer .ask-live-answer .ask-answer-section h3{font-size:13px!important;line-height:1.3!important}
      #askStateDrawer .ask-live-answer .ask-item-text{font-size:13px!important;line-height:1.48!important}
      #askStateDrawer .ask-live-answer .ask-item-detail{font-size:11.5px!important;line-height:1.4!important}
      #askStateDrawer .ask-live-answer .ask-item-action,#askStateDrawer .ask-live-answer .text-button{font-size:10.5px!important;font-weight:700!important;white-space:nowrap!important}

      @media(max-width:760px){
        #askStateDrawer .ask-state-drawer-form{display:block!important;position:relative!important}
        #askStateDrawer .ask-state-drawer-form input{height:42px!important;min-height:42px!important;max-height:42px!important;padding:0 78px 0 12px!important;font-size:14px!important}
        #askStateDrawer .ask-state-drawer-form button[type="submit"]{position:absolute!important;right:5px!important;top:50%!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important}
        #askStateDrawer .state-ask-clear{right:40px!important}
        #askStateDrawer .ask-state-drawer-close{position:relative!important;z-index:3!important;touch-action:manipulation!important}
        #askStateDrawer .ask-state-starters button{touch-action:manipulation!important}
        .settings-page .settings-actions{align-items:stretch!important}
        .settings-page .settings-actions .btn,.settings-page [data-action="connect-slack"],.settings-page [data-action="disable-slack"]{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important}
        #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:18px!important}
        #askStateDrawer .ask-live-answer .ask-answer-head p,#askStateDrawer .ask-live-answer .ask-answer-summary,#askStateDrawer .ask-live-answer .ask-item-text{font-size:12.5px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function syncAttentionFromApi(){
    const API=window.STATE_API, app=window.STATE_ASK_TEST_API;
    if(!API?.getAttention||!app?.state) return;
    API.getAttention().then(payload=>{
      const state=app.state;
      const incoming=Array.isArray(payload?.questions)?payload.questions:[];
      state.data.questions=incoming.map(q=>({
        id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,
        origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',
        topics:[],backendManaged:true
      }));
      const reviews=(Array.isArray(payload?.open_reviews)?payload.open_reviews:[]).length;
      const blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length;
      const count=reviews+blockers;
      document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{
        el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`);
      });
      const attention=document.querySelector('.workspace-attention');
      const title=attention?.querySelector('.workspace-attention-head h3');
      const support=attention?.querySelector('.workspace-attention-head p');
      if(title&&count) title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;
      if(support&&count) support.textContent=`${reviews} ${reviews===1?'review':'reviews'} · ${blockers} blocking ${blockers===1?'question':'questions'}`;
    }).catch(()=>{});
  }

  function installAskMobileHardening(){
    if(document.documentElement.dataset.stateAskMobileHardening==='1') return;
    document.documentElement.dataset.stateAskMobileHardening='1';

    document.addEventListener('pointerup',e=>{
      if(!window.matchMedia('(max-width:760px)').matches) return;
      const close=e.target.closest?.('#askStateDrawer .ask-state-drawer-close');
      if(close){
        e.preventDefault();e.stopImmediatePropagation();
        const drawer=document.getElementById('askStateDrawer');
        const launcher=document.getElementById('askStateLauncher');
        if(drawer) drawer.hidden=true;
        if(launcher) launcher.classList.remove('is-hidden');
        return;
      }
      const starter=e.target.closest?.('#askStateDrawer [data-review-batch-prompt]');
      if(starter){
        e.preventDefault();e.stopImmediatePropagation();
        const input=document.getElementById('askStateDrawerInput');
        const form=starter.closest('#askStateDrawer')?.querySelector('[data-review-batch-form="ask"]');
        if(!input||!form) return;
        input.value=starter.dataset.reviewBatchPrompt||starter.textContent.trim();
        input.dispatchEvent(new Event('input',{bubbles:true}));
        form.requestSubmit();
      }
    },true);
  }

  function watchEvidenceCompletion(){
    if(document.documentElement.dataset.stateEvidenceCountSync==='1') return;
    document.documentElement.dataset.stateEvidenceCountSync='1';
    const observer=new MutationObserver(()=>{
      const body=document.getElementById('dialogBody');
      if(!body) return;
      const text=(body.textContent||'').replace(/\s+/g,' ').trim();
      if(/Evidence added|Saved, but not analyzed/i.test(text)) setTimeout(syncAttentionFromApi,250);
    });
    const start=()=>{const body=document.getElementById('dialogBody');if(body)observer.observe(body,{childList:true,subtree:true,characterData:true});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function run(){addStyles();installAskMobileHardening();watchEvidenceCompletion();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();