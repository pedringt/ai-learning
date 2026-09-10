// Regression coverage for context-analytics.js -- the lightweight,
// privacy-conscious event tracker added for the "Next Marching Orders"
// Phase 1 analytics work. Verifies ref/session attribution, owner-mode
// suppression, Ask query handling, and consequence-specific Review events.
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

function freshContext({search='',ownerMode=false}={}){
  const events=[];
  const localStorage=makeStorage();
  const sessionStorage=makeStorage();
  if(ownerMode) localStorage.setItem('paigeOwnerMode','true');
  const stub={appendChild(){},addEventListener(){}};
  const document={
    readyState:'complete',
    createElement(){return {};},
    head:stub,
    addEventListener(event,cb){ if(event==='click') document._click=cb; else if(event==='DOMContentLoaded') document._domReady=cb; },
    _click:null,
    _domReady:null,
  };
  const va=function(){ events.push(Array.from(arguments)); };
  const location={href:'https://state.example/app'+search,origin:'https://state.example',search};
  const context={
    window:{va,location},
    document,
    localStorage,
    sessionStorage,
    location,
    URL,
    URLSearchParams,
    console,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(dir,'context-analytics.js'),'utf8'),context);
  return {context,events};
}

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// --- basic tracking + session/ref attribution ---------------------------
{
  const {context,events}=freshContext({search:'?ref=kim-review'});
  context.window.StateAnalytics.track('workspace_viewed',{view:'overview'});
  const [name,payload]=events[events.length-1];
  check('track() sends the event name', name==='event');
  check('track() carries the event name in payload.name', payload.name==='workspace_viewed');
  check('ref query param is captured into the event payload', payload.data.ref==='kim-review');
  check('a session id is attached', typeof payload.data.session==='string' && payload.data.session.length>0);
}

// --- ref persists across calls even after the query param is gone -------
{
  const {context,events}=freshContext({search:'?ref=kim-review'});
  context.window.StateAnalytics.track('workspace_viewed');
  context.location.search='';
  context.window.StateAnalytics.track('open_items_viewed');
  const last=events[events.length-1][1];
  check('ref is remembered for later events in the same session even once the URL param is gone', last.data.ref==='kim-review');
}

// --- no ref param falls back to 'direct' ---------------------------------
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.track('workspace_viewed');
  const last=events[events.length-1][1];
  check('ordinary traffic with no ?ref= is labeled direct', last.data.ref==='direct');
}

// --- owner mode suppresses all tracking -----------------------------------
{
  const {context,events}=freshContext({ownerMode:true});
  context.window.StateAnalytics.track('workspace_viewed');
  check('owner mode (paigeOwnerMode) suppresses tracking so QA/dev usage does not pollute reviewer analytics', events.length===0);
}

// --- Ask query text only goes out through trackAskQuery -------------------
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.trackAskQuery('What is blocking launch?',{followupMode:'new'});
  const [,payload]=events[events.length-1];
  check('trackAskQuery names the event ask_submitted', payload.name==='ask_submitted');
  check('trackAskQuery carries the actual query text', payload.data.query==='What is blocking launch?');
  check('trackAskQuery still carries session/ref attribution', payload.data.ref==='direct' && !!payload.data.session);
}

// --- ask query text is truncated, not stored unbounded ---------------------
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.trackAskQuery('x'.repeat(1000));
  const [,payload]=events[events.length-1];
  check('overly long Ask queries are truncated before being sent', payload.data.query.length<=300);
}

// --- legacy Review events normalize to consequence language --------------
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.track('review_accepted',{reviewId:'r-update'});
  const [,payload]=events[events.length-1];
  check('legacy review_accepted is normalized to review_decision', payload.name==='review_decision');
  check('accepted State update records the actual outcome', payload.data.outcome==='current_state_updated' && payload.data.reviewId==='r-update');
}
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.track('review_rejected',{reviewId:'r-keep'});
  const [,payload]=events[events.length-1];
  check('legacy review_rejected is normalized instead of calling kept Evidence rejected', payload.name==='review_decision');
  check('keep action is recorded as Current State kept', payload.data.outcome==='current_state_kept' && payload.data.reviewId==='r-keep');
}
{
  const {context,events}=freshContext();
  context.window.StateAnalytics.track('review_decision',{reviewId:'r-answer',outcome:'question_resolved'});
  const [,payload]=events[events.length-1];
  check('new question-specific review_decision passes through unchanged', payload.name==='review_decision' && payload.data.outcome==='question_resolved');
}

// --- state_demo_opened fires once on load (document already complete) -----
{
  const {events}=freshContext();
  check('state_demo_opened fires on module load', events.some(([,p])=>p.name==='state_demo_opened'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
