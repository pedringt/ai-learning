// #135: the shipped app must not carry dev/test fixture data. context-feedback-pass-4.js used to push two
// hard-coded "Stress test" notes into every project's client-side notes on each render pass. Hydration
// overwrote them, so they were only visible if the backend could not be reached, but they were still
// test data in a production bundle.
const fs=require('fs'),path=require('path');
const dir=__dirname;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name)}else{fail++;console.error('FAIL',name,detail)}}
const shipped=fs.readdirSync(dir).filter(f=>/^(context|state-shell).*\.(js)$/.test(f));
const offenders=shipped.filter(f=>/n-stress-|Stress test:|seedStressNotes/.test(fs.readFileSync(path.join(dir,f),'utf8')));
check('no shipped module seeds stress-test notes into the app',offenders.length===0,offenders.join(', '));
check('the modules that were checked are the ones the app loads',shipped.length>=28,`${shipped.length} files`);
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
