(() => {
  const cleanQuestionIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-.9.5-1.5 1-1.5 2M12 16.8h.01"/></svg>';

  function addStyles(){
    if(document.getElementById('state-feedback-pass-3')) return;
    const s=document.createElement('style');
    s.id='state-feedback-pass-3';
    s.textContent=`
      /* Final source of truth for the redesign pass. */
      .sidebar-nav{gap:4px!important}
      .sidebar-nav .nav-item{min-height:46px!important;padding:9px 15px!important;margin:0!important}
      .sidebar-nav .nav-label,.sidebar-nav .project-nav-toggle{white-space:nowrap!important;min-width:0!important}
      .app-sidebar>.demo-help-button.state-help-card{position:fixed!important;left:18px!important;right:auto!important;bottom:18px!important;width:280px!important;max-width:calc(100vw - 36px)!important;margin:0!important;z-index:80!important}
      .project-switcher>span{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;transform:translateY(-1px)!important}

      /* Workspace attention: compact, left anchored, no phantom grid columns. */
      .workspace-attention{padding:16px!important}
      .workspace-attention .attention-list{border:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}
      .workspace-attention .attention-item{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:12px!important;width:100%!important;max-width:none!important;margin:0!important;padding:13px 16px!important;background:#fff!important;border:0!important;border-top:1px solid #e8edf4!important;border-radius:0!important;text-align:left!important}
      .workspace-attention .attention-item:first-child{border-top:0!important;border-radius:10px 10px 0 0!important}
      .workspace-attention .attention-item:last-child{border-radius:0 0 10px 10px!important}
      .workspace-attention .attention-item:only-child{border-radius:10px!important}
      .workspace-attention .attention-item>.attention-icon{display:none!important}
      .workspace-attention .attention-item-copy{flex:1 1 auto!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0 0 0 46px!important;position:relative!important;text-align:left!important;justify-self:auto!important}
      .workspace-attention .attention-item-copy>*{text-align:left!important;margin-left:0!important;margin-right:0!important}
      .workspace-attention .attention-row-icon{position:absolute!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;width:34px!important;height:34px!important;background:#eaf2ff!important;color:#1769e8!important}
      .workspace-attention .attention-kind{flex:0 0 auto!important;margin:0 0 0 auto!important;padding:2px 7px!important;font-size:9px!important;font-weight:750!important;white-space:nowrap!important;align-self:center!important}
      .workspace-attention .attention-arrow{display:none!important}
      .workspace-attention .attention-item:hover{background:#fbfcff!important}

      /* Workspace Current State card: remove excess vertical air. */
      .workspace-status-card{padding:14px 16px!important}
      .workspace-status-card>.eyebrow{min-height:30px!important;margin:0 0 2px!important}
      .workspace-status-card .workspace-section-hint{margin-top:-14px!important;margin-bottom:8px!important}
      .workspace-status-card .workspace-status-body{margin-top:0!important}
      .workspace-status-card .state-fact-preview{padding-top:0!important}
      .workspace-status-card .state-fact-preview p{margin:0 0 8px!important}
      .workspace-status-card .state-fact-preview>.text-button{font-size:11.5px!important;font-weight:700!important}

      /* Current State page: readable wiki, not a database/provenance inspector. */
      .project-page .project-document-head{padding:15px 18px!important;margin-bottom:10px!important;border-radius:13px!important}
      .project-page .project-head-row{align-items:center!important;gap:12px!important}
      .project-page .project-title-line h2{font-size:27px!important;line-height:1.08!important;margin:0!important}
      .project-page .project-document-summary{margin:6px 0 11px!important;font-size:13px!important;line-height:1.45!important}
      .project-page .project-document-meta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important;margin:0!important}
      .project-page .project-document-meta>div{padding:0!important}
      .project-page .project-document-meta dt{font-size:10px!important;margin-bottom:2px!important}
      .project-page .project-document-meta dd{font-size:12px!important;line-height:1.38!important;font-weight:600!important;margin:0!important}
      .project-page .project-head-copy-context{display:none!important}
      .project-page-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;margin:0 0 8px!important;padding:0 2px!important}
      .project-page-toolbar .eyebrow{font-size:10px!important;color:#65728b!important}
      .project-page-toolbar .project-head-copy-context{display:inline-flex!important;align-items:center!important;padding:5px 8px!important;font-size:11px!important;border:0!important;background:transparent!important;color:#31598f!important;box-shadow:none!important}
      .project-page .project-wiki-topic{padding:15px 0 17px!important}
      .project-page .project-wiki-topic-head{margin-bottom:5px!important}
      .project-page .project-wiki-topic-head h4{margin-bottom:3px!important}
      .project-page .project-wiki-prose{display:block!important;max-width:940px!important}
      .project-page .project-wiki-prose p{font-size:14px!important;line-height:1.65!important;color:#3f4b61!important;margin:8px 0 0!important}
      .project-page .project-maintained-facts,
      .project-page .project-provenance,
      .project-page .project-fact-provenance,
      .project-page [class*="provenance"]{display:none!important}

      /* Open Items: decision queue density. */
      .open-items-page .open-items-section{margin-bottom:10px!important}
      .open-items-page .open-items-section-head{padding:12px 16px!important}
      .open-items-page .open-items-section-copy{gap:1px!important}
      .open-items-page .open-items-kicker{font-size:10px!important;margin-bottom:1px!important}
      .open-items-page .open-items-section-title{font-size:17px!important;line-height:1.22!important}
      .open-items-page .open-items-section-description{font-size:11.5px!important;line-height:1.32!important;margin-top:1px!important}
      .open-items-page .open-items-section-body{padding:4px 16px 8px!important}
      .open-items-page .review-card.compact-review{padding:0!important;margin:0!important;border-radius:0!important}
      .open-items-page .review-card-toggle{padding:10px 0!important;min-height:0!important}
      .open-items-page .review-row-copy{gap:2px!important}
      .open-items-page .review-kicker{font-size:10px!important;line-height:1.15!important;margin:0!important}
      .open-items-page .review-card-title{font-size:14px!important;line-height:1.32!important;margin:1px 0!important}
      .open-items-page .review-source-meta{font-size:10.5px!important;margin-top:1px!important}
      .open-items-page .review-card-body{padding-top:8px!important}

      /* Notes: quiet neutral state, actionable review remains actionable. */
      .notes-page .notes-disclosure,.notes-page .notes-result-count{display:none!important}
      .notes-page .notes-toolbar{gap:6px!important;margin-bottom:10px!important;padding-bottom:8px!important}
      .notes-page .notes-filter-row{gap:7px!important;align-items:center!important}
      .notes-page .notes-filter-summary{margin:0!important;padding:0!important;min-height:0!important}
      .notes-page .note-status.is-neutral-status{border:0!important;background:transparent!important;padding:0!important;border-radius:0!important;color:#7b879a!important;font-size:10.5px!important;font-weight:600!important;letter-spacing:0!important;text-transform:none!important;white-space:nowrap!important}

      /* Settings: compact utility UI. */
      .settings-page{padding-top:2px!important}
      .settings-page .page-head{margin-bottom:10px!important}
      .settings-page .settings-section{padding:10px 12px!important;margin-bottom:7px!important;border-radius:11px!important}
      .settings-page .settings-section-head{gap:8px!important;margin-bottom:5px!important}
      .settings-page .settings-section h3{font-size:15px!important;margin-bottom:2px!important}
      .settings-page .settings-section p{font-size:12px!important;line-height:1.36!important}
      .settings-page .settings-rules{margin-top:7px!important}
      .settings-page .settings-rules summary{padding:8px 10px!important}
      .settings-page .settings-rules-body{padding:9px!important}
      .settings-page .settings-rule-form{margin-top:7px!important}
      .settings-page .settings-rule-list{margin-top:7px!important;padding-top:7px!important}
      .settings-page .settings-rule-list li{padding:7px 9px!important}
      .settings-page .settings-behavior-list{margin-top:5px!important;gap:5px 12px!important}
      .settings-page .slack-preview,.settings-page .source-list{margin-top:7px!important;gap:3px!important}
      .settings-page .source-row{padding:7px 0!important}
      .settings-page .settings-callout{margin-top:7px!important;padding:7px 9px!important}
      .settings-page .settings-actions{margin-top:7px!important}

      /* Ask: consistent icon proportions and functional compact mobile form. */
      .ask-state-drawer-head{background:#f1f6ff!important}
      .ask-state-starters .ask-polish-icon,.ask-quick-actions-polish .ask-polish-icon{display:grid!important;place-items:center!important}
      .ask-state-starters .ask-polish-icon svg,.ask-quick-actions-polish .ask-polish-icon svg{width:21px!important;height:21px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}

      @media(max-width:760px){
        html,body{overflow-x:hidden!important}
        .software-shell{display:block!important;grid-template-columns:1fr!important}
        .sidebar-project,.sidebar-nav,.project-subnav,.app-sidebar>.demo-help-button{display:none!important}
        .app-sidebar{display:block!important;position:static!important;width:100%!important;height:auto!important;min-height:0!important;padding:8px 12px 0!important;border:0!important;background:transparent!important}
        .mobile-primary-nav{display:flex!important;margin:0 -4px!important;padding:0 4px 10px!important}
        .mobile-subnav{display:flex!important}
        .mobile-subnav[hidden]{display:none!important}
        .app-workspace{padding-bottom:112px!important}
        .view-root,.page,.collection-page,.project-page{max-width:100%!important;min-width:0!important}

        .workspace-attention{padding:12px!important}
        .workspace-attention .attention-item{display:flex!important;gap:8px!important;padding:11px!important}
        .workspace-attention .attention-item-copy{padding-left:39px!important}
        .workspace-attention .attention-row-icon{width:30px!important;height:30px!important}
        .workspace-attention .attention-kind{align-self:flex-start!important;margin-top:2px!important;font-size:9px!important;padding:2px 6px!important}
        .workspace-status-card .state-fact-preview>.text-button{position:static!important;margin-top:8px!important}
        .workspace-status-card .state-fact-preview p{padding-right:0!important}

        .notes-page .notes-filter-row{display:flex!important;flex-wrap:wrap!important;gap:6px!important}
        .notes-page .notes-date-filters{width:100%!important;overflow-x:auto!important;flex-wrap:nowrap!important}
        .notes-page .notes-status-filter{flex:1 1 100%!important}
        .notes-page .notes-status-filter select,.notes-page .notes-search{width:100%!important}
        .notes-page article.simple-note.note-index-row{grid-template-columns:32px minmax(0,1fr)!important;padding:12px 6px!important;column-gap:10px!important}
        .notes-page .note-index-status{grid-column:2!important;grid-row:auto!important;justify-self:start!important;margin:5px 0 0!important}
        .notes-page .note-status.is-neutral-status{font-size:10px!important;line-height:1.2!important}

        .history-page .history-entry{padding:14px 0!important}
        .history-page .history-change{grid-template-columns:1fr!important;gap:8px!important}

        .project-page .project-document-head{padding:13px!important}
        .project-page .project-title-line h2{font-size:23px!important}
        .project-page .project-document-meta{grid-template-columns:1fr!important;gap:8px!important}
        .project-page .project-wiki-prose p{font-size:13px!important;line-height:1.58!important}

        .open-items-page .open-items-section-head{padding:11px 13px!important}
        .open-items-page .open-items-section-body{padding:3px 13px 7px!important}
        .open-items-page .review-card-toggle{padding:9px 0!important}

        .settings-page .settings-section{padding:10px!important;margin-bottom:7px!important}

        .ask-state-drawer{width:100vw!important;max-width:100vw!important}
        .ask-state-drawer-head{padding:15px 18px 12px!important}
        .ask-state-drawer-controls{padding:14px 18px 20px!important}
        .ask-state-drawer-form{position:relative!important}
        .ask-state-drawer-form input,.ask-state-drawer-form textarea{height:96px!important;min-height:96px!important;padding:14px 58px 14px 14px!important;box-sizing:border-box!important}
        .ask-state-drawer-form button{position:absolute!important;right:12px!important;bottom:12px!important;top:auto!important;transform:none!important;width:42px!important;height:42px!important}
      }
      @media(max-width:430px){
        .mobile-primary-nav,.mobile-subnav{margin-left:-4px!important;margin-right:-4px!important;padding-left:4px!important}
        .mobile-primary-nav .nav-item,.mobile-subnav button{padding:6px 10px!important;font-size:11.5px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function simplifyWorkspaceBrowse(){
    document.querySelectorAll('.workspace-status-card .state-fact-preview>.text-button').forEach(b=>{
      if(/browse current state/i.test(b.textContent)) b.textContent='Browse →';
    });
  }

  function cleanNotes(){
    document.querySelectorAll('.notes-page .notes-disclosure').forEach(el=>el.remove());
    document.querySelectorAll('.notes-page .notes-filter-summary').forEach(el=>{
      const text=el.textContent.replace(/\s+/g,' ').trim();
      const active=!!el.querySelector('[data-action="clear-note-filters"]');
      if(!active && /all time/i.test(text) && /all statuses/i.test(text)) el.style.display='none';
    });
    document.querySelectorAll('.notes-page .note-status,.notes-page .note-index-status [class*="status"]').forEach(el=>{
      if(/no review needed/i.test(el.textContent||'')) el.classList.add('is-neutral-status');
    });
  }

  function simplifyCurrentState(){
    document.querySelectorAll('.project-page .project-maintained-facts').forEach(el=>{el.hidden=true;});
    const head=document.querySelector('.project-page .project-document-head');
    const copy=head?.querySelector('.project-head-copy-context');
    if(head&&copy&&!document.querySelector('.project-page .project-page-toolbar')){
      const toolbar=document.createElement('div');
      toolbar.className='project-page-toolbar';
      toolbar.innerHTML='<span class="eyebrow">Current State</span>';
      toolbar.appendChild(copy);
      head.before(toolbar);
    }
  }

  function fixAskIcon(){
    const fourth=document.querySelector('.ask-state-starters button:nth-of-type(4) .ask-polish-icon');
    if(fourth&&fourth.dataset.cleaned!=='true'){
      fourth.innerHTML=cleanQuestionIcon;
      fourth.dataset.cleaned='true';
    }
  }

  function runQuickAction(button){
    const drawer=button.closest('.ask-state-drawer')||document.querySelector('.ask-state-drawer');
    const form=drawer?.querySelector('.ask-state-drawer-form');
    const field=form?.querySelector('input,textarea');
    const submit=form?.querySelector('button');
    if(!field||!submit) return;
    field.value=button.dataset.q||button.textContent.trim();
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(()=>submit.click(),0);
  }

  function bindQuickActions(){
    if(document.documentElement.dataset.stateFinalQuickActions==='1') return;
    document.documentElement.dataset.stateFinalQuickActions='1';
    document.addEventListener('click',e=>{
      const b=e.target.closest('.ask-quick-actions-polish button[data-q]');
      if(!b) return;
      setTimeout(()=>runQuickAction(b),0);
    },true);
  }

  function run(){
    addStyles();
    simplifyWorkspaceBrowse();
    cleanNotes();
    simplifyCurrentState();
    fixAskIcon();
    bindQuickActions();
  }

  let queued=false;
  const schedule=()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;run();});
  };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();