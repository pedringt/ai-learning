// Oct 11 (Cowork follow-up): the status banner offered "View all issues →" even when it said
// nothing needs attention. It now appears only when there is something actionable; a failed
// check offers "Retry check" instead; nothing shows while loading.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','project-health.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const line=(src.split('\n').find(l=>l.includes('View all issues →'))||'');
check('"View all issues" is gated on actionable items',/actionable\.length\?'<button[^']*data-tab-target="ai-quality">View all issues →<\/button>':''/.test(line),line.trim().slice(0,200));
check('a failed check still offers Retry',/incompleteOnly\?'<button[^']*data-retry-health>Retry check<\/button>'/.test(line));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
