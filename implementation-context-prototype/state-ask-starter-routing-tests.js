// Regression coverage for a live-staging bug (2026-09-12): clicking any of
// the Ask State drawer's 5 built-in "starter" prompts never reached the real
// backend. runAsk() ran every submitted query -- starters included -- through
// the same client-side classifier used to route short generic questions like
// "What needs review?" straight to a static Open Items count card. The
// starters are long instructions to the model (e.g. "...keep accepted
// Current State, pending Reviews, and unresolved Questions clearly
// separate."), and phrases like "pending Reviews" trip that classifier just
// like a bare "What needs review?" would, so 3 of the 5 starters silently
// rendered the same generic card instead of a real synthesized answer.
//
// The fix: runAsk(query, {skipRouting}) lets the starter click handler opt
// out of the classifier entirely, while the typed-question path (form
// submit, refresh-ask) is untouched and still routes generic questions to
// the compact card. This test drives the actual DOM click/submit handlers
// registered by context-product-polish.js -- not just the classifier in
// isolation -- so it would have caught the real bug.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

function makeElement(tag){
  const el={
    tagName:tag,id:'',className:'',hidden:false,textContent:'',innerHTML:'',value:'',disabled:false,
    dataset:{},attributes:{},children:[],style:{setProperty(){},removeProperty(){}},
    classList:{
      _set:new Set(),
      add(...c){c.forEach(x=>this._set.add(x));},
      remove(...c){c.forEach(x=>this._set.delete(x));},
      toggle(c,force){if(force===undefined){this._set.has(c)?this._set.delete(c):this._set.add(c);}else{force?this._set.add(c):this._set.delete(c);}},
      contains(c){return this._set.has(c);}
    },
    appendChild(child){this.children.push(child);child.parentNode=this;if(child.id)elementsById[child.id]=child;return child;},
    setAttribute(name,val){this.attributes[name]=val;},
    getAttribute(name){return this.attributes[name];},
    removeAttribute(name){delete this.attributes[name];},
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    closest(){return null;},
    focus(){},
    remove(){if(this.parentNode){const idx=this.parentNode.children.indexOf(this);if(idx>=0)this.parentNode.children.splice(idx,1);}},
    scrollTop:0,
  };
  return el;
}

const elementsById={};
const bodyEl=makeElement('body'), headEl=makeElement('head'), htmlEl=makeElement('html');
const listeners={};
const document={
  head:headEl, body:bodyEl, documentElement:htmlEl,
  readyState:'complete',
  activeElement:null,
  createElement(tag){return makeElement(tag);},
  getElementById(id){if(!elementsById[id])elementsById[id]=makeElement('div');return elementsById[id];},
  querySelector(){return null;},
  querySelectorAll(){return [];},
  contains(){return true;},
  addEventListener(type,handler){(listeners[type]=listeners[type]||[]).push(handler);},
};

// A fake DOM node standing in for a rendered starter button / ask form: its
// closest() answers only the selector the real click/submit handlers check
// for the interaction being simulated, exactly as a real element's closest()
// would for that element.
function starterButton(prompt){
  const el={dataset:{reviewBatchPrompt:prompt}};
  el.closest=sel=>sel==='[data-review-batch-prompt]'?el:null;
  return el;
}
function askForm(inputValue){
  const input={value:inputValue};
  const el={querySelector:sel=>sel==='input'?input:null};
  el.closest=sel=>sel==='[data-review-batch-form="ask"]'?el:null;
  return el;
}
function fire(type,target){
  const event={target,preventDefault(){},stopPropagation(){}};
  (listeners[type]||[]).forEach(handler=>handler(event));
}
const flush=()=>new Promise(r=>setTimeout(r,0));

const calls=[];
const stubAsk={
  canHandle(){return true;},
  canStream(){return false;},
  async submit(query){calls.push(query);return {answer:{headline:'Real answer for: '+query}};},
  async submitStream(query){calls.push(query);return {answer:{headline:'Real answer for: '+query}};},
  render(payload){return `<div class="ask-live-answer"><h2>${payload.answer.headline}</h2></div>`;},
  renderStream(){return '<div class="ask-live-loading">streaming</div>';},
  portableText(){return '';},
};

const context={
  window:{STATE_ASK:stubAsk, addEventListener(){}, innerWidth:1200},
  document,
  navigator:{clipboard:{writeText(){}}},
  location:{protocol:'file:',search:''},
  requestAnimationFrame(fn){fn();},
  HTMLElement:function(){},
  MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{};},
  console,setTimeout,clearInterval(){},setInterval(){return 0;},
  URLSearchParams,history:{replaceState(){}},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-product-polish.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;
const starters=context.window.STATE_ASK_STARTERS;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name);}else{fail++;console.error('✗',name,detail);}}

(async()=>{
  check('starters are exposed for testing', Array.isArray(starters)&&starters.length===5, JSON.stringify(starters));

  const misclassified=[
    {label:'What should I know?', expectKind:'pending'},
    {label:'Prep me for my next meeting', expectKind:'pending'},
    {label:'What are we still unsure about?', expectKind:'open'},
  ];

  for(const {label,expectKind} of misclassified){
    const starter=starters.find(s=>s.label===label);
    check(`starter "${label}" is present`, !!starter);
    if(!starter)continue;

    // Confirms the classifier really would misfire on this starter's long
    // instruction text -- this is *why* the starter needs skipRouting.
    const intent=api.detectAskIntent(starter.prompt);
    check(`"${label}"'s prompt text is misclassified as "${expectKind}" by the generic-inventory classifier`, intent?.kind===expectKind, JSON.stringify(intent));

    calls.length=0;
    fire('click',starterButton(starter.prompt));
    await flush();await flush();await flush();

    check(`clicking "${label}" reaches the real backend (ASK.submit/submitStream called)`, calls.includes(starter.prompt), JSON.stringify(calls));
    const resultHtml=elementsById['askStateDrawerResult']?.innerHTML||'';
    check(`clicking "${label}" does not render the static routing card`, !resultHtml.includes('ask-routing-card'), resultHtml.slice(0,160));
    check(`clicking "${label}" renders the real synthesized answer`, resultHtml.includes('Real answer for: '+starter.prompt), resultHtml.slice(0,160));
  }

  // Control: a user-typed question with the same generic-inventory phrasing
  // must still route to the static card, unaffected by the starter fix.
  calls.length=0;
  fire('submit',askForm('What needs review?'));
  await flush();await flush();await flush();
  check('a typed generic question still routes to the static card', (elementsById['askStateDrawerResult']?.innerHTML||'').includes('ask-routing-card'));
  check('a typed generic question never reaches the real backend', calls.length===0, JSON.stringify(calls));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})().catch(err=>{console.error(err);process.exit(1);});
