// #478: internal record ids in Review copy (Cowork, Oct 9): "effective scope of q-retention",
// "Current State (k-slack) excludes it". The Establishes line was printed raw.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub};
const context={window:{},document,console,setTimeout,location:{protocol:'file:',search:''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
const view=context.window.STATE_OPEN_ITEMS_VIEW;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const a=view.cleanReviewCopy('The note narrows the effective scope of q-retention.');
check('a bare Question id becomes words', a==='The note narrows the effective scope of the linked Question.', a);
const b=view.cleanReviewCopy('Current State (k-slack) excludes it.');
check('a parenthesised id citation is dropped', b==='Current State excludes it.', b);
const d=view.cleanReviewCopy('Check-in with co-op partners.');
check('hyphenated words are not treated as ids', d==='Check-in with co-op partners.', d);

const src=fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8');
check('the Establishes line goes through the cleaner', /esc\(cleanReviewCopy\(r\.establishes\)\)/.test(src));

// The streaming draft (context-ask.js renderStream) scrubs the prompt's record format too.
const askCtx={window:{},document,console,setTimeout,location:{protocol:'file:',search:''},fetch(){}};
vm.createContext(askCtx);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask.js'),'utf8'),askCtx);
const raw='{"answer":{"headline":"Retention","summary":"Review decision_question: retention blocking=true; blocks: launch. Review type: open_question (: q-retention)"';
const html=askCtx.window.STATE_ASK.renderStream(raw,null);
check('draft hides key=value pairs', !/blocking=true/.test(html), html);
check('draft hides field names', !/decision_question/.test(html), html);
check('draft hides record ids', !/q-retention/.test(html), html);
check('draft spells out review types', /open question/.test(html) && !/open_question/.test(html), html);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
