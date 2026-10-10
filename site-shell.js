(function(){const h=location.hostname;if(h==='ai-learning-rouge.vercel.app'||h==='authenticignorance.site'||h==='www.authenticignorance.site'){location.replace('https://www.contextswitch.tech'+location.pathname+location.search+location.hash);}})();

/* Shared behavior for the portfolio's standalone pages (every page except index.html,
   which carries its own script). Trimmed in #451: this file was a copy of the State app's
   shell (now implementation-context-prototype/state-shell.js) and most of it targeted
   elements portfolio pages do not have: the Ask drawer, Slack settings, the Notes toolbar,
   index.html's home/portfolio/learn sections (index.html never loaded this file), and a
   theme toggle that no longer exists. final-freeze-polish.css is now a <link> in each page. */
(()=>{
  /* Portfolio traffic analytics. The domain restriction keeps staging,
     previews, and local QA out of the real portfolio numbers. */
  if(!document.querySelector('script[data-umami-portfolio]')){
    const analytics=document.createElement('script');
    analytics.defer=true;
    analytics.src='https://cloud.umami.is/script.js';
    analytics.setAttribute('data-website-id','238c100f-0a08-472c-9eb3-22acc2c795fa');
    analytics.setAttribute('data-domains','www.contextswitch.tech,contextswitch.tech,authenticignorance.site,www.authenticignorance.site');
    analytics.setAttribute('data-umami-portfolio','true');
    document.head.appendChild(analytics);
  }

  /* The portfolio is light-only (#428); clear a dark class left by an older saved theme. */
  document.body.classList.remove('v88-dark');

  /* Mobile page picker. */
  const mobile=document.getElementById('v922MobileNav');
  if(mobile) mobile.addEventListener('change',()=>{ location.href=mobile.value; });
})();
