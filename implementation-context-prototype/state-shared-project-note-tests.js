// Nov 3 (Paige): visitor-created projects are shared, not private. GET /api/projects lists every project, a new project
// has no owner, and any visitor can edit or delete it (state-project-complete/api_core.py). Until visitor isolation (#594)
// exists, the New project dialog says so before anything is created.
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'context-app.js'),'utf8');

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}

const start=source.indexOf("act==='new-project'");
const dialog=start<0?'':source.slice(start,source.indexOf("act==='save-new-project'",start));
check('the New project dialog exists',dialog.length>0);
check('it says other visitors can see, edit, and delete projects created here',
  /Other visitors can see, edit, and delete any project created here/.test(dialog));
check('the notice comes before the name field and Create button',
  dialog.indexOf('sharedProjectNote')>-1&&dialog.indexOf('sharedProjectNote')<dialog.indexOf('id="newProjectName"')&&dialog.indexOf('sharedProjectNote')<dialog.indexOf('save-new-project'));
check('the name field is described by the notice for screen readers',/aria-describedby="sharedProjectNote newProjectNameError"/.test(dialog));
check('the dialog makes no privacy or isolation claim',!/\bprivate to you\b|only you|isolated|just for you/i.test(dialog));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
