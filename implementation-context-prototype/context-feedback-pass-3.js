(() => {
  const cleanQuestionIcon='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-.9.5-1.5 1-1.5 2M12 16.8h.01"/></svg>';
  function styles(){
    if(document.getElementById('state-feedback-pass-3')) return;
    const s=document.createElement('style');
    s.id='state-feedback-pass-3';
    s.textContent=`
      /* Desktop nav: keep labels compact and on one line. */
      .sidebar-nav .nav-label{white-space:nowrap!important;min-width:0!important}

      /* Workspace attention: one soft container, no extra navigation arrows. */
      .workspace-attention{padding:18px!important}
      .workspace-attention .attention-list{border:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}
      .workspace-attention .attention-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important;background:#fff!important;border:0!important;border-top:1px solid #e8edf4!important;border-radius:0!important;padding:14px 16px!important;align-items:center!important}
      .workspace-attention .attention-item:first-child{border-top:0!important;border-radius:10px 10px 0 0!important}
      .workspace-attention .attention-item:last-child{border-radius:0 0 10px 10px!important}
      .workspace-attention .attention-item:only-child{border-radius:10px!important}
      .workspace-attention .attention-item-copy{grid-column:1!important;justify-self:stretch!important;width:100%!important;max-width:none!important;margin:0!important;padding-left:47px!important;position:relative!important;text-align:left!important;min-width:0!important}
      .workspace-attention .attention-item-copy strong,.workspace-attention .attention-item-copy>span:last-child{text-align:left!important}
      .workspace-attention .attention-row-icon{left:0!important;width:34px!important;height:34px!important}
      .workspace-attention .attention-kind{grid-column:2!important;justify-self:end!important;margin:0!important;padding:2px 7px!important;font-size:9px!important;font-weight:750!important;white-space:nowrap!important;align-self:center!important}
      .workspace-attention .attention-arrow{display:none!important}

      /* Current State workspace card */
      .workspace-status-card .state-fact-preview>.text-button{font-size:11.5px!important;font-weight:700!important}
      .workspace-status-card .state-fact-preview p{margin-top:2px!important;margin-bottom:10px!important}

      /* Notes toolbar cleanup */
      .notes-page .notes-disclosure{display:none!important}
      .notes-page .notes-result-count{display:none!important}
      .notes-page .notes-toolbar{gap:6px!important;margin-bottom:10px!important;padding-bottom:8px!important}
      .notes-page .notes-filter-row{gap:7px!important;align-items:center!important}
      .notes-page .notes-search{margin:0!important}
      .notes-page .notes-filter-summary{margin:0!important;padding:0!important;min-height:0!important}
      .notes-page .notes-filter-summary span{font-size:11.5px!important}
      .notes-page .notes-filter-summary .text-button{font-size:11.5px!important}

      /* Current State: readable wiki first, provenance second. */
      .project-page .project-document-head{padding:16px 18px!important;margin-bottom:12px!important;border-radius:13px!important}
      .project-page .project-head-row{align-items:center!important;gap:12px!important}
      .project-page .project-title-line h2{font-size:27px!important;line-height:1.08!important;margin:0!important}
      .project-page .project-document-summary{margin:6px 0 12px!important;font-size:13px!important;line-height:1.45!important}
      .project-page .project-document-meta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important;margin:0!important}
      .project-page .project-document-meta>div{padding:0!important}
      .project-page .project-document-meta dt{font-size:10px!important;margin-bottom:3px!important}
      .project-page .project-document-meta dd{font-size:12px!important;line-height:1.38!important;font-weight:600!important;margin:0!important}
      .project-page .project-head-copy-context{display:none!important}
      .project-page-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;padding:0 2px}
      .project-page-toolbar .eyebrow{font-size:10px!important;color:#65728b!important}
      .project-page-toolbar .project-head-copy-context{display:inline-flex!important;align-items:center!important;padding:5px 8px!important;font-size:11px!important;border:0!important;background:transparent!important;color:#31598f!important;box-shadow:none!important}
      .project-page .project-wiki-prose{display:block!important;max-width:920px!important}
      .project-page .project-wiki-prose p{font-size:14px!important;line-height:1.65!important;color:#3f4b61!important;margin:8px 0 0!important}
      .project-page .project-maintained-facts{margin-top:10px!important;border-top:0!important}
      .project-page .project-maintained-facts summary{font-size:11px!important;color:#31598f!important;font-weight:700!important;list-style:none!important;cursor:pointer!important;width:max-content!important}
      .project-page .project-maintained-facts summary::-webkit-details-marker{display:none!important}
      .project-page .project-maintained-facts summary::after{content:' →';}
      .project-page .project-maintained-facts[open] summary::after{content:' ↑';}
      .project-page .project-maintained-facts ul{margin-top:10px!important;border-top:1px solid #e7ecf3!important}
      .project-page .project-maintained-fact{padding:10px 0!important}
      .project-page .project-wiki-topic{padding-top:16px!important;padding-bottom:18px!important}
      .project-page .project-wiki-topic-head{margin-bottom:5px!important}
      .project-page .project-wiki-topic-head h4{margin-bottom:3px!important}
      .project-page .project-outline-actions .text-button{font-size:10.5px!important}

      /* Open Items: compact work queue, preserve readable type. */
      .open-items-page .open-items-section{margin-bottom:12px!important}
      .open-items-page .open-items-section-head{padding:15px 18px!important}
      .open-items-page .open-items-section-copy{gap:2px!important}
      .open-items-page .open-items-kicker{font-size:10px!important;margin-bottom:2px!important}
      .open-items-page .open-items-section-title{font-size:17px!important;line-height:1.25!important}
      .open-items-page .open-items-section-description{font-size:11.5px!important;line-height:1.35!important;margin-top:2px!important}
      .open-items-page .open-items-section-body{padding:8px 18px 12px!important}
      .open-items-page .review-card.compact-review{margin:0!important;border-radius:0!important}
      .open-items-page .review-card-toggle{padding:12px 0!important}
      .open-items-page .review-row-copy{gap:3px!important}
      .open-items-page .review-kicker{font-size:10px!important;line-height:1.2!important}
      .open-items-page .review-card-title{font-size:14px!important;line-height:1.35!important}
      .open-items-page .review-source-meta{font-size:10.5px!important;margin-top:2px!important}
      .open-items-page .review-card-body{padding-top:10px!important}

      /* Settings should be utility-dense. */
      .settings-page{padding-top:2px!important}
      .settings-page .page-head{margin-bottom:12px!important}
      .settings-page .settings-section{padding:12px 14px!important;margin-bottom:9px!important;border-radius:12px!important}
      .settings-page .settings-section-head{gap:10px!important;margin-bottom:7px!important}
      .settings-page .settings-section h3{font-size:15px!important;margin-bottom:2px!important}
      .settings-page .settings-section p{font-size:12px!important;line-height:1.38!important}
      .settings-page .settings-rules{margin-top:9px!important}
      .settings-page .settings-rules summary{padding:9px 11px!important}
      .settings-page .settings-rules-body{padding:10px!important}
      .settings-page .settings-rule-form{margin-top:8px!important}
      .settings-page .settings-rule-list{margin-top:9px!important;padding-top:9px!important}
      .settings-page .settings-rule-list li{padding:8px 10px!important}
      .settings-page .settings-behavior-list{margin-top:6px!important;gap:6px 14px!important}
      .settings-page .slack-preview,.settings-page .source-list{margin-top:8px!important;gap:4px!important}
      .settings-page .source-row{padding:8px 0!important}
      .settings-page .settings-callout{margin-top:8px!important;padding:8px 10px!important}
      .settings-page .settings-actions{margin-top:8px!important}

      /* Mobile: hide desktop navigation, keep only project selector + mobile pills. */
      @media(max-width:760px){
        html,body{overflow-x:hidden}
        .view-root,.page,.collection-page,.project-page{max-width:100%!important;min-width:0!important}
        .sidebar-nav,.project-subnav,.app-sidebar>.demo-help-button{display:none!important}
        .app-sidebar{position:static!important;height:auto!important;min-height:0!important;padding:14px 12px 0!important;border-right:0!important;background:transparent!important}
        .sidebar-project{margin:0 0 10px!important}
        .mobile-primary-nav{display:flex!important;margin:0 -4px!important;padding:0 4px 10px!important}
        .mobile-subnav{display:flex!important}
        .mobile-subnav[hidden]{display:none!important}
        .app-workspace{padding-bottom:96px!important}

        .workspace-below-grid{grid-template-columns:1fr!important;gap:10px!important}
        .workspace-attention{padding:13px!important;border-radius:12px!important}
        .workspace-attention-head{gap:10px!important;margin-bottom:10px!important}
        .workspace-attention-head>div{padding-left:42px!important}
        .attention-head-icon{width:32px!important;height:32px!important}
        .workspace-attention .attention-item{grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;padding:12px!important}
        .workspace-attention .attention-item-copy{padding-left:42px!important}
        .workspace-attention .attention-row-icon{width:31px!important;height:31px!important}
        .workspace-attention .attention-kind{font-size:9px!important;padding:2px 6px!important;align-self:start!important;margin-top:3px!important}
        .workspace-attention .attention-item-copy strong{font-size:12.5px!important;line-height:1.35!important}
        .workspace-attention .attention-item-copy>span:last-child{font-size:11px!important;line-height:1.35!important}
        .workspace-status-card .state-fact-preview>.text-button{position:static!important;margin-top:10px!important}
        .workspace-status-card .state-fact-preview p{padding-right:0!important}

        .notes-page .notes-filter-row{display:flex!important;flex-wrap:wrap!important;gap:6px!important}
        .notes-page .notes-date-filters{width:100%!important;overflow-x:auto!important;flex-wrap:nowrap!important;padding-bottom:2px!important}
        .notes-page .notes-status-filter{flex:1 1 100%!important}
        .notes-page .notes-status-filter select{width:100%!important}
        .notes-page .notes-search{width:100%!important}
        .notes-page article.simple-note.note-index-row{grid-template-columns:32px minmax(0,1fr)!important;padding:12px 6px!important;column-gap:10px!important}
        .notes-page .note-index-status{grid-column:2!important;grid-row:auto!important;justify-self:start!important;margin:6px 0 0!important}
        .notes-page .note-status{display:inline-flex!important;width:auto!important;max-width:max-content!important;padding:3px 7px!important;font-size:8.5px!important;line-height:1.15!important;letter-spacing:.04em!important;border-radius:999px!important}
        .note-feed-icon{width:30px!important;height:30px!important}

        .history-page .history-entry{padding:14px 0!important}
        .history-page .history-change{grid-template-columns:1fr!important;gap:8px!important}

        .project-page-toolbar{margin-bottom:6px!important}
        .project-page .project-document-head{padding:13px!important}
        .project-page .project-title-line h2{font-size:23px!important}
        .project-page .project-document-meta{grid-template-columns:1fr!important;gap:8px!important}
        .project-page .project-wiki-prose p{font-size:13px!important;line-height:1.58!important}
        .project-page .project-maintained-fact{grid-template-columns:1fr!important;gap:8px!important}
        .project-page .project-outline-actions{justify-content:flex-start!important}

        .open-items-page .open-items-section-head{padding:13px 14px!important}
        .open-items-page .open-items-section-body{padding:6px 14px 10px!important}
        .open-items-page .review-card-toggle{padding:10px 0!important}

        .settings-page .settings-section{padding:11px!important;margin-bottom:8px!important}

        .ask-state-drawer{width:100vw!important;max-width:100vw!important}
        .ask-state-drawer-head{padding:16px 18px 13px!important}
        .ask-state-drawer-controls{padding:15px 18px 20px!important}
        .ask-state-drawer-form input{height:86px!important;min-height:86px!important}
        .ask-state-starters button,.ask-quick-actions-polish button{min-width:0!important}
        .ask-state-starters button{grid-template-columns:22px minmax(0,1fr)!important;gap:10px!important}
        .ask-quick-actions-polish button{grid-template-columns:24px minmax(0,1fr)!important;gap:10px!important}
      }
      @media(max-width:430px){
        .mobile-primary-nav,.mobile-subnav{margin-left:-4px!important;margin-right:-4px!important;padding-left:4px!important}
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

  function makeCurrentStateWiki(){
    document.querySelectorAll('.project-page .project-maintained-facts summary').forEach(s=>{s.textContent='Why this is current';});
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

  function fixAskQuestionIcon(){
    const fourth=document.querySelector('.ask-state-starters button:nth-of-type(4) .ask-polish-icon');
    if(fourth && fourth.dataset.cleaned!=='true'){
      fourth.innerHTML=cleanQuestionIcon;
      fourth.dataset.cleaned='true';
    }
  }

  function bindQuickActions(){
    if(document.documentElement.dataset.askQuickBound==='true') return;
    document.documentElement.dataset.askQuickBound='true';
    document.addEventListener('click',e=>{
      const b=e.target.closest('.ask-quick-actions-polish button[data-q]');
      if(!b) return;
      const controls=b.closest('.ask-state-drawer-controls');
      const input=controls?.querySelector('.ask-state-drawer-form input,.ask-state-drawer-form textarea,input,textarea');
      if(!input) return;
      input.value=b.dataset.q||'';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      requestAnimationFrame(()=>{
        const submit=controls.querySelector('.ask-state-drawer-form button');
        if(submit) submit.click();
      });
    },true);
  }

  function run(){styles();simplifyWorkspaceBrowse();cleanNotes();makeCurrentStateWiki();fixAskQuestionIcon();bindQuickActions()}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();