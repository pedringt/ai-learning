// #650 review (Nov 8): openQuestionById() showed a Question's dialog even after the user had closed it, switched
// projects, or opened another Question while the request was in flight. These delay getQuestion() replies and check
// that a stale reply, success or error, is dropped, while a current one still shows. No network, no model calls.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

function deferred(){ let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
const stub=()=>({innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){},contains(){return false}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}});
const overlay=stub();
// The dialog body answers selector lookups from its HTML, which is all the request-token check needs.
const dialogBody={...stub(),querySelector(sel){ const m=/\[data-question-request="(\d+)"\]/.exec(sel); return m&&this.innerHTML.includes(`data-question-request="${m[1]}"`)?{}:null; }};
const other=stub();
const document={getElementById(id){return id==='overlay'?overlay:id==='dialogBody'?dialogBody:other},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub(),contains(){return true},activeElement:null};

const replies=[];
const stubApi=new Proxy({
  setActiveProject(){},
  getQuestion(id){ const d=deferred(); replies.push({id,...d}); return d.promise; },
  async switchProject(id){ return {id,name:id}; },
}, {get(target,prop){ return prop in target ? target[prop] : (()=>new Promise(()=>{})); }});

const context={window:{STATE_API:stubApi},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
for(const file of ['context-data.js','context-notes-view.js','context-open-items-view.js','context-project-view.js','context-backend-sync.js','context-app-dialogs.js','context-app-navigation.js','context-app-hydration.js','context-app-review-actions.js','context-app.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

const answered=id=>({item:{id,text:`Question ${id}?`,status:'resolved',resolved_at:null},details:{evidence:null,resolving_review:null,state_updates:[]}});
const tick=()=>new Promise(r=>setTimeout(r,0));
const shows=text=>!overlay.hidden&&dialogBody.innerHTML.includes(text);
function reset(){ api.closeDialog(); replies.length=0; }

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

(async()=>{
  reset(); api.openQuestionById('qA'); replies[0].resolve(answered('qA')); await tick();
  check('control: a current reply still shows its Question', shows('Question qA?'));

  reset(); api.openQuestionById('qA'); replies[0].reject(new Error('offline')); await tick();
  check('control: a current error still shows the could-not-load dialog', shows('could not be loaded'));

  reset(); api.openQuestionById('qA'); api.closeDialog(); replies[0].resolve(answered('qA')); await tick();
  check('closing the dialog drops a later success', overlay.hidden&&!dialogBody.innerHTML.includes('Question qA?'));

  reset(); api.openQuestionById('qA'); api.closeDialog(); replies[0].reject(new Error('offline')); await tick();
  check('closing the dialog drops a later error', overlay.hidden&&!dialogBody.innerHTML.includes('could not be loaded'));

  reset(); api.openQuestionById('qA'); api.showDialog('<h2 id="dialogTitle">Another dialog</h2>'); replies[0].resolve(answered('qA')); await tick();
  check('opening another dialog drops a later success', shows('Another dialog')&&!dialogBody.innerHTML.includes('Question qA?'));

  reset(); api.openQuestionById('qA'); api.openQuestionById('qB');
  replies[1].resolve(answered('qB')); await tick(); replies[0].resolve(answered('qA')); await tick();
  check('Question B opened before A returns: B shows and A\'s late success is dropped', shows('Question qB?')&&!dialogBody.innerHTML.includes('Question qA?'));

  reset(); api.openQuestionById('qA'); api.openQuestionById('qB');
  replies[0].resolve(answered('qA')); await tick();
  check('Question B opened before A returns: A\'s reply arriving first does not replace B\'s loading dialog', shows('Loading…')&&!dialogBody.innerHTML.includes('Question qA?'));
  replies[1].reject(new Error('offline')); await tick();
  check('…and B\'s own error still shows', shows('could not be loaded'));

  reset(); api.openQuestionById('qA'); api.openQuestionById('qB');
  replies[1].resolve(answered('qB')); await tick(); replies[0].reject(new Error('offline')); await tick();
  check('A\'s late error does not replace Question B', shows('Question qB?')&&!dialogBody.innerHTML.includes('could not be loaded'));

  reset(); api.openQuestionById('qA'); api.activateProject('juniper'); await tick();  // its re-hydration never finishes here; the switch itself has happened
  replies[0].resolve(answered('qA')); await tick();
  check('switching projects drops a later success', !dialogBody.innerHTML.includes('Question qA?'));

  // The next two keep the loading dialog open, so only the project and hydration-generation checks can drop the reply.
  reset(); const before=api.state.data.project; api.openQuestionById('qA');
  api.state.data.project={...before,id:'project-other'};
  replies[0].reject(new Error('404')); await tick();
  check('a project change drops a later error', shows('Loading…')&&!dialogBody.innerHTML.includes('could not be loaded'));
  api.state.data.project=before;

  reset(); api.openQuestionById('qA'); api.hydrateBackend();
  replies[0].resolve(answered('qA')); await tick();
  check('a re-hydration (new generation) drops a later success', shows('Loading…')&&!dialogBody.innerHTML.includes('Question qA?'));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
