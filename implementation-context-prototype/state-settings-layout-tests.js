// Settings design cleanup (Paige, Nov 16): Settings is styled in one block at the end of state-app.css (one panel with
// hairline dividers, one section layout, one button size), not in layered !important overrides; the Other Sources
// callout that repeated "never change Current State directly" is gone. Static checks; no network, no model calls.
const assert=require('assert'), fs=require('fs'), path=require('path');
const dir=__dirname;
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('✓',name);}catch(e){fail++;console.error('✗',name,'\n ',e.message);}}

// Settings-only classes; .settings-note belongs to the Rules and New project dialogs, not the page.
const SETTINGS=/\.(settings-(?!note)[\w-]+|slack-preview(?:-row)?|source-(?:row|title|description|list|icon))(?![\w-])/;
const MARKER='Settings — the one place the Settings page is styled';
const app=read('state-app.css'), tool=read('context-tool.css');
const blockStart=app.lastIndexOf('/*',app.indexOf(MARKER));
const settingsBlock=()=>app.slice(blockStart);

check('every Settings rule in state-app.css sits in the one Settings block',()=>{
  assert.ok(app.indexOf(MARKER)>0,'Settings block missing');
  const before=app.slice(0,blockStart).replace(/\/\*[\s\S]*?\*\//g,'');
  const stray=before.split('\n').filter(l=>SETTINGS.test(l));
  assert.deepEqual(stray,[],'Settings selectors outside the block');
});

check('context-tool.css has no Settings page rules',()=>{
  const stray=tool.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').filter(l=>SETTINGS.test(l));
  assert.deepEqual(stray,[]);
});

check('no specificity hack and only the documented !important in the Settings block',()=>{
  const block=settingsBlock().replace(/\/\*[\s\S]*?\*\//g,'');
  assert.ok(!/#_#_#_/.test(block));
  const importants=(block.match(/!important/g)||[]).length;
  assert.equal(importants,2,'max-width on .settings-page (desktop + phone) only');
});

check('one panel with hairline dividers: sections share a border, the first and last are rounded',()=>{
  const block=settingsBlock();
  assert.match(block,/\.settings-section\{[^}]*border:1px solid var\(--state-line\);border-top-width:0/);
  assert.match(block,/\.settings-page>\.settings-section:first-of-type\{border-top-width:1px;border-radius:12px 12px 0 0\}/);
  assert.match(block,/\.settings-page>\.settings-section:last-of-type\{border-radius:0 0 12px 12px\}/);
});

check('one button size and source names below section headings',()=>{
  const block=settingsBlock();
  assert.match(block,/\.settings-page \.btn\{[^}]*height:36px;min-height:36px[^}]*font-size:12px/);
  assert.match(block,/\.settings-section-head h3\{[^}]*font-size:15px/);
  assert.match(block,/\.source-title\{[^}]*font-size:14px;font-weight:650/);
});

check('the Other Sources callout is gone; How State works still says Evidence cannot change Current State',()=>{
  const js=read('context-settings.js');
  assert.ok(!/settings-callout/.test(js));
  assert.ok(!/Sources provide Evidence\. They never change Current State directly\./.test(js));
  assert.match(js,/<li>Evidence cannot change Current State automatically\.<\/li>/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
