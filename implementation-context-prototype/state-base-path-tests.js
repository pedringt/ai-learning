// The app must load its own files relative to the directory it is served from, not the URL's parent (#228).
// Vercel's cleanUrls serves the page at ".../implementation-context-prototype" with no trailing slash and no
// file name, so a plain relative URL such as "state-shell.css" resolves one level too high and 404s.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function baseFor(pathname) {
  const line = html.split('\n').find(l => l.includes('window.__STATE_BASE =') && !l.trim().startsWith('//'));
  assert.ok(line, 'index.html no longer computes window.__STATE_BASE');
  const window = {};
  const location = { pathname };
  new Function('window', 'location', 'var path = location.pathname;\n' + line)(window, location);
  return window.__STATE_BASE;
}

let pass = 0;
function check(name, fn) { try { fn(); pass++; console.log('✓', name); } catch (e) { console.error('✗', name); throw e; } }

check('clean URL without a trailing slash resolves to the app directory, not its parent', () => {
  assert.equal(baseFor('/implementation-context-prototype'), '/implementation-context-prototype/');
});
check('directory URL and explicit index.html resolve to the same directory', () => {
  assert.equal(baseFor('/implementation-context-prototype/'), '/implementation-context-prototype/');
  assert.equal(baseFor('/implementation-context-prototype/index.html'), '/implementation-context-prototype/');
  assert.equal(baseFor('/implementation-context-prototype/index'), '/implementation-context-prototype/');
});
check('served from a domain root (its own subdomain) the base is "/"', () => {
  assert.equal(baseFor('/'), '/');
  assert.equal(baseFor('/index'), '/');
  assert.equal(baseFor('/index.html'), '/');
});
check('opened from disk (file://) the base is the containing folder', () => {
  assert.equal(baseFor('/Users/me/app/index.html'), '/Users/me/app/');
});
check('every script and stylesheet the page writes goes through the computed base', () => {
  const writes = html.match(/document\.write\([^\n]*(?:<script src=|<link rel="(?:stylesheet|icon)")[^\n]*/g) || [];
  assert.ok(writes.length >= 5, 'expected the loader writes to be found');
  for (const w of writes) {
    if (w.includes('/api/state-config.js')) continue; // absolute on purpose: the function is served at the site root
    assert.ok(w.includes('__STATE_BASE'), 'loader line bypasses __STATE_BASE: ' + w.slice(0, 120));
  }
});
check('the shell computes its stylesheet URL from the same base', () => {
  const shell = fs.readFileSync(path.join(__dirname, 'state-shell.js'), 'utf8');
  assert.ok(/polish\.href=\(window\.__STATE_BASE\|\|''\)\+'final-freeze-polish\.css'/.test(shell));
});
check('the app no longer reaches into portfolio root files', () => {
  assert.ok(!/\.\.\/(site-shell|favicon|index)/.test(html));
});
check('no app source file hard-codes the old absolute path prefix', () => {
  // Scripts load other scripts at runtime (context-sources.js, context-final-mobile.js did); any of them using
  // "/implementation-context-prototype/" would 404 once the app is served from its own domain root.
  const files = fs.readdirSync(__dirname).filter(f => /^(context-.*\.js|state-shell\.js|state-shell\.css|context-tool\.css|index\.html)$/.test(f));
  assert.ok(files.length > 20, 'expected to scan the app sources');
  const offenders = files.filter(f => fs.readFileSync(path.join(__dirname, f), 'utf8').includes('/implementation-context-prototype/'));
  assert.deepEqual(offenders, [], 'absolute app-path prefix found in: ' + offenders.join(', '));
});

console.log(`\n${pass} passed, 0 failed`);
