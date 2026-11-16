// #688 (Nov 16): "Relevant prior decisions" attached the same Security-discovery decision ("Does the Security
// discovery note answer what would justify reconsidering human review?") to unrelated answers. It now needs two shared
// whole words in the Review's own question and reason, or one when the question asks about past decisions.
// Harness copied from state-ask-starter-routing-tests.js (loads context-product-polish.js with a stub DOM).
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
  URLSearchParams,history:{replaceState(){}},AbortController,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
context.window.STATE_API=null;
for(const file of ['context-app-dialogs.js','context-app-navigation.js','context-app-hydration.js','context-app-review-actions.js','context-app.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-product-polish.js'),'utf8'),context);
const related=context.window.STATE_ASK_UI.relatedResolvedDecisions;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name);}else{fail++;console.error('✗',name,detail);}}

// Northstar's two resolved Reviews with these resolutions, as the staging API returned them on Nov 16.
const security={id:'demo-review-resolved-review-question',resolution:'confirmed_current',
  decision_question:'Does the Security discovery note answer what would justify reconsidering human review?',
  why_consequential:"Security's own discovery notes describe exactly the evidence category the open Question was waiting on.",
  evidence_items:[{content:'Security discovery follow-up: the categories of evidence that would justify reconsidering the human-review boundary are the same ones already being tracked for launch thresholds -- no new boundary decision is needed yet.'}]};
const escalation={id:'demo-review-resolved-leave-unchanged',resolution:'not_applied',
  decision_question:"Should the escalation path explicitly restate that it preserves the assistant's evidence and attempted steps?",
  why_consequential:'Support asked whether the escalation path needed to spell this out, since it already carries the relevant context forward implicitly.',
  evidence_items:[{content:'Support workflow review asked whether escalations preserve what the assistant relied on and already tried.'}]};
const accepted={id:'r-accepted',resolution:'accepted',decision_question:'Should the escalation path change?',why_consequential:'Escalation path change.'};
const reviews=[security,escalation,accepted];
const ids=q=>related(reviews,q).map(r=>r.id);

// The four answers the QA pass saw it under.
for(const q of ['What does that mean for the launch date?','Who owns the final launch-threshold decision?',
  'Prepare a meeting brief for the security review','Which Current State items need a re-check?'])
  check(`not attached to an unrelated question: ${q}`,ids(q).length===0,JSON.stringify(ids(q)));

check('attached when the question is about it',ids('What would justify reconsidering human review?').includes(security.id),JSON.stringify(ids('What would justify reconsidering human review?')));
check('attached by two shared words',JSON.stringify(ids('Should the escalation path restate the attempted steps?'))===JSON.stringify([escalation.id]));
check('a past-decision question needs one shared word',JSON.stringify(ids('Did we already decide anything about escalation?'))===JSON.stringify([escalation.id]));
check('a past-decision question with no subject lists them',ids('What have we decided against?').length===2);
check('only kept-as-is and not-applied Reviews count',!ids('Should the escalation path change?').includes('r-accepted'));
check('whole words: "need" no longer matches "needed"',ids('Which escalation items need attention?').length===0);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
