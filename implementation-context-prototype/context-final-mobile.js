(() => {
  const STYLE_ID = 'state-final-mobile-r63';
  const CHECKLIST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/><path d="m7.5 12 1 1 1.7-2"/></svg>';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Product chrome */
      html body:not(.v88-dark) .prototype-productbar{background:#1769e8!important;border-bottom-color:#145fcf!important;color:#fff!important}
      html body:not(.v88-dark) .prototype-productbar .product-name,
      html body:not(.v88-dark) .prototype-productbar .product-mark,
      html body:not(.v88-dark) .prototype-productbar .product-divider,
      html body:not(.v88-dark) .prototype-productbar .product-tagline{color:#fff!important;opacity:1!important}
      html body:not(.v88-dark) .prototype-productbar .product-tagline{font-weight:600!important}

      /* Workspace attention: one clean surface, no alert chrome. */
      html body .workspace-attention{border:1px solid #dfe5ed!important;border-top:1px solid #dfe5ed!important;background:#fff!important;box-shadow:none!important}
      html body .workspace-attention::before,
      html body .workspace-attention::after,
      html body .workspace-attention .workspace-attention-head::before,
      html body .workspace-attention .workspace-attention-head::after{content:none!important;display:none!important}
      html body .workspace-attention .workspace-attention-head{display:grid!important;grid-template-columns:42px minmax(0,1fr) auto!important;gap:12px!important;align-items:start!important}
      html body .workspace-attention .workspace-attention-head>.state-attention-head-icon{display:grid!important;place-items:center!important;width:36px!important;height:36px!important;margin-top:0!important;border:1px solid #cfe0fa!important;border-radius:10px!important;background:#edf4ff!important;color:#1769e8!important}
      html body .workspace-attention .workspace-attention-head>.state-attention-head-icon svg{width:21px!important;height:21px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      html body .workspace-attention .workspace-attention-head>div{grid-column:2!important;min-width:0!important}
      html body .workspace-attention .workspace-attention-head>.text-button{grid-column:3!important;align-self:start!important}
      html body .workspace-attention .workspace-attention-head h3{margin-top:1px!important}
      html body .workspace-attention .attention-row-icon{align-self:start!important;margin-top:1px!important}

      /* Open Items: one structural grammar across Reviews and Questions. */
      html body .open-items-page .open-items-section,
      html body .open-items-page .open-items-reviews,
      html body .open-items-page .open-items-blockers,
      html body .open-items-page .open-items-questions,
      html body .open-items-page .open-items-drafts{border:0!important;border-left:0!important;box-shadow:none!important;background:transparent!important}
      html body .open-items-page .open-items-section-head,
      html body .open-items-page .open-items-reviews .open-items-section-head,
      html body .open-items-page .open-items-blockers .open-items-section-head,
      html body .open-items-page .open-items-questions .open-items-section-head,
      html body .open-items-page .open-items-drafts .open-items-section-head{background:transparent!important;background-image:none!important;border:0!important;border-bottom:1px solid #dde3ea!important;box-shadow:none!important}
      html body .open-items-page .open-items-kicker{color:#7b8494!important}
      html body .open-items-page .open-items-blockers .open-items-kicker{color:#9a681e!important}
      html body .open-items-page .review-card:first-child .review-card-toggle,
      html body .open-items-page .review-card.is-expanded .review-card-toggle{border-left:0!important;padding-left:8px!important}
      html body .open-items-page .review-card.is-expanded .review-card-toggle{background:#fafbfc!important;border-radius:8px!important}
      html body .open-items-page .open-item-label,
      html body .open-items-page .open-item-label.blocking,
      html body .open-items-page .open-item-label.question{display:inline-flex!important;width:max-content!important;max-width:100%!important;min-width:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;white-space:nowrap!important;font-size:10.5px!important;line-height:1.25!important;letter-spacing:.055em!important}
      html body .open-items-page .open-item-label.blocking{color:#95601d!important}
      html body .open-items-page .open-item-label.blocking::before{content:'•';margin-right:5px;font-size:13px;line-height:.9;color:#c18a3d}
      html body .open-items-page .open-item-label.question{color:#526c91!important}
      html body .open-items-page .open-question-row.is-blocking{border-left:0!important;padding-left:4px!important}
      html body .open-items-page .open-question-row,
      html body .open-items-page .open-items-section,
      html body .open-items-page .open-items-section-body{overflow-anchor:none!important}

      /* Expanded Notes really show the whole note. */
      html body .notes-page .note-index-row.is-expanded .note-full-text{display:block!important;-webkit-line-clamp:unset!important;-webkit-box-orient:initial!important;overflow:visible!important;max-height:none!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:break-word!important}

      /* Readability floor against older late-loaded polish rules. */
      html body .open-items-page .review-source-meta,
      html body .open-items-page .open-question-meta,
      html body .open-items-page details.reasoning summary,
      html body .open-items-page details.reasoning p{font-size:12px!important;line-height:1.45!important}
      html body .notes-page .note-source,
      html body .notes-page .note-date,
      html body .notes-page .note-expand-label,
      html body .notes-page .note-index-row .text-button{font-size:11.5px!important}
      html body .history-page .history-entry-date,
      html body .history-page .decision-line{font-size:11.5px!important}
      html body .settings-page .settings-section p,
      html body .settings-page .settings-behavior-list li,
      html body .settings-page .source-description,
      html body .settings-page .slack-preview-row span,
      html body .settings-page .settings-rule-copy span{font-size:12.5px!important;line-height:1.48!important}
      html body #askStateDrawer .ask-live-answer .result-lede,
      html body #askStateDrawer .ask-live-answer .ask-answer-summary,
      html body #askStateDrawer .ask-item-text{font-size:13px!important;line-height:1.5!important}
      html body #askStateDrawer .ask-item-detail,
      html body #askStateDrawer .ask-item-action,
      html body #askStateDrawer .ask-item-link,
      html body #askStateDrawer .ask-state-actions .text-button,
      html body #askStateDrawer .ask-copy-answer{font-size:11.5px!important}

      @media(max-width:760px){
        /* view-root already owns the phone gutter; don't double-pad it. */
        html body .app-workspace{padding-left:0!important;padding-right:0!important}
        html body .prototype-productbar{align-items:center!important;flex-wrap:nowrap!important;padding:10px 14px!important;min-height:48px!important}
        html body .prototype-productbar .product-name{font-size:18px!important}
        html body .prototype-productbar .product-tagline{font-size:11.5px!important;line-height:1.3!important;min-width:0!important}

        html body .workspace-attention .workspace-attention-head{grid-template-columns:36px minmax(0,1fr)!important;gap:10px!important}
        html body .workspace-attention .workspace-attention-head>.state-attention-head-icon{width:32px!important;height:32px!important;border-radius:9px!important}
        html body .workspace-attention .workspace-attention-head>.state-attention-head-icon svg{width:19px!important;height:19px!important}
        html body .workspace-attention .workspace-attention-head>.text-button{grid-column:2!important;margin-top:7px!important;justify-self:start!important}
        html body .workspace-attention .workspace-attention-head h3{font-size:16px!important;line-height:1.3!important}

        html body .open-items-page .review-card:first-child .review-card-toggle,
        html body .open-items-page .review-card.is-expanded .review-card-toggle{padding-left:4px!important}
        html body .open-items-page .open-question-row.is-blocking{padding-left:4px!important}
        html body .open-items-page .open-item-label.blocking{white-space:normal!important}

        html body .dialog-close,
        html body #askStateDrawer .ask-state-drawer-close{width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important}
        html body .settings-page .settings-actions .btn,
        html body .settings-page .slack-preview-row button{min-height:42px!important;height:42px!important}
        html body .notes-page .note-index-row .text-button{min-height:38px!important;padding:7px 8px!important;display:inline-flex!important;align-items:center!important}
        html body #askStateDrawer .ask-copy-answer,
        html body #askStateDrawer .ask-item-action,
        html body #askStateDrawer .ask-item-link{min-height:34px!important;display:inline-flex!important;align-items:center!important;padding:5px 6px!important}
      }
      @media(max-width:480px){
        html body .prototype-productbar .product-tagline,
        html body .prototype-productbar .product-divider{display:none!important}
        html body .prototype-productbar{gap:8px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function syncWorkspaceAttentionIcon(){
    document.querySelectorAll('.workspace-attention .workspace-attention-head').forEach(head=>{
      let icon=head.querySelector(':scope > .state-attention-head-icon');
      if(!icon){
        icon=document.createElement('span');
        icon.className='state-attention-head-icon';
        icon.innerHTML=CHECKLIST_ICON;
        head.prepend(icon);
      }
    });
  }

  function installStableOpenItemToggles(){
    if(document.documentElement.dataset.stateOpenItemsStableToggleR63==='1') return;
    document.documentElement.dataset.stateOpenItemsStableToggleR63='1';
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('.open-items-page [data-action="toggle-open-item-section"]');
      if(!button) return;
      const key=button.dataset.section;
      const before=button.getBoundingClientRect().top;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const safeKey=(window.CSS&&CSS.escape)?CSS.escape(key||''):String(key||'').replace(/[^a-z0-9_-]/gi,'');
        const replacement=document.querySelector(`.open-items-page [data-action="toggle-open-item-section"][data-section="${safeKey}"]`);
        if(!replacement) return;
        const after=replacement.getBoundingClientRect().top;
        const delta=after-before;
        if(Math.abs(delta)>1) window.scrollBy({top:delta,left:0,behavior:'auto'});
      }));
    },true);
  }

  function run(){installStyles();syncWorkspaceAttentionIcon();installStableOpenItemToggles();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;installStyles();syncWorkspaceAttentionIcon();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();