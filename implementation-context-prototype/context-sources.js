(() => {
  // Workspace source status stays intentionally lightweight; this file is also a safe staging deploy trigger.
  const root = document.getElementById('viewRoot');
  if (!root) return;

  const style = document.createElement('style');
  style.id = 'state-workspace-sources-styles';
  style.textContent = `
    .workspace-source-strip{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'head action' 'copy copy';gap:7px 16px;align-items:start;margin:2px 0 18px;padding:10px 12px;border:1px solid var(--border,#d9dde3);border-radius:12px;background:var(--surface,#fff);font-size:12px}
    .workspace-source-head{grid-area:head;display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
    .workspace-source-strip .meta-label{margin:0;color:var(--muted,#626779)}
    .workspace-source-name{font-weight:700}
    .workspace-source-status{padding:3px 7px;border:1px solid var(--border,#d9dde3);border-radius:999px;background:var(--soft,#f6f5f8);font-weight:700;color:var(--muted,#626779)}
    .workspace-source-copy{grid-area:copy;color:var(--muted,#626779);line-height:1.45}
    .workspace-source-strip .workspace-source-action{grid-area:action;align-self:start;white-space:nowrap;margin:0}
    @media(max-width:560px){
      .workspace-source-strip{grid-template-columns:1fr;grid-template-areas:'head' 'copy' 'action';gap:8px}
      .workspace-source-strip .workspace-source-action{justify-self:start}
    }
  `;
  document.head.appendChild(style);

  function decorate(){
    const overview = root.querySelector('.overview');
    if (!overview || overview.querySelector('.workspace-source-strip')) return;
    const heading = overview.querySelector('.overview-heading');
    if (!heading) return;
    heading.insertAdjacentHTML('afterend', `<section class="workspace-source-strip" aria-label="Source status"><div class="workspace-source-head"><span class="meta-label">Sources</span><span class="workspace-source-name">Slack</span><span class="workspace-source-status">In development</span></div><button class="btn secondary workspace-source-action" type="button" data-view="settings">Connect your apps →</button><span class="workspace-source-copy">This demo includes Slack-sourced Evidence you can trace through Review and History. Live connection is still in development.</span></section>`);
  }

  decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(root,{childList:true,subtree:true});
})();
