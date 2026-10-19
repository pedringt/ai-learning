// The cross-project overview must keep attention separate from unavailable checks.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','project-health.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
check('headline counts only actionable signals',/issues\.filter\(signal=>signal\.kind==='bad'\|\|signal\.kind==='warn'\)\.length/.test(src));
check('unavailable checks receive a distinct headline',src.includes("Couldn\\'t check every project signal"));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
