(() => {
  const QUICK_ACTIONS = new Map([
    ['Summarize this page', 'Summarize the current state. Focus on the most consequential accepted project understanding and keep unresolved items separate.'],
    ['Show open questions', 'What are we still unsure about?'],
    ['Show recent changes', 'What changed recently?']
  ]);



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
    const toolbar=document.querySelector('.project-page-toolbar');
    toolbar?.remove();
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
