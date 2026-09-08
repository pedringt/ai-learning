
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
