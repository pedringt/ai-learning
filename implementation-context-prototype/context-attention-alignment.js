(() => {
  const PASS='r82-final-balance';

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

  function normalizeWorkspacePair(scope=document){
    const grid=scope.querySelector?.('.workspace-below-grid');
    const recent=grid?.querySelector('.workspace-recent');
    const recentHead=recent?.querySelector('.workspace-recent-head');

    if(recent&&recentHead){
      const icon=recentHead.querySelector(':scope > .section-icon');
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
    }

    scope.querySelectorAll?.('.workspace-status-card').forEach(card=>{
      const eyebrow=card.querySelector(':scope > .eyebrow');
      const preview=card.querySelector('.state-fact-preview');
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

    });

  }

  // The stage chip's own colors are in state-app.css now (#450). A "Late discovery" pill inside it
  // can only be matched by its text, so that part stays here.
  function normalizeStage(scope=document){
    scope.querySelectorAll?.('.overview-stage *').forEach(el=>{
      if(!/^late discovery$/i.test(el.textContent?.trim()||'')) return;
      important(el,'background','#e8edff');important(el,'background-color','#e8edff');important(el,'color','#4f5f8e');important(el,'border-color','#d9def2');important(el,'box-shadow','none');
    });
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
    normalizeStage(document);
    syncAskBlankGuard();
  }

  let queued=false;
  function schedule(){if(queued) return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();