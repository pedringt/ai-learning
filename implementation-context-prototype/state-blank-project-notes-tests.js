// Blank-project bug report (2026-09-15), item 1: "Notes from one of the
// seeded projects, mostly Northstar, appear in the new project." Root cause
// (found while trying to reproduce this live, not just from the report):
// state.data starts as a clone of window.PROJECT_CONTEXT_DATA -- Northstar's
// static fixture, rendered before any real hydration -- and
// syncApiEvidence()'s "local" carve-out (context-backend-sync.js) used to
// keep any note that was neither backendManaged nor evidenceId'd, meant to
// protect in-progress drafts across a hydration cycle. The 25 static
// fixture notes match that same double-negative, so they were never
// actually cleared: once a real (even genuinely empty) evidence response
// had been applied to ANY project -- including a brand-new blank one -- the
// fixture notes kept getting carried forward into the merged result
// forever, indistinguishable from a real draft.
//
// This exercises BACKEND_SYNC.syncApiEvidence() directly, starting from the
// REAL static fixture (not a hand-rolled stub), the same way it's actually
// seeded in the live app.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
const SYNC=context.window.STATE_BACKEND_SYNC;
const FIXTURE_NOTES=context.window.PROJECT_CONTEXT_DATA.notes;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

check('the static fixture really does start with a batch of Northstar notes (sanity check)', FIXTURE_NOTES.length>0, FIXTURE_NOTES.length);

// A brand-new blank project's first hydration: zero Evidence, zero open/
// resolved Reviews, starting from the same static fixture notes state.data
// begins with.
const afterBlankHydration=SYNC.syncApiEvidence([],[],[],FIXTURE_NOTES);
check('a genuinely blank project shows zero notes after hydration, not the Northstar fixture', afterBlankHydration.length===0, `got ${afterBlankHydration.length}: ${JSON.stringify(afterBlankHydration.slice(0,2).map(n=>n.id))}`);

// A real backend Evidence item for THIS project must still show up (the fix
// must not have turned into "always empty").
const REAL_EVIDENCE=[{id:'ev-1',content:'Real evidence for this project.',source_type:'manual_note',processing_status:'processed',submitted_at:'2026-09-15T00:00:00Z'}];
const withRealEvidence=SYNC.syncApiEvidence(REAL_EVIDENCE,[],[],afterBlankHydration);
check('a real Evidence item for this project still appears', withRealEvidence.some(n=>n.evidenceId==='ev-1'), JSON.stringify(withRealEvidence.map(n=>n.evidenceId)));
check('the fixture notes still do not reappear once a real note exists', !withRealEvidence.some(n=>FIXTURE_NOTES.some(f=>f.id===n.id)));

// An in-progress draft (the ACTUAL thing this carve-out is meant to
// protect) must survive an evidence hydration cycle that doesn't mention it.
const notesWithADraft=[...afterBlankHydration,{id:'draft-1',draftId:'d1',title:'Untitled note',text:'still typing...',backendDraft:true}];
const afterHydrationWithDraft=SYNC.syncApiEvidence([],[],[],notesWithADraft);
check('a real in-progress draft note survives an evidence hydration cycle', afterHydrationWithDraft.some(n=>n.id==='draft-1'), JSON.stringify(afterHydrationWithDraft.map(n=>n.id)));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0) process.exit(1);
