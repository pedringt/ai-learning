// Injected into the State app by compare.py. Visits every view, then records a
// fingerprint of each element: computed style (incl. ::before/::after), own
// text, attributes, visibility and position in the tree. Run twice on the same
// build, the result is identical, so any difference is a real UI change.
(() => {
  const VIEWS = ['workspace', 'project-overview', 'open-items', 'notes', 'history', 'settings'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  // Relative timestamps change between runs; they are not UI differences.
  const VOLATILE = /\b(\d+\s*(s|m|h|d|sec|min|minute|minutes|hour|hours|day|days)\s*ago|just now|just added|\d+(\.\d+)?\s?(ms|s|seconds?))\b/gi;

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

  // Animated values (a spinner's rotation, a pulsing status) depend on when the snapshot lands.
  // Rewind looping animations to their first frame and finish one-off transitions first.
  function freezeAnimations() {
    for (const a of document.getAnimations()) {
      try {
        if (a.effect?.getComputedTiming?.().iterations === Infinity) a.currentTime = 0;
        else a.finish();
      } catch (e) { /* an animation that cannot be seeked is left as is */ }
    }
  }

  function snap() {
    freezeAnimations();
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

  async function ask(question) {
    const input = document.getElementById('askStateDrawerInput');
    if (!input) return;
    input.focus();
    input.value = question;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form')?.requestSubmit();
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const result = document.getElementById('askStateDrawerResult');
      if (result?.querySelector('.ask-live-answer,.ask-live-error') && !result.querySelector('.ask-live-loading')) break;
    }
    await settle();
  }

  // Walks every state in a fixed order. With stopAt, returns full computed styles for
  // `paths` at that state instead of fingerprints (used by compare.py --explain).
  async function run(stopAt = null, paths = []) {
    const out = {};
    const record = name => {
      if (stopAt !== name) { if (!stopAt) out[name] = snap(); return false; }
      freezeAnimations();
      const byPath = {};
      for (const el of document.body.querySelectorAll('*')) {
        const p = pathOf(el);
        if (paths.includes(p)) byPath[p] = { base: styleOf(el), before: styleOf(el, '::before'), after: styleOf(el, '::after') };
      }
      out.__detail = byPath;
      return true;
    };
    // What a visitor sees first: Workspace right after load, before any navigation.
    await settle();
    if (record('workspace-cold')) return out.__detail;
    // Warm-up pass: on a cold load the patch layers race (#450), and the UI only
    // settles to one stable version after each view has rendered once.
    for (const v of VIEWS) await go(v);
    for (const v of VIEWS) { await go(v); if (record(v)) return out.__detail; }
    await go('workspace');
    document.getElementById('askStateLauncher')?.click();
    await settle();
    if (record('ask-drawer')) return out.__detail;
    // Ask lifecycle, with the deterministic fake Ask provider compare.py installs.
    await ask('What is the current pilot scope?');
    if (record('ask-answered')) return out.__detail;
    const input = document.getElementById('askStateDrawerInput');
    if (input) { input.focus(); input.value = 'What is the current pilot scope? More'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    await settle();
    if (record('ask-editing')) return out.__detail;
    document.querySelector('#askStateDrawer .state-ask-reset')?.click();
    await settle();
    if (record('ask-cleared')) return out.__detail;
    await ask('COMPARE_FAIL pilot scope');
    if (record('ask-error')) return out.__detail;
    // Mid-answer: submit a slow question and snapshot before the answer lands.
    const slowInput = document.getElementById('askStateDrawerInput');
    if (slowInput) {
      slowInput.focus();
      slowInput.value = 'COMPARE_SLOW pilot scope';
      slowInput.dispatchEvent(new Event('input', { bubbles: true }));
      slowInput.closest('form')?.requestSubmit();
      await sleep(1200);
      if (record('ask-generating')) return out.__detail;
      for (let i = 0; i < 80; i++) {
        await sleep(150);
        const r = document.getElementById('askStateDrawerResult');
        if (r?.querySelector('.ask-live-answer,.ask-live-error') && !r.querySelector('.ask-live-loading')) break;
      }
      await settle();
    }
    document.querySelector('.ask-state-drawer-close')?.click();
    await settle();
    return out;
  }

  window.STATE_CAPTURE = { run };
})();
