// Injected into the State app by compare.py. Visits every view, then records a
// fingerprint of each element: computed style (incl. ::before/::after), own
// text, attributes, visibility and position in the tree. Run twice on the same
// build, the result is identical, so any difference is a real UI change.
(() => {
  const VIEWS = ['workspace', 'project-overview', 'open-items', 'notes', 'history', 'settings'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  // Relative timestamps change between runs; they are not UI differences.
  // Generated ids (new project, proposal, evidence ids) are random per run: 8+ hex characters
  // that include a digit, or a UUID.
  const GENERATED_ID = /(?<![0-9a-z])(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[0-9a-f]*\d)[0-9a-f]{8,})(?![0-9a-z])/gi;  // e.g. project_2ccda7ef36fa
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
      const attrs = [...el.attributes].filter(a => a.name !== 'style').map(a => a.name + '=' + a.value.replace(VOLATILE, '~').replace(GENERATED_ID, '#id').replace(/127\.0\.0\.1:\d+/g, 'localhost')).sort().join('|');  // each capture's backend has its own port
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

  async function waitFor(test, timeout = 15000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { try { if (test()) return true; } catch (e) { /* keep waiting */ } await sleep(150); }
    return false;
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
      // Snapshot once the loading state is showing, not after a fixed delay (a fixed delay
      // sometimes landed after the answer under load).
      await waitFor(() => document.querySelector('#askStateDrawerResult .ask-live-loading'), 8000);
      await sleep(300);
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

    // Baseline Setup on a brand-new project. Model-free: facts are entered manually, and
    // pasted starting material fails analysis because compare.py's backend has no model.
    const click = sel => document.querySelector(sel)?.click();
    const fill = (sel, value) => { const el = document.querySelector(sel); if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    const bannerText = () => document.getElementById('baselineSetupBanner')?.textContent || '';
    await go('workspace');
    click('#projectSwitcher'); await settle();
    [...document.querySelectorAll('#projectMenu button')].find(b => /New project/.test(b.textContent))?.click(); await settle();
    fill('#dialogBody input', 'Compare baseline');
    click('#dialogBody button.primary');
    await waitFor(() => /Set up Current State/.test(bannerText()));
    await settle();
    if (record('baseline-blank')) return out.__detail;
    click('[data-baseline-add-starting]'); await settle();
    if (record('baseline-starting-dialog')) return out.__detail;
    click('#dialogBody [data-action="close-dialog"]'); await settle();
    click('[data-baseline-start-manual]'); await settle();
    if (record('baseline-manual-dialog')) return out.__detail;
    fill('[data-baseline-manual-topic]', 'Pilot scope');
    fill('[data-baseline-manual-statement]', 'The pilot covers Tier 1 troubleshooting only.');
    click('[data-baseline-save-manual]');
    await waitFor(() => document.querySelector('.baseline-draft-dialog .baseline-draft-fact[data-proposal-id]'));
    await settle();
    if (record('baseline-draft-dialog')) return out.__detail;
    click('[data-baseline-add-fact]'); await settle();
    if (record('baseline-new-fact-form')) return out.__detail;
    click('[data-baseline-cancel-new-fact]');
    click('#dialogBody [data-action="close-dialog"]');
    await waitFor(() => /ready to review/i.test(bannerText()));
    await settle();
    if (record('baseline-ready')) return out.__detail;
    click('[data-baseline-add-starting]'); await settle();
    fill('#baselineStartingText', 'Starting notes for the pilot.');
    click('[data-baseline-save-starting-text]');
    await waitFor(() => /needs attention|could not|failed/i.test(bannerText() + (document.getElementById('dialogBody')?.textContent || '')), 12000);
    await sleep(2500); await settle();
    if (record('baseline-after-failed-analysis')) return out.__detail;
    return out;
  }

  window.STATE_CAPTURE = { run };
})();
