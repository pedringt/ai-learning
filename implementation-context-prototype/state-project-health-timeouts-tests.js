// Oct 10 production check: right after a deploy every project read "Incomplete: Couldn't check:
// Deployment activity (request timed out)". The page waited 7.5 s, but the activity function may
// legitimately take its full chain of Vercel API timeouts (deployment list, then runtime logs).
// The page must wait longer than that chain, and Vercel must allow it to run.
// Oct 12 production timing: a cold activity call took ~14 s for every project because a 9 s retry
// of the runtime-log stream never returned rows. Oct 19: that stream is a live tail with no history,
// so it is no longer read; the chain is one bounded deployment-list call.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const api=fs.readFileSync(path.join(root,'api/project-health-activity.js'),'utf8');
const {DEPLOYMENTS_TIMEOUT_MS}=require('../api/project-health-activity.js')._test;
const serverWorst=DEPLOYMENTS_TIMEOUT_MS;
check('the activity function has a bounded request',DEPLOYMENTS_TIMEOUT_MS>0,String(DEPLOYMENTS_TIMEOUT_MS));
const body=api.slice(api.indexOf('async function loadActivity'),api.indexOf('module.exports=async function handler'));
const calls=[...body.matchAll(/await timed\w*\(/g)].length;
check('the chain is one deployment-list call (no runtime-log read, no retry)',calls===1,`found ${calls} awaited Vercel calls`);
const literals=[...body.matchAll(/timeoutMs:(\d+)/g)].map(m=>m[1]);
check('every Vercel call uses the named timeouts the chain is computed from',!literals.length,String(literals));
check('the worst-case server chain stays under 12 s',serverWorst<=12000,`server worst ${serverWorst} ms`);
const page=fs.readFileSync(path.join(root,'project-health.js'),'utf8');
const browser=Number((page.match(/project-health-activity\?project='\+encodeURIComponent\(project\.id\),\{timeoutMs:(\d+)\}/)||[])[1]);
check('the page waits longer than that chain, with at least 2 s of margin',browser>=serverWorst+2000,`page ${browser} ms, server worst ${serverWorst} ms`);
const fn=(JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).functions||{})['api/project-health-activity.js']||{};
check('Vercel lets the function run that long',fn.maxDuration*1000>serverWorst,`maxDuration ${fn.maxDuration}`);

(async()=>{
  // Behavior: the deployment summary is returned, no runtime-log stream is opened, and server errors
  // are reported as not monitored (never as a clean or partial scan).
  const handler=require('../api/project-health-activity.js');
  const originalFetch=global.fetch,originalToken=process.env.VERCEL_TOKEN;
  const urls=[];
  process.env.VERCEL_TOKEN='test-token';
  global.fetch=async url=>{
    urls.push(String(url));
    if(/\/v7\/deployments/.test(String(url)))return {ok:true,status:200,json:async()=>({deployments:[{uid:'dpl_1',name:'state',target:'production',state:'READY',created:Date.now()-60000}]})};
    throw new Error('unexpected fetch '+url);
  };
  let payload=null;
  try{
    await handler({method:'GET',query:{project:'state'}},{setHeader(){},status(){return this;},json(body){payload=body;}});
  }finally{
    global.fetch=originalFetch;
    if(originalToken==null)delete process.env.VERCEL_TOKEN;else process.env.VERCEL_TOKEN=originalToken;
  }
  check('no runtime-log stream is opened',!urls.some(url=>/runtime-logs/.test(url)),urls.join(' '));
  check('server errors are reported as not monitored',payload?.activity?.runtime?.coverage==='not_monitored'&&/Not monitored/.test(payload?.activity?.runtime?.note||''),JSON.stringify(payload?.activity?.runtime));
  check('deployment activity is still returned',payload?.activity?.available===true&&payload.activity.deployments.latest_state==='READY');

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
