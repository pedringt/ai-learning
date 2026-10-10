const fs=require('fs'),path=require('path');
const dir=__dirname;
const index=fs.readFileSync(path.join(dir,'index.html'),'utf8');
// The three Baseline layers were consolidated into context-baseline.js (#450).
const fixes=fs.readFileSync(path.join(dir,'context-baseline.js'),'utf8');
// The dogfood-fixes rules moved from the script into state-app.css (#450).
const fixesCss=require('./state-layer-css')('context-baseline-dogfood-fixes.js');
const prompt=fs.readFileSync(path.join(dir,'../state-project-complete/baseline_prompt_hardening.py'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name)}else{fail++;console.error('FAIL',name,detail)}}
check('Baseline module loads after the app it extends',index.indexOf('context-baseline.js')>index.indexOf('context-app.js')&&!index.includes('context-baseline-dogfood-fixes.js'));
check('blank setup has one obvious starting-material action',fixes.includes('Add starting material')&&fixes.includes('Enter Current State manually'));
check('blank setup no longer presents Review Starting State as the initial action',fixes.indexOf("if(blank)")>=0&&fixes.indexOf('Add starting material',fixes.indexOf("if(blank)"))>=0);
check('processing setup exposes progress and another-source path',fixes.includes('Building your Starting State')&&fixes.includes('source${processing===1')&&fixes.includes('Add more material'));
check('starting material accepts one file at a time',fixes.includes('baselineStartingFile')&&fixes.includes('window.STATE_API.uploadEvidence(file)'));
check('normal Add Evidence is intercepted only while Baseline is active',fixes.includes('[data-action="add-info"]')&&fixes.includes('addEvidence&&baselineActive()')&&fixes.includes('stopImmediatePropagation'));
check('starting-state review can add a missing fact',fixes.includes('+ Add missing fact')&&fixes.includes('/api/baseline/manual')&&fixes.includes('data-baseline-new-area'));
check('confirm starting state stays on one line at desktop widths',fixesCss.includes('[data-baseline-confirm-starting]')&&fixesCss.includes('white-space:nowrap!important'));
check('caught-up workspace gets calm success treatment',fixes.includes('dogfood-caught-up')&&fixesCss.includes('.dogfood-caught-up')&&fixesCss.includes('#eaf7ee')&&fixes.includes("Nothing needs your attention right now."));
check('brand-new workspace is distinguished from established caught-up state',fixes.includes('Your workspace is ready')&&fixes.includes('Starting State not confirmed'));
check('What Changed empty state explains future content',fixes.includes('Changes will appear here as Current State is updated.'));
check('structured baseline prompt treats General as last resort',prompt.includes('"General" is a last resort')&&prompt.includes('meaningful source headings and numbered sections'));
check('structured baseline prompt requires maintainable decomposition',prompt.includes('independently maintainable facts')&&prompt.includes('one giant Current State statement'));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
