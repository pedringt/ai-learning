(() => {
  // Keep the last UI layer authoritative without flashing an earlier design
  // while the final cleanup script loads. The fallback always reveals State
  // even if that optional polish script fails to load.
  document.documentElement.classList.add('state-final-mobile-pending');
  window.__stateFinalMobileTimer=setTimeout(()=>document.documentElement.classList.remove('state-final-mobile-pending'),1500);
  if(!document.querySelector('script[data-state-final-mobile]')){
    const finalScript=document.createElement('script');
    finalScript.dataset.stateFinalMobile='1';
    finalScript.src=(window.__STATE_BASE||'')+'context-final-mobile.js?v=r63-mobile-final';
    finalScript.addEventListener('error',()=>document.documentElement.classList.remove('state-final-mobile-pending'),{once:true});
    document.head.appendChild(finalScript);
  }

  // Workspace source status stays intentionally lightweight; this file is also a safe staging deploy trigger.
  const root = document.getElementById('viewRoot');
  if (!root) return;

  const DISMISS_KEY = 'state-workspace-source-banner-dismissed-v2';
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (err) { /* private mode etc -- just always show it */ }

  function decorate(){
    if (dismissed) return;
    const overview = root.querySelector('.overview');
    if (!overview || overview.querySelector('.workspace-source-strip')) return;
    const heading = overview.querySelector('.overview-heading');
    if (!heading) return;
    heading.insertAdjacentHTML('afterend', `<section class="workspace-source-strip" aria-label="Source status"><div class="workspace-source-head"><span class="meta-label">Sources</span><span class="workspace-source-name">Slack</span><span class="workspace-source-status">Just added</span></div><div class="workspace-source-head"><button class="btn secondary workspace-source-action" type="button" data-view="settings" data-anchor="settings-slack">Connect your apps →</button><button class="workspace-source-dismiss" type="button" aria-label="Dismiss">×</button></div></section>`);
    overview.querySelector('.workspace-source-dismiss')?.addEventListener('click', () => {
      dismissed = true;
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (err) { /* private mode etc -- dismissal just won't persist */ }
      overview.querySelector('.workspace-source-strip')?.remove();
    });
  }

  window.STATE_WORKSPACE_SOURCES = Object.freeze({decorate});
  decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(root,{childList:true,subtree:true});
})();
