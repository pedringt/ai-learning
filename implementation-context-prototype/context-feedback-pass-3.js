(() => {
  const QUICK_ACTIONS = new Map([
    ['Summarize this page', 'Summarize the current state. Focus on the most consequential accepted project understanding and keep unresolved items separate.'],
    ['Show open questions', 'What are we still unsure about?'],
    ['Show recent changes', 'What changed recently?']
  ]);

  function ensureLora(){
    if(document.getElementById('state-lora-font')) return;
    const link=document.createElement('link');
    link.id='state-lora-font';
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Lora:wght@600;700&display=swap';
    document.head.appendChild(link);
  }

  function addStyles(){
    if(document.getElementById('state-feedback-pass-3')) return;
    const s=document.createElement('style');
    s.id='state-feedback-pass-3';
    s.textContent=`
      :root{color-scheme:light!important}
      #v922ThemeToggle{display:none!important}
      body{background:#f7f9fc!important;color:#101a31!important}
      .northstar-display{font-family:'Lora',Georgia,serif!important;letter-spacing:-.025em!important}

      /* Sidebar: compact. Need help stays fixed to the viewport, but JS sizes
         it to the sidebar's actual inner width so it can never bleed into content. */
      .app-sidebar{position:sticky!important;top:0!important;align-self:start!important;height:100vh!important;min-height:0!important;padding-bottom:112px!important;overflow:hidden!important}
      .sidebar-nav{gap:4px!important}
      .sidebar-nav .nav-item{min-height:46px!important;padding:9px 15px!important;margin:0!important}
      .sidebar-nav .nav-label,.sidebar-nav .project-nav-toggle{white-space:nowrap!important;min-width:0!important}
      .app-sidebar>.demo-help-button.state-help-card{position:fixed!important;right:auto!important;bottom:16px!important;margin:0!important;z-index:80!important;max-width:none!important;box-sizing:border-box!important}
      .project-switcher>span{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;transform:translateY(-1px)!important}

      /* Workspace attention: preserve the approved layout. */
      .workspace-attention{padding:16px!important}
      .workspace-attention .attention-list{border:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}
      .workspace-attention .attention-item{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:14px!important;width:100%!important;max-width:none!important;margin:0!important;padding:13px 16px!important;background:#fff!important;border:0!important;border-top:1px solid #e8edf4!important;border-radius:0!important;text-align:left!important}
      .workspace-attention .attention-item:first-child{border-top:0!important;border-radius:10px 10px 0 0!important}
      .workspace-attention .attention-item:last-child{border-radius:0 0 10px 10px!important}
      .workspace-attention .attention-item:only-child{border-radius:10px!important}
      .workspace-attention .attention-item>.attention-icon{display:none!important}
      .workspace-attention .attention-item-copy{display:grid!important;grid-template-columns:42px minmax(0,1fr)!important;grid-template-rows:auto auto!important;column-gap:12px!important;row-gap:2px!important;align-items:center!important;flex:1 1 auto!important;width:auto!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;position:static!important;text-align:left!important}
      .workspace-attention .attention-item-copy>*{text-align:left!important;margin-left:0!important;margin-right:0!important}
      .workspace-attention .attention-row-icon{position:static!important;grid-column:1!important;grid-row:1 / span 2!important;align-self:center!important;transform:none!important;width:34px!important;height:34px!important;background:#eaf2ff!important;color:#1769e8!important}
      .workspace-attention .attention-item-copy>strong{grid-column:2!important;grid-row:1!important;align-self:end!important}
      .workspace-attention .attention-item-copy>span:last-child{grid-column:2!important;grid-row:2!important;align-self:start!important}
      .workspace-attention .attention-kind{flex:0 0 auto!important;margin:0 0 0 auto!important;padding:2px 7px!important;font-size:9px!important;font-weight:750!important;white-space:nowrap!important;align-self:center!important}
      .workspace-attention .attention-arrow{display:none!important}
      .workspace-attention .attention-item:hover{background:#fbfcff!important}

      /* Workspace Current State summary: fill the card intentionally instead
         of leaving a dead block of whitespace at the bottom. */
      .workspace-status-card{padding:13px 16px!important;display:flex!important;flex-direction:column!important}
      .workspace-status-card>.eyebrow{min-height:28px!important;margin:0 0 1px!important}
      .workspace-status-card .workspace-section-hint{margin-top:-13px!important;margin-bottom:4px!important}
      .workspace-status-card .workspace-status-body{margin-top:0!important;display:flex!important;flex:1!important;flex-direction:column!important}
      .workspace-status-card .state-fact-preview{padding-top:0!important;display:flex!important;flex:1!important;flex-direction:column!important;justify-content:space-evenly!important}
      .workspace-status-card .state-fact-preview p{margin:0 0 5px!important}
      .workspace-status-card .state-fact-preview li{padding-top:9px!important;padding-bottom:9px!important}
      .workspace-status-card .state-fact-preview>.text-button{font-size:11.5px!important;font-weight:700!important}

      /* Current State: one readable wiki, no hero-card/database feel. */
      .project-page-toolbar{display:none!important}
      .project-page .project-document-head{background:transparent!important;border:0!important;border-bottom:1px solid #dfe6ef!important;box-shadow:none!important;border-radius:0!important;padding:2px 0 20px!important;margin:0 0 20px!important}
      .project-page .project-head-row{display:flex!important;align-items:center!important;gap:12px!important}
      .project-page .project-title-line{min-width:0!important}
      .project-page .project-title-line h2{font-family:'Lora',Georgia,serif!important;font-size:38px!important;line-height:1.08!important;letter-spacing:-.03em!important;margin:0!important;color:#173d79!important}
      .project-page .project-document-summary{margin:8px 0 20px!important;font-size:13.5px!important;line-height:1.5!important;color:#5f6b80!important}
      .project-page .project-meta-heading{display:block!important;margin:0 0 13px!important;font-size:11px!important;font-weight:800!important;letter-spacing:.12em!important;text-transform:uppercase!important;color:#403a79!important}
      .project-page .project-document-meta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0!important;margin:0!important}
      .project-page .project-document-meta>div{padding:0 28px 0 0!important}
      .project-page .project-document-meta>div+div{border-left:1px solid #d8dce7!important;padding:0 0 0 28px!important}
      .project-page .project-document-meta dt{font-size:10.5px!important;font-weight:800!important;letter-spacing:.09em!important;text-transform:uppercase!important;color:#65687a!important;margin:0 0 7px!important}
      .project-page .project-document-meta dd{font-size:14px!important;line-height:1.48!important;font-weight:600!important;margin:0!important;color:#222b3d!important}
      .project-page .project-head-copy-context{display:inline-flex!important;margin-left:auto!important;padding:5px 7px!important;border:0!important;background:transparent!important;color:#31598f!important;box-shadow:none!important;font-size:11px!important;font-weight:700!important}
      .project-page .project-head-copy-context:hover{background:#eef4fc!important}
      .project-page .project-maintained-facts,.project-page .project-provenance,.project-page .project-fact-provenance,.project-page [class*="provenance"]{display:none!important}
      .project-page .project-wiki-topic{padding:15px 0 17px!important}
      .project-page .project-wiki-topic-head{margin-bottom:5px!important}
      .project-page .project-wiki-topic-head h4{margin-bottom:3px!important}
      .project-page .project-wiki-prose{display:block!important;max-width:940px!important}
      .project-page .project-wiki-prose p{font-size:14px!important;line-height:1.65!important;color:#3f4b61!important;margin:8px 0 0!important}

      /* Open Items: compact queue, not compressed. */
      .open-items-page .open-items-section{margin-bottom:10px!important}
      .open-items-page .open-items-section-head{padding:12px 16px!important}
      .open-items-page .open-items-section-copy{gap:1px!important}
      .open-items-page .open-items-kicker{font-size:10px!important;margin-bottom:1px!important}
      .open-items-page .open-items-section-title{font-size:17px!important;line-height:1.22!important}
      .open-items-page .open-items-section-description{font-size:11.5px!important;line-height:1.32!important;margin-top:1px!important}
      .open-items-page .open-items-section-body{padding:6px 16px 10px!important}
      .open-items-page .review-card.compact-review{padding:0!important;margin:0!important;border-radius:0!important}
      .open-items-page .review-card-toggle{padding:15px 0!important;min-height:0!important}
      .open-items-page .review-row-copy{gap:3px!important}
      .open-items-page .review-kicker{font-size:10px!important;line-height:1.15!important;margin:0 0 2px!important}
      .open-items-page .review-card-title{font-size:14px!important;line-height:1.34!important;margin:2px 0!important}
      .open-items-page .review-source-meta{font-size:10.5px!important;margin-top:3px!important}
      .open-items-page .review-card-body{padding-top:10px!important}
      .evidence-answer-callout{display:block!important;position:relative!important;margin:8px 0 10px!important;padding:10px 12px 10px 34px!important;border:1px solid #d8e7fb!important;border-radius:10px!important;background:#f3f8ff!important;color:#3d506c!important;font-size:12px!important;line-height:1.45!important;font-weight:500!important}
      .evidence-answer-callout::before{content:'✓';position:absolute;left:12px;top:10px;color:#1769e8;font-weight:800}

      /* Notes: blue object language + compact statuses on phone. */
      .notes-page .notes-disclosure,.notes-page .notes-result-count{display:none!important}
      .notes-page .notes-toolbar{gap:6px!important;margin-bottom:10px!important;padding-bottom:8px!important}
      .notes-page .notes-filter-row{gap:7px!important;align-items:center!important}
      .notes-page .notes-filter-summary{margin:0!important;padding:0!important;min-height:0!important}
      .notes-page .note-feed-icon{background:#eaf2ff!important;color:#1769e8!important}
      .notes-page .note-status.is-neutral-status{border:0!important;background:transparent!important;padding:0!important;border-radius:0!important;color:#7b879a!important;font-size:10.5px!important;font-weight:600!important;letter-spacing:0!important;text-transform:none!important;white-space:nowrap!important}
      .notes-page .note-index-status .note-status,.notes-page .note-index-status [class*="status"]{text-transform:none!important;letter-spacing:0!important;line-height:1.15!important}

      /* Settings: denser sections and compact rule rows. */
      .settings-page{padding-top:2px!important}
      .settings-page .page-head{margin-bottom:8px!important}
      .settings-page .settings-section{padding:8px 10px!important;margin-bottom:6px!important;border-radius:10px!important}
      .settings-page .settings-section-head{gap:7px!important;margin-bottom:4px!important}
      .settings-page .settings-section h3{font-size:14.5px!important;margin-bottom:1px!important}
      .settings-page .settings-section p{font-size:11.5px!important;line-height:1.34!important}
      .settings-page .settings-rules{margin-top:6px!important}
      .settings-page .settings-rules summary{padding:7px 9px!important}
      .settings-page .settings-rules-body{padding:8px!important}
      .settings-page .settings-rule-list{gap:5px!important;margin-top:8px!important;padding-top:8px!important}
      .settings-page .settings-rule-list li{padding:8px 10px!important;gap:10px!important;min-height:0!important;border-radius:8px!important}
      .settings-page .settings-rule-copy strong{font-size:9px!important;margin-bottom:2px!important;letter-spacing:.08em!important}
      .settings-page .settings-rule-copy span{font-size:12.5px!important;font-weight:500!important;line-height:1.35!important;color:#303a50!important}
      .settings-page .settings-rule-list .text-button{font-size:11px!important;font-weight:700!important;padding:4px 5px!important}
      .settings-page .source-row{padding-top:6px!important;padding-bottom:6px!important}
      .settings-page .settings-callout{margin-top:6px!important;padding:6px 8px!important}
      .settings-page .settings-actions{margin-top:6px!important}

      /* Ask: compact composer, unmistakable lifecycle, answer replaces discovery UI. */
      .ask-state-drawer-head{background:#f1f6ff!important;padding:15px 20px 13px!important}
      .ask-state-drawer-controls{padding:14px 20px 18px!important}
      #askStateDrawer .ask-state-drawer-form{position:relative!important;display:block!important}
      #askStateDrawer .ask-state-drawer-form input{display:block!important;width:100%!important;height:50px!important;min-height:50px!important;max-height:50px!important;padding:0 94px 0 14px!important;box-sizing:border-box!important;border-radius:11px!important;font-size:14px!important;line-height:normal!important}
      #askStateDrawer .ask-state-drawer-form button[type="submit"]{position:absolute!important;right:7px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;width:36px!important;height:36px!important;border-radius:50%!important;padding:0!important}
      #askStateDrawer .ask-state-drawer-form button[type="submit"]:disabled{opacity:.55!important;cursor:wait!important}
      #askStateDrawer .state-ask-clear{display:none!important;position:absolute!important;right:48px!important;top:50%!important;transform:translateY(-50%)!important;width:30px!important;height:30px!important;border:0!important;border-radius:50%!important;padding:0!important;background:transparent!important;color:#677389!important;font:inherit!important;font-size:20px!important;line-height:30px!important;cursor:pointer!important;box-shadow:none!important}
      #askStateDrawer.has-answer .state-ask-clear{display:block!important}
      #askStateDrawer .state-ask-clear:hover{background:#eef3fa!important;color:#17233a!important}
      .state-ask-status{display:none;align-items:center;gap:7px;margin:8px 2px 0;font-size:11px;font-weight:700;color:#31598f}
      .state-ask-status.is-visible{display:flex}
      .state-ask-status::before{content:'';width:7px;height:7px;border-radius:50%;background:#1769e8;flex:0 0 auto}
      .state-ask-status.is-loading::before{animation:stateAskPulse .9s ease-in-out infinite alternate}
      .state-ask-status.is-ready{color:#277653}
      .state-ask-status.is-ready::before{background:#20a875}
      @keyframes stateAskPulse{from{opacity:.3;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
      #askStateDrawer.is-generating .ask-state-starters,#askStateDrawer.is-generating .ask-quick-actions-polish,#askStateDrawer.has-answer .ask-state-starters,#askStateDrawer.has-answer .ask-quick-actions-polish{display:none!important}
      #askStateDrawer.is-generating .ask-state-drawer-help,#askStateDrawer.has-answer .ask-state-drawer-help{margin-bottom:0!important}
      .ask-state-drawer.is-generating .ask-state-drawer-result{padding-top:10px!important}
      .ask-state-starters .ask-polish-icon,.ask-quick-actions-polish .ask-polish-icon{display:grid!important;place-items:center!important}
      .ask-state-starters .ask-polish-icon svg,.ask-quick-actions-polish .ask-polish-icon svg{width:21px!important;height:21px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}

      @media(max-width:760px){
        html,body{overflow-x:hidden!important}
        .software-shell{display:block!important;grid-template-columns:1fr!important}
        .sidebar-project,.sidebar-nav,.project-subnav,.app-sidebar>.demo-help-button{display:none!important}
        .app-sidebar{display:block!important;position:static!important;width:100%!important;height:auto!important;min-height:0!important;padding:8px 12px 0!important;border:0!important;background:transparent!important;overflow:visible!important}
        .mobile-primary-nav{display:flex!important;margin:0 -4px!important;padding:0 4px 10px!important}
        .mobile-subnav{display:flex!important}.mobile-subnav[hidden]{display:none!important}
        .app-workspace{padding-bottom:112px!important}
        .view-root,.page,.collection-page,.project-page{max-width:100%!important;min-width:0!important}

        .workspace-attention{padding:12px!important}
        .workspace-attention .attention-item{gap:8px!important;padding:11px!important}
        .workspace-attention .attention-item-copy{grid-template-columns:36px minmax(0,1fr)!important;column-gap:9px!important}
        .workspace-attention .attention-row-icon{width:30px!important;height:30px!important}
        .workspace-attention .attention-kind{align-self:flex-start!important;margin-top:2px!important;font-size:9px!important;padding:2px 6px!important}
        .workspace-status-card .state-fact-preview>.text-button{position:static!important;margin-top:8px!important}
        .workspace-status-card .state-fact-preview p{padding-right:0!important}

        .project-page .project-document-head{padding:0 0 16px!important;margin-bottom:16px!important}
        .project-page .project-title-line h2{font-size:30px!important}
        .project-page .project-document-summary{margin:6px 0 16px!important;font-size:13px!important}
        .project-page .project-document-meta{grid-template-columns:1fr!important}
        .project-page .project-document-meta>div{padding:0!important}
        .project-page .project-document-meta>div+div{border-left:0!important;border-top:1px solid #e2e6ed!important;padding:12px 0 0!important;margin-top:12px!important}
        .project-page .project-head-copy-context{font-size:10.5px!important}
        .project-page .project-wiki-prose p{font-size:13px!important;line-height:1.58!important}

        .open-items-page .open-items-section-head{padding:11px 13px!important}
        .open-items-page .open-items-section-body{padding:5px 13px 9px!important}
        .open-items-page .review-card-toggle{padding:13px 0!important}

        .notes-page .notes-filter-row{display:flex!important;flex-wrap:wrap!important;gap:6px!important}
        .notes-page .notes-date-filters{width:100%!important;overflow-x:auto!important;flex-wrap:nowrap!important}
        .notes-page .notes-status-filter{flex:1 1 100%!important}
        .notes-page .notes-status-filter select,.notes-page .notes-search{width:100%!important}
        .notes-page article.simple-note.note-index-row{grid-template-columns:32px minmax(0,1fr)!important;padding:12px 6px!important;column-gap:10px!important}
        .notes-page .note-index-status{grid-column:2!important;grid-row:auto!important;justify-self:start!important;margin:6px 0 0!important;max-width:100%!important}
        .notes-page .note-index-status .note-status,.notes-page .note-index-status [class*="status"]{display:inline-flex!important;align-items:center!important;width:auto!important;max-width:100%!important;min-height:0!important;padding:4px 7px!important;border-radius:999px!important;font-size:9.5px!important;line-height:1.1!important;white-space:normal!important;text-transform:none!important;letter-spacing:0!important}
        .notes-page .note-status.is-neutral-status{padding:0!important;border:0!important;background:transparent!important;font-size:10px!important;white-space:nowrap!important}

        .history-page .history-entry{padding:14px 0!important}.history-page .history-change{grid-template-columns:1fr!important;gap:8px!important}
        .settings-page .settings-section{padding:8px 9px!important;margin-bottom:6px!important}
        .settings-page .settings-rule-list li{align-items:center!important}

        .ask-state-drawer{width:100vw!important;max-width:100vw!important}
        .ask-state-drawer-head{padding:14px 18px 12px!important}
        .ask-state-drawer-controls{padding:13px 18px 17px!important}
        #askStateDrawer .ask-state-drawer-form input{height:46px!important;min-height:46px!important;max-height:46px!important;padding-left:12px!important;padding-right:86px!important;font-size:14px!important}
        #askStateDrawer .ask-state-drawer-form button[type="submit"]{right:6px!important;width:34px!important;height:34px!important}
        #askStateDrawer .state-ask-clear{right:44px!important;width:28px!important;height:28px!important;font-size:18px!important;line-height:28px!important}
      }
      @media(max-width:430px){
        .mobile-primary-nav,.mobile-subnav{margin-left:-4px!important;margin-right:-4px!important;padding-left:4px!important}
        .mobile-primary-nav .nav-item,.mobile-subnav button{padding:6px 10px!important;font-size:11.5px!important;white-space:nowrap!important}
      }
    `;
    document.head.appendChild(s);
  }

  function forceLightState(){
    document.body?.classList.remove('v88-dark');
    document.documentElement.style.colorScheme='light';
  }

  function markNorthstar(){
    document.querySelectorAll('#viewRoot h1,#viewRoot h2').forEach(el=>{
      if((el.textContent||'').trim()==='Northstar') el.classList.add('northstar-display');
    });
  }

  function simplifyWorkspaceBrowse(){
    document.querySelectorAll('.workspace-status-card .state-fact-preview>.text-button').forEach(b=>{
      if(/browse current state/i.test(b.textContent)) b.textContent='Browse →';
    });
  }

  function cleanNotes(){
    document.querySelectorAll('.notes-page .notes-disclosure').forEach(el=>el.remove());
    document.querySelectorAll('.notes-page .note-status,.notes-page .note-index-status [class*="status"]').forEach(el=>{
      if(/no review needed/i.test(el.textContent||'')) el.classList.add('is-neutral-status');
    });
  }

  function simplifyCurrentState(){
    document.querySelectorAll('.project-page .project-maintained-facts').forEach(el=>{el.hidden=true;});
    const head=document.querySelector('.project-page .project-document-head');
    if(!head) return;
    const row=head.querySelector('.project-head-row');
    const toolbar=document.querySelector('.project-page-toolbar');
    const copy=(toolbar&&toolbar.querySelector('.project-head-copy-context'))||head.querySelector('.project-head-copy-context');
    if(row&&copy&&copy.parentElement!==row) row.appendChild(copy);
    toolbar?.remove();
    const meta=head.querySelector('.project-document-meta');
    if(meta&&!head.querySelector('.project-meta-heading')){
      const label=document.createElement('span');
      label.className='project-meta-heading';
      label.textContent='Project status';
      meta.before(label);
    }
  }

  function styleEvidenceCallout(){
    const root=document.getElementById('viewRoot');
    if(!root) return;
    root.querySelectorAll('*').forEach(el=>{
      if(el.children.length) return;
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(/^(?:New )?Evidence may answer this question\./i.test(text)){
        el.classList.add('evidence-answer-callout');
        el.textContent='New evidence may answer this question. Review it before State treats the question as resolved.';
      }
    });
  }

  function syncHelpCard(){
    if(window.matchMedia('(max-width:760px)').matches) return;
    const sidebar=document.querySelector('.app-sidebar');
    const card=sidebar?.querySelector(':scope > .demo-help-button.state-help-card');
    if(!sidebar||!card) return;
    const rect=sidebar.getBoundingClientRect();
    const inset=18;
    card.style.left=`${Math.round(rect.left+inset)}px`;
    card.style.width=`${Math.max(0,Math.round(rect.width-inset*2))}px`;
  }

  function ensureAskStatus(){
    const drawer=document.getElementById('askStateDrawer');
    const form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form) return;
    let status=drawer.querySelector('.state-ask-status');
    if(!status){
      status=document.createElement('div');
      status.className='state-ask-status';
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      form.after(status);
    }
    let clear=form.querySelector('.state-ask-clear');
    if(!clear){
      clear=document.createElement('button');
      clear.type='button';
      clear.className='state-ask-clear';
      clear.setAttribute('aria-label','Clear question and answer');
      clear.textContent='×';
      form.appendChild(clear);
    }
    const result=drawer.querySelector('#askStateDrawerResult');
    const loading=!!result?.querySelector('.ask-live-loading') || drawer.dataset.askPending==='1';
    const error=!!result?.querySelector('.ask-live-error');
    const hasAnswer=!!result?.textContent?.trim()&&!result?.querySelector('.ask-live-loading')&&!error;
    const submit=form.querySelector('button[type="submit"]');
    if(error){delete drawer.dataset.askPending;}
    if(hasAnswer){delete drawer.dataset.askPending;}
    drawer.classList.toggle('is-generating',loading&&!hasAnswer&&!error);
    drawer.classList.toggle('has-answer',hasAnswer);
    if(submit) submit.disabled=loading&&!hasAnswer&&!error;
    status.className='state-ask-status';
    if(loading&&!hasAnswer&&!error){status.classList.add('is-visible','is-loading');status.textContent='Finding the answer…';}
    else if(hasAnswer){status.classList.add('is-visible','is-ready');status.textContent='Answer ready';}
    else status.textContent='';
  }

  function installAskLifecycle(){
    if(document.documentElement.dataset.stateAskLifecycle==='1') return;
    document.documentElement.dataset.stateAskLifecycle='1';

    document.addEventListener('submit',e=>{
      const form=e.target.closest?.('[data-review-batch-form="ask"]');
      if(!form) return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer){drawer.dataset.askPending='1';drawer.classList.remove('has-answer');}
      requestAnimationFrame(ensureAskStatus);
    },true);

    document.addEventListener('click',e=>{
      const clear=e.target.closest?.('.state-ask-clear');
      if(clear){
        e.preventDefault();e.stopImmediatePropagation();
        const drawer=document.getElementById('askStateDrawer');
        const input=drawer?.querySelector('#askStateDrawerInput');
        const result=drawer?.querySelector('#askStateDrawerResult');
        if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
        if(result) result.innerHTML='';
        if(drawer){delete drawer.dataset.askPending;drawer.classList.remove('has-answer','is-generating');}
        ensureAskStatus();
        return;
      }

      const button=e.target.closest?.('.ask-quick-actions-polish button');
      if(!button) return;
      const label=(button.textContent||'').replace(/\s+/g,' ').trim();
      const prompt=button.dataset.q||button.dataset.reviewBatchPrompt||QUICK_ACTIONS.get(label);
      if(!prompt) return;
      e.preventDefault();e.stopImmediatePropagation();
      const drawer=document.getElementById('askStateDrawer');
      const input=drawer?.querySelector('#askStateDrawerInput');
      const form=drawer?.querySelector('[data-review-batch-form="ask"]');
      if(!input||!form) return;
      input.value=prompt;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      drawer.dataset.askPending='1';
      drawer.classList.remove('has-answer');
      ensureAskStatus();
      form.requestSubmit();
    },true);

    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput') return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer && !e.target.value.trim() && !drawer.querySelector('#askStateDrawerResult')?.textContent?.trim()) drawer.classList.remove('has-answer');
    });
  }

  function run(){
    ensureLora();
    addStyles();
    forceLightState();
    markNorthstar();
    simplifyWorkspaceBrowse();
    cleanNotes();
    simplifyCurrentState();
    styleEvidenceCallout();
    syncHelpCard();
    ensureAskStatus();
    installAskLifecycle();
  }

  let queued=false;
  const schedule=()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;run();});
  };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',syncHelpCard,{passive:true});
  window.addEventListener('scroll',syncHelpCard,{passive:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();