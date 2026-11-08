// #629: Notes and Open Items put record ids into HTML attributes without escaping. Ids are server-generated today,
// so this was not exploitable, but an id carrying a quote would have broken out of its attribute.
const fs=require('fs'),path=require('path'),vm=require('vm');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'context-notes-view.js'),'utf8'),{window,console});
const {simpleNote}=window.STATE_NOTES_VIEW;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}
const evil='n1" onmouseover="alert(1)';
const html=simpleNote({id:evil,title:'T',source:'Project note',text:'x',date:'Nov 7',status:'failed',evidenceId:'e1" x="y'},new Set([evil]),null);
check('a quote in a note id cannot open a new attribute',!html.includes('onmouseover="alert(1)"'),html.slice(0,300));
check('the id is still present, escaped',html.includes('data-note-id="n1&quot; onmouseover=&quot;alert(1)"'));
check('a quote in an evidence id is escaped too',!html.includes('x="y"')&&html.includes('e1&quot; x=&quot;y'));
const src=fs.readFileSync(path.join(__dirname,'context-open-items-view.js'),'utf8');
check('Open Items has no unescaped review-id attributes',!/="\$\{r\.id\}"/.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
