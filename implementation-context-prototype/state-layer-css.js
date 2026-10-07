// Test helper (#450): the CSS a context-*.js layer used to inject now lives in
// its own section of state-app.css. layerCss('context-x.js') returns that section
// so source-level style checks can keep targeting the layer that owns the rule.
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'state-app.css'), 'utf8');

module.exports = function layerCss(file) {
  const marker = '/* ==== from ' + file + ':';
  let out = '';
  for (let at = css.indexOf(marker); at >= 0; at = css.indexOf(marker, at + 1)) {
    const end = css.indexOf('/* ==== from', at + 1);
    out += css.slice(at, end < 0 ? undefined : end);
  }
  if (!out) throw new Error('no state-app.css section for ' + file);
  return out;
};
