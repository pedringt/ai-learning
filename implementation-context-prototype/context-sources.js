(() => {
  // Keep the last UI layer authoritative without flashing an earlier design
  // while the final cleanup script loads. The fallback always reveals State
  // even if that optional polish script fails to load.
  if(!document.getElementById('state-final-mobile-loader-style')){
    const guard=document.createElement('style');
    guard.id='state-final-mobile-loader-style';
    guard.textContent='html.state-final-mobile-pending .prototype-productbar,html.state-final-mobile-pending .software-shell{visibility:hidden!important}';
    document.head.appendChild(guard);
  }
  document.documentElement.classList.add('state-final-mobile-pending');
  window.__stateFinalMobileTimer=setTimeout(()=>document.documentElement.classList.remove('state-final-mobile-pending'),1500);
  if(!document.querySelector('script[data-state-final-mobile]')){
    const finalScript=document.createElement('script');
    finalScript.dataset.stateFinalMobile='1';
    finalScript.src=(location.protocol==='file:'?'context-final-mobile.js?v=r63-mobile-final':'/implementation-context-prototype/context-final-mobile.js?v=r63-mobile-final');
    finalScript.addEventListener('error',()=>document.documentElement.classList.remove('state-final-mobile-pending'),{once:true});
    document.head.appendChild(finalScript);
  }

  // Workspace source status stays intentionally lightweight; this file is also a safe staging deploy trigger.
  const root = document.getElementById('viewRoot');
  if (!root) return;

  const DISMISS_KEY = 'state-workspace-source-banner-dismissed-v2';
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (err) { /* private mode etc -- just always show it */ }

  const style = document.createElement('style');
  style.id = 'state-workspace-sources-styles';
  style.textContent = `
    .workspace-source-strip{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:2px 0 18px;padding:9px 14px;border:1px solid var(--border,#d9dde3);border-radius:12px;background:var(--accent-soft,#eeebf4);font-size:12px}
    .workspace-source-head{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
    .workspace-source-strip .meta-label{margin:0;color:var(--muted,#626779)}
    .workspace-source-name{font-weight:700}
    .workspace-source-status{padding:3px 7px;border:1px solid var(--border,#d9dde3);border-radius:999px;background:var(--soft,#f6f5f8);font-weight:700;color:var(--muted,#626779)}
    .workspace-source-strip .workspace-source-action{white-space:nowrap;margin:0;padding:7px 13px;font-size:12px;line-height:1.3}
    .workspace-source-dismiss{white-space:nowrap;margin:0;padding:2px 4px;font-size:16px;line-height:1;background:none;border:none;color:var(--muted,#626779);cursor:pointer}
    .workspace-source-dismiss:hover{color:inherit}
    @media(max-width:560px){
      .workspace-source-strip{flex-direction:column;align-items:flex-start;gap:10px}
    }
    /* This banner has no actionable-state model behind it yet -- it's
       always the same static "connected fine" promo, never a real
       disconnected/failed/needs-attention signal. On mobile that's just
       vertical space spent on nothing new to say, so it's hidden there
       until it has something actionable to report. Desktop unchanged. */
    @media(max-width:760px){
      .workspace-source-strip{display:none}
    }
  `;
  document.head.appendChild(style);

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

  decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(root,{childList:true,subtree:true});
})();
