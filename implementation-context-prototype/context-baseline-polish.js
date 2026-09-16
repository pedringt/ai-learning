(() => {
  const BASELINE_AREA_DESCRIPTION='Baseline section created from human-authorized project material.';

  function syncBaselinePresentation(){
    const banner=document.getElementById('baselineSetupBanner');
    const active=!!banner&&!banner.hidden;
    document.body.classList.toggle('state-baseline-active',active);

    const copy=banner?.querySelector('.baseline-setup-copy');
    if(copy) copy.textContent=copy.textContent.replace('Starting State State assembles','Starting State that State assembles');

    // Older baseline accepts stored setup-process copy as an area description.
    // It is not project truth, so never render it as wiki content. New Starting
    // State confirmations create areas without this description.
    document.querySelectorAll('.project-outline-description').forEach(node=>{
      if(String(node.textContent||'').trim()===BASELINE_AREA_DESCRIPTION) node.remove();
    });

    if(!active)return;
    const patience=document.querySelector('.analysis-patience');
    if(patience)patience.textContent='Larger starting sources can take a little while to analyze. You can review the Starting State when they finish.';
  }

  function addStyles(){
    if(document.getElementById('state-baseline-polish-styles'))return;
    const style=document.createElement('style');
    style.id='state-baseline-polish-styles';
    style.textContent=`
      body.state-baseline-active .state-reviewer-guide{display:none!important}
      #baselineSetupBanner{padding:10px 12px!important;border-radius:10px!important;box-shadow:none!important}
      #baselineSetupBanner .baseline-review-button{width:auto!important;min-height:32px!important;padding:6px 10px!important;font-size:12px!important}
    `;
    document.head.appendChild(style);
  }

  function start(){
    addStyles();syncBaselinePresentation();
    new MutationObserver(()=>requestAnimationFrame(syncBaselinePresentation))
      .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
