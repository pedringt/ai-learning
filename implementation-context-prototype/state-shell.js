(function(){const h=location.hostname;if(h==='state.authenticignorance.site'){location.replace('https://state.contextswitch.tech'+location.pathname+location.search+location.hash);}})();

/* State's own shell behavior.
 * Copied from the portfolio's site-shell.js so the State app no longer depends on the portfolio deployment (#228).
 * The portfolio traffic-analytics loader was removed: State visits must not be counted in portfolio analytics.
 * The portfolio-page patches (title/hero/Applied Work/validation rewrites, mobile nav, secondary menu) matched
 * nothing in State and were removed in the Nov 5 cleanup. */
(()=>{
  const body=document.body;

  /* final-freeze-polish.css and this file's two style blocks now load statically from state-app.css (#450). */

  // State is light-only (#229). Its styling is written for light mode and its theme toggle is
  // hidden, so following the browser's dark-mode preference (or a theme saved on this origin by
  // the portfolio) only flipped a handful of rules to dark and left the app half-dark.
  // Never add the dark class.
  body.classList.remove('v88-dark');

  const normalizeAuthorityCopy=()=>{
    document.querySelectorAll('.demo-flow-principle').forEach(node=>{if(node.textContent.trim()==='AI interprets → software enforces → people decide') node.textContent='AI interprets → software enforces → people authorize';});
  };

  const polishSlackSettings=()=>{
    const section=document.getElementById('settings-slack');
    if(!section)return;
    const preview=section.querySelector('.slack-preview');
    if(preview&&!section.querySelector('.settings-channel-heading')){
      const heading=document.createElement('div');heading.className='settings-channel-heading';heading.innerHTML='<strong>Approved channels</strong><span>Choose which channel conversations State can use as Evidence.</span>';preview.parentNode.insertBefore(heading,preview);
    }
    section.querySelectorAll('[data-settings-action="toggle-channel"]').forEach(control=>{
      const enabled=control.dataset.enabled==='1';const label=enabled?'Disable channel':'Enable channel';if(control.textContent!==label) control.textContent=label;
      const row=control.closest('.slack-preview-row');const channel=row?.querySelector('strong')?.textContent?.trim();const aria=channel?`${enabled?'Disable':'Enable'} ${channel}`:'';if(aria&&control.getAttribute('aria-label')!==aria) control.setAttribute('aria-label',aria);
    });
  };

  let askPageY=0;let askScrollLocked=false;
  const askDrawerIsOpen=()=>{const drawer=document.getElementById('askStateDrawer');if(!drawer||drawer.hidden||drawer.getAttribute('aria-hidden')==='true') return false;const style=window.getComputedStyle(drawer);return style.display!=='none'&&style.visibility!=='hidden';};
  const lockAskBackground=()=>{if(askScrollLocked)return;askPageY=window.scrollY||window.pageYOffset||0;body.style.position='fixed';body.style.top=`-${askPageY}px`;body.style.left='0';body.style.right='0';body.style.width='100%';body.style.overflow='hidden';askScrollLocked=true;};
  const unlockAskBackground=()=>{if(!askScrollLocked)return;body.style.position='';body.style.top='';body.style.left='';body.style.right='';body.style.width='';body.style.overflow='';askScrollLocked=false;window.scrollTo(0,askPageY);};
  const syncAskBackground=()=>{askDrawerIsOpen()?lockAskBackground():unlockAskBackground();};
  const stateUiObserver=new MutationObserver(()=>{syncAskBackground();polishSlackSettings();normalizeAuthorityCopy();});
  stateUiObserver.observe(body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style']});
  syncAskBackground();polishSlackSettings();normalizeAuthorityCopy();

  const polishAskLauncher=()=>{const launcher=document.querySelector('.ask-state-launcher');if(!launcher)return false;if(!launcher.dataset.sparkleLabel){const label=launcher.textContent.trim().replace(/^✦\s*/, '') || 'Ask State';launcher.textContent=`✦ ${label}`;launcher.dataset.sparkleLabel='true';}return true;};
  if(!polishAskLauncher()){const observer=new MutationObserver(()=>{if(polishAskLauncher())observer.disconnect();});observer.observe(body,{childList:true,subtree:true});window.setTimeout(()=>observer.disconnect(),10000);}
})();