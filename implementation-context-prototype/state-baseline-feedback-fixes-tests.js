const fs=require('fs'), path=require('path');
const dir=__dirname;
const index=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const evidence=fs.readFileSync(path.join(dir,'context-evidence-resilience.js'),'utf8');
const setup=fs.readFileSync(path.join(dir,'context-baseline-setup.js'),'utf8');
const polish=fs.readFileSync(path.join(dir,'context-baseline-polish.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name)}else{fail++;console.error('FAIL',name,detail)}}
check('evidence resilience loads before context-app',index.indexOf('context-evidence-resilience.js')>0&&index.indexOf('context-evidence-resilience.js')<index.indexOf('context-app.js'));
check('baseline polish loads after baseline setup',index.indexOf('context-baseline-polish.js')>index.indexOf('context-baseline-setup.js'));
check('long Evidence still gets a two-minute client window',evidence.includes('LONG_EVIDENCE_TIMEOUT_MS = 120000'));
check('paste and upload both use the long Evidence request',evidence.includes("evidenceRequest('/api/evidence'")&&evidence.includes("evidenceRequest('/api/evidence/upload'"));
check('reanalysis also uses the long Evidence request',evidence.includes('/reanalyze'));
check('baseline mode hides the competing onboarding banner',polish.includes('state-baseline-active .state-reviewer-guide'));
check('old Finish Baseline interception is gone',!polish.includes('data-baseline-finish')&&!polish.includes('window.confirm('));
check('banner avoids the oversized primary button treatment',setup.includes('btn secondary baseline-review-button')&&!setup.includes('primary-button'));
check('starting-source patience copy remains explicit',polish.includes('starting sources can take a little while'));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
