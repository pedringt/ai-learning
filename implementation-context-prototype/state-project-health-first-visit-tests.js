// Oct 31: on a first visit (no saved snapshot) in a hidden or background page, every Project Health card stayed on
// "Checking" after the status line said "Updated just now". Renders were queued on requestAnimationFrame, which never
// fires in such a page, so the page kept its first paint. These tests run init() end to end with a stub DOM, no
// snapshot, and a requestAnimationFrame that never fires, and wait for every card to settle.
const assert=require('assert');
const H=require('../project-health.js');

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

function stubElement(id){
  return {
    id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    setAttribute(){},getAttribute(){return null;},removeAttribute(){},
    addEventListener(){},removeEventListener(){},
    querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;},
    appendChild(){},append(){},insertAdjacentHTML(){},scrollIntoView(){},focus(){},showModal(){},close(){},contains(){return false;}
  };
}
function stubRoot({raf}){
  const elements=new Map(),store=new Map();
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,stubElement(id));return elements.get(id);},
    querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(){},removeEventListener(){},createElement(tag){return stubElement(tag);},
    body:stubElement('body'),hidden:true
  };
  const timers=new Set();
  const root={
    document,
    location:{href:'https://www.contextswitch.tech/project-health',search:'',hostname:'www.contextswitch.tech'},
    history:{replaceState(){}},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)},
    navigator:{},
    setTimeout:(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;},
    clearTimeout:t=>{timers.delete(t);clearTimeout(t);},
    setInterval:()=>0,
    alert(){},prompt(){},
    addEventListener(){},removeEventListener(){}
  };
  if(raf==='never')root.requestAnimationFrame=()=>0;
  return {root,elements,store,cleanup:()=>{for(const t of timers)clearTimeout(t);timers.clear();}};
}
// Every API answers 404 quickly, so each project settles on a known status ("Incomplete") without any network.
function failingFetch(){
  return async()=>({ok:false,status:404,json:async()=>({detail:'not found'})});
}
function cardStatuses(html){
  return [...html.matchAll(/data-project="([^"]+)"[^>]*>[\s\S]*?class="status-pill [^"]*"[^>]*>(?:<span aria-hidden="true">)?([^<]+)/g)].map(match=>({id:match[1],label:match[2]}));
}
async function waitFor(predicate,ms=4000){
  const start=Date.now();
  while(Date.now()-start<ms){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,25));}
  return predicate();
}

(async()=>{
  const realFetch=global.fetch;
  global.fetch=failingFetch();
  try{
    await check('first visit with requestAnimationFrame paused: every card leaves "Checking"',async()=>{
      const {root,elements,store,cleanup}=stubRoot({raf:'never'});
      try{
        await H.init(root);
        const cards=()=>cardStatuses(elements.get('projectCards').innerHTML);
        assert.strictEqual(cards().length,H.PROJECTS.length,'one card per project');
        const settled=await waitFor(()=>cards().every(card=>card.label!=='Checking'));
        assert.ok(settled,'cards still checking: '+JSON.stringify(cards()));
        assert.ok(cards().every(card=>card.label!=='Healthy'),'no card may read Healthy when every signal failed: '+JSON.stringify(cards()));
        assert.match(elements.get('status').innerHTML,/Updated just now/);
        assert.ok(store.has('project-health-snapshot:production'),'the snapshot is saved');
      }finally{cleanup();}
    });
    await check('first visit with no requestAnimationFrame at all also settles',async()=>{
      const {root,elements,cleanup}=stubRoot({raf:'none'});
      try{
        await H.init(root);
        const cards=()=>cardStatuses(elements.get('projectCards').innerHTML);
        assert.ok(await waitFor(()=>cards().length&&cards().every(card=>card.label!=='Checking')),'cards still checking: '+JSON.stringify(cards()));
      }finally{cleanup();}
    });
  }finally{global.fetch=realFetch;}

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
