
/* v93 shared shell behavior for standalone artifact pages */
(()=>{
  const root=document.documentElement;
  const body=document.body;
  const btn=document.getElementById('v922ThemeToggle');
  const mobile=document.getElementById('v922MobileNav');
  const isDark=()=>body.classList.contains('v88-dark');
  const applyIcon=()=>{
    if(!btn)return;
    const dark=isDark();
    btn.textContent=dark?'☀':'☾';
    btn.setAttribute('aria-pressed',dark?'true':'false');
    btn.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    btn.title=dark?'Switch to light mode':'Switch to dark mode';
  };
  if(localStorage.getItem('ai-cs-theme')==='dark') body.classList.add('v88-dark');
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
})();
