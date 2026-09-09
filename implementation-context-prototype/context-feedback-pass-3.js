(() => {
  function styles(){
    if(document.getElementById('state-feedback-pass-3')) return;
    const s=document.createElement('style');
    s.id='state-feedback-pass-3';
    s.textContent=`
      /* Workspace attention: one container, simple rows */
      .workspace-attention{padding:18px!important}
      .workspace-attention .attention-list{border:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}
      .workspace-attention .attention-item{background:#fff!important;border:0!important;border-top:1px solid #e8edf4!important;border-radius:0!important;padding:14px 16px!important;grid-template-columns:42px minmax(0,1fr) auto 20px!important;gap:12px!important}
      .workspace-attention .attention-item:first-child{border-top:0!important;border-radius:10px 10px 0 0!important}
      .workspace-attention .attention-item:last-child{border-radius:0 0 10px 10px!important}
      .workspace-attention .attention-item:only-child{border-radius:10px!important}
      .workspace-attention .attention-row-icon{width:34px!important;height:34px!important}
      .workspace-attention .attention-item-copy{justify-self:start!important;text-align:left!important;min-width:0!important}
      .workspace-attention .attention-item-copy strong,.workspace-attention .attention-item-copy span{text-align:left!important}
      .workspace-attention .attention-kind{justify-self:end!important}.workspace-attention .attention-arrow{justify-self:end!important}

      /* Current State workspace card */
      .workspace-status-card .state-fact-preview>.text-button{font-size:11.5px!important;font-weight:700!important}
      .workspace-status-card .state-fact-preview p{margin-top:2px!important;margin-bottom:10px!important}

      /* Notes toolbar cleanup */
      .notes-page .notes-disclosure{display:none!important}
      .notes-page .notes-result-count{display:none!important}
      .notes-page .notes-toolbar{gap:8px!important;margin-bottom:12px!important;padding-bottom:10px!important}
      .notes-page .notes-filter-row{gap:8px!important;align-items:center!important}
      .notes-page .notes-search{margin:0!important}
      .notes-page .notes-filter-summary{margin:2px 0 0!important;padding:0!important;min-height:0!important}
      .notes-page .notes-filter-summary span{font-size:11.5px!important}
      .notes-page .notes-filter-summary .text-button{font-size:11.5px!important}

      /* Current State page: compact header and direct facts */
      .project-page .project-document-head{padding:18px 20px!important;margin-bottom:14px!important;border-radius:14px!important}
      .project-page .project-head-row{align-items:center!important;gap:12px!important}
      .project-page .project-title-line h2{font-size:28px!important;line-height:1.08!important;margin:0!important}
      .project-page .project-document-summary{margin:7px 0 14px!important;font-size:13px!important;line-height:1.45!important}
      .project-page .project-document-meta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important;margin:0!important}
      .project-page .project-document-meta>div{padding:0!important}
      .project-page .project-document-meta dt{font-size:10px!important;margin-bottom:3px!important}
      .project-page .project-document-meta dd{font-size:12.5px!important;line-height:1.4!important;font-weight:600!important;margin:0!important}
      .project-page .project-head-copy-context{display:none!important}
      .project-copy-row{display:flex;justify-content:flex-end;margin:0 0 12px}
      .project-copy-row .project-head-copy-context{display:inline-flex!important;padding:7px 10px!important;font-size:11.5px!important;border-radius:9px!important}
      .project-page .project-wiki-prose{display:none!important}
      .project-page .project-maintained-facts{margin-top:10px!important}
      .project-page .project-maintained-facts summary{font-size:11.5px!important;color:#52627d!important}
      .project-page .project-wiki-topic{padding-top:18px!important;padding-bottom:18px!important}
      .project-page .project-wiki-topic-head{margin-bottom:8px!important}

      /* Settings should be denser than content pages */
      .settings-page{padding-top:4px!important}
      .settings-page .page-head{margin-bottom:14px!important}
      .settings-page .settings-section{padding:15px 16px!important;margin-bottom:12px!important;border-radius:13px!important}
      .settings-page .settings-section-head{gap:12px!important;margin-bottom:9px!important}
      .settings-page .settings-section h3{font-size:16px!important;margin-bottom:3px!important}
      .settings-page .settings-section p{font-size:12.5px!important;line-height:1.42!important}
      .settings-page .settings-rules{margin-top:12px!important}
      .settings-page .settings-rules summary{padding:10px 12px!important}
      .settings-page .settings-rules-body{padding:12px!important}
      .settings-page .settings-rule-form{margin-top:10px!important}
      .settings-page .settings-rule-list{margin-top:12px!important;padding-top:12px!important}
      .settings-page .settings-rule-list li{padding:9px 11px!important}
      .settings-page .settings-behavior-list{margin-top:8px!important;gap:7px 16px!important}
      .settings-page .slack-preview,.settings-page .source-list{margin-top:10px!important;gap:6px!important}
      .settings-page .source-row{padding:10px 0!important}
      .settings-page .settings-callout{margin-top:10px!important;padding:9px 11px!important}
      .settings-page .settings-actions{margin-top:10px!important}

      /* Phone-width safeguards for latest redesign */
      @media(max-width:760px){
        html,body{overflow-x:hidden}
        .view-root,.page,.collection-page,.project-page{max-width:100%!important;min-width:0!important}
        .workspace-below-grid{grid-template-columns:1fr!important;gap:10px!important}
        .workspace-attention{padding:13px!important;border-radius:12px!important}
        .workspace-attention-head{gap:10px!important;margin-bottom:10px!important}
        .workspace-attention-head>div{padding-left:42px!important}
        .attention-head-icon{width:32px!important;height:32px!important}
        .workspace-attention .attention-item{grid-template-columns:36px minmax(0,1fr) auto!important;gap:9px!important;padding:12px!important}
        .workspace-attention .attention-arrow{display:none!important}
        .workspace-attention .attention-kind{font-size:9.5px!important;padding:2px 7px!important;white-space:nowrap!important}
        .workspace-attention .attention-item-copy strong{font-size:12.5px!important;line-height:1.35!important}
        .workspace-attention .attention-item-copy>span:last-child{font-size:11px!important;line-height:1.35!important}
        .workspace-status-card .state-fact-preview>.text-button{position:static!important;margin-top:10px!important}
        .workspace-status-card .state-fact-preview p{padding-right:0!important}
        .notes-page .notes-filter-row{display:flex!important;flex-wrap:wrap!important;gap:6px!important}
        .notes-page .notes-date-filters{width:100%!important;overflow-x:auto!important;flex-wrap:nowrap!important;padding-bottom:2px!important}
        .notes-page .notes-status-filter{flex:1 1 100%!important}
        .notes-page .notes-status-filter select{width:100%!important}
        .notes-page .notes-search{width:100%!important}
        .notes-page article.simple-note.note-index-row{grid-template-columns:32px minmax(0,1fr)!important;padding:13px 6px!important;column-gap:10px!important}
        .notes-page .note-index-status{grid-column:2!important;grid-row:auto!important;justify-self:start!important;margin:8px 0 0!important}
        .note-feed-icon{width:30px!important;height:30px!important}
        .history-page .history-entry{padding:14px 0!important}
        .history-page .history-change{grid-template-columns:1fr!important;gap:8px!important}
        .project-page .project-document-head{padding:14px!important}
        .project-page .project-title-line h2{font-size:24px!important}
        .project-page .project-document-meta{grid-template-columns:1fr!important;gap:9px!important}
        .project-copy-row{justify-content:flex-start!important}
        .project-page .project-maintained-fact{grid-template-columns:1fr!important;gap:8px!important}
        .project-page .project-outline-actions{justify-content:flex-start!important}
        .settings-page .settings-section{padding:13px!important;margin-bottom:10px!important}
        .ask-state-drawer{width:100vw!important;max-width:100vw!important}
        .ask-state-drawer-head{padding:16px 18px 13px!important}
        .ask-state-drawer-controls{padding:15px 18px 20px!important}
        .ask-state-drawer-form input{height:86px!important;min-height:86px!important}
        .ask-state-starters button,.ask-quick-actions-polish button{min-width:0!important}
        .ask-state-starters button{grid-template-columns:22px minmax(0,1fr)!important;gap:10px!important}
        .ask-quick-actions-polish button{grid-template-columns:24px minmax(0,1fr)!important;gap:10px!important}
      }
      @media(max-width:430px){
        .mobile-primary-nav,.mobile-subnav{margin-left:-8px!important;margin-right:-8px!important;padding-left:8px!important}
        .mobile-primary-nav .nav-item,.mobile-subnav button{padding:6px 10px!important;font-size:11.5px!important}
        .overview-heading-row h2{font-size:27px!important}
        .overview-heading-row .overview-add{padding:8px 11px!important;font-size:11.5px!important}
        .workspace-record-orientation{font-size:12.5px!important}
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
  }

  function simplifyCurrentState(){
    document.querySelectorAll('.project-page .project-maintained-facts summary').forEach(s=>{
      if(/current state/i.test(s.textContent) || /maintained from/i.test(s.textContent)) s.textContent='Current State';
    });
    document.querySelectorAll('.project-page .project-wiki-prose').forEach(el=>el.remove());
    const head=document.querySelector('.project-page .project-document-head');
    const intro=document.querySelector('.project-page .project-document-intro');
    const copy=head?.querySelector('.project-head-copy-context');
    if(head&&intro&&copy&&!document.querySelector('.project-page .project-copy-row')){
      const row=document.createElement('div');row.className='project-copy-row';row.appendChild(copy);intro.before(row);
    }
  }

  function run(){styles();simplifyWorkspaceBrowse();cleanNotes();simplifyCurrentState()}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();