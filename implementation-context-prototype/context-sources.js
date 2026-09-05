(() => {
  const root = document.getElementById('viewRoot');
  if (!root) return;

  const style = document.createElement('style');
  style.id = 'state-workspace-sources-styles';
  style.textContent = `
    .workspace-source-strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:2px 0 18px;padding:10px 12px;border:1px solid var(--border,#d9dde3);border-radius:12px;background:var(--surface,#fff);font-size:12px}
    .workspace-source-strip .meta-label{margin:0;color:var(--muted,#626779)}
    .workspace-source-name{font-weight:700}
    .workspace-source-status{padding:3px 7px;border:1px solid var(--border,#d9dde3);border-radius:999px;background:var(--soft,#f6f5f8);font-weight:700;color:var(--muted,#626779)}
    .workspace-source-copy{color:var(--muted,#626779)}
    .workspace-source-strip .text-button{margin-left:auto}
    @media(max-width:560px){.workspace-source-copy{flex-basis:100%;order:4}.workspace-source-strip .text-button{margin-left:auto}}
  `;
  document.head.appendChild(style);

  function decorate(){
    const overview = root.querySelector('.overview');
    if (!overview || overview.querySelector('.workspace-source-strip')) return;
    const heading = overview.querySelector('.overview-heading');
    if (!heading) return;
    heading.insertAdjacentHTML('afterend', `<section class="workspace-source-strip" aria-label="Source status"><span class="meta-label">Sources</span><span class="workspace-source-name">Slack</span><span class="workspace-source-status">In development</span><span class="workspace-source-copy">Approved project conversations will enter State as Evidence, never as automatic Current State.</span><button class="text-button" type="button" data-view="settings">Settings →</button></section>`);
  }

  decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(root,{childList:true,subtree:true});
})();
