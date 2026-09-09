
/* v93 shared shell behavior for standalone artifact pages */
(()=>{
  const root=document.documentElement;
  const body=document.body;
  const btn=document.getElementById('v922ThemeToggle');
  const mobile=document.getElementById('v922MobileNav');
  const isDark=()=>body.classList.contains('v88-dark');

  /* Small shared presentation layer for the final pre-freeze polish. */
  if(!document.querySelector('link[data-final-freeze-polish]')){
    const polish=document.createElement('link');
    polish.rel='stylesheet';
    polish.href=location.protocol==='file:'?'../final-freeze-polish.css':'/final-freeze-polish.css';
    polish.dataset.finalFreezePolish='true';
    document.head.appendChild(polish);
  }

  /* Mobile Learning Guide hardening. Keep expanded stage content inside the
     card bounds instead of letting old negative-offset polish clip it. */
  if(!document.getElementById('learning-mobile-bounds-fix')){
    const learningMobileFix=document.createElement('style');
    learningMobileFix.id='learning-mobile-bounds-fix';
    learningMobileFix.textContent=`
      @media(max-width:640px){
        [data-page="learn"] .learning-stage .stage-body{
          width:100%!important;
          max-width:100%!important;
          min-width:0!important;
          box-sizing:border-box!important;
        }
        [data-page="learn"] .learning-stage .stage-body > *,
        [data-page="learn"] .learning-stage .stage-group,
        [data-page="learn"] .learning-stage .learning-item{
          min-width:0!important;
          max-width:100%!important;
          box-sizing:border-box!important;
        }
        [data-page="learn"] .learning-stage .stage-group.practice{
          margin-left:0!important;
          margin-right:0!important;
          width:auto!important;
          max-width:100%!important;
        }
        [data-page="learn"] .learning-stage .resource-row{
          min-width:0!important;
          max-width:100%!important;
        }
        [data-page="learn"] .learning-stage .resource-link{
          max-width:100%!important;
          white-space:normal!important;
          overflow-wrap:anywhere!important;
        }
        [data-page="learn"] .learning-stage .learning-item,
        [data-page="learn"] .learning-stage .learning-item p,
        [data-page="learn"] .learning-stage .stage-group.practice p{
          overflow-wrap:break-word!important;
        }
      }
    `;
    document.head.appendChild(learningMobileFix);
  }

  const applyIcon=()=>{
    if(!btn)return;
    const dark=isDark();
    btn.textContent=dark?'☀':'☾';
    btn.setAttribute('aria-pressed',dark?'true':'false');
    btn.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    btn.title=dark?'Switch to light mode':'Switch to dark mode';
  };
  const savedTheme=localStorage.getItem('ai-cs-theme');
  const systemDark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  if(savedTheme==='dark'||(!savedTheme&&systemDark)) body.classList.add('v88-dark');
  applyIcon();
  if(btn) btn.addEventListener('click',()=>{
    body.classList.toggle('v88-dark');
    localStorage.setItem('ai-cs-theme',isDark()?'dark':'light');
    applyIcon();
  });
  if(mobile) mobile.addEventListener('change',()=>{ location.href=mobile.value; });
  document.addEventListener('click',e=>{
    document.querySelectorAll('.secondary-menu[open]').forEach(d=>{
      if(!d.contains(e.target))d.removeAttribute('open');
    });
  });

  /* State creates this launcher after the shell loads, so watch briefly and add the AI cue without changing behavior. */
  const polishAskLauncher=()=>{
    const launcher=document.querySelector('.ask-state-launcher');
    if(!launcher)return false;
    if(!launcher.dataset.sparkleLabel){
      const label=launcher.textContent.trim().replace(/^✦\s*/, '') || 'Ask State';
      launcher.textContent=`✦ ${label}`;
      launcher.dataset.sparkleLabel='true';
    }
    return true;
  };
  if(!polishAskLauncher()){
    const observer=new MutationObserver(()=>{if(polishAskLauncher())observer.disconnect();});
    observer.observe(body,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),10000);
  }
})();
