// Regression coverage for context-analytics.js. The compatibility layer must
// stay inert by default, preserve safe metadata for a future first-party sink,
// and fail closed on project/user content.
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

function freshContext({search='',ownerMode=false,hostname='state.example',projectId='northstar',withSink=false}={}){
  const events=[];
  const listeners={};
  const localStorage=makeStorage();
  const sessionStorage=makeStorage();
  if(ownerMode) localStorage.setItem('paigeOwnerMode','true');
  const projectSwitcher={dataset:{projectId}};
  const appendedScripts=[];
  const document={
    readyState:'complete',
    currentScript:{src:`https://${hostname}/implementation-context-prototype/context-analytics.js?v=test-build`},
    createElement(tag){return {tagName:tag};},
    head:{appendChild(node){appendedScripts.push(node);}},
    getElementById(id){return id==='projectSwitcher'?projectSwitcher:null;},
    addEventListener(event,cb){(listeners[event]=listeners[event]||[]).push(cb);},
  };
  const location={href:`https://${hostname}/app${search}`,origin:`https://${hostname}`,search,hostname,protocol:'https:'};
  const window={location};
  if(withSink) window.StateAnalyticsSink=(event)=>events.push(event);
  const context={window,document,localStorage,sessionStorage,location,URL,URLSearchParams,console,Date,Math};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(dir,'context-analytics.js'),'utf8'),context);
  function dispatch(type,event){for(const cb of listeners[type]||[])cb(event);}
  function analyticsEvents(name){return events.filter(event=>!name||event.name===name);}
  return {context,events,dispatch,analyticsEvents,appendedScripts};
}

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// --- zero-cost default -----------------------------------------------------
{
  const {context,events,appendedScripts}=freshContext();
  context.window.StateAnalytics.track('workspace_viewed',{view:'overview'});
  check('no browser analytics events are sent without an explicit first-party sink',events.length===0);
  check('analytics module does not inject a Vercel analytics script',appendedScripts.length===1 && appendedScripts[0].tagName==='style');
  check('default analytics state reports no sink',context.window.StateAnalytics.hasSink()===false);
}

// --- optional first-party sink keeps safe metadata ------------------------
{
  const {context,analyticsEvents}=freshContext({search:'?ref=kim-review',withSink:true});
  context.window.StateAnalytics.track('workspace_viewed',{view:'overview'});
  const payload=analyticsEvents('workspace_viewed').pop();
  check('future first-party sink receives event name',payload.name==='workspace_viewed');
  check('ref query param is captured',payload.data.ref==='kim-review');
  check('a session id is attached',typeof payload.data.session==='string'&&payload.data.session.length>0);
  check('active project id is attached',payload.data.project_id==='northstar');
  check('environment is attached',payload.data.environment==='production');
  check('frontend build label is attached',payload.data.build==='test-build');
  check('safe event metadata is preserved',payload.data.view==='overview');
}

// --- ref persists across calls --------------------------------------------
{
  const {context,analyticsEvents}=freshContext({search:'?ref=kim-review',withSink:true});
  context.window.StateAnalytics.track('workspace_viewed');
  context.location.search='';
  context.window.StateAnalytics.track('open_items_viewed');
  check('ref is remembered for later events in the same session',analyticsEvents('open_items_viewed').pop().data.ref==='kim-review');
}

// --- environment labeling -------------------------------------------------
{
  const {context,analyticsEvents}=freshContext({hostname:'ai-learning-git-staging-cairn10.vercel.app',withSink:true});
  context.window.StateAnalytics.track('workspace_viewed');
  check('staging/preview host is labeled staging',analyticsEvents('workspace_viewed').pop().data.environment==='staging');
}

// --- owner mode suppresses even a configured sink -------------------------
{
  const {context,events}=freshContext({ownerMode:true,withSink:true});
  context.window.StateAnalytics.track('workspace_viewed');
  check('owner mode suppresses tracking',events.length===0);
}

// --- project/user content fails closed ------------------------------------
{
  const {context,analyticsEvents}=freshContext({withSink:true});
  context.window.StateAnalytics.track('privacy_probe',{
    query:'secret question',
    evidence_content:'secret evidence',
    answer:'secret answer',
    current_state:'secret state',
    prompt:'secret prompt',
    token:'secret token',
    safe_count:3
  });
  const data=analyticsEvents('privacy_probe').pop().data;
  check('content-bearing fields are dropped',
    !('query'in data)&&!('evidence_content'in data)&&!('answer'in data)&&!('current_state'in data)&&!('prompt'in data)&&!('token'in data));
  check('safe metadata survives privacy filtering',data.safe_count===3);
}

// --- compatibility helper never forwards raw Ask text ---------------------
{
  const {context,analyticsEvents}=freshContext({withSink:true});
  context.window.StateAnalytics.trackAskQuery('What is blocking launch?',{source:'typed'});
  const payload=analyticsEvents('ask_submitted').pop();
  check('trackAskQuery preserves event compatibility',payload.name==='ask_submitted');
  check('trackAskQuery does not forward raw query text',!('query'in payload.data));
  check('safe Ask metadata may still be preserved',payload.data.source==='typed');
}

// --- state_demo_opened reaches an installed sink --------------------------
{
  const {analyticsEvents}=freshContext({withSink:true});
  check('state_demo_opened reaches a configured first-party sink',analyticsEvents('state_demo_opened').length===1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
