(() => {
  const STYLE_ID='state-attention-alignment';
  const PASS='r75-layout-ownership';

  document.getElementById(STYLE_ID)?.remove();
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Preserve record surfaces that already passed visual QA. */
    html body .open-items-page .open-items-section,
    html body .open-items-page .open-items-section-head{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-body{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .notes-page .note-results,
    html body .notes-page #notesList{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .history-page .history-list,
    html body .history-page #historyList{width:100%!important;max-width:none!important;box-sizing:border-box!important;padding-top:20px!important;background:var(--surface,#fff)!important;box-shadow:none!important}

    /* Current State header owns its icon, title, support copy, and Browse action. */
    html body .workspace-below-grid{align-items:start!important;grid-auto-rows:min-content!important}
    html body .workspace-status-card{align-self:start!important;height:auto!important;min-height:0!important;display:block!important;position:relative!important}
    html body .workspace-status-card>.eyebrow{display:grid!important;grid-template-columns:36px minmax(0,1fr) auto!important;grid-template-rows:auto auto!important;column-gap:12px!important;row-gap:3px!important;align-items:center!important;min-height:0!important;height:auto!important;margin:0 0 10px!important;padding-left:0!important;font-size:0!important;position:relative!important}
    html body .workspace-status-card>.eyebrow>.section-icon{position:static!important;grid-column:1!important;grid-row:1 / span 2!important;align-self:center!important;justify-self:start!important;transform:none!important;margin:0!important}
    html body .workspace-status-card>.eyebrow::after{grid-column:2!important;grid-row:1!important;align-self:end!important;margin:0!important;line-height:1.2!important}
    html body .workspace-status-card .current-state-support{grid-column:2!important;grid-row:2!important;align-self:start!important;margin:0!important;padding:0!important;color:#64718a!important;font-size:12px!important;font-weight:500!important;letter-spacing:0!important;text-transform:none!important;line-height:1.4!important}
    html body .workspace-status-card .current-state-browse{grid-column:3!important;grid-row:1!important;align-self:center!important;justify-self:end!important;position:static!important;margin:0!important;white-space:nowrap!important;font-size:11.5px!important}
    html body .workspace-status-card .workspace-status-body{display:block!important;flex:0 0 auto!important;height:auto!important;min-height:0!important;margin-top:0!important}
    html body .workspace-status-card .state-fact-preview{display:block!important;flex:0 0 auto!important;height:auto!important;min-height:0!important;padding-top:0!important;justify-content:flex-start!important}
    html body .workspace-status-card .state-fact-preview>ul{margin:0!important}

    /* Attention header is one real row. Quickwins may create the icon, but it no longer positions it absolutely. */
    html body .workspace-attention .workspace-attention-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important}
    html body .workspace-attention .workspace-attention-head>div{display:flex!important;align-items:center!important;gap:12px!important;min-width:0!important;min-height:38px!important;padding-left:0!important;position:static!important;flex:1 1 auto!important}
    html body .workspace-attention .workspace-attention-head .attention-head-icon{position:static!important;display:grid!important;place-items:center!important;flex:0 0 38px!important;width:38px!important;height:38px!important;margin:0!important;transform:none!important;top:auto!important;left:auto!important}
    html body .workspace-attention .workspace-attention-head h3{margin:0!important;line-height:1.25!important;align-self:center!important}
    html body .workspace-attention .workspace-attention-head .eyebrow,
    html body .workspace-attention .workspace-attention-head p{display:none!important}

    /* Other Sources is a readable list, not a nested two-column grid. */
    html body .settings-page .settings-source-grid{display:block!important;grid-template-columns:none!important;gap:0!important}
    html body .settings-page .settings-source-grid>.source-row{display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-start!important;gap:7px!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:12px 0!important;border-top:1px solid #e5e8ed!important}
    html body .settings-page .settings-source-grid>.source-row:first-child{border-top:0!important}
    html body .settings-page .settings-source-grid>.source-row>div{order:1!important;width:100%!important;min-width:0!important}
    html body .settings-page .settings-source-grid>.source-row>.settings-status{order:2!important;align-self:flex-start!important;margin:0 0 0 26px!important;width:max-content!important;max-width:calc(100% - 26px)!important;white-space:nowrap!important}
    html body .settings-page .settings-source-grid .source-title,
    html body .settings-page .settings-source-grid .source-description{min-width:0!important;max-width:100%!important}

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
      html body .workspace-status-card>.eyebrow{grid-template-columns:36px minmax(0,1fr)!important}
      html body .workspace-status-card .current-state-browse{grid-column:2!important;grid-row:3!important;justify-self:start!important;margin-top:5px!important}
      html body .workspace-attention .workspace-attention-head{display:flex!important}
    }
  `;
  document.head.appendChild(style);

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  function normalizeCurrentState(scope=document){
    scope.querySelectorAll?.('.workspace-status-card').forEach(card=>{
      const eyebrow=card.querySelector(':scope > .eyebrow');
      const preview=card.querySelector('.state-fact-preview');
      const body=card.querySelector('.workspace-status-body');
      if(!eyebrow||!preview) return;

      let support=eyebrow.querySelector(':scope > .current-state-support');
      const oldSupport=preview.querySelector(':scope > p');
      if(!support&&oldSupport){
        support=oldSupport;
        support.classList.add('current-state-support');
        eyebrow.appendChild(support);
      }

      let browse=eyebrow.querySelector(':scope > .current-state-browse');
      const oldBrowse=preview.querySelector(':scope > .text-button');
      if(!browse&&oldBrowse){
        browse=oldBrowse;
        browse.classList.add('current-state-browse');
        eyebrow.appendChild(browse);
      }

      important(card,'align-self','start');
      important(card,'height','auto');
      important(card,'min-height','0');
      important(body,'display','block');
      important(body,'flex','0 0 auto');
      important(body,'height','auto');
      important(body,'min-height','0');
      important(preview,'display','block');
      important(preview,'flex','0 0 auto');
      important(preview,'height','auto');
      important(preview,'min-height','0');
      important(preview,'justify-content','flex-start');
      important(preview,'padding-top','0');
    });
    const grid=scope.querySelector?.('.workspace-below-grid');
    important(grid,'align-items','start');
    important(grid,'grid-auto-rows','min-content');
  }

  function normalizeAttention(scope=document){
    scope.querySelectorAll?.('.workspace-attention').forEach(section=>{
      const head=section.querySelector('.workspace-attention-head');
      const copy=head?.querySelector(':scope > div');
      const icon=copy?.querySelector('.attention-head-icon');
      const title=copy?.querySelector('h3');
      if(!head||!copy||!title) return;
      important(head,'display','flex');
      important(head,'align-items','flex-start');
      important(copy,'display','flex');
      important(copy,'align-items','center');
      important(copy,'gap','12px');
      important(copy,'padding-left','0');
      important(copy,'position','static');
      important(copy,'min-height','38px');
      if(icon){
        important(icon,'position','static');
        important(icon,'flex','0 0 38px');
        important(icon,'width','38px');
        important(icon,'height','38px');
        important(icon,'margin','0');
        important(icon,'transform','none');
        important(icon,'top','auto');
        important(icon,'left','auto');
      }
      important(title,'margin','0');
      important(title,'align-self','center');
    });
  }

  function normalizeSettings(scope=document){
    const grid=scope.querySelector?.('.settings-page .settings-source-grid');
    if(!grid) return;
    important(grid,'display','block');
    important(grid,'grid-template-columns','none');
    important(grid,'gap','0');
    grid.querySelectorAll(':scope > .source-row').forEach((row,index)=>{
      const content=row.querySelector(':scope > div');
      const status=row.querySelector(':scope > .settings-status');
      important(row,'display','flex');
      important(row,'flex-direction','column');
      important(row,'align-items','flex-start');
      important(row,'gap','7px');
      important(row,'width','100%');
      important(row,'min-width','0');
      important(row,'box-sizing','border-box');
      important(row,'border-top',index===0?'0':'1px solid #e5e8ed');
      if(content){important(content,'order','1');important(content,'width','100%');important(content,'min-width','0')}
      if(status){important(status,'order','2');important(status,'align-self','flex-start');important(status,'margin','0 0 0 26px');important(status,'width','max-content');important(status,'max-width','calc(100% - 26px)')}
    });
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

  function sync(){
    document.documentElement.dataset.stateMobilePass=PASS;
    normalizeCurrentState(document);
    normalizeAttention(document);
    normalizeSettings(document);
    syncAskBlankGuard();
  }

  let queued=false;
  function schedule(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;sync()});
  }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();