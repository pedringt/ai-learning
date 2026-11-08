// Test helper (#450): the CSS a context-*.js layer used to inject now lives in
// its own named section of state-app.css. layerCss('baseline-setup') returns that
// section so source-level style checks can keep targeting the rules they own.
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'state-app.css'), 'utf8');

module.exports = function layerCss(name) {
  const marker = '/* ==== section ' + name + ':';
  const at = css.indexOf(marker);
  if (at < 0) throw new Error('no state-app.css section named ' + name);
  const end = css.indexOf('/* ==== section ', at + 1);
  return css.slice(at, end < 0 ? undefined : end);
};
