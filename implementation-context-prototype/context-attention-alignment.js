(() => {
  const id='state-attention-alignment';
  if(document.getElementById(id)) return;

  const style=document.createElement('style');
  style.id=id;
  style.textContent=`
    /* Keep the working record-surface cleanup, but stop restyling the same
       mobile component structure from several different late CSS blocks. */
    html body .open-items-page .open-items-section{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-head{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-body{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .open-items-page .review-card,
    html body .open-items-page .compact-review,
    html body .open-items-page .review-card-toggle,
    html body .open-items-page .review-card-body,
    html body .open-items-page .open-question-list,
    html body .open-items-page details.open-question-item{width:100%!important;max-width:none!important;background:transparent!important;box-shadow:none!important}

    html body .notes-page .note-results,
    html body .notes-page #notesList{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .notes-page article.simple-note.note-index-row{width:100%!important;max-width:none!important;background:transparent!important}

    html body .history-page .history-list,
    html body .history-page #historyList{width:100%!important;max-width:none!important;box-sizing:border-box!important;padding-top:20px!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .history-page .history-entry,
    html body .history-page .history-entry-body{background:transparent!important}

    html body .settings-page>.page-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:28px!important}
    html body .settings-page>.page-head>h2{margin:0!important;flex:0 0 auto!important}
    html body .settings-page>.page-head>p{margin:0!important;max-width:620px!important;line-height:1.45!important}

    html body .overview-stage .workspace-next-arrow{display:none!important}

    @media(max-width:760px){
      html body .settings-page>.page-head{display:block!important}
      html body .settings-page>.page-head>p{margin-top:7px!important;max-width:none!important}

      html body .notes-page .note-index-status{display:flex!important;flex-wrap:wrap!important;justify-self:start!important;align-self:start!important;width:100%!important;min-width:0!important;max-width:100%!important;margin-left:0!important}
      html body .notes-page .note-index-status .note-status,
      html body .notes-page .note-index-status .note-status-link{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;width:auto!important;max-width:100%!important;height:auto!important;min-height:26px!important;padding:5px 9px!important;border-radius:999px!important;line-height:1.25!important;white-space:nowrap!important}

      html body .settings-page .settings-rule-form>.btn{width:auto!important;min-width:0!important;height:38px!important;min-height:38px!important;padding:0 12px!important;border-radius:8px!important;font-size:12px!important;line-height:1.2!important;align-self:end!important}
    }
  `;
  document.head.appendChild(style);

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  function stabilizeSettings(){
    if(!matchMedia('(max-width:900px)').matches) return;
    const grid=document.querySelector('.settings-page .settings-source-grid');
    if(!grid) return;
    important(grid,'display','block');
    important(grid,'grid-template-columns','none');
    important(grid,'gap','0');
    grid.querySelectorAll(':scope > .source-row').forEach((row,index)=>{
      important(row,'display','flex');
      important(row,'flex-direction','column');
      important(row,'align-items','flex-start');
      important(row,'gap','8px');
      important(row,'min-width','0');
      important(row,'width','100%');
      important(row,'box-sizing','border-box');
      if(index===0) important(row,'border-top','0');
      const copy=row.querySelector(':scope > div');
      const status=row.querySelector(':scope > .settings-status');
      if(copy){important(copy,'order','1');important(copy,'width','100%');important(copy,'min-width','0')}
      if(status){important(status,'order','2');important(status,'align-self','flex-start');important(status,'margin','0 0 0 26px');important(status,'width','max-content');important(status,'max-width','calc(100% - 26px)')}
    });
  }

  function stabilizeCurrentState(){
    if(!matchMedia('(max-width:760px)').matches) return;
    const card=document.querySelector('.workspace-status-card');
    const preview=card?.querySelector('.state-fact-preview');
    const eyebrow=card?.querySelector(':scope > .eyebrow');
    const body=card?.querySelector('.workspace-status-body');
    const support=preview?.querySelector(':scope > p');
    const list=preview?.querySelector(':scope > ul');
    const browse=preview?.querySelector(':scope > .text-button');
    if(!card||!preview) return;

    important(card,'display','block');
    important(card,'position','relative');
    if(eyebrow){important(eyebrow,'display','flex');important(eyebrow,'align-items','center');important(eyebrow,'min-height','0');important(eyebrow,'margin','0 88px 0 0');important(eyebrow,'line-height','1.2')}
    if(body){important(body,'display','block');important(body,'flex','0 0 auto');important(body,'margin-top','0')}
    important(preview,'display','block');
    important(preview,'flex','0 0 auto');
    important(preview,'justify-content','flex-start');
    important(preview,'padding-top','0');
    if(support){important(support,'margin','3px 0 10px');important(support,'padding','0');important(support,'line-height','1.4')}
    if(list) important(list,'margin','0');
    if(browse){important(browse,'position','absolute');important(browse,'top','14px');important(browse,'right','16px');important(browse,'margin','0')}
  }

  function stabilizeAttentionHeader(){
    if(!matchMedia('(max-width:760px)').matches) return;
    const head=document.querySelector('.workspace-attention .workspace-attention-head');
    const copy=head?.querySelector(':scope > div');
    const icon=head?.querySelector('.attention-head-icon');
    const title=head?.querySelector('h3');
    if(!head||!copy||!title) return;

    important(head,'display','flex');
    important(head,'align-items','flex-start');
    important(copy,'position','relative');
    important(copy,'display','grid');
    important(copy,'grid-template-columns','36px minmax(0,1fr)');
    important(copy,'grid-template-rows','auto auto');
    important(copy,'column-gap','8px');
    important(copy,'align-items','center');
    important(copy,'padding-left','0');
    important(copy,'min-height','0');
    if(icon){
      important(icon,'position','static');
      important(icon,'grid-column','1');
      important(icon,'grid-row','1 / span 2');
      important(icon,'align-self','center');
      important(icon,'transform','none');
      important(icon,'top','auto');
      important(icon,'left','auto');
    }
    const eyebrow=copy.querySelector('.eyebrow');
    if(eyebrow){important(eyebrow,'grid-column','2');important(eyebrow,'grid-row','1');important(eyebrow,'margin','0')}
    important(title,'grid-column','2');
    important(title,'grid-row','2');
    important(title,'margin','0');
    important(title,'align-self','start');
  }

  function syncAskBlankGuard(){
    const input=document.getElementById('askStateDrawerInput');
    const form=input?.closest('[data-review-batch-form="ask"]');
    const submit=form?.querySelector('button[type="submit"]');
    if(!input||!form) return;
    input.required=true;
    const blank=!input.value.trim();
    if(submit){submit.disabled=blank;submit.setAttribute('aria-disabled',blank?'true':'false')}
  }

  let closeShieldTimer=0;
  function shieldMobileNav(){
    if(!matchMedia('(max-width:760px)').matches) return;
    document.body.classList.add('state-ask-close-shield');
    clearTimeout(closeShieldTimer);
    closeShieldTimer=setTimeout(()=>document.body.classList.remove('state-ask-close-shield'),600);
  }
  const shieldStyle=document.createElement('style');
  shieldStyle.textContent='@media(max-width:760px){body.state-ask-close-shield .top-actions,body.state-ask-close-shield .mobile-menu-button,body.state-ask-close-shield [data-mobile-menu]{pointer-events:none!important}}';
  document.head.appendChild(shieldStyle);

  const closeTarget=event=>event.target?.closest?.('#askStateDrawer [data-review-batch-action="close-ask"],#askStateDrawer .ask-state-drawer-close');
  window.addEventListener('pointerdown',event=>{if(closeTarget(event))shieldMobileNav()},true);
  window.addEventListener('touchstart',event=>{if(closeTarget(event))shieldMobileNav()},{capture:true,passive:true});
  document.addEventListener('click',event=>{if(closeTarget(event))shieldMobileNav()},true);
  document.addEventListener('input',event=>{if(event.target?.id==='askStateDrawerInput')syncAskBlankGuard()},true);

  let queued=false;
  function sync(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      stabilizeSettings();
      stabilizeCurrentState();
      stabilizeAttentionHeader();
      syncAskBlankGuard();
    });
  }

  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',sync,{passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sync,{once:true}); else sync();
})();
