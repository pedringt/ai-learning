// #482 (QA-11, Cowork Oct 9): "Still unresolved" repeated the card title. Oct 27: "Does not
// establish" was fixed text rather than anything the Evidence said, so API Reviews no longer set it.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){},contains(){return false}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub};
const context={window:{},document,console,setTimeout,location:{protocol:'file:',search:''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
const view=context.window.STATE_OPEN_ITEMS_VIEW;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const base={id:'r-1',status:'pending',reviewType:'missing_understanding',checkOnly:false,summary:'Is the approved pilot budget ready to be recorded?',current:'x',evidence:'y',establishes:'z',doesNot:'Only accepting this changes Current State.',proposals:[{id:'p-1',operation:'create',proposedStatement:'The pilot budget is $40,000.'}],proposed:'The pilot budget is $40,000.',resolvesQuestionIds:[]};
const repeat=view.reviewCard({...base,unresolved:'Is the approved pilot budget ready to be recorded?'},true,false);
check('"Still unresolved" is hidden when it repeats the title', !repeat.includes('Still unresolved'), repeat.slice(0,300));
const distinct=view.reviewCard({...base,unresolved:'Finance has not said whether the $40k covers implementation.'},true,false);
check('"Still unresolved" stays when it says something new', distinct.includes('Still unresolved') && distinct.includes('covers implementation'));

const src=fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8');
check('API Reviews carry no fixed "Does not establish" line', !/doesNot:/.test(src) && !src.includes('Only accepting this changes Current State.'));
const noDoesNot=view.reviewCard({...base,doesNot:undefined},true,false);
check('a Review without doesNot shows no "Does not establish" line', !noDoesNot.includes('Does not establish'), noDoesNot.slice(0,300));
check('a written doesNot still shows', view.reviewCard(base,true,false).includes('Does not establish'));
check('old boilerplate is gone', !src.includes('does not automatically resolve the uncertainty or change Current State'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
