// #163: Baseline Setup presents one Starting State draft instead of making
// routine facts feel like a queue of independent approval cards.
const fs=require('fs'), path=require('path');
const dir=__dirname;
const source=fs.readFileSync(path.join(dir,'context-baseline-setup.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name)}else{fail++;console.error('FAIL',name,detail)}}

check('Baseline Setup module is loaded by the product shell',html.includes("'context-baseline-setup.js'"));
check('status comes from the Starting State draft endpoint',source.includes("'/api/baseline/draft'"));
check('draft and confirm requests are project-scoped',source.includes("'X-State-Project-Id'"));
check('banner points to one Starting State review',source.includes('Review Starting State')&&!source.includes('Finish Baseline Setup'));
check('copy keeps Questions and conflicts in Review',source.includes('Questions and conflicts stay in Review'));
check('routine facts are editable before confirmation',source.includes('data-baseline-statement')&&source.includes('data-baseline-topic')&&source.includes('data-baseline-area'));
check('routine facts can be removed from the baseline',source.includes('data-baseline-remove-fact')&&source.includes("decision:card.dataset.removed==='true'?'reject':'accept'"));
check('one confirm action uses the bulk baseline endpoint',source.includes("'/api/baseline/confirm'")&&source.includes('Confirm Starting State'));
check('confirmation follows backend readiness',source.includes("summary.can_confirm?'':'disabled'"));
check('older backend previews fail closed without breaking State',source.includes('if(error.status!==404)'));
check('banner refreshes after app rerenders Evidence or Review state',source.includes("observe(root,{childList:true,subtree:true})"));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0)process.exit(1);
