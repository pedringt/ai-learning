// #692: Ask sends the browser's time-zone offset with its local day, so a date Ask writes in software (when a Current
// State item was last confirmed) falls on the same day as the re-check chip beside it. A backend without the field
// answers 422 and Ask retries without either field (#476).
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'context-api.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}

function api(statuses){
  const bodies=[];
  const fetch=async(url,init)=>{bodies.push(JSON.parse(init.body));const status=statuses.shift()??200;
    return {ok:status<400,status,json:async()=>(status<400?{answer:{}}:{detail:'Unprocessable'}),headers:{get(){return 'application/json';}}};};
  const window={STATE_API_BASE:'http://127.0.0.1:8000'};
  const context={window,location:{hostname:'localhost'},document:{documentElement:{dataset:{}},getElementById(){return null}},fetch,AbortController,setTimeout,clearTimeout,TextDecoder,console,Date};
  vm.runInNewContext(src,context);
  return {API:window.STATE_API,bodies};
}

(async()=>{
  const {API,bodies}=api([200]);
  await API.ask('Which items need a re-check?');
  check('Ask sends the local day',/^\d{4}-\d{2}-\d{2}$/.test(bodies[0]?.client_date),JSON.stringify(bodies[0]));
  check('Ask sends the time-zone offset in minutes',bodies[0]?.client_timezone_offset===new Date().getTimezoneOffset(),JSON.stringify(bodies[0]));
  const old=api([422,200]);
  await old.API.ask('Which items need a re-check?').catch(()=>{});
  check('an older backend gets a retry without either field',old.bodies.length===2&&!('client_date' in old.bodies[1])&&!('client_timezone_offset' in old.bodies[1]),JSON.stringify(old.bodies));
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
