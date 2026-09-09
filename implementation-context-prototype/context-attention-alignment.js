(() => {
  const STYLE_ID='state-attention-alignment';
  if(document.getElementById(STYLE_ID)) return;

  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Preserve the record-surface cleanup that already proved stable. */
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
      /* Other Sources is structurally one column on small screens. The status
         is moved into the source copy block by syncSettingsRows(), so there is
         no second grid column left to squeeze the title/description. */
      html body .settings-page .settings-source-grid{display:block!important;grid-template-columns:none!important;gap:0!important}
      html body .settings-page .settings-source-grid>.source-row{display:block!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}
      html body .settings-page .settings-source-grid>.source-row>div{width:100%!important;min-width:0!important}
      html body .settings-page .settings-source-grid .source-description{max-width:100%!important}
      html body .settings-page .settings-source-grid .settings-status[data-mobile-source-status]{display:inline-flex!important;width:max-content!important;max-width:calc(100% - 26px)!important;margin:8px 0 0 26px!important;white-space:nowrap!important}
    }

    @media(max-width:760px){
      html body .settings-page>.page-head{display:block!important}
      html body .settings-page>.page-head>p{margin-top:7px!important;max-width:none!important}

      html body .notes-page .note-index-status{display:flex!important;flex-wrap:wrap!important;justify-self:start!important;align-self:start!important;width:100%!important;min-width:0!important;max-width:100%!important;margin-left:0!important}
      html body .notes-page .note-index-status .note-status,
      html body .notes-page .note-index-status .note-status-link{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;width:auto!important;max-width:100%!important;height:auto!important;min-height:26px!important;padding:5px 9px!important;border-radius:999px!important;line-height:1.25!important;white-space:nowrap!important}
      html body .settings-page .settings-rule-form>.btn{width:auto!important;min-width:0!important;height:38px!important;min-height:38px!important;padding:0 12px!important;border-radius:8px!important;font-size:12px!important;line-height:1.2!important;align-self:end!important}

      /* The two Workspace cards used to stretch to the same grid-row height.
         Combined with an older flex:1/space-evenly preview rule, that created
         the large fake gap under Current State. Stop the stretch at the grid
         and card level, then let the content flow naturally. */
      html body .workspace-below-grid{align-items:start!important}
      html body .workspace-status-card{height:auto!important;min-height:0!important;align-self:start!important;display:block!important;position:relative!important}
      html body .workspace-status-card>.eyebrow{height:auto!important;min-height:36px!important;margin:0!important;line-height:1.2!important}
      html body .workspace-status-card .workspace-status-body{height:auto!important;min-height:0!important;margin-top:0!important;display:block!important;flex:none!important}
      html body .workspace-status-card .state-fact-preview{height:auto!important;min-height:0!important;display:block!important;flex:none!important;justify-content:flex-start!important;padding-top:0!important}
      html body .workspace-status-card .state-fact-preview p{margin:4px 0 10px!important;padding:0!important;line-height:1.4!important}
      html body .workspace-status-card .state-fact-preview ul{margin:0!important}
      html body .workspace-status-card .state-fact-preview>.text-button{position:absolute!important;top:14px!important;right:16px!important;margin:0!important}

      /* Quickwins injects .attention-head-icon. Older cleanup targeted a
         different class name, so the icon could survive and stay misaligned.
         syncAttentionHeader() removes either variant; these rules also remove
         the 50px indentation that existed only to make room for that icon. */
      html body .workspace-attention .workspace-attention-head>div{padding-left:0!important;min-height:0!important}
      html body .workspace-attention .workspace-attention-head h3{margin:0!important;line-height:1.3!important}
      html body .workspace-attention .workspace-attention-head .attention-head-icon,
      html body .workspace-attention .workspace-attention-head .state-attention-head-icon{display:none!important}
    }
  `;
  document.head.appendChild(style);

  function syncSettingsRows(){
    const mobile=matchMedia('(max-width:900px)').matches;
    document.querySelectorAll('.settings-page .settings-source-grid>.source-row').forEach(row=>{
      const copy=row.querySelector(':scope > div');
      const directStatus=row.querySelector(':scope > .settings-status');
      const movedStatus=copy?.querySelector(':scope > .settings-status[data-mobile-source-status]');
      if(mobile){
        const status=directStatus||movedStatus;
        if(copy&&status&&status.parentElement!==copy){
          status.dataset.mobileSourceStatus='1';
          copy.appendChild(status);
        }
      }else if(movedStatus){
        movedStatus.removeAttribute('data-mobile-source-status');
        row.appendChild(movedStatus);
      }
    });
  }

  function syncAttentionHeader(){
    if(!matchMedia('(max-width:760px)').matches) return;
    document.querySelectorAll('.workspace-attention .workspace-attention-head .attention-head-icon, .workspace-attention .workspace-attention-head .state-attention-head-icon').forEach(icon=>icon.remove());
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

  let queued=false;
  function sync(){
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      syncSettingsRows();
      syncAttentionHeader();
      syncAskBlankGuard();
    });
  }

  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',sync,{passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sync,{once:true}); else sync();
})();
