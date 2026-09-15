// Explicit Current State promotion regression coverage (2026-09-15).
//
// A person may notice that processed Evidence contains something State missed
// even when that Evidence already produced other Reviews or even one accepted
// Current State change. The escape hatch therefore belongs to processed
// Evidence generally, not only the no_review_needed status. Pending Evidence
// is intentionally excluded so we do not invite a duplicate proposal while
// the initial Review is still unresolved.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
const view=context.window.STATE_NOTES_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

function markup(status,extra={}){
  const note={
    id:'api-note-ev-1',
    title:'Manual note',
    text:'Settled decision plus an unresolved follow-up question.',
    source:'Manual note',
    date:'Sep 15',
    dateISO:'2026-09-15T12:00:00Z',
    status,
    evidenceId:'ev-1',
    backendManaged:true,
    reviewIds:[],
    resolvedReviewIds:[],
    historyIds:[],
    ...extra,
  };
  return view.simpleNote(note,new Set([note.id]),null);
}

check('no-review Evidence can be explicitly proposed for Current State', markup('no_review_needed').includes('Propose for Current State'));
check('Evidence that produced resolved Reviews but no State change can still be promoted', markup('reviewed',{resolvedReviewIds:['r-question']}).includes('Propose for Current State'));
check('Evidence that already changed one Current State item can still be promoted for a missed fact', markup('accepted',{resolvedReviewIds:['r-1'],historyIds:['h-1']}).includes('Propose for Current State'));

const pending=markup('pending',{reviewIds:['r-open']});
check('pending Evidence does not offer a second promotion while its initial Review is unresolved', !pending.includes('Propose for Current State'));
check('pending Evidence still links to its open Review', pending.includes('Review proposed update'));

const failed=markup('failed');
check('failed analysis shows retry rather than promotion', failed.includes('Retry analysis')&&!failed.includes('Propose for Current State'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0) process.exit(1);
