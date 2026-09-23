// Deterministic coverage for state.md #108: the page-level "Something
// changed?" entry point on Current State, and the Add Evidence dialog's
// context-specific helper copy. Same lightweight vm harness as
// state-question-review-handoff-tests.js.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []},focus(){}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};
const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
context.window.STATE_API=null;
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;
const projectView=context.window.STATE_PROJECT_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

// --- Page-level CTA, not per-item -------------------------------------------
const knowledge=[
  {id:'k-stage',state:'current',statement:'Late discovery.'},
  {id:'k-outcome',state:'current',statement:'Reduce repetitive effort.'},
  {id:'k-pilot',state:'current',statement:'Tier 1 troubleshooting.'},
  {id:'k-a',state:'current',projectArea:'product',statement:'Fact A.',title:'Fact A'},
  {id:'k-b',state:'current',projectArea:'product',statement:'Fact B.',title:'Fact B'},
  {id:'k-c',state:'current',projectArea:'safety',statement:'Fact C.',title:'Fact C'},
];
const html=projectView.render({
  backendState:'loaded', projectName:'Northstar', knowledge, history:[],
  pendingFor:()=>[],
});
const ctaMatches=(html.match(/data-action="something-changed"/g)||[]).length;
check('Current State page has exactly one "Something changed?" CTA, not one per item',
  ctaMatches===1, `found ${ctaMatches}`);
check('CTA uses the agreed short label',
  html.includes('<strong>Something changed?</strong>'));
check('CTA explains the consequence without implying direct editing',
  html.includes('Add new information and State will review whether Current State should change.'));
check('CTA button says Add Evidence, reusing the existing flow\'s own label',
  /data-action="something-changed">Add Evidence<\/button>/.test(html));
check('CTA sits below the page header and metadata, before the Current State document',
  html.indexOf('</header>') < html.indexOf('class="project-document-meta"') &&
  html.indexOf('class="project-document-meta"') < html.indexOf('data-action="something-changed"') &&
  html.indexOf('data-action="something-changed"') < html.indexOf('class="project-outline"'));

// --- Add Evidence dialog: same flow, only the description line changes -----
const defaultDialog=api.addDialogHtml();
check('default Add Evidence dialog keeps its original description',
  defaultDialog.includes('Add project information State should evaluate.'));
check('default Add Evidence dialog has no prefill text',
  /<textarea[^>]*>\s*<\/textarea>/.test(defaultDialog));

const somethingChangedDialog=api.addDialogHtml('',{description:'What changed or what is incorrect? Add what you learned — State will compare it with Current State.'});
check('"Something changed?" entry uses the suggested helper copy',
  somethingChangedDialog.includes('What changed or what is incorrect?'));
check('"Something changed?" entry still has no prefill -- not a pre-populated correction',
  /<textarea[^>]*>\s*<\/textarea>/.test(somethingChangedDialog));
check('"Something changed?" entry submits through the exact same Add Evidence action/endpoint',
  somethingChangedDialog.includes('data-action="save-info"') && somethingChangedDialog.includes('<h2 id="dialogTitle">Add Evidence</h2>'));
check('"Something changed?" entry is not a different dialog title or a special correction form',
  !/correction|edit current state/i.test(somethingChangedDialog));

console.log(`\n${pass} passed, ${fail} failed`); if(fail)process.exit(1);
