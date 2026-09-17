// Regression coverage for State's metadata-only first-party analytics collector.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
function makeStorage(){const data={};return{getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]};}
function freshContext({search='',ownerMode=false,hostname='state.example',projectId='northstar',externalSink=false}={}){
  const events=[],requests=[],listeners={};
  const localStorage=makeStorage(),sessionStorage=makeStorage();if(ownerMode)localStorage.setItem('paigeOwnerMode','true');
  const projectSwitcher={dataset:{projectId}};
  const document={readyState:'complete',currentScript:{src:`https://${hostname}/implementation-context-prototype/context-analytics.js?v=test-build`},createElement:tag=>({tagName:tag}),head:{appendChild(){}},getElementById:id=>id==='projectSwitcher'?projectSwitcher:null,addEventListener:(event,cb)=>(listeners[event]=listeners[event]||[]).push(cb)};
  const location={href:`https://${hostname}/app${search}`,origin:`https://${hostname}`,search,hostname,protocol:'https:'};
  const window={location};if(externalSink)window.StateAnalyticsSink=event=>events.push(event);
  const fetch=(url,options={})=>{requests.push({url,options,payload:options.body?JSON.parse(options.body):null});return Promise.resolve({ok:true});};
  const context={window,document,localStorage,sessionStorage,location,URL,URLSearchParams,console,Date,Math,Set,fetch};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(dir,'context-analytics.js'),'utf8'),context);
  return{context,events,requests,dispatch:(type,event)=>{for(const cb of listeners[type]||[])cb(event);}};
}
let pass=0;function check(name,fn){try{fn();pass++;console.log('✓',name)}catch(e){console.error('✗',name);throw e}}

check('default collector sends state_demo_opened to first-party API',()=>{const {requests}=freshContext({hostname:'ai-learning-git-staging-cairn10.vercel.app'});if(!requests.length)throw new Error('no request');if(!requests[0].url.startsWith('https://state-api-staging.onrender.com/api/analytics/events'))throw new Error(requests[0].url);if(requests[0].payload.name!=='state_demo_opened')throw new Error('wrong event');});
check('collector includes metadata context but no project content',()=>{const {context,requests}=freshContext();context.window.StateAnalytics.track('view_opened',{view:'overview',query:'secret',safe_count:4,evidence_content:'secret'});const p=requests.at(-1).payload;if(p.view!=='overview'||p.project_id!=='northstar'||!p.session_id)throw new Error('missing safe metadata');for(const key of ['query','safe_count','evidence_content'])if(key in p)throw new Error(`leaked ${key}`);});
check('explicit allowlist drops unknown event properties',()=>{const {context,requests}=freshContext();context.window.StateAnalytics.track('ask_failed',{outcome:'timeout',duration_ms:30000,status_code:504,reason:'private detail'});const p=requests.at(-1).payload;if(p.outcome!=='timeout'||p.duration_ms!==30000||p.status_code!==504)throw new Error('safe fields missing');if('reason'in p)throw new Error('unknown field leaked');});
check('unsupported event names are ignored',()=>{const {context,requests}=freshContext();const before=requests.length;context.window.StateAnalytics.track('capture_everything',{outcome:'x'});if(requests.length!==before)throw new Error('unsupported event sent');});
check('owner mode suppresses first-party collection',()=>{const {context,requests}=freshContext({ownerMode:true});const before=requests.length;context.window.StateAnalytics.track('view_opened',{view:'overview'});if(requests.length!==before)throw new Error('owner event sent');});
check('raw Ask query never enters event payload',()=>{const {context,requests}=freshContext();context.window.StateAnalytics.trackAskQuery('What is the secret launch plan?',{outcome:'submitted'});const p=requests.at(-1).payload;if(p.name!=='ask_submitted'||'query'in p)throw new Error('Ask query leaked');});
check('outbound links store origin only',()=>{const {dispatch,requests}=freshContext();dispatch('click',{target:{closest:sel=>sel==='a[href]'?{href:'https://example.com/private/path?token=secret'}:null}});const p=requests.at(-1).payload;if(p.destination_origin!=='https://example.com')throw new Error(JSON.stringify(p));});
check('external sink remains supported for tests/integrations',()=>{const {context,events}=freshContext({externalSink:true});context.window.StateAnalytics.track('view_opened',{view:'history'});if(events.at(-1).name!=='view_opened')throw new Error('sink not called');});
console.log(`\n${pass} passed, 0 failed`);
