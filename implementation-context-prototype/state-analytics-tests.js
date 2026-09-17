// Regression coverage for context-analytics.js. Verifies deployment/project
// context, owner-mode suppression, the explicit Ask-query exception, privacy
// filtering, and Ask lifecycle outcomes without sending answer/project content.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

function makeStorage(){
  const data={};
  return {
    getItem(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},
    setItem(k,v){data[k]=String(v);},
    removeItem(k){delete data[k];},
  };
}

function freshContext({search='',ownerMode=false,hostname='state.example',projectId='northstar'}={}){
  const events=[];
  const listeners={};
  const localStorage=makeStorage();
  const sessionStorage=makeStorage();
  if(ownerMode) localStorage.setItem('paigeOwnerMode','true');
  const projectSwitcher={dataset:{projectId}};
  const askInput={value:''};
  const stub={appendChild(){},addEventListener(){}};
  const document={
    readyState:'complete',
    currentScript:{src:`https://${hostname}/implementation-context-prototype/context-analytics.js?v=test-build`},
    createElement(){return {};},
    head:stub,
    getElementById(id){if(id==='projectSwitcher')return projectSwitcher;if(id==='askStateDrawerInput')return askInput;return null;},
    addEventListener(event,cb){(listeners[event]=listeners[event]||[]).push(cb);},
  };
  const va=function(){events.push(Array.from(arguments));};
  const location={href:`https://${hostname}/app${search}`,origin:`https://${hostname}`,search,hostname,protocol:'https:'};
  const window={va,location,setTimeout,clearTimeout,performance};
  const context={window,document,localStorage,sessionStorage,location,URL,URLSearchParams,console,setTimeout,clearTimeout,performance};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(dir,'context-analytics.js'),'utf8'),context);
  function dispatch(type,event){for(const cb of listeners[type]||[])cb(event);}
  function analyticsEvents(name){return events.map(([,payload])=>payload).filter(payload=>!name||payload.name===name);}
  return {context,events,dispatch,analyticsEvents,askInput};
}

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  // --- basic tracking + deployment/project/session/ref context ------------
  {
    const {context,events}=freshContext({search:'?ref=kim-review'});
    context.window.StateAnalytics.track('workspace_viewed',{view:'overview'});
    const [name,payload]=events[events.length-1];
    check('track() sends the event name',name==='event');
    check('track() carries the event name in payload.name',payload.name==='workspace_viewed');
    check('ref query param is captured',payload.data.ref==='kim-review');
    check('a session id is attached',typeof payload.data.session==='string'&&payload.data.session.length>0);
    check('active project id is attached',payload.data.project_id==='northstar');
    check('environment is attached',payload.data.environment==='production');
    check('frontend build label is attached',payload.data.build==='test-build');
  }

  // --- ref persists across calls ------------------------------------------
  {
    const {context,events}=freshContext({search:'?ref=kim-review'});
    context.window.StateAnalytics.track('workspace_viewed');
    context.location.search='';
    context.window.StateAnalytics.track('open_items_viewed');
    const last=events[events.length-1][1];
    check('ref is remembered for later events in the same session',last.data.ref==='kim-review');
  }

  // --- environment labeling ----------------------------------------------
  {
    const {context,events}=freshContext({hostname:'ai-learning-git-staging-cairn10.vercel.app'});
    context.window.StateAnalytics.track('workspace_viewed');
    check('staging/preview host is labeled staging',events[events.length-1][1].data.environment==='staging');
  }

  // --- owner mode suppresses all tracking ---------------------------------
  {
    const {context,events}=freshContext({ownerMode:true});
    context.window.StateAnalytics.track('workspace_viewed');
    check('owner mode suppresses tracking',events.length===0);
  }

  // --- Ask query is the only bounded content exception --------------------
  {
    const {context,events}=freshContext();
    context.window.StateAnalytics.trackAskQuery('What is blocking launch?',{source:'typed'});
    const [,payload]=events[events.length-1];
    check('trackAskQuery names the event ask_submitted',payload.name==='ask_submitted');
    check('trackAskQuery carries the disclosed query text',payload.data.query==='What is blocking launch?');
    check('trackAskQuery still carries project/session context',payload.data.project_id==='northstar'&&!!payload.data.session);
  }
  {
    const {context,events}=freshContext();
    context.window.StateAnalytics.trackAskQuery('x'.repeat(1000));
    const [,payload]=events[events.length-1];
    check('overly long Ask queries are truncated',payload.data.query.length<=300);
  }

  // --- generic event payloads cannot carry project/answer content ----------
  {
    const {context,events}=freshContext();
    context.window.StateAnalytics.track('privacy_probe',{
      evidence_content:'secret evidence',answer:'secret answer',current_state:'secret state',prompt:'secret prompt',safe_count:3
    });
    const data=events[events.length-1][1].data;
    check('content-bearing generic analytics fields are dropped',
      !('evidence_content'in data)&&!('answer'in data)&&!('current_state'in data)&&!('prompt'in data));
    check('safe metadata survives privacy filtering',data.safe_count===3);
  }

  // --- Ask lifecycle: starter -> answered + backend timing -----------------
  {
    const {context,dispatch,analyticsEvents}=freshContext();
    context.window.STATE_ASK=Object.freeze({
      submit:async()=>({timing:{pipeline:'one_call',total_ms:123,provider_ms:100}}),
      submitStream:async()=>({timing:{pipeline:'one_call_stream',total_ms:140,provider_ms:115,first_token_ms:40}}),
    });
    const prompt='Give me the project briefing';
    dispatch('click',{target:{closest(sel){return sel==='[data-review-batch-prompt]'?{dataset:{reviewBatchPrompt:prompt}}:null;}}});
    await context.window.STATE_ASK.submit(prompt);
    const submitted=analyticsEvents('ask_submitted').pop();
    const completed=analyticsEvents('ask_completed').pop();
    check('starter Ask is distinguished from typed Ask',submitted.data.source==='starter');
    check('successful Ask records answered outcome',completed.data.outcome==='answered');
    check('Ask completion carries backend timing metadata',completed.data.pipeline==='one_call'&&completed.data.backend_total_ms===123&&completed.data.provider_ms===100);
    check('Ask completion does not include answer content',!Object.keys(completed.data).some(k=>/answer|content|statement|evidence/i.test(k)));
  }

  // --- typed Ask cancellation is classified, not treated as generic failure -
  {
    const {context,dispatch,analyticsEvents,askInput}=freshContext();
    context.window.STATE_ASK=Object.freeze({
      submit:async()=>{const err=new Error('Cancelled.');err.isCancelled=true;throw err;},
      submitStream:async()=>{const err=new Error('Cancelled.');err.isCancelled=true;throw err;},
    });
    askInput.value='What changed?';
    const form={querySelector(){return askInput;}};
    dispatch('submit',{target:{closest(sel){return sel==='[data-review-batch-form="ask"]'?form:null;}}});
    try{await context.window.STATE_ASK.submit('What changed?');}catch(_){}
    const completed=analyticsEvents('ask_completed').pop();
    check('typed Ask is distinguished from starter Ask',analyticsEvents('ask_submitted').pop().data.source==='typed');
    check('cancelled Ask is classified separately',completed.data.outcome==='cancelled');
  }

  // --- locally routed Ask is still observable without a model/API call -----
  {
    const {dispatch,analyticsEvents,askInput}=freshContext();
    askInput.value='What needs review?';
    const form={querySelector(){return askInput;}};
    dispatch('submit',{target:{closest(sel){return sel==='[data-review-batch-form="ask"]'?form:null;}}});
    await delay(5);
    const completed=analyticsEvents('ask_completed').pop();
    check('locally handled Ask is classified as routed',completed&&completed.data.outcome==='routed');
  }

  // --- refresh and copy are visible as behavior, with no copied text --------
  {
    const {dispatch,analyticsEvents,askInput}=freshContext();
    askInput.value='What changed?';
    dispatch('click',{target:{closest(sel){return sel==='[data-review-batch-action]'?{dataset:{reviewBatchAction:'refresh-ask'}}:null;}}});
    await delay(5);
    check('refresh is identified as its own Ask source',analyticsEvents('ask_submitted').pop().data.source==='refresh');
    dispatch('click',{target:{closest(sel){return sel==='[data-review-batch-action]'?{dataset:{reviewBatchAction:'copy-ask-answer'}}:null;}}});
    const copied=analyticsEvents('ask_answer_copied').pop();
    check('copying an Ask answer emits a content-free event',!!copied&&!Object.keys(copied.data).some(k=>/answer|content|statement|evidence/i.test(k)));
  }

  // --- state_demo_opened fires once on load -------------------------------
  {
    const {analyticsEvents}=freshContext();
    check('state_demo_opened fires on module load',analyticsEvents('state_demo_opened').length===1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail) process.exit(1);
}

main().catch(error=>{console.error(error);process.exit(1);});
