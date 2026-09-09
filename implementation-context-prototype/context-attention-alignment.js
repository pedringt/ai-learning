(() => {
  const STYLE_ID = 'state-attention-alignment';
  const PASS = 'r74-source-stability';

  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Keep the History surface breathing room that was already verified. */
    html body .history-page .history-list,
    html body .history-page #historyList {
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
      padding-top: 20px !important;
      background: var(--surface,#fff) !important;
      box-shadow: none !important;
    }

    /* Current State must flow naturally. Never stretch the preview to match a sibling card. */
    html body .workspace-below-grid {
      align-items: start !important;
      grid-auto-rows: min-content !important;
    }
    html body .workspace-status-card {
      align-self: start !important;
      height: auto !important;
      min-height: 0 !important;
      display: block !important;
    }
    html body .workspace-status-card > .eyebrow {
      min-height: 36px !important;
      margin: 0 0 6px !important;
    }
    html body .workspace-status-card .workspace-status-body {
      display: block !important;
      flex: 0 0 auto !important;
      height: auto !important;
      min-height: 0 !important;
      margin-top: 0 !important;
    }
    html body .workspace-status-card .state-fact-preview {
      display: block !important;
      flex: 0 0 auto !important;
      height: auto !important;
      min-height: 0 !important;
      padding-top: 0 !important;
      justify-content: flex-start !important;
    }
    html body .workspace-status-card .state-fact-preview > p {
      margin: 0 0 10px !important;
      padding: 0 !important;
    }
    html body .workspace-status-card .state-fact-preview > ul {
      margin: 0 !important;
    }
    html body .workspace-status-card .state-fact-preview > .text-button {
      position: static !important;
      margin-top: 10px !important;
    }

    /* The alert icon belongs to the title row, not an absolutely positioned side rail. */
    html body .workspace-attention .workspace-attention-head {
      display: flex !important;
      align-items: flex-start !important;
      gap: 12px !important;
    }
    html body .workspace-attention .workspace-attention-head > div {
      display: grid !important;
      grid-template-columns: 40px minmax(0,1fr) !important;
      grid-template-rows: auto auto !important;
      column-gap: 12px !important;
      row-gap: 3px !important;
      align-items: center !important;
      min-height: 0 !important;
      padding-left: 0 !important;
      position: static !important;
      flex: 1 1 auto !important;
    }
    html body .workspace-attention .attention-head-icon {
      position: static !important;
      grid-column: 1 !important;
      grid-row: 1 !important;
      align-self: center !important;
      justify-self: center !important;
      transform: none !important;
      margin: 0 !important;
      width: 38px !important;
      height: 38px !important;
    }
    html body .workspace-attention .workspace-attention-head h3 {
      grid-column: 2 !important;
      grid-row: 1 !important;
      align-self: center !important;
      margin: 0 !important;
      min-width: 0 !important;
    }
    html body .workspace-attention .workspace-attention-head .attention-intro-text,
    html body .workspace-attention .workspace-attention-head > div > p {
      grid-column: 2 !important;
      grid-row: 2 !important;
      margin: 0 !important;
      min-width: 0 !important;
    }
    html body .workspace-attention .workspace-attention-head .eyebrow {
      display: none !important;
    }

    /* Each source owns its status. The outer source grid may still be two columns on desktop. */
    html body .settings-page .settings-source-grid .source-row {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      gap: 8px !important;
      min-width: 0 !important;
      grid-template-columns: none !important;
    }
    html body .settings-page .settings-source-grid .source-row > div {
      order: 1 !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    html body .settings-page .settings-source-grid .source-row > .settings-status {
      order: 2 !important;
      align-self: flex-start !important;
      margin: 0 0 0 26px !important;
      width: max-content !important;
      max-width: calc(100% - 26px) !important;
    }
    html body .settings-page .settings-source-grid .source-title,
    html body .settings-page .settings-source-grid .source-description {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    @media (max-width: 900px) {
      html body .settings-page .settings-source-grid {
        grid-template-columns: minmax(0,1fr) !important;
        gap: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);

  const important = (el, prop, value) => el?.style?.setProperty(prop, value, 'important');

  function syncCurrentState(scope = document) {
    scope.querySelectorAll?.('.workspace-status-card').forEach(card => {
      important(card, 'align-self', 'start');
      important(card, 'height', 'auto');
      important(card, 'min-height', '0');
      important(card, 'display', 'block');
      const body = card.querySelector('.workspace-status-body');
      const preview = card.querySelector('.state-fact-preview');
      important(body, 'display', 'block');
      important(body, 'flex', '0 0 auto');
      important(body, 'height', 'auto');
      important(body, 'min-height', '0');
      important(preview, 'display', 'block');
      important(preview, 'flex', '0 0 auto');
      important(preview, 'height', 'auto');
      important(preview, 'min-height', '0');
      important(preview, 'justify-content', 'flex-start');
      important(preview, 'padding-top', '0');
    });
    const grid = scope.querySelector?.('.workspace-below-grid');
    important(grid, 'align-items', 'start');
    important(grid, 'grid-auto-rows', 'min-content');
  }

  function syncAttention(scope = document) {
    scope.querySelectorAll?.('.workspace-attention').forEach(section => {
      const head = section.querySelector('.workspace-attention-head');
      const copy = head?.querySelector(':scope > div');
      const icon = copy?.querySelector('.attention-head-icon');
      const title = copy?.querySelector('h3');
      const intro = copy?.querySelector('.attention-intro-text, p');
      if (!head || !copy || !title) return;
      important(head, 'display', 'flex');
      important(head, 'align-items', 'flex-start');
      important(copy, 'display', 'grid');
      important(copy, 'grid-template-columns', '40px minmax(0,1fr)');
      important(copy, 'grid-template-rows', 'auto auto');
      important(copy, 'column-gap', '12px');
      important(copy, 'row-gap', '3px');
      important(copy, 'align-items', 'center');
      important(copy, 'padding-left', '0');
      important(copy, 'position', 'static');
      important(copy, 'min-height', '0');
      if (icon) {
        important(icon, 'position', 'static');
        important(icon, 'grid-column', '1');
        important(icon, 'grid-row', '1');
        important(icon, 'align-self', 'center');
        important(icon, 'justify-self', 'center');
        important(icon, 'transform', 'none');
        important(icon, 'margin', '0');
      }
      important(title, 'grid-column', '2');
      important(title, 'grid-row', '1');
      important(title, 'align-self', 'center');
      important(title, 'margin', '0');
      if (intro) {
        important(intro, 'grid-column', '2');
        important(intro, 'grid-row', '2');
        important(intro, 'margin', '0');
      }
    });
  }

  function syncSettings(scope = document) {
    scope.querySelectorAll?.('.settings-source-grid .source-row').forEach(row => {
      const content = row.querySelector(':scope > div');
      const status = row.querySelector(':scope > .settings-status');
      important(row, 'display', 'flex');
      important(row, 'flex-direction', 'column');
      important(row, 'align-items', 'flex-start');
      important(row, 'justify-content', 'flex-start');
      important(row, 'gap', '8px');
      important(row, 'min-width', '0');
      important(content, 'order', '1');
      important(content, 'width', '100%');
      important(status, 'order', '2');
      important(status, 'align-self', 'flex-start');
      important(status, 'margin', '0 0 0 26px');
    });
  }

  function guardAsk() {
    const form = document.querySelector('#askStateDrawer [data-review-batch-form="ask"]');
    const input = form?.querySelector('input,textarea');
    const submit = form?.querySelector('button[type="submit"]');
    if (input && submit && !input.value.trim()) submit.disabled = true;
  }

  function sync() {
    document.documentElement.dataset.stateMobilePass = PASS;
    syncCurrentState(document);
    syncAttention(document);
    syncSettings(document);
    guardAsk();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
  window.addEventListener('resize', schedule, {passive:true});
  document.addEventListener('input', event => {
    if (event.target?.closest?.('#askStateDrawer')) schedule();
  });

  sync();
  [50,150,350,750,1500,2500].forEach(delay => setTimeout(sync, delay));
})();