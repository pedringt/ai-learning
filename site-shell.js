/* Load the existing site shell, then add the governance reference to Learning Library stage 05. */
(()=>{
  const core=document.createElement('script');
  core.src='site-shell-core.js';
  core.async=false;
  core.onload=()=>{
    const stage=document.querySelector('#governance-human-control .stage-body');
    if(stage&&!stage.querySelector('a[href="cheat-sheets/AI_Governance_Risk_PM_Cheat_Sheet.pdf"]')){
      const row=document.createElement('div');
      row.className='resource-row';
      const link=document.createElement('a');
      link.className='resource-link';
      link.href='cheat-sheets/AI_Governance_Risk_PM_Cheat_Sheet.pdf';
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent='AI governance, safety & privacy';
      row.appendChild(link);
      stage.appendChild(row);
    }
  };
  document.head.appendChild(core);
})();
