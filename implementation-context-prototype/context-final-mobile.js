(() => {
  // loadAttentionAlignment (a fallback loader that never ran: index.html always loads the script) and
  // removeWorkspaceAttentionIcon (its class is rendered nowhere) were removed in #450.
  function ensureMobileHelp(){
    const root=document.getElementById('viewRoot');
    const page=root?.querySelector('.page,.overview');
    if(!page)return;
    root.querySelectorAll('.state-mobile-help').forEach(el=>{if(el.parentElement!==page)el.remove();});
    if(page.querySelector('.state-mobile-help'))return;
    const help=document.createElement('footer');
    help.className='state-mobile-help';
    help.innerHTML='<button type="button" data-action="show-demo-help">Need help? How State works →</button>';
    page.appendChild(help);
  }

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

  function reveal(){
    // classList.remove rewrites the class attribute even when the class is absent, which
    // re-triggered every layer's observer each frame (#450).
    if(document.documentElement.classList.contains('state-final-mobile-pending')) document.documentElement.classList.remove('state-final-mobile-pending');
    if(window.__stateFinalMobileTimer){clearTimeout(window.__stateFinalMobileTimer);delete window.__stateFinalMobileTimer;}
  }

  // CSS position:sticky does not take effect for this element in this
  // layout (verified: even inline !important sticky + resetting every
  // overflow/transform/contain/filter property up the ancestor chain has
  // no effect, while position:fixed on the same element works normally).
  // This polyfills the same natural-until-scrolled-past behavior with a
  // sentinel + scroll listener instead of relying on sticky.
  let subnavSentinel=null;
  function syncSubnavSentinel(){
    const nav=document.getElementById('mobileProjectSubnav');
    if(!nav){subnavSentinel=null;return;}
    if(!subnavSentinel||subnavSentinel.nextElementSibling!==nav||subnavSentinel.parentElement!==nav.parentElement){
      subnavSentinel=nav.previousElementSibling&&nav.previousElementSibling.classList?.contains('mobile-subnav-sentinel')
        ? nav.previousElementSibling
        : document.createElement('div');
      subnavSentinel.className='mobile-subnav-sentinel';
      subnavSentinel.style.cssText='height:0;margin:0;padding:0;pointer-events:none';
      if(subnavSentinel.nextElementSibling!==nav) nav.parentElement.insertBefore(subnavSentinel,nav);
    }
    updateSubnavPin();
  }
  function updateSubnavPin(){
    const nav=document.getElementById('mobileProjectSubnav');
    if(!nav||!subnavSentinel)return;
    if(nav.hidden||window.matchMedia('(max-width:760px)').matches===false){
      if(nav.classList.contains('is-pinned')){nav.classList.remove('is-pinned');subnavSentinel.style.height='0';}
      return;
    }
    const shouldPin=subnavSentinel.getBoundingClientRect().top<=0;
    if(shouldPin&&!nav.classList.contains('is-pinned')){
      subnavSentinel.style.height=nav.offsetHeight+'px';
      nav.classList.add('is-pinned');
    }else if(!shouldPin&&nav.classList.contains('is-pinned')){
      nav.classList.remove('is-pinned');
      subnavSentinel.style.height='0';
    }
  }
  // Listen on document with capture:true, not just window: on some mobile
  // browsers (notably iOS Safari) the box that actually scrolls -- and so
  // the element the 'scroll' event fires on -- ends up being <body>, not
  // the window/document, once body has any non-'visible' overflow-x/-y
  // (this codebase sets html,body{overflow-x:hidden} for mobile, which
  // browsers then coerce the other axis to 'auto' on, making body its own
  // scroll container). A window-only listener silently never fires there.
  // capture:true on document catches the event during capture regardless
  // of which element it targets.
  const onScroll=()=>{if(subnavSentinel)updateSubnavPin();};
  document.addEventListener('scroll',onScroll,{passive:true,capture:true});
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});

  function run(){ensureMobileHelp();syncMobileAskLauncher();syncSubnavSentinel();reveal();}
  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      
      ensureMobileHelp();
      syncMobileAskLauncher();
      syncSubnavSentinel();
      reveal();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-review-batch-action="close-ask"]')){
      requestAnimationFrame(()=>requestAnimationFrame(syncMobileAskLauncher));
    }
  },true);
  window.addEventListener('pageshow',syncMobileAskLauncher);
  window.addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();