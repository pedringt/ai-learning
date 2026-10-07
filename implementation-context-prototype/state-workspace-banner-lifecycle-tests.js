// Regression coverage for the Workspace tour's first-render styling and
// project-switcher lifecycle. A timed inline style used to make the initial
// banner white and compact, then disappear when a render replaced it.
const fs=require('fs'), path=require('path');
const dir=__dirname;
const app=fs.readFileSync(path.join(dir,'context-app.js'),'utf8');
const guide=fs.readFileSync(path.join(dir,'context-ask-followup.js'),'utf8')+require('./state-layer-css')('context-ask-followup.js');
const openItems=fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8');
const sources=fs.readFileSync(path.join(dir,'context-sources.js'),'utf8');
let pass=0,fail=0;
function check(name,ok){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name)}}

check('opening the project switcher updates navigation without rerendering the view',/act==='toggle-projects'\)\{state\.projectMenuOpen=!state\.projectMenuOpen;updateNav\(\);\}/.test(app));
check('Workspace rerenders synchronously restore the tour banner',/ASK\?\.syncWorkspaceDecorations\?\.\(\)/.test(app));
check('Workspace rerenders synchronously restore the source strip',/STATE_WORKSPACE_SOURCES\?\.decorate\?\.\(\)/.test(app));
check('tour banner uses the intended white background in its base style',/\.state-reviewer-guide\{[^}]*background:#fff;/.test(guide));
check('tour CTA stays a compact text link in its base style',/\.state-reviewer-guide-start\{[^}]*padding:4px 0;border:0[^}]*background:transparent/.test(guide));
check('dark-mode tour CTA remains a text link',/body\.v88-dark \.state-reviewer-guide-start\{background:transparent/.test(guide));
check('late inline banner polisher is removed',!openItems.includes('polishExploringBanner')&&!openItems.includes("setProperty?.('background','#fff'"));
check('source strip exposes its synchronous decoration hook',/STATE_WORKSPACE_SOURCES\s*=\s*Object\.freeze\(\{decorate\}\)/.test(sources));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
