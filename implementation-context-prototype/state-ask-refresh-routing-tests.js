// Regression coverage for a follow-on to the 2026-09-12 starter-routing bug
// (see state-ask-starter-routing-tests.js): that fix let the starter click
// handler pass {skipRouting:true} so a starter's long instruction text (e.g.
// "...keep accepted Current State, pending Reviews, and unresolved Questions
// clearly separate.") isn't misread by the generic-inventory classifier as a
// bare "What needs review?" But the "Refresh answer" control shown when the
// project record has changed since an answer was generated
// (data-review-batch-action="refresh-ask") called runAsk(ui.query) with no
// options, defaulting back to skipRouting:false -- so refreshing a starter's
// answer silently swapped the real synthesized answer for the static Open
// Items routing card, even though the original ask got a real one. The fix:
// runAsk persists the skipRouting it was called with onto ui.skipRouting, and
// the refresh-ask handler passes that back in on refresh.
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

function starterButton(prompt){
  const el={dataset:{reviewBatchPrompt:prompt}};
  el.closest=sel=>sel==='[data-review-batch-prompt]'?el:null;
  return el;
}
// Stands in for the "Refresh answer ->" button rendered when ui.stale is
// true: data-review-batch-action="refresh-ask", nothing else.
function refreshButton(){
  const el={dataset:{reviewBatchAction:'refresh-ask'}};
  el.closest=sel=>sel==='[data-review-batch-action]'?el:null;
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
const starters=context.window.STATE_ASK_STARTERS;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name);}else{fail++;console.error('✗',name,detail);}}

(async()=>{
  const starter=starters.find(s=>s.label==='What should I know?');
  check('starter "What should I know?" is present', !!starter);
  if(!starter){console.log(`\n${pass} passed, ${fail} failed`);if(fail)process.exit(1);return;}

  calls.length=0;
  fire('click',starterButton(starter.prompt));
  await flush();await flush();await flush();
  check('clicking the starter reaches the real backend', calls.includes(starter.prompt), JSON.stringify(calls));
  check('clicking the starter renders the real synthesized answer',
    (elementsById['askStateDrawerResult']?.innerHTML||'').includes('Real answer for: '+starter.prompt));

  // Simulate the project record changing, which is what makes the
  // "Refresh answer ->" control (data-review-batch-action="refresh-ask")
  // appear in the real UI.
  calls.length=0;
  fire('click',refreshButton());
  await flush();await flush();await flush();
  check('refreshing that same answer reaches the real backend again (not the static card)',
    calls.includes(starter.prompt), JSON.stringify(calls));
  const resultHtml=elementsById['askStateDrawerResult']?.innerHTML||'';
  check('refreshing does not silently swap in the static routing card',
    !resultHtml.includes('ask-routing-card'), resultHtml.slice(0,160));
  check('refreshing renders the real synthesized answer',
    resultHtml.includes('Real answer for: '+starter.prompt), resultHtml.slice(0,160));

  // A second, more common way to hit the same gap: after clicking the
  // starter chip, the drawer's input holds that starter's full text.
  // Pressing Enter or tapping "Ask" again resubmits it through the plain
  // form-submit handler, not the chip's own skipRouting:true click handler.
  calls.length=0;
  fire('submit',askForm(starter.prompt));
  await flush();await flush();await flush();
  check('resubmitting the untouched starter text via the form still reaches the real backend',
    calls.includes(starter.prompt), JSON.stringify(calls));
  const resubmitHtml=elementsById['askStateDrawerResult']?.innerHTML||'';
  check('resubmitting the untouched starter text does not swap in the static routing card',
    !resubmitHtml.includes('ask-routing-card'), resubmitHtml.slice(0,160));

  // But editing that text first must still go through the classifier like
  // any other typed question -- trust is for exact resubmission only.
  const edited=starter.prompt+' Keep it very short.';
  calls.length=0;
  fire('submit',askForm(edited));
  await flush();await flush();await flush();
  check('editing the starter text before resubmitting loses the trust and hits the classifier',
    (elementsById['askStateDrawerResult']?.innerHTML||'').includes('ask-routing-card'), JSON.stringify(calls));
  check('an edited starter question never reaches the real backend once misclassified',
    calls.length===0, JSON.stringify(calls));

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})().catch(err=>{console.error(err);process.exit(1);});
