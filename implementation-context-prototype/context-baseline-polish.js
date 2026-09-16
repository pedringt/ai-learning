(() => {
  function syncBaselinePresentation(){
    const banner=document.getElementById('baselineSetupBanner');
    const active=!!banner&&!banner.hidden;
    document.body.classList.toggle('state-baseline-active',active);
    if(!active)return;
    const patience=document.querySelector('.analysis-patience');
    if(patience)patience.textContent='Larger starting sources can take a little while to analyze. You can review the Starting State when they finish.';
  }

  function addStyles(){
    if(document.getElementById('state-baseline-polish-styles'))return;
    const style=document.createElement('style');
    style.id='state-baseline-polish-styles';
    style.textContent='body.state-baseline-active .state-reviewer-guide{display:none!important}';
    document.head.appendChild(style);
  }

  function start(){
    addStyles();syncBaselinePresentation();
    new MutationObserver(()=>requestAnimationFrame(syncBaselinePresentation))
      .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
