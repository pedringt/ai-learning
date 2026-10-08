(() => {
  const PASS='r82-final-balance';

  const important=(el,prop,value)=>el?.style?.setProperty(prop,value,'important');

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
    
    normalizeStage(document);
    syncAskBlankGuard();
  }

  let queued=false;
  function schedule(){if(queued) return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();