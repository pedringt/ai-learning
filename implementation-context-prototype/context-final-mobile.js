(() => {
  const STYLE_ID = 'state-final-mobile-r66';
  let movingStyle=false;

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Product chrome: quiet separation from the portfolio, not a colored banner. */
      html body:not(.v88-dark) .prototype-productbar{background:#fbfcfd!important;border-bottom:1px solid #d8e1eb!important;color:#1e3048!important;box-shadow:none!important}
      html body:not(.v88-dark) .prototype-productbar .product-name,
      html body:not(.v88-dark) .prototype-productbar .product-mark{color:#1e3048!important;opacity:1!important}
      html body:not(.v88-dark) .prototype-productbar .product-divider{color:#9aa8b8!important;opacity:1!important}
      html body:not(.v88-dark) .prototype-productbar .product-tagline{color:#617086!important;font-weight:600!important;opacity:1!important}

      /* Project stage is orientation, not a warning or call to action. */
      html body:not(.v88-dark) .overview-stage{display:inline-flex!important;width:max-content!important;margin-top:7px!important;padding:3px 8px!important;border:1px solid #d9e0e8!important;border-radius:999px!important;background:#f5f7f9!important;color:#647084!important;box-shadow:none!important;font-size:10.5px!important;font-weight:700!important}

      /* Workspace attention: text supplies the hierarchy. No redundant header alert icon. */
      html body .workspace-attention{border:1px solid #dfe5ed!important;border-top:1px solid #dfe5ed!important;background:#fff!important;box-shadow:none!important}
      html body .workspace-attention::before,
      html body .workspace-attention::after,
      html body .workspace-attention .workspace-attention-head::before,
      html body .workspace-attention .workspace-attention-head::after{content:none!important;display:none!important}
      html body .workspace-attention .workspace-attention-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important}
      html body .workspace-attention .workspace-attention-head>.state-attention-head-icon{display:none!important}
      html body .workspace-attention .workspace-attention-head>div{min-width:0!important}
      html body .workspace-attention .workspace-attention-head>.text-button{align-self:flex-start!important}
      html body .workspace-attention .workspace-attention-head h3{margin-top:1px!important}
      html body .workspace-attention .attention-row-icon{align-self:start!important;margin-top:2px!important}

      /* Open Items: reviews are the action queue; question status is semantic, not urgency color. */
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
      html body .open-items-page .open-items-kicker,
      html body .open-items-page .open-items-blockers .open-items-kicker{color:#7b8494!important}
      html body .open-items-page .review-card:first-child .review-card-toggle,
      html body .open-items-page .review-card.is-expanded .review-card-toggle{border-left:0!important;padding-left:8px!important}
      html body .open-items-page .review-card.is-expanded .review-card-toggle{background:#fafbfc!important;border-radius:8px!important}
      html body .open-items-page .open-item-label,
      html body .open-items-page .open-item-label.blocking,
      html body .open-items-page .open-item-label.question{display:inline-flex!important;width:max-content!important;max-width:100%!important;min-width:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;white-space:nowrap!important;font-size:10.5px!important;line-height:1.25!important;letter-spacing:.055em!important;color:#6f7887!important}
      html body .open-items-page .open-item-label.blocking::before{content:'•';margin-right:5px;font-size:13px;line-height:.9;color:#7b8494!important}
      html body .open-items-page .open-item-label.question{color:#6f7887!important}
      html body .open-items-page .open-question-row.is-blocking{border-left:0!important;padding-left:4px!important;background:transparent!important}
      html body .open-items-page .open-question-row,
      html body .open-items-page .open-items-section,
      html body .open-items-page .open-items-section-body{overflow-anchor:auto!important}

      /* History is a flat audit log. Reassert this after every older style pass. */
      html body .history-page #historyList,
      html body .history-page .history-list{border-left:0!important;border-inline-start:0!important;background-image:none!important}
      html body .history-page .history-entry,
      html body .history-page .history-entry:hover,
      html body .history-page .history-entry.is-linked,
      html body .history-page .history-entry.is-linked:hover,
      html body .history-page .history-entry-body,
      html body .history-page .history-entry-body:hover{border-left:0!important;border-inline-start:0!important;background-image:none!important;box-shadow:none!important;transform:none!important;outline:0!important}
      html body .history-page .history-entry::before,
      html body .history-page .history-entry::after,
      html body .history-page .history-entry:hover::before,
      html body .history-page .history-entry:hover::after,
      html body .history-page .history-entry-body::before,
      html body .history-page .history-entry-body::after{content:none!important;display:none!important;border:0!important;box-shadow:none!important}

      /* Expanded Notes really show the whole note. */
      html body .notes-page .note-index-row.is-expanded .note-full-text{display:block!important;-webkit-line-clamp:unset!important;-webkit-box-orient:initial!important;overflow:visible!important;max-height:none!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:break-word!important}

      /* Ask has one control state. The obsolete clear X must never compete with reset. */
      html body #askStateDrawer .state-ask-clear,
      html body #askStateDrawer.has-answer .state-ask-clear,
      html body #askStateDrawer.is-generating .state-ask-clear,
      html body #askStateDrawer.is-editing-answer .state-ask-clear{display:none!important;visibility:hidden!important;pointer-events:none!important}
      html body #askStateDrawer .state-ask-reset::before,
      html body #askStateDrawer .state-ask-reset::after{content:none!important;display:none!important}

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

      /* Evidence intake uses the same neutral + blue action language as State. */
      html body .dialog:has(#addInfoText){background:#fff!important;border:1px solid #dfe5ed!important;box-shadow:0 22px 70px rgba(24,43,70,.16)!important}
      html body .dialog:has(#addInfoText)>.dialog-close{background:#f7f9fc!important;color:#647084!important}
      html body .dialog:has(#addInfoText) .eyebrow,
      html body .dialog:has(#addInfoText) .meta-label{color:#68768a!important}
      html body .dialog:has(#addInfoText) #addInfoText{border-color:#cfd8e4!important;background:#fff!important;box-shadow:none!important}
      html body .dialog:has(#addInfoText) #addInfoText:focus{border-color:#6f9bc8!important;box-shadow:0 0 0 3px #edf4fb!important}
      html body .dialog:has(#addInfoText) .note-example-chips button{border:1px solid #d8e0e9!important;background:#f7f9fb!important;color:#476789!important;box-shadow:none!important}
      html body .dialog:has(#addInfoText) .note-example-chips button:hover{border-color:#b9c9dc!important;background:#f0f5fa!important}
      html body .dialog:has(#addInfoText) [data-action='save-info']{background:#1769e8!important;border-color:#1769e8!important;color:#fff!important}

      /* Evidence analysis uses the same neutral/blue language as the rest of State. */
      html body .dialog:has(.analysis-state){background:#fff!important;border:1px solid #dfe5ed!important;box-shadow:0 22px 70px rgba(24,43,70,.16)!important}
      html body .analysis-state{padding:14px 8px 8px!important}
      html body .analysis-state .eyebrow{color:#64748b!important}
      html body .analysis-state h2{font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-size:21px!important;letter-spacing:-.01em!important;color:#18253a!important}
      html body .analysis-state p{color:#647084!important}
      html body .analysis-orbit{width:48px!important;height:48px!important;margin-bottom:16px!important;border-color:#cbd9ea!important;background:#f7faff!important}
      html body .analysis-orbit::before{inset:10px!important;border-color:#9eb9db!important}
      html body .analysis-orbit span{width:7px!important;height:7px!important;background:#4b82bd!important;box-shadow:0 0 0 4px #e8f1fb!important}
      html body .analysis-orbit span:nth-child(1){top:-3px!important;left:20px!important}
      html body .analysis-progress{border-color:#d8e2ee!important;background:#f7f9fc!important;color:#596579!important}
      html body .analysis-pulse{background:#4b82bd!important}

      @media(max-width:760px){
        html body .app-workspace{padding-left:0!important;padding-right:0!important}
        html body .prototype-productbar{align-items:center!important;flex-wrap:nowrap!important;padding:10px 14px!important;min-height:48px!important}
        html body .prototype-productbar .product-name{font-size:18px!important}
        html body .prototype-productbar .product-tagline{font-size:11.5px!important;line-height:1.3!important;min-width:0!important}
        html body .workspace-attention .workspace-attention-head{display:block!important}
        html body .workspace-attention .workspace-attention-head>.text-button{display:inline-flex!important;margin-top:8px!important}
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

  function keepFinalStyleLast(){
    const style=document.getElementById(STYLE_ID);
    if(!style||style.parentElement!==document.head||document.head.lastElementChild===style||movingStyle) return;
    movingStyle=true;
    document.head.appendChild(style);
    queueMicrotask(()=>{movingStyle=false;});
  }

  function removeWorkspaceAttentionIcon(){
    document.querySelectorAll('.workspace-attention .workspace-attention-head>.state-attention-head-icon').forEach(icon=>icon.remove());
  }

  function reveal(){
    document.documentElement.classList.remove('state-final-mobile-pending');
    if(window.__stateFinalMobileTimer){clearTimeout(window.__stateFinalMobileTimer);delete window.__stateFinalMobileTimer;}
  }

  function run(){installStyles();keepFinalStyleLast();removeWorkspaceAttentionIcon();reveal();}
  let queued=false;
  const schedule=()=>{
    if(movingStyle||queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      installStyles();
      keepFinalStyleLast();
      removeWorkspaceAttentionIcon();
      reveal();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();