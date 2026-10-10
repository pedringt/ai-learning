// Guards #450: layer styles live in state-app.css, loaded once by index.html.
// Scripts must not go back to injecting <style>/<link> elements at runtime,
// which made the cascade depend on script timing.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failures++; console.log('✗ ' + name + '\n  ' + e.message); }
}

const dir = __dirname;
const scripts = fs.readdirSync(dir).filter(f => /^context-.*\.js$/.test(f) || f === 'state-shell.js');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

check('no app script creates a <style> or stylesheet <link> at runtime', () => {
  const offenders = scripts.filter(f => /createElement\(\s*['"](style|link)['"]\s*\)/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepStrictEqual(offenders, [], 'inject styles in state-app.css instead: ' + offenders.join(', '));
});
check('index.html loads state-app.css exactly once, after context-tool.css', () => {
  const app = html.indexOf("'state-app.css"), tool = html.indexOf("'context-tool.css");
  assert.ok(app > 0 && tool > 0 && app > tool, 'state-app.css must load after context-tool.css');
  assert.strictEqual(html.split("'state-app.css").length - 1, 1);
});
check('state-app.css exists and keeps its ordering note', () => {
  const css = fs.readFileSync(path.join(dir, 'state-app.css'), 'utf8');
  assert.ok(/Do not reorder sections/.test(css));
});

console.log(`\n${3 - failures} passed, ${failures} failed`);
if (failures) process.exit(1);
