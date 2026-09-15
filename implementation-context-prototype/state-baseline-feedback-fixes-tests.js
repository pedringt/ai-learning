const fs=require('fs'), path=require('path');
const dir=__dirname;
const index=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const evidence=fs.readFileSync(path.join(dir,'context-evidence-resilience.js'),'utf8');
const polish=fs.readFileSync(path.join(dir,'context-baseline-polish.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
check('evidence resilience loads before context-app',index.indexOf('context-evidence-resilience.js')>0&&index.indexOf('context-evidence-resilience.js')<index.indexOf('context-app.js'));
check('baseline polish loads after baseline setup',index.indexOf('context-baseline-polish.js')>index.indexOf('context-baseline-setup.js'));
check('long Evidence gets a two-minute client window',evidence.includes('LONG_EVIDENCE_TIMEOUT_MS = 120000'));
check('paste and upload both use the long Evidence request',evidence.includes("evidenceRequest('/api/evidence'")&&evidence.includes("evidenceRequest('/api/evidence/upload'"));
check('reanalysis also uses the long Evidence request',evidence.includes('/reanalyze'));
check('baseline mode hides the competing onboarding banner',polish.includes('state-baseline-active .state-reviewer-guide'));
check('finish uses the shared State overlay',polish.includes("getElementById('overlay')")&&polish.includes('data-baseline-confirm-finish'));
check('polish does not use browser-native confirm',!polish.includes('window.confirm('));
check('long baseline analysis copy sets correct expectation',polish.includes('couple of minutes'));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
