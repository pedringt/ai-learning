(() => {
  const STYLE_ID='state-attention-alignment';
  const PASS='r82-final-balance';

  document.getElementById(STYLE_ID)?.remove();
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    /* Record surfaces: headers stay on the page background; records live on one white surface. */
    html body .open-items-page .open-items-section,
    html body .open-items-page .open-items-section-head{background:transparent!important;box-shadow:none!important}
    html body .open-items-page .open-items-section-body,
    html body .open-items-page .open-question-list{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important;box-sizing:border-box!important}
    html body .open-items-page .open-question-list{padding-left:0!important;padding-right:0!important}

    /* Questions keep a modest inset. Reviews align to the same text column and get a neutral marker. */
    html body .open-items-page details.open-question-item,
    html body .open-items-page .open-question-row{background:transparent!important;box-shadow:none!important;box-sizing:border-box!important;padding-left:12px!important;padding-right:16px!important}
    html body .open-items-page .review-card,
    html body .open-items-page .compact-review{background:transparent!important;box-shadow:none!important;box-sizing:border-box!important;position:relative!important;padding-left:40px!important;padding-right:16px!important}
    html body .open-items-page .review-card::before,
    html body .open-items-page .compact-review::before{content:''!important;position:absolute!important;left:18px!important;top:23px!important;width:7px!important;height:7px!important;border-radius:999px!important;background:#9aa5b5!important;box-shadow:none!important}

    html body .notes-page .note-results,
    html body .notes-page #notesList{width:100%!important;max-width:none!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .notes-page .note-index-status{gap:6px!important}
    html body .notes-page .note-history-link{font-size:11.5px!important;white-space:nowrap!important}

    html body .history-page .history-list,
    html body .history-page #historyList{width:100%!important;max-width:none!important;box-sizing:border-box!important;padding:20px 24px 24px!important;background:var(--surface,#fff)!important;box-shadow:none!important}
    html body .history-page .history-entry,
    html body .history-page .history-entry-body{width:100%!important;max-width:none!important;background:transparent!important;box-sizing:border-box!important;padding-left:0!important;padding-right:0!important}
    html body .history-page .history-change{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
    html body .history-page .history-change>p{width:100%!important;max-width:none!important;box-sizing:border-box!important}

    /* Workspace summary pair: equal cards and one shared header geometry. */
    html body .workspace-below-grid{align-items:stretch!important;grid-auto-rows:auto!important}
    html body .workspace-recent,
    html body .workspace-status-card{align-self:stretch!important;height:100%!important;min-height:0!important}

    html body .workspace-recent-head,
    html body .workspace-status-card>.eyebrow{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;gap:12px!important;align-items:start!important;min-height:0!important;height:auto!important;margin:0 0 12px!important;padding-left:0!important;position:relative!important}
    html body .workspace-recent-head>.section-icon,
    html body .workspace-status-card>.eyebrow>.section-icon{position:static!important;grid-column:1!important;grid-row:1!important;align-self:start!important;justify-self:start!important;transform:none!important;margin:0!important;width:36px!important;height:36px!important}

    html body .workspace-recent-head>.eyebrow{display:none!important}
    html body .workspace-recent-copy,
    html body .workspace-status-card .current-state-copy{grid-column:2!important;grid-row:1!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;align-items:flex-start!important;gap:4px!important;min-width:0!important}
    html body .workspace-recent-title,
    html body .workspace-status-card .current-state-title{display:block!important;margin:0!important;padding:0!important;color:var(--ink,#101a31)!important;font-size:16px!important;font-weight:820!important;letter-spacing:-.01em!important;text-transform:none!important;line-height:1.2!important}
    html body .workspace-recent-copy .workspace-section-hint,
    html body .workspace-status-card .current-state-support{display:block!important;margin:0!important;padding:0!important;color:#64718a!important;font-size:12px!important;font-weight:500!important;letter-spacing:0!important;text-transform:none!important;line-height:1.4!important}
    html body .workspace-recent-head>.text-button,
    html body .workspace-status-card .current-state-browse{grid-column:3!important;grid-row:1!important;align-self:start!important;justify-self:end!important;position:static!important;margin:3px 0 0!important;white-space:nowrap!important;font-size:11.5px!important}

    html body .workspace-status-card{display:block!important;position:relative!important}
    html body .workspace-status-card>.eyebrow{font-size:0!important}
    html body .workspace-status-card>.eyebrow::after{content:none!important;display:none!important}
    html body .workspace-status-card .workspace-status-body{display:block!important;flex:0 0 auto!important;height:auto!important;min-height:0!important;margin-top:0!important}
    html body .workspace-status-card .state-fact-preview{display:block!important;flex:0 0 auto!important;height:auto!important;min-height:0!important;padding-top:0!important;justify-content:flex-start!important}
    html body .workspace-status-card .state-fact-preview>ul{margin:0!important}

    /* Attention header is one real row. */
    html body .workspace-attention .workspace-attention-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important}
    html body .workspace-attention .workspace-attention-head>div{display:flex!important;align-items:center!important;gap:12px!important;min-width:0!important;min-height:38px!important;padding-left:0!important;position:static!important;flex:1 1 auto!important}
    html body .workspace-attention .workspace-attention-head .attention-head-icon{position:static!important;display:grid!important;place-items:center!important;flex:0 0 38px!important;width:38px!important;height:38px!important;margin:0!important;transform:none!important;top:auto!important;left:auto!important}
    html body .workspace-attention .workspace-attention-head h3{margin:0!important;line-height:1.25!important;align-self:center!important}
    html body .workspace-attention .workspace-attention-head .eyebrow,
    html body .workspace-attention .workspace-attention-head p{display:none!important}

    /* Settings uses a substantial but bounded centered column. */
    html body .settings-page{width:100%!important;max-width:1280px!important;margin-left:auto!important;margin-right:auto!important;box-sizing:border-box!important}
    html body .settings-page .settings-section{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:var(--surface,#fff)!important;box-sizing:border-box!important;padding:20px 24px!important}

    /* Other Sources: one source per row, status aligned top-right with the title. */
    html body .settings-page .settings-source-grid{display:block!important;grid-template-columns:none!important;gap:0!important}
    html body .settings-page .settings-source-grid>.source-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:auto!important;column-gap:16px!important;row-gap:0!important;align-items:start!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:13px 0!important;border-top:1px solid #e5e8ed!important}
    html body .settings-page .settings-source-grid>.source-row:first-child{border-top:0!important}
    html body .settings-page .settings-source-grid>.source-row>div{grid-column:1!important;grid-row:1!important;width:100%!important;min-width:0!important}
    html body .settings-page .settings-source-grid>.source-row>.settings-status{grid-column:2!important;grid-row:1!important;align-self:start!important;justify-self:end!important;margin:1px 0 0!important;width:max-content!important;max-width:none!important;white-space:nowrap!important}
    html body .settings-page .settings-source-grid .source-title,
    html body .settings-page .settings-source-grid .source-description{min-width:0!important;max-width:100%!important}

    html body .settings-page>.page-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:28px!important;width:100%!important;max-width:none!important}
    html body .settings-page>.page-head>h2{margin:0!important;flex:0 0 auto!important}
    html body .settings-page>.page-head>p{margin:0!important;max-width:620px!important;line-height:1.45!important}

    /* Project stage is informational, not a warning. */
    html body .overview-stage{background:#f4f6ff!important;border-color:#d9def2!important;box-shadow:none!important}
    html body .overview-stage .workspace-stage-pill{background:#e8edff!important;color:#4f5f8e!important}
    html body .overview-stage .workspace-stage-pill::before{color:#6675a8!important}
    html body .overview-stage .workspace-next-step{color:#52617e!important}
    html body .overview-stage .workspace-next-arrow{display:none!important}

    @media(max-width:760px){
      html body .settings-page>.page-head{display:block!important}
      html body .settings-page>.page-head>p{margin-top:7px!important;max-width:none!important}
      html body .settings-page .settings-section{padding:18px 16px!important}
      html body .open-items-page details.open-question-item,
      html body .open-items-page .open-question-row{padding-left:10px!important;padding-right:12px!important}
      html body .open-items-page .review-card,
      html body .open-items-page .compact-review{padding-left:34px!important;padding-right:12px!important}
      html body .open-items-page .review-card::before,
      html body .open-items-page .compact-review::before{left:14px!important;top:21px!important}
      html body .notes-page .note-index-status{display:flex!important;flex-wrap:wrap!important;justify-self:start!important;align-self:start!important;width:100%!important;min-width:0!important;max-width:100%!important;margin-left:0!important}
      html body .notes-page .note-index-status .note-status,
      html body .notes-page .note-index-status .note-status-link{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;width:auto!important;max-width:100%!important;height:auto!important;min-height:26px!important;padding:5px 9px!important;border-radius:999px!important;line-height:1.25!important;white-space:nowrap!important}
      html body .settings-page .settings-rule-form>.btn{width:auto!important;min-width:0!important;height:38px!important;min-height:38px!important;padding:0 12px!important;border-radius:8px!important;font-size:12px!important;line-height:1.2!important;align-self:end!important}
      html body .workspace-below-grid{align-items:start!important;grid-auto-rows:min-content!important}
      html body .workspace-recent,
      html body .workspace-status-card{align-self:start!important;height:auto!important}
      html body .workspace-recent-head,
      html body .workspace-status-card>.eyebrow{grid-template-columns:auto minmax(0,1fr) auto!important;align-items:start!important}
      html body .workspace-status-card .state-fact-preview li:nth-child(n+4){display:none!important}
      html body .workspace-attention .workspace-attention-head{display:flex!important}
      html body .history-page .history-list,
      html body .history-page #historyList{padding:18px 16px 20px!important}
      html body .settings-page .settings-source-grid>.source-row{column-gap:10px!important}
      html body .settings-page .settings-source-grid>.source-row>.settings-status{font-size:11px!important;padding-left:9px!important;padding-right:9px!important}
    }
  `;
  document.head.appendChild(style);

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  function normalizeWorkspacePair(scope=document){
    const grid=scope.querySelector?.('.workspace-below-grid');
    const recent=grid?.querySelector('.workspace-recent');
    const recentHead=recent?.querySelector('.workspace-recent-head');
    const mobile=matchMedia('(max-width:760px)').matches;

    if(recent&&recentHead){
      const icon=recentHead.querySelector(':scope > .section-icon');
      const oldEyebrow=recentHead.querySelector(':scope > .eyebrow');
      const hint=recent.querySelector(':scope > .workspace-section-hint');
      let copy=recentHead.querySelector(':scope > .workspace-recent-copy');
      if(!copy){
        copy=document.createElement('span');
        copy.className='workspace-recent-copy';
        if(icon) icon.after(copy); else recentHead.prepend(copy);
      }
      let title=copy.querySelector('.workspace-recent-title');
      if(!title){title=document.createElement('span');title.className='workspace-recent-title';title.textContent='What Changed';copy.prepend(title)}
      if(hint&&hint.parentElement!==copy) copy.appendChild(hint);
      if(oldEyebrow) important(oldEyebrow,'display','none');
      important(recent,'align-self',mobile?'start':'stretch');
      important(recent,'height',mobile?'auto':'100%');
    }

    scope.querySelectorAll?.('.workspace-status-card').forEach(card=>{
      const eyebrow=card.querySelector(':scope > .eyebrow');
      const preview=card.querySelector('.state-fact-preview');
      const body=card.querySelector('.workspace-status-body');
      if(!eyebrow||!preview) return;

      let support=eyebrow.querySelector('.current-state-support');
      const oldSupport=preview.querySelector(':scope > p');
      if(!support&&oldSupport){support=oldSupport;support.classList.add('current-state-support')}

      let title=eyebrow.querySelector('.current-state-title');
      if(!title){title=document.createElement('span');title.className='current-state-title';title.textContent='Current State'}

      let copy=eyebrow.querySelector('.current-state-copy');
      if(!copy){
        copy=document.createElement('span');
        copy.className='current-state-copy';
        const icon=eyebrow.querySelector(':scope > .section-icon');
        if(icon) icon.after(copy); else eyebrow.prepend(copy);
      }
      if(title.parentElement!==copy) copy.appendChild(title);
      if(support&&support.parentElement!==copy) copy.appendChild(support);

      let browse=eyebrow.querySelector(':scope > .current-state-browse');
      const oldBrowse=preview.querySelector(':scope > .text-button');
      if(!browse&&oldBrowse){browse=oldBrowse;browse.classList.add('current-state-browse');eyebrow.appendChild(browse)}

      const list=preview.querySelector(':scope > ul');
      if(list&&list.children.length<4){
        const fact=window.PROJECT_CONTEXT_DATA?.knowledge?.find?.(item=>item.id==='k-entry'&&item.state==='current')?.statement;
        if(fact){const li=document.createElement('li');li.textContent=fact;list.appendChild(li)}
      }

      important(card,'align-self',mobile?'start':'stretch');
      important(card,'height',mobile?'auto':'100%');
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
      if(browse){important(browse,'grid-column','3');important(browse,'grid-row','1');important(browse,'align-self','start');important(browse,'justify-self','end');important(browse,'position','static');important(browse,'margin','3px 0 0')}
    });

    important(grid,'align-items',mobile?'start':'stretch');
    important(grid,'grid-auto-rows',mobile?'min-content':'auto');
  }

  function normalizeAttention(scope=document){
    scope.querySelectorAll?.('.workspace-attention').forEach(section=>{
      const head=section.querySelector('.workspace-attention-head');
      const copy=head?.querySelector(':scope > div');
      const icon=copy?.querySelector('.attention-head-icon');
      const title=copy?.querySelector('h3');
      if(!head||!copy||!title) return;
      important(head,'display','flex');important(head,'align-items','flex-start');important(copy,'display','flex');important(copy,'align-items','center');important(copy,'gap','12px');important(copy,'padding-left','0');important(copy,'position','static');important(copy,'min-height','38px');
      if(icon){important(icon,'position','static');important(icon,'flex','0 0 38px');important(icon,'width','38px');important(icon,'height','38px');important(icon,'margin','0');important(icon,'transform','none');important(icon,'top','auto');important(icon,'left','auto')}
      important(title,'margin','0');important(title,'align-self','center');
    });
  }

  function normalizeSettings(scope=document){
    const mobile=matchMedia('(max-width:760px)').matches;
    const page=scope.querySelector?.('.settings-page');
    if(page){important(page,'width','100%');important(page,'max-width','1280px');important(page,'margin-left','auto');important(page,'margin-right','auto');important(page,'box-sizing','border-box')}
    scope.querySelectorAll?.('.settings-page .settings-section').forEach(section=>{important(section,'width','100%');important(section,'max-width','none');important(section,'margin-left','0');important(section,'margin-right','0');important(section,'border','0');important(section,'border-radius','0');important(section,'box-shadow','none');important(section,'background','var(--surface,#fff)');important(section,'box-sizing','border-box');important(section,'padding',mobile?'18px 16px':'20px 24px')});
    const grid=scope.querySelector?.('.settings-page .settings-source-grid');
    if(!grid) return;
    important(grid,'display','block');important(grid,'grid-template-columns','none');important(grid,'gap','0');
    grid.querySelectorAll(':scope > .source-row').forEach((row,index)=>{
      const content=row.querySelector(':scope > div');
      const status=row.querySelector(':scope > .settings-status');
      important(row,'display','grid');important(row,'grid-template-columns','minmax(0,1fr) auto');important(row,'grid-template-rows','auto');important(row,'column-gap',mobile?'10px':'16px');important(row,'row-gap','0');important(row,'align-items','start');important(row,'width','100%');important(row,'min-width','0');important(row,'box-sizing','border-box');important(row,'border-top',index===0?'0':'1px solid #e5e8ed');
      if(content){important(content,'grid-column','1');important(content,'grid-row','1');important(content,'width','100%');important(content,'min-width','0')}
      if(status){important(status,'grid-column','2');important(status,'grid-row','1');important(status,'align-self','start');important(status,'justify-self','end');important(status,'margin','1px 0 0');important(status,'width','max-content');important(status,'max-width','none')}
    });
  }

  function normalizeStage(scope=document){
    const stage=scope.querySelector?.('.overview-stage');
    if(stage){important(stage,'background','#f4f6ff');important(stage,'background-color','#f4f6ff');important(stage,'border-color','#d9def2');important(stage,'box-shadow','none')}
    scope.querySelectorAll?.('.overview-stage *').forEach(el=>{
      if(!/^late discovery$/i.test(el.textContent?.trim()||'')) return;
      important(el,'background','#e8edff');important(el,'background-color','#e8edff');important(el,'color','#4f5f8e');important(el,'border-color','#d9def2');important(el,'box-shadow','none');
    });
  }

  function normalizeRecordSurfaces(scope=document){
    const mobile=matchMedia('(max-width:760px)').matches;
    scope.querySelectorAll?.('.open-items-page .open-items-section-body,.open-items-page .open-question-list').forEach(el=>{important(el,'width','100%');important(el,'max-width','none');important(el,'background','var(--surface,#fff)');important(el,'box-shadow','none');important(el,'box-sizing','border-box')});
    scope.querySelectorAll?.('.open-items-page .open-question-list').forEach(el=>{important(el,'padding-left','0');important(el,'padding-right','0')});
    scope.querySelectorAll?.('.open-items-page details.open-question-item,.open-items-page .open-question-row').forEach(el=>{important(el,'background','transparent');important(el,'box-shadow','none');important(el,'box-sizing','border-box');important(el,'padding-left',mobile?'10px':'12px');important(el,'padding-right',mobile?'12px':'16px')});
    scope.querySelectorAll?.('.open-items-page .review-card,.open-items-page .compact-review').forEach(el=>{important(el,'background','transparent');important(el,'box-shadow','none');important(el,'box-sizing','border-box');important(el,'position','relative');important(el,'padding-left',mobile?'34px':'40px');important(el,'padding-right',mobile?'12px':'16px')});
    const history=scope.querySelector?.('.history-page .history-list,.history-page #historyList');
    if(history){important(history,'width','100%');important(history,'max-width','none');important(history,'box-sizing','border-box');important(history,'background','var(--surface,#fff)');important(history,'padding',mobile?'18px 16px 20px':'20px 24px 24px')}
    scope.querySelectorAll?.('.history-page .history-entry,.history-page .history-entry-body').forEach(el=>{important(el,'width','100%');important(el,'max-width','none');important(el,'box-sizing','border-box');important(el,'padding-left','0');important(el,'padding-right','0')});
    scope.querySelectorAll?.('.history-page .history-change').forEach(el=>{important(el,'width','100%');important(el,'max-width','none');important(el,'box-sizing','border-box');important(el,'margin-left','0');important(el,'margin-right','0')});
    scope.querySelectorAll?.('.history-page .history-change>p').forEach(el=>{important(el,'width','100%');important(el,'max-width','none');important(el,'box-sizing','border-box')});
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
    normalizeWorkspacePair(document);
    normalizeAttention(document);
    normalizeSettings(document);
    normalizeStage(document);
    normalizeRecordSurfaces(document);
    syncAskBlankGuard();
  }

  let queued=false;
  function schedule(){if(queued) return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();