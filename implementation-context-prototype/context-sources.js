(() => {
  // Workspace source status stays intentionally lightweight; this file is also a safe staging deploy trigger.
  const root = document.getElementById('viewRoot');
  if (!root) return;

  const style = document.createElement('style');
  style.id = 'state-workspace-sources-styles';
  style.textContent = `
    .workspace-source-strip{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:2px 0 18px;padding:9px 14px;border:1px solid var(--border,#d9dde3);border-radius:12px;background:var(--accent-soft,#eeebf4);font-size:12px}
    .workspace-source-head{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
    .workspace-source-strip .meta-label{margin:0;color:var(--muted,#626779)}
    .workspace-source-name{font-weight:700}
    .workspace-source-status{padding:3px 7px;border:1px solid var(--border,#d9dde3);border-radius:999px;background:var(--soft,#f6f5f8);font-weight:700;color:var(--muted,#626779)}
    .workspace-source-strip .workspace-source-action{white-space:nowrap;margin:0;padding:7px 13px;font-size:12px;line-height:1.3}
    @media(max-width:560px){
      .workspace-source-strip{flex-direction:column;align-items:flex-start;gap:10px}
    }
  `;
  document.head.appendChild(style);

  function decorate(){
    const overview = root.querySelector('.overview');
    if (!overview || overview.querySelector('.workspace-source-strip')) return;
    const heading = overview.querySelector('.overview-heading');
    if (!heading) return;
    heading.insertAdjacentHTML('afterend', `<section class="workspace-source-strip" aria-label="Source status"><div class="workspace-source-head"><span class="meta-label">Sources</span><span class="workspace-source-name">Slack</span><span class="workspace-source-status">In development</span></div><button class="btn secondary workspace-source-action" type="button" data-view="settings" data-anchor="settings-slack">Connect your apps →</button></section>`);
  }

  decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(root,{childList:true,subtree:true});
})();
