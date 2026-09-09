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
    if(document.getElementById('state-final-feedback'))return;
    const s=document.createElement('style');s.id='state-final-feedback';s.textContent=`
      .prototype-productbar{background:#e7effc!important;border-bottom-color:#cfdbef!important}
      .project-page .project-head-copy-context{padding:7px 11px!important;border:1px solid #c8d6ea!important;border-radius:9px!important;background:#fff!important;color:#28558f!important;box-shadow:0 1px 2px rgba(16,26,49,.04)!important}
      .project-page .project-head-copy-context:hover{background:#f3f7fd!important;border-color:#aec4e3!important}
      .settings-page .settings-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}
      .settings-page .settings-actions .btn,.settings-page .source-row .btn,.settings-page [data-action="connect-slack"],.settings-page [data-action="disable-slack"]{min-height:32px!important;padding:6px 10px!important;font-size:11px!important;line-height:1.2!important}
      #askStateDrawer .ask-quick-actions-polish{display:none!important}
      #askStateDrawer .ask-state-drawer-form input{height:44px!important;min-height:44px!important;max-height:44px!important}
      #askStateDrawer .ask-state-drawer-close{display:grid!important;place-items:center!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important;border:0!important;background:transparent!important;font-size:25px!important;line-height:1!important;appearance:none!important;-webkit-appearance:none!important}
      #askStateDrawer .ask-state-drawer-close::before,#askStateDrawer .ask-state-drawer-close::after{content:none!important;display:none!important}
      #askStateDrawer .ask-live-answer>h2,#askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:20px!important;line-height:1.22!important;letter-spacing:-.015em!important;margin:7px 0 9px!important}
      #askStateDrawer .ask-live-answer .result-lede,#askStateDrawer .ask-live-answer .ask-answer-summary{font-size:13px!important;line-height:1.55!important}
      #askStateDrawer .ask-answer-section h3{font-size:13px!important;line-height:1.3!important}
      #askStateDrawer .ask-item-text{font-size:13px!important;line-height:1.48!important}
      #askStateDrawer .ask-item-detail{font-size:11.5px!important;line-height:1.4!important}
      #askStateDrawer .ask-item-action,#askStateDrawer .ask-item-link{font-size:10.5px!important;font-weight:700!important;white-space:nowrap!important}
      @media(max-width:760px){
        #askStateDrawer .ask-state-drawer-form{display:block!important;position:relative!important}
        #askStateDrawer .ask-state-drawer-form input{height:42px!important;min-height:42px!important;max-height:42px!important;padding:0 78px 0 12px!important;font-size:14px!important}
        #askStateDrawer .ask-state-drawer-form button[type="submit"]{position:absolute!important;right:5px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;width:32px!important;height:32px!important;min-width:32px!important;padding:0!important}
        #askStateDrawer .state-ask-clear{right:40px!important}
        #askStateDrawer .ask-state-drawer-close{position:relative!important;z-index:3!important;touch-action:manipulation!important}
        #askStateDrawer .ask-state-starters button{touch-action:manipulation!important}
        .settings-page .settings-actions{align-items:stretch!important}
        .settings-page .settings-actions .btn,.settings-page [data-action="connect-slack"],.settings-page [data-action="disable-slack"]{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important}
        #askStateDrawer .ask-live-answer>h2,#askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:18px!important}
        #askStateDrawer .ask-live-answer .result-lede,#askStateDrawer .ask-live-answer .ask-answer-summary,#askStateDrawer .ask-item-text{font-size:12.5px!important}
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
    if(document.documentElement.dataset.stateAskMobileHardening==='1')return;document.documentElement.dataset.stateAskMobileHardening='1';
    document.addEventListener('pointerup',e=>{
      if(!matchMedia('(max-width:760px)').matches)return;
      const close=e.target.closest?.('#askStateDrawer .ask-state-drawer-close');
      if(close){e.preventDefault();e.stopImmediatePropagation();const d=document.getElementById('askStateDrawer'),l=document.getElementById('askStateLauncher');if(d)d.hidden=true;if(l)l.classList.remove('is-hidden');return}
      const starter=e.target.closest?.('#askStateDrawer [data-review-batch-prompt]');
      if(starter){e.preventDefault();e.stopImmediatePropagation();const input=document.getElementById('askStateDrawerInput'),form=document.querySelector('#askStateDrawer [data-review-batch-form="ask"]');if(!input||!form)return;input.value=starter.dataset.reviewBatchPrompt||starter.textContent.trim();input.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit()}
    },true);
  }

  function evidenceSync(){
    if(document.documentElement.dataset.stateEvidenceCountSync==='1')return;document.documentElement.dataset.stateEvidenceCountSync='1';
    const start=()=>{const body=document.getElementById('dialogBody');if(!body)return;new MutationObserver(()=>{const text=(body.textContent||'').replace(/\s+/g,' ').trim();if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttentionFromApi,250)}).observe(body,{childList:true,subtree:true,characterData:true})};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function run(){styles();fixNav();mobileAsk();evidenceSync()}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;styles();fixNav()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();