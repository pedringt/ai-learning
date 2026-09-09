(() => {
  const STYLE_ID='state-attention-alignment';
  if(document.getElementById(STYLE_ID)) return;

  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    html body .open-items-page .open-items-section,
    html body .open-items-page .open-items-section-head{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-body{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .notes-page .note-results,
    html body .notes-page #notesList{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .history-page .history-list,
    html body .history-page #historyList{width:100%!important;max-width:none!important;box-sizing:border-box!important;padding-top:20px!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .history-page .history-entry,
    html body .history-page .history-entry-body{background:transparent!important}
    html body .settings-page>.page-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:28px!important}
    html body .settings-page>.page-head>h2{margin:0!important;flex:0 0 auto!important}
    html body .settings-page>.page-head>p{margin:0!important;max-width:620px!important;line-height:1.45!important}
    html body .overview-stage .workspace-next-arrow{display:none!important}

    @media(max-width:900px){
      html body .settings-page .settings-source-grid{display:block!important;grid-template-columns:none!important;gap:0!important}
      html body .settings-page .settings-source-grid>.source-row{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto!important;gap:8px!important;align-items:start!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}
      html body .settings-page .settings-source-grid>.source-row>div{grid-column:1!important;grid-row:1!important;width:100%!important;min-width:0!important}
      html body .settings-page .settings-source-grid>.source-row>.settings-status{grid-column:1!important;grid-row:2!important;justify-self:start!important;align-self:start!important;width:max-content!important;max-width:calc(100% - 26px)!important;margin:0 0 0 26px!important;white-space:nowrap!important}
      html body .settings-page .settings-source-grid .source-description{max-width:100%!important;overflow-wrap:anywhere!important}
    }

    @media(max-width:760px){
      html body .settings-page>.page-head{display:block!important}
      html body .settings-page>.page-head>p{margin-top:7px!important;max-width:none!important}
      html body .notes-page .note-index-status{display:flex!important;flex-wrap:wrap!important;justify-self:start!important;align-self:start!important;width:100%!important;min-width:0!important;max-width:100%!important;margin-left:0!important}
      html body .notes-page .note-index-status .note-status,
      html body .notes-page .note-index-status .note-status-link{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;width:auto!important;max-width:100%!important;height:auto!important;min-height:26px!important;padding:5px 9px!important;border-radius:999px!important;line-height:1.25!important;white-space:nowrap!important}
      html body .settings-page .settings-rule-form>.btn{width:auto!important;min-width:0!important;height:38px!important;min-height:38px!important;padding:0 12px!important;border-radius:8px!important;font-size:12px!important;line-height:1.2!important;align-self:end!important}
      html body .workspace-below-grid{align-items:start!important}
      html body .workspace-status-card{height:auto!important;min-height:0!important;align-self:start!important;display:block!important;position:relative!important}
      html body .workspace-status-card>.eyebrow{height:auto!important;min-height:36px!important;margin:0!important;line-height:1.2!important}
      html body .workspace-status-card .workspace-status-body{height:auto!important;min-height:0!important;margin-top:0!important;display:block!important;flex:none!important}
      html body .workspace-status-card .state-fact-preview{height:auto!important;min-height:0!important;display:block!important;flex:none!important;justify-content:flex-start!important;padding-top:0!important}
      html body .workspace-status-card .state-fact-preview p{margin:4px 0 10px!important;padding:0!important;line-height:1.4!important}
      html body .workspace-status-card .state-fact-preview ul{margin:0!important}
      html body .workspace-status-card .state-fact-preview>.text-button{position:absolute!important;top:14px!important;right:16px!important;margin:0!important}
      html body .workspace-attention .workspace-attention-head>div{padding-left:0!important;min-height:0!important}
      html body .workspace-attention .workspace-attention-head h3{margin:0!important;line-height:1.3!important}
    }
  `;
  document.head.appendChild(style);

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  function forceSettings(){
    if(!matchMedia('(max-width:900px)').matches) return;
    const grid=document.querySelector('.settings-page .settings-source-grid');
    if(!grid) return;
    important(grid,'display','block');
    important(grid,'grid-template-columns','none');
    important(grid,'gap','0');
    grid.querySelectorAll(':scope > .source-row').forEach(row=>{
      const copy=row.querySelector(':scope > div');
      const status=row.querySelector(':scope > .settings-status');
      important(row,'display','grid');
      important(row,'grid-template-columns','minmax(0,1fr)');
      important(row,'grid-template-rows','auto auto');
      important(row,'gap','8px');
      important(row,'align-items','start');
      important(row,'width','100%');
      important(row,'min-width','0');
      important(row,'box-sizing','border-box');
      if(copy){important(copy,'grid-column','1');important(copy,'grid-row','1');important(copy,'width','100%');important(copy,'min-width','0');}
      if(status){important(status,'grid-column','1');important(status,'grid-row','2');important(status,'justify-self','start');important(status,'align-self','start');important(status,'margin','0 0 0 26px');important(status,'width','max-content');important(status,'max-width','calc(100% - 26px)');}
    });
  }

  function forceCurrentState(){
    if(!matchMedia('(max-width:760px)').matches) return;
    const grid=document.querySelector('.workspace-below-grid');
    const card=document.querySelector('.workspace-status-card');
    const eyebrow=card?.querySelector(':scope > .eyebrow');
    const body=card?.querySelector('.workspace-status-body');
    const preview=card?.querySelector('.state-fact-preview');
    const support=preview?.querySelector(':scope > p');
    const list=preview?.querySelector(':scope > ul');
    const browse=preview?.querySelector(':scope > .text-button');
    important(grid,'align-items','start');
    if(!card) return;
    important(card,'height','auto');
    important(card,'min-height','0');
    important(card,'align-self','start');
    important(card,'display','block');
    important(card,'position','relative');
    if(eyebrow){important(eyebrow,'height','auto');important(eyebrow,'min-height','36px');important(eyebrow,'margin','0');important(eyebrow,'line-height','1.2');}
    if(body){important(body,'height','auto');important(body,'min-height','0');important(body,'margin-top','0');important(body,'display','block');important(body,'flex','none');}
    if(preview){important(preview,'height','auto');important(preview,'min-height','0');important(preview,'display','block');important(preview,'flex','none');important(preview,'justify-content','flex-start');important(preview,'padding-top','0');}
    if(support){important(support,'margin','4px 0 10px');important(support,'padding','0');important(support,'line-height','1.4');}
    if(list) important(list,'margin','0');
    if(browse){important(browse,'position','absolute');important(browse,'top','14px');important(browse,'right','16px');important(browse,'margin','0');}
  }

  function forceAttention(){
    if(!matchMedia('(max-width:760px)').matches) return;
    document.querySelectorAll('.workspace-attention .workspace-attention-head').forEach(head=>{
      const copy=head.querySelector(':scope > div');
      const icon=copy?.querySelector('.attention-head-icon,.state-attention-head-icon');
      const title=copy?.querySelector('h3');
      const intro=copy?.querySelector('p');
      if(!copy||!title) return;
      important(copy,'position','relative');
      important(copy,'display','grid');
      important(copy,'grid-template-columns',icon?'38px minmax(0,1fr)':'minmax(0,1fr)');
      important(copy,'grid-template-rows','auto auto');
      important(copy,'column-gap',icon?'10px':'0');
      important(copy,'row-gap','2px');
      important(copy,'align-items','center');
      important(copy,'padding-left','0');
      important(copy,'min-height','0');
      if(icon){important(icon,'position','static');important(icon,'grid-column','1');important(icon,'grid-row','1 / span 2');important(icon,'align-self','center');important(icon,'justify-self','center');important(icon,'transform','none');important(icon,'top','auto');important(icon,'left','auto');important(icon,'margin','0');}
      important(title,'grid-column',icon?'2':'1');
      important(title,'grid-row','1');
      important(title,'align-self','end');
      important(title,'margin','0');
      important(title,'line-height','1.25');
      if(intro){important(intro,'grid-column',icon?'2':'1');important(intro,'grid-row','2');important(intro,'align-self','start');important(intro,'margin','0');}
    });
  }

  function syncAskBlankGuard(){
    const input=document.getElementById('askStateDrawerInput');
    const form=input?.closest('[data-review-batch-form="ask"]');
    const submit=form?.querySelector('button[type="submit"]');
    if(!input||!form) return;
    input.required=true;
    const blank=!input.value.trim();
    if(submit){submit.disabled=blank;submit.setAttribute('aria-disabled',blank?'true':'false');}
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
  window.addEventListener('pointerdown',event=>{if(closeTarget(event))shieldMobileNav();},true);
  window.addEventListener('touchstart',event=>{if(closeTarget(event))shieldMobileNav();},{capture:true,passive:true});
  document.addEventListener('click',event=>{if(closeTarget(event))shieldMobileNav();},true);
  document.addEventListener('input',event=>{if(event.target?.id==='askStateDrawerInput')syncAskBlankGuard();},true);

  function run(){
    document.documentElement.dataset.stateMobilePass='r73';
    forceSettings();
    forceCurrentState();
    forceAttention();
    syncAskBlankGuard();
  }

  let queued=false;
  function sync(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;run();});
  }

  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',sync,{passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sync,{once:true}); else sync();
})();
