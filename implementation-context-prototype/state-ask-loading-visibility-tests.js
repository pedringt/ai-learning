// Regression coverage for a bug found in live staging QA (2026-09-06): a fresh
// or topic-shift question computed followupMode==='new' correctly, but
// submitAsk() never consulted it before showing the *loading/streaming*
// state -- it always carried the old answer into state.result.previousLive,
// so the stale answer sat fully visible on screen for the entire wait even
// though the eventual final swap (driven by the backend's own followup_mode)
// was already correct. state-ask-followup-tests.js only covers the network
// payload and the final rendered state; this file covers the transient
// loading state in between, which is where the bug actually lived.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

let resolveStream;
const streamGate=new Promise(res=>{resolveStream=res});
const stubAsk={
  canHandle(){return true},
  canStream(){return true},
  // Mirrors context-ask-followup.js's real contract: a fresh/topic-shift
  // question gets no previous-answer context and is reported back as 'new',
  // regardless of what submitAsk() happened to pass in as `previous`.
  followupMode(query){return /new question/i.test(query)?'new':'replace'},
  async submitStream(query,previous){
    await streamGate;
    const isNew=/new question/i.test(query);
    return {answer:{headline:'answer for '+query}, followup_mode: isNew?'new':'append'};
  },
  async submit(query,previous){
    const isNew=/new question/i.test(query);
    return {answer:{headline:'answer for '+query}, followup_mode: isNew?'new':'append'};
  },
  render(){return '<div class="rendered"></div>'},
  renderStream(){return '<div class="streaming"></div>'},
  portableText(){return ''},
};

const context={window:{STATE_ASK:stubAsk},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

(async()=>{
  api.state.result={liveAsk:{headline:'Old answer'}};
  const pending=api.submitAsk('What is a totally new question?');
  // submitAsk runs synchronously up to its first await (the gated
  // submitStream call), so the loading state is already committed here.
  check('fresh question hides stale answer while loading',api.state.result.previousLive===null,JSON.stringify(api.state.result.previousLive));
  check('fresh question is in a loading/streaming state',api.state.result.liveAskStreaming===true);
  resolveStream();
  await pending;
  check('fresh question has no previous answer once resolved',api.state.result.previousLive===null);

  api.state.result={liveAsk:{headline:'Old answer'}};
  const pending2=api.submitAsk('Why?');
  check('dependent follow-up keeps stale answer visible while loading',pending2 && api.state.result.previousLive?.headline==='Old answer',JSON.stringify(api.state.result.previousLive));
  await pending2;
  check('dependent follow-up keeps previous answer once resolved',api.state.result.previousLive?.headline==='Old answer');

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})().catch(err=>{console.error(err);process.exit(1)});
