// #487: an open Question row collapsed whenever Open Items re-rendered (a late load, a retry),
// because the <details> was always rendered closed. The view now renders the rows the user has
// open (context-app.js keeps them in state.openQuestionIds from the details `toggle` event).
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

const questions=[{id:'q-1',text:'Who owns the launch threshold?',status:'open'},{id:'q-2',text:'What retention terms apply?',status:'open',blocking:true,blocks:'Pilot launch'}];
const base={reviewsStatus:'loaded',questionsStatus:'loaded',draftsStatus:'loaded',reviews:[],questions,draftNotes:[],notes:[],
  openQuestionsExpanded:true,expandedReviewId:null,openItemSections:{reviews:null,blockers:null,questions:null,drafts:null},renderDraftNote:()=>''};
const rowTag=(html,id)=>(html.match(new RegExp(`<details[^>]*data-question-id="${id}"[^>]*>`))||[''])[0];

const closed=view.render(base);
check('rows render closed by default', rowTag(closed,'q-1') && !/\bopen>/.test(rowTag(closed,'q-1')) && !/\bopen>/.test(rowTag(closed,'q-2')), rowTag(closed,'q-1'));
const reopened=view.render({...base,openQuestionIds:new Set(['q-2'])});
check('a row the user opened stays open after a re-render', /\sopen>$/.test(rowTag(reopened,'q-2')), rowTag(reopened,'q-2'));
check('only that row', !/\sopen>$/.test(rowTag(reopened,'q-1')), rowTag(reopened,'q-1'));

const app=fs.readFileSync(path.join(dir,'context-app.js'),'utf8');
check('the app records open rows from the toggle event', /addEventListener\('toggle'[\s\S]{0,300}openQuestionIds\.(add|delete)/.test(app));
check('and passes them to the view', app.includes('openQuestionIds:state.openQuestionIds'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
