// Nov 5 cleanup: index.html used to run a whole-page MutationObserver that renamed "Send as Evidence" to
// "Submit for review" and removed Edit from submitted notes. The renderer already does both, so the observer was
// deleted. These checks pin that behavior in context-notes-view.js itself.
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'context-notes-view.js'),'utf8'),{window,console});
const {simpleNote,draftNoteRow}=window.STATE_NOTES_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}

const note=(status,extra={})=>({id:'n_'+status,title:'Pilot note',source:'Project note',text:'Launch moved to October 15.',date:'Nov 5',status,...extra});
const expanded=n=>simpleNote(n,new Set([n.id]),null);

const draft=expanded(note('draft'));
check('a draft offers Submit for review',draft.includes('data-action="send-note-review"')&&draft.includes('>Submit for review<'));
check('a draft can be edited',draft.includes('data-action="edit-note"'));
check('no row says "Send as Evidence"',!draft.includes('Send as Evidence')&&!draftNoteRow(note('draft')).includes('Send as Evidence'));
check('the unsaved draft row offers Submit for review',draftNoteRow(note('draft')).includes('>Submit for review<'));

for(const status of ['pending','accepted','reviewed','no_review_needed','unknown']){
  const html=expanded(note(status));
  check(`a ${status} note has no Edit`,!html.includes('data-action="edit-note"'),html);
  check(`a ${status} note cannot be submitted again`,!html.includes('data-action="send-note-review"'),html);
}
check('a backend-managed draft has no Edit',!expanded(note('draft',{backendManaged:true})).includes('data-action="edit-note"'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
