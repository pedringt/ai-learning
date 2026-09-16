// Blank-project bug report (2026-09-15), item 4: a brand-new project showed
// the same "Exploring State?" tour banner as an established one, pointing
// at Open Items/Current State that are both still empty. onboardingStage()
// (context-ask-followup.js) picks one of three banners based on whether the
// project has any Evidence yet and whether it has established Current
// State. This exercises that state->stage mapping and each stage's copy
// directly (guideMarkup is a pure function of the stage), without needing a
// full rendered DOM.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

const stubApi=new Proxy({}, {get(target,prop){return prop in target?target[prop]:(()=>new Promise(()=>{}));}});

const context={window:{STATE_API:stubApi},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,setInterval,clearInterval,URLSearchParams,history:{replaceState(){}},WeakMap,MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask-followup.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);

const onboarding=context.window.STATE_ONBOARDING_TEST_API;
const app=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

check('onboarding test API loaded', !!onboarding);

app.state.data.notes=[];
app.state.data.knowledge=[];
check('a blank project (no notes, no current state) is the no_evidence stage', onboarding.onboardingStage()==='no_evidence');
check('no_evidence banner tells the user to add their first evidence', guideHas('no_evidence','Add your first evidence'));
check('no_evidence banner\'s CTA goes to Add Evidence, not empty Open Items', guideHas('no_evidence','data-action="add-info"'));

app.state.data.notes=[{id:'n-1',text:'A substantial first note.'}];
app.state.data.knowledge=[];
check('notes exist but nothing established yet is the evidence_not_established stage', onboarding.onboardingStage()==='evidence_not_established');
check('evidence_not_established banner points at Open Items for the pending decision', guideHas('evidence_not_established','Open Items'));

app.state.data.notes=[{id:'n-1',text:'A substantial first note.'}];
app.state.data.knowledge=[{id:'k-1',statement:'Something is now established.',state:'current'}];
check('current state exists is the established stage (original banner, unchanged)', onboarding.onboardingStage()==='established');
check('established banner keeps the original "Exploring State?" copy', guideHas('established','Exploring State?'));

app.state.data.notes=[{id:'n-1',text:'A substantial first note.'}];
app.state.data.knowledge=[{id:'k-1',statement:'Retired, not actually current.',state:'retired'}];
check('a project with only retired knowledge (never removed by syncApiState, just tagged) is still evidence_not_established, not established', onboarding.onboardingStage()==='evidence_not_established');

function guideHas(stage,substring){ return onboarding.guideMarkup(stage).includes(substring); }

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0) process.exit(1);
