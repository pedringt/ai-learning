// #481 (Cowork, Oct 9): "Keep tracking" / "Link existing Question" attached Evidence to a
// Question, but nothing showed it. The Question card and dialog list the linked Evidence, and
// the note says which Question(s) it informs.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){},contains(){return false}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub};
const context={window:{},document,console,setTimeout,location:{protocol:'file:',search:''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
const view=context.window.STATE_OPEN_ITEMS_VIEW, notes=context.window.STATE_NOTES_VIEW;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const question={id:'q-1',text:'What retention and deletion terms apply to pilot prompts and outputs?',status:'open',blocking:true,blocks:'Pilot launch',
  linkedEvidence:[{evidenceId:'e-1',excerpt:'Legal sync: the MSA draft says 90 days; the vendor email said 30.',date:'Oct 9',how:'linked'}]};
const page=view.render({reviewsStatus:'loaded',questionsStatus:'loaded',draftsStatus:'loaded',reviews:[],questions:[question],draftNotes:[],notes:[],
  openQuestionsExpanded:true,expandedReviewId:null,openItemSections:{reviews:null,blockers:null,questions:null,drafts:null},renderDraftNote:()=>''});
check('the Question card lists its linked evidence', page.includes('Linked evidence') && page.includes('the MSA draft says 90 days'), page.slice(0,200));
check('with its date', page.includes('Oct 9'));
const dialog=view.questionDialogHtml(question,null);
check('the Question dialog lists it too', dialog.includes('Linked evidence') && dialog.includes('the MSA draft says 90 days'));
const plain=view.questionDialogHtml({...question,linkedEvidence:[]},null);
check('no section when nothing is linked', !plain.includes('Linked evidence'));

const note={id:'api-note-e-1',evidenceId:'e-1',title:'Project update',text:'Legal sync notes',source:'Project update',date:'Oct 9',status:'reviewed',backendManaged:true,
  linkedQuestions:[{id:'q-1',text:question.text},{id:'q-2',text:'Who owns the launch threshold?'}]};
const row=notes.simpleNote(note,new Set(),null);
check('a note names every Question it informs', (row.match(/note-linked-question/g)||[]).length===2 && row.includes('Who owns the launch threshold?'), row);
check('a note without links has no line', !notes.simpleNote({...note,linkedQuestions:undefined},new Set(),null).includes('note-linked-question'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
