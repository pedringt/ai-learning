// Blank-project bug report (2026-09-15), item 3: Settings must offer Reset
// for a seeded demo project (Northstar/Juniper) and Delete for a
// user-created one -- never both, never neither. This exercises
// showProjectSettings()'s actual rendered dialog markup for each case.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const dialogBody={innerHTML:''};
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []},focus(){},scrollTop:0};
const overlay={...stub};
const dialogEl={classList:{toggle(){},add(){},remove(){}},querySelector(){return null},scrollTop:0,focus(){}};
const document={
  getElementById(id){ if(id==='dialogBody')return dialogBody; if(id==='overlay')return overlay; return stub; },
  querySelectorAll(){return []},
  querySelector(sel){ if(sel==='.dialog')return dialogEl; return null; },
  addEventListener(){}, body:{classList:{add(){},remove(){}}}, contains(){return true}, activeElement:null,
  createElement(){return {classList:{add(){},remove(){}},addEventListener(){},setAttribute(){}}},
};

const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});

const context={window:{STATE_API:stubApi},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

api.state.data.project={id:'northstar',name:'Northstar',seeded:true};
api.showProjectSettings();
check('a seeded project offers Reset example data', dialogBody.innerHTML.includes('data-action="confirm-demo-reset"'));
check('a seeded project does NOT offer Delete project', !dialogBody.innerHTML.includes('data-action="confirm-delete-project"'));

api.state.data.project={id:'project_custom',name:'AI Notes',seeded:false};
api.showProjectSettings();
check('a user-created project offers Delete project', dialogBody.innerHTML.includes('data-action="confirm-delete-project"'));
check('a user-created project does NOT offer Reset example data', !dialogBody.innerHTML.includes('data-action="confirm-demo-reset"'));

// A missing/unknown `seeded` flag must default to the SAFER choice: offer
// Reset (a no-op-ish, backend-enforced action), never Delete (irreversible).
api.state.data.project={id:'project_unknown',name:'Unknown'};
api.showProjectSettings();
check('a project with no seeded flag defaults to Reset, not Delete', dialogBody.innerHTML.includes('data-action="confirm-demo-reset"') && !dialogBody.innerHTML.includes('data-action="confirm-delete-project"'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0) process.exit(1);
