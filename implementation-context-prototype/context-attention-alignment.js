(() => {
  const PASS='r82-final-balance';


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

      // QA follow-up (2026-09-14): this used to pad a short fact list out
      // toward 4 items using window.PROJECT_CONTEXT_DATA's static k-entry
      // statement -- Northstar's own fixture, unconditionally, regardless
      // of which project is actually active. Doesn't affect today's two
      // seeded projects (both have well over 4 real facts) but is the same
      // leak class as the rest of this pass; a real fact count under 4
      // should just show fewer bullets, not synthesize one from another
      // project's fixture data.

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
    // Write only on change (#450): identical writes every frame kept every layer's observer busy.
    if(!input.required) input.required=true;
    const blank=!input.value.trim();
    if(submit){
      if(submit.disabled!==blank) submit.disabled=blank;
      if(submit.getAttribute('aria-disabled')!==String(blank)) submit.setAttribute('aria-disabled',String(blank));
    }
  }

  let closeShieldTimer=0;
  function shieldMobileNav(){
    if(!matchMedia('(max-width:760px)').matches) return;
    document.body.classList.add('state-ask-close-shield');
    clearTimeout(closeShieldTimer);
    closeShieldTimer=setTimeout(()=>document.body.classList.remove('state-ask-close-shield'),600);
  }

  const closeTarget=event=>event.target?.closest?.('#askStateDrawer [data-review-batch-action="close-ask"],#askStateDrawer .ask-state-drawer-close');
  window.addEventListener('pointerdown',event=>{if(closeTarget(event))shieldMobileNav()},true);
  window.addEventListener('touchstart',event=>{if(closeTarget(event))shieldMobileNav()},{capture:true,passive:true});
  document.addEventListener('click',event=>{if(closeTarget(event))shieldMobileNav()},true);
  document.addEventListener('input',event=>{if(event.target?.id==='askStateDrawerInput')syncAskBlankGuard()},true);

  function sync(){
    if(document.documentElement.dataset.stateMobilePass!==PASS) document.documentElement.dataset.stateMobilePass=PASS;
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