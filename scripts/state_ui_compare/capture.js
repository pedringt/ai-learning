// Injected into the State app by compare.py. Visits every view, then records a
// fingerprint of each element: computed style (incl. ::before/::after), own
// text, attributes, visibility and position in the tree. Run twice on the same
// build, the result is identical, so any difference is a real UI change.
(() => {
  const VIEWS = ['workspace', 'project-overview', 'open-items', 'notes', 'history', 'settings'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  // Relative timestamps change between runs; they are not UI differences.
  const VOLATILE = /\b(\d+\s*(s|m|h|d|sec|min|minute|minutes|hour|hours|day|days)\s*ago|just now|just added)\b/gi;

  const pathOf = el => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      let i = 1, s = n;
      while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
      parts.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + ':' + i);
    }
    return parts.reverse().join('>');
  };

  // Chrome lists custom properties in a per-document order, so sort; and computed
  // url(...) values include the origin, which differs between the two servers.
  const styleOf = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo && (cs.content === 'none' || cs.content === 'normal')) return '';
    let out = '';
    for (const p of [...cs].sort()) {
      if (p.startsWith('transition') || p.startsWith('animation')) continue;
      out += p + ':' + cs.getPropertyValue(p) + ';';
    }
    return out.split(location.origin).join('');
  };

  function snap() {
    const rows = {};
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('script,style,noscript')) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')
        .replace(VOLATILE, '~').replace(/\s+/g, ' ').trim();
      // The style attribute is skipped: its effect is already in the computed style, and moving
      // inline styles into a stylesheet must not count as a change.
      const attrs = [...el.attributes].filter(a => a.name !== 'style').map(a => a.name + '=' + a.value.replace(VOLATILE, '~')).sort().join('|');
      const visible = el.getClientRects().length ? 'v' : 'h';
      rows[pathOf(el)] = {
        s: hash(styleOf(el) + '@@' + styleOf(el, '::before') + '@@' + styleOf(el, '::after')),
        t: hash(own),
        a: hash(attrs + visible),
        txt: own.slice(0, 60),
        cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
      };
    }
    return rows;
  }

  async function settle() {
    for (let i = 0; i < 40; i++) { await sleep(150); if (!document.querySelector('.loading,[aria-busy="true"]')) break; }
    await sleep(900);
  }
  async function go(view) {
    if (location.hash !== '#' + view) location.hash = '#' + view;
    document.querySelector(`.sidebar-nav [data-view="${view}"]`)?.click();
    await settle();
  }

  async function run() {
    const out = {};
    // What a visitor sees first: Workspace right after load, before any navigation.
    await settle();
    out['workspace-cold'] = snap();
    // Warm-up pass: on a cold load the patch layers race (#450), and the UI only
    // settles to one stable version after each view has rendered once.
    for (const v of VIEWS) await go(v);
    for (const v of VIEWS) { await go(v); out[v] = snap(); }
    await go('workspace');
    document.getElementById('askStateLauncher')?.click();
    await settle();
    out['ask-drawer'] = snap();
    document.querySelector('.ask-state-drawer-close')?.click();
    await settle();
    return out;
  }

  // For --explain: full computed styles for given element paths on one view.
  async function detail(view, paths) {
    if (view === 'ask-drawer') { await go('workspace'); document.getElementById('askStateLauncher')?.click(); await settle(); }
    else if (view === 'workspace-cold') { /* already there */ }
    else await go(view);
    const byPath = {};
    for (const el of document.body.querySelectorAll('*')) { const p = pathOf(el); if (paths.includes(p)) byPath[p] = { base: styleOf(el), before: styleOf(el, '::before'), after: styleOf(el, '::after') }; }
    return byPath;
  }

  window.STATE_CAPTURE = { run, detail };
})();
