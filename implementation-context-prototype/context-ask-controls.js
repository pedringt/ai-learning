// Ask drawer controls (#450). Consolidated, in their original order, from the patch layers
// that used to own them: context-feedback-pass.js (mobileAsk, askControlStates),
// context-feedback-pass-3.js (status line, lifecycle), context-feedback-pass-4.js (reset
// button, control visibility), context-attention-alignment.js (blank-question guard, mobile
// close shield) and context-final-mobile.js (mobile launcher). Capture-phase handlers here
// call stopImmediatePropagation, so registration order matters and matches the old files:
// the close shield registers on load; the rest on DOMContentLoaded (feedback-pass, then
// feedback-pass-4); the feedback-pass-3 lifecycle one animation frame later.
// The Ask flow itself (runAsk, routing, read-only guard) lives in context-product-polish.js.
(() => {


  // ---- from context-feedback-pass.js ----
  function mobileAsk(){
    if(document.documentElement.dataset.stateAskMobileHardening==='1')return;document.documentElement.dataset.stateAskMobileHardening='1';
    document.addEventListener('pointerup',e=>{
      if(!matchMedia('(max-width:760px)').matches)return;
      const close=e.target.closest?.('#askStateDrawer .ask-state-drawer-close');
      if(close){e.preventDefault();e.stopImmediatePropagation();const d=document.getElementById('askStateDrawer'),l=document.getElementById('askStateLauncher');if(d)d.hidden=true;if(l)l.classList.remove('is-hidden');return}
      const starter=e.target.closest?.('#askStateDrawer [data-review-batch-prompt]');
      // Re-fire a real click on the same element rather than reimplementing
      // "fill the input and submit" here: that reimplementation used
      // form.requestSubmit(), which only ever reaches runAsk() through the
      // plain form-submit handler in context-product-polish.js -- the one
      // that (correctly) treats untrusted text through the classifier. The
      // starter's own click handler passes {skipRouting:true} for exactly
      // this text; on mobile, this pointerup handler's preventDefault +
      // stopImmediatePropagation was suppressing that click handler from
      // ever running at all, so tapping a starter here on mobile always
      // hit the classifier fresh and (for 3 of the 5 starters, whose
      // instruction wording trips it -- see state-ask-starter-routing-
      // tests.js) rendered the static Open Items card instead of a real
      // answer, unlike the same tap on desktop.
      if(starter){e.preventDefault();e.stopImmediatePropagation();starter.click();return}
    },true);
  }

  function askControlStates(){
    if(document.documentElement.dataset.stateAskControlStates==='1')return;document.documentElement.dataset.stateAskControlStates='1';
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(!drawer?.classList.contains('has-answer'))return;
      if(!e.target.value.trim()){
        drawer.classList.remove('is-editing-answer');
        return;
      }
      drawer.classList.add('is-editing-answer');
    });
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer [data-review-batch-form="ask"]'))return;
      document.getElementById('askStateDrawer')?.classList.remove('is-editing-answer');
    },true);
  }

  // ---- from context-feedback-pass-3.js ----
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
    const result=drawer.querySelector('#askStateDrawerResult');
    const loading=!!result?.querySelector('.ask-live-loading') || drawer.dataset.askPending==='1';
    const error=!!result?.querySelector('.ask-live-error');
    const hasAnswer=!!result?.textContent?.trim()&&!result?.querySelector('.ask-live-loading')&&!error;
    const submit=form.querySelector('button[type="submit"]');
    if(error){delete drawer.dataset.askPending;}
    if(hasAnswer){delete drawer.dataset.askPending;}
    drawer.classList.toggle('is-generating',loading&&!hasAnswer&&!error);
    drawer.classList.toggle('has-answer',hasAnswer);
    // The submit button's disabled state is owned by context-attention-alignment.js
    // (syncAskBlankGuard: disabled only while the question is blank). This file used
    // to set it as well, and the two fought every frame (#450).
    // Write only on change: rewriting identical values each frame re-triggered every
    // layer's MutationObserver (#450).
    const generating=loading&&!hasAnswer&&!error;
    const statusClass=generating?'state-ask-status is-visible is-loading':hasAnswer?'state-ask-status is-visible is-ready':'state-ask-status';
    const statusText=generating?'Finding the answer…':hasAnswer?'Answer ready':'';
    if(status.className!==statusClass) status.className=statusClass;
    if(status.textContent!==statusText) status.textContent=statusText;
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

    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput') return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer && !e.target.value.trim() && !drawer.querySelector('#askStateDrawerResult')?.textContent?.trim()) drawer.classList.remove('has-answer');
    });
  }

  // ---- from context-feedback-pass-4.js ----
  function ensureResetButton(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form) return;
    let reset=form.querySelector('.state-ask-reset');
    if(!reset){
      reset=document.createElement('button');
      reset.type='button';
      reset.className='state-ask-reset';
      reset.setAttribute('aria-label','Clear answer and start a new Ask');
      reset.textContent='×';
      form.appendChild(reset);
    }
  }

  function syncAskControls(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form)return;
    ensureResetButton();
    const reset=form.querySelector('.state-ask-reset'),submit=form.querySelector('button[type="submit"]'),result=drawer.querySelector('#askStateDrawerResult');
    const hasAnswer=!!result?.querySelector('.ask-live-answer,.ask-answer-item') || (!!result?.textContent?.trim()&&!result?.querySelector('.ask-live-loading,.ask-live-error'));
    const generating=drawer.classList.contains('is-generating')||drawer.dataset.askPending==='1'||!!result?.querySelector('.ask-live-loading');
    drawer.classList.toggle('has-answer',hasAnswer&&!generating);
    if(reset){
      reset.style.setProperty('display',hasAnswer&&!generating?'block':'none','important');
      reset.style.setProperty('visibility',hasAnswer&&!generating?'visible':'hidden','important');
    }
    if(submit){
      submit.style.setProperty('display',hasAnswer&&!generating?'none':'grid','important');
      submit.style.setProperty('visibility',hasAnswer&&!generating?'hidden':'visible','important');
      submit.style.setProperty('pointer-events',hasAnswer&&!generating?'none':'auto','important');
    }
  }

  function restoreAskDiscovery(){
    const drawer=document.getElementById('askStateDrawer');if(!drawer)return;
    const input=drawer.querySelector('#askStateDrawerInput'),result=drawer.querySelector('#askStateDrawerResult');
    drawer.dataset.stateAskResetting='1';
    if(result)result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    delete drawer.dataset.askPending;
    drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    drawer.querySelectorAll('.state-ask-status').forEach(el=>{el.className='state-ask-status';el.textContent='';});
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;syncAskControls();});
  }

  function installAskControls(){
    if(document.documentElement.dataset.stateAskControlsR61==='1')return;
    document.documentElement.dataset.stateAskControlsR61='1';
    document.addEventListener('click',e=>{
      const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');
      if(!reset)return;
      e.preventDefault();e.stopImmediatePropagation();restoreAskDiscovery();
    },true);
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer .ask-state-drawer-form'))return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer){drawer.classList.remove('has-answer','is-editing-answer');drawer.dataset.askPending='1';}
      requestAnimationFrame(syncAskControls);
    },true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer?.dataset.stateAskResetting!=='1'&&drawer?.classList.contains('has-answer')) drawer.classList.add('is-editing-answer');
      requestAnimationFrame(syncAskControls);
    },true);
  }

  // ---- from context-attention-alignment.js ----
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

  // ---- from context-final-mobile.js ----
  function syncMobileAskLauncher(){
    if(!window.matchMedia('(max-width:760px)').matches)return;
    const launcher=document.getElementById('askStateLauncher');
    if(!launcher)return;
    const drawer=document.getElementById('askStateDrawer');
    const drawerOpen=!!drawer&&!drawer.hidden&&document.body.classList.contains('ask-state-drawer-open');
    launcher.classList.toggle('is-hidden',drawerOpen);
    if(!drawerOpen){
      launcher.style.removeProperty('opacity');
      launcher.style.removeProperty('visibility');
      launcher.style.removeProperty('pointer-events');
      launcher.style.removeProperty('transform');
      launcher.removeAttribute('aria-hidden');
    }
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-review-batch-action="close-ask"]')){
      requestAnimationFrame(()=>requestAnimationFrame(syncMobileAskLauncher));
    }
  },true);
  window.addEventListener('pageshow',syncMobileAskLauncher);

  // One observer replaces the four the old files each ran for these controls; the calls keep
  // the order those files ran in (feedback-pass-3, feedback-pass-4, attention-alignment,
  // final-mobile).
  function sync(){
    ensureAskStatus();
    installAskLifecycle();
    ensureResetButton();
    syncAskControls();
    syncAskBlankGuard();
    syncMobileAskLauncher();
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync();});};

  function start(){
    mobileAsk();askControlStates();          // feedback-pass run()
    installAskControls();ensureResetButton();syncAskControls(); // feedback-pass-4 run()
    syncAskBlankGuard();                      // attention-alignment sync()
    syncMobileAskLauncher();                  // final-mobile run()
    schedule();                               // feedback-pass-3: status + lifecycle on the next frame
    new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    window.addEventListener('resize',schedule,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
