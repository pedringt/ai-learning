/* Portfolio light/dark theme (DEC-034).
   Follows the visitor's system setting until they use the header toggle; that choice is remembered.
   Loaded synchronously in <head> on every portfolio page so the theme is set before first paint.
   Colours live in site-dark.css, keyed on html[data-theme="dark"]. */
(function(){
  var KEY='cs-theme';
  var root=document.documentElement;
  var media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;

  function saved(){
    try{var v=localStorage.getItem(KEY);return v==='dark'||v==='light'?v:null;}catch(e){return null;}
  }
  function preferred(){return saved()||(media&&media.matches?'dark':'light');}
  function isDark(){return root.getAttribute('data-theme')==='dark';}

  var SUN='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  function syncButton(){
    var button=document.getElementById('csThemeToggle');
    if(!button)return;
    var dark=isDark();
    button.setAttribute('aria-pressed',String(dark));
    button.title=dark?'Switch to light mode':'Switch to dark mode';
    button.innerHTML=dark?SUN:MOON;
  }
  function apply(theme){
    root.setAttribute('data-theme',theme);
    syncButton();
  }

  apply(preferred());

  /* Keep following the system setting until the visitor makes an explicit choice. */
  if(media){
    var onChange=function(){if(!saved())apply(preferred());};
    if(media.addEventListener)media.addEventListener('change',onChange);
    else if(media.addListener)media.addListener(onChange);
  }

  function mount(){
    var host=document.querySelector('.topbar .top-actions');
    if(!host||document.getElementById('csThemeToggle'))return;
    var button=document.createElement('button');
    button.type='button';
    button.id='csThemeToggle';
    button.className='theme-toggle';
    button.setAttribute('aria-label','Dark mode');
    button.addEventListener('click',function(){
      var next=isDark()?'light':'dark';
      try{localStorage.setItem(KEY,next);}catch(e){}
      apply(next);
    });
    host.appendChild(button);
    syncButton();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
  else mount();
})();
