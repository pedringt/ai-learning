// #617: the portfolio editor edits blocks marked data-edit on these pages.
// New copy must be marked (or explicitly skipped), markers must be unique,
// and every marked block must survive the editor's cleanup unchanged so a
// save never degrades markup the editor didn't touch.
//
// Fix a failure with: node tools/portfolio-editor/mark.js
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const {PAGES,auditPage}=require('../tools/portfolio-editor/lib/html.js');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const brief=b=>`<${b.tag}> ${b.inner.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,60)}`;

for(const page of Object.keys(PAGES)){
  const a=auditPage(fs.readFileSync(path.join(root,page),'utf8'));
  check(`${page}: has editable blocks`,a.marked>0,String(a.marked));
  check(`${page}: every in-scope block is marked or skipped`,!a.missing.length,a.missing.map(brief).join(' | '));
  check(`${page}: marker ids are unique`,!a.duplicates.length,a.duplicates.join(', '));
  check(`${page}: markers sit only on in-scope blocks`,!a.outOfScope.length&&!a.strayMarkers,a.outOfScope.map(brief).join(' | '));
  check(`${page}: marked blocks round-trip through the editor cleanup`,!a.unsafe.length,a.unsafe.map(brief).join(' | '));
}

const others=fs.readdirSync(root).filter(f=>f.endsWith('.html')&&!Object.hasOwn(PAGES,f)&&/\sdata-edit="/.test(fs.readFileSync(path.join(root,f),'utf8')));
check('pages outside the editor’s scope carry no markers',!others.length,others.join(', '));

const ignore=fs.readFileSync(path.join(root,'.vercelignore'),'utf8').split('\n').map(l=>l.trim());
check('the editor itself is never deployed',ignore.includes('tools/portfolio-editor'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
