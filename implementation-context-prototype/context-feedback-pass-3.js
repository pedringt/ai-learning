(() => {

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


  // The Ask status line and lifecycle moved to context-ask-controls.js (#450).
  function run(){
    syncHelpCard();
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
