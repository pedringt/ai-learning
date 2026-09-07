// Regression coverage for a bug found in live staging QA (2026-09-07): a
// clearly phrased question like "Did Security and Legal confirm retention
// terms?" opened "Add a project update" instead of answering the question,
// because the old heuristic fired on any past-tense word (approved,
// confirmed, decided, agreed, learned, yesterday, today) plus a topic word,
// with no regard for whether the input was phrased as a question at all.
// submitAsk() must now default to treating input as a question unless there
// is explicit update intent ("add this", "update state", "record this", etc).
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

const stubAsk={
  canHandle(){return true},
  canStream(){return false},
  followupMode(){return 'new'},
  async submit(query){return {answer:{headline:'answer for '+query},followup_mode:'new'};},
  render(){return '<div class="rendered"></div>'},
  renderStream(){return '<div class="streaming"></div>'},
  portableText(){return ''},
};

const context={window:{STATE_ASK:stubAsk},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

function dialogOpened(){ return stub.innerHTML.includes('Add a project update'); }

(async()=>{
  // The exact bug report: a question containing "confirm"/topic words must
  // still be treated as a question, not redirected into the update dialog.
  const questions=[
    'Did Security and Legal confirm retention terms?',
    'What are the confirmed retention terms?',
    'Was the plan approved yesterday?',
    'Is the feature team decided on Okta?',
    'Who approved the security plan?',
    'Did the customer agree to the new terms?',
  ];
  for(const q of questions){
    stub.innerHTML='';
    await api.submitAsk(q);
    check(`question is answered, not redirected: "${q}"`, !dialogOpened(), stub.innerHTML.slice(0,80));
  }

  // Explicit update intent, phrased as a statement (not a question), should
  // still open the update dialog -- this is the legitimate case the old
  // heuristic was trying to serve.
  const updates=[
    'Please add this: Security approved Okta yesterday.',
    'Update State: the client approved Okta on September 6.',
    'Record this: the plan was approved.',
  ];
  for(const u of updates){
    stub.innerHTML='';
    await api.submitAsk(u);
    check(`explicit update intent opens the update dialog: "${u}"`, dialogOpened(), stub.innerHTML.slice(0,80));
  }

  // A plain statement with no question mark AND no explicit update marker
  // should default to Ask (the safe default), not silently open a dialog.
  stub.innerHTML='';
  await api.submitAsk('Security approved Okta for SSO yesterday');
  check('plain statement without explicit intent defaults to Ask, not the dialog', !dialogOpened(), stub.innerHTML.slice(0,80));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail) process.exit(1);
})();
