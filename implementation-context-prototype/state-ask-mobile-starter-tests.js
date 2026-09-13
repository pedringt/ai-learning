// Regression coverage for a mobile-only Ask bug (2026-09-13): context-
// feedback-pass.js's mobileAsk() intercepts starter-chip taps on a
// document-level 'pointerup' capturing listener (gated to max-width:760px)
// and reimplemented "fill the input, dispatch input, form.requestSubmit()"
// itself, with e.preventDefault()+e.stopImmediatePropagation(). On a real
// phone that suppresses the follow-up mouse-compatibility 'click' event (the
// entire point of intercepting pointerup in the first place), that
// reimplementation was the ONLY thing that ever ran -- and it reaches
// runAsk() through the plain form-submit handler, not the starter click
// handler in context-product-polish.js that passes {skipRouting:true}. So a
// starter whose own instruction wording trips the generic-inventory
// classifier (see state-ask-starter-routing-tests.js) rendered the static
// Open Items card on a real mobile tap even though clicking the exact same
// chip with a mouse -- or in most browser-automation tools, which still
// fire a compatibility click Playwright-side after pointerup preventDefault
// -- correctly reached the real backend. That environment gap is why this
// bug wasn't caught by a live Playwright check before shipping: verified
// with a MutationObserver over #askStateDrawerResult that the routing card
// really did render first and then get silently overwritten within
// milliseconds by a second, correct request.
//
// The fix: mobileAsk() re-fires a real click on the same starter element
// instead of reimplementing its handling, so there is exactly one code path
// or the mobile tap runs (skipRouting:true) -- no gap for a real phone's
// click-suppression to hide.
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
    click(){clickLog.push(this);},
    remove(){if(this.parentNode){const idx=this.parentNode.children.indexOf(this);if(idx>=0)this.parentNode.children.splice(idx,1);}},
    scrollTop:0,
  };
  return el;
}

const elementsById={};
const clickLog=[];
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
  addEventListener(type,handler,opts){(listeners[type]=listeners[type]||[]).push(handler);},
};

// Stands in for a rendered starter button: dataset.reviewBatchPrompt is
// what mobileAsk() reads, and its own .click() call is what the fix should
// trigger (recorded in clickLog) instead of the old input+submit
// reimplementation.
function starterButton(prompt){
  const el=makeElement('button');
  el.dataset.reviewBatchPrompt=prompt;
  el.closest=sel=>sel==='#askStateDrawer [data-review-batch-prompt]'?el:null;
  return el;
}
function fire(type,target){
  const event={
    target,
    preventDefault(){},
    stopPropagation(){},
    stopImmediatePropagation(){this._stopped=true;},
  };
  for(const handler of (listeners[type]||[])){
    if(event._stopped)break;
    handler(event);
  }
  return event;
}

const context={
  window:{addEventListener(){}, innerWidth:390},
  document,
  matchMedia:query=>({matches:query.includes('max-width:760px')}),
  navigator:{clipboard:{writeText(){}}},
  location:{protocol:'file:',search:''},
  requestAnimationFrame(fn){fn();},
  HTMLElement:function(){},
  MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{};},
  console,setTimeout,clearInterval(){},setInterval(){return 0;},
  URLSearchParams,history:{replaceState(){}},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-feedback-pass.js'),'utf8'),context);

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name);}else{fail++;console.error('✗',name,detail);}}

const prompt='Give me the most consequential project briefing for right now. Prioritize what matters most, then keep accepted Current State, pending Reviews, and unresolved Questions clearly separate.';
const starter=starterButton(prompt);

clickLog.length=0;
fire('pointerup',starter);

check('mobileAsk() re-fires a real click on the tapped starter element',
  clickLog.includes(starter), JSON.stringify(clickLog.length));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
