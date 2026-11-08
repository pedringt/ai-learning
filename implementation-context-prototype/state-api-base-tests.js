// #621: when api/state-config.js has not set window.STATE_API_BASE (a page opened from disk, a failed config load,
// an unrecognised preview host), the frontend used to fall back to the production API, so a local session could write
// to the shared production demo. Only the production hostnames default to production now.
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'context-api.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}
function baseFor(hostname,configured){
  const window={};if(configured)window.STATE_API_BASE=configured;
  const context={window,location:{hostname},document:{documentElement:{dataset:{}},getElementById(){return null}},fetch(){},AbortController,setTimeout,clearTimeout,TextDecoder,console};
  vm.runInNewContext(src,context);
  return window.STATE_API?.base;
}
const PROD='https://state-api-6waw.onrender.com',STAGING='https://state-api-staging.onrender.com';
check('state.contextswitch.tech uses production',baseFor('state.contextswitch.tech')===PROD,baseFor('state.contextswitch.tech'));
check('www.contextswitch.tech uses production',baseFor('www.contextswitch.tech')===PROD);
check('a page opened from disk uses staging',baseFor('')===STAGING,baseFor(''));
check('localhost uses staging',baseFor('localhost')===STAGING);
check('an unrecognised preview host uses staging',baseFor('state-abc123-cairn10.vercel.app')===STAGING);
check('the staging preview uses staging',baseFor('state-git-staging-cairn10.vercel.app')===STAGING);
check('a lookalike host is not production',baseFor('contextswitch.tech.evil.example')===STAGING);
check('window.STATE_API_BASE still wins',baseFor('localhost','http://127.0.0.1:8000')==='http://127.0.0.1:8000');
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
