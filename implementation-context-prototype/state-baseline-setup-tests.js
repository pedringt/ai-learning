// Issue #155: Baseline Setup is an explicit lifecycle, not "Current State is empty".
// These checks lock the frontend contract into the build without needing a live
// feature-branch backend (Vercel previews intentionally still point at staging).
const fs=require('fs'), path=require('path');
const dir=__dirname;
const source=fs.readFileSync(path.join(dir,'context-baseline-setup.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

check('Baseline Setup module is loaded by the product shell', html.includes("'context-baseline-setup.js'"));
check('new baseline shell asset version is present', html.includes("r110-baseline-setup"));
check('status endpoint is project-scoped', source.includes("'/api/baseline'") && source.includes("'X-State-Project-Id'"));
check('finish action is explicit', source.includes("'/api/baseline/finish'") && source.includes('Finish Baseline Setup'));
check('copy says setup survives accepted facts until explicit finish', source.includes('stays active across multiple notes and accepted facts until you explicitly finish it'));
check('coverage warning does not claim a detected omission is truth', source.includes('prompt to inspect, not proof something is missing'));
check('preview tolerates an older backend without breaking State', source.includes('if(error.status!==404)'));
check('banner refreshes after app rerenders Evidence/Review state', source.includes("observe(root,{childList:true,subtree:true})"));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0) process.exit(1);
