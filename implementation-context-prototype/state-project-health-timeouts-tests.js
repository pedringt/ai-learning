// Oct 10 production check: right after a deploy every project read "Incomplete: Couldn't check:
// Deployment activity (request timed out)". The page waited 7.5 s, but the activity function may
// legitimately take its full chain of Vercel API timeouts (deployment list, then runtime logs with
// one longer retry). The page must wait longer than that chain, and Vercel must allow it to run.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const api=fs.readFileSync(path.join(root,'api/project-health-activity.js'),'utf8');
const chain=[...api.matchAll(/timeoutMs:(\d+)\s*\}/g)].map(m=>Number(m[1]));
const serverWorst=chain.reduce((a,b)=>a+b,0);
check('the activity function has a bounded request chain',chain.length>=3&&serverWorst>0,String(chain));
const page=fs.readFileSync(path.join(root,'project-health.js'),'utf8');
const browser=Number((page.match(/project-health-activity\?project='\+encodeURIComponent\(project\.id\),\{timeoutMs:(\d+)\}/)||[])[1]);
check('the page waits longer than that chain',browser>serverWorst,`page ${browser} ms, server worst ${serverWorst} ms`);
const fn=(JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).functions||{})['api/project-health-activity.js']||{};
check('Vercel lets the function run that long',fn.maxDuration*1000>serverWorst,`maxDuration ${fn.maxDuration}`);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
