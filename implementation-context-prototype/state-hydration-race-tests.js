// Blank-project bug report (2026-09-15): "Notes from another project
// (Northstar) leak into a brand-new blank project." Root cause traced to a
// hydration race: hydrateBackend() had no way to tell whether it was still
// the LATEST call by the time its async response landed. Rapidly switching
// projects (or creating one right after initial page load) could let an
// earlier, slower response for the OLD project overwrite state.data with
// stale data after a newer call for the NEW project had already started --
// and even reset the active-project pointer back to the old project via
// payload.project (see hydrateBackend() in context-app.js).
//
// This exercises hydrateBackend() directly with two overlapping calls whose
// responses resolve out of order (the OLDER call's response arrives LAST),
// and asserts the stale one is discarded rather than applied.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};

function deferred(){ let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve}; }

// Two "projects" worth of bootstrap payloads. Northstar's response is the
// stale one this test artificially delays.
const NORTHSTAR_BOOTSTRAP={project:{id:'northstar',name:'Northstar'},state:[],evidence:[{id:'ev-northstar',content:'Northstar note',source_type:'manual_note'}],open_reviews:[],resolved_reviews:[],history:[],questions:[],rules:[],drafts:[]};
const BLANK_BOOTSTRAP={project:{id:'project_new',name:'AI Notes'},state:[],evidence:[],open_reviews:[],resolved_reviews:[],history:[],questions:[],rules:[],drafts:[]};

let bootstrapCall=0;
const bootstrapDeferreds=[deferred(),deferred()];
let attentionCall=0;
const attentionDeferreds=[deferred(),deferred()];

const stubApi=new Proxy({
  setActiveProject(id){ stubApi._activeProjectId=id; },
  async getBootstrap(){ const d=bootstrapDeferreds[bootstrapCall++]; return d.promise; },
  async getAttention(){ const d=attentionDeferreds[attentionCall++]; return d.promise; },
  async getProjects(){ return {items:[{id:'northstar',name:'Northstar'},{id:'project_new',name:'AI Notes'}]}; },
}, {
  get(target,prop){ return prop in target ? target[prop] : (()=>new Promise(()=>{})); },
});

const context={window:{STATE_API:stubApi},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-notes-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-backend-sync.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-app.js'),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

(async()=>{
  // Module load already fired one hydrateBackend() call (generation 1),
  // consuming bootstrapDeferreds[0]/attentionDeferreds[0]. Start a SECOND,
  // newer call (generation 2) as if the user just created/switched to a
  // blank project -- this consumes bootstrapDeferreds[1]/attentionDeferreds[1].
  const secondCall=api.hydrateBackend();

  // Resolve the NEWER call's response first (the realistic "the new blank
  // project's fast response wins the race"), then the OLDER call's response
  // last -- this is exactly the out-of-order arrival the bug report
  // describes. If hydrateBackend() had no staleness guard, this stale,
  // late-arriving Northstar payload would overwrite the blank project's
  // state right after it was correctly applied.
  attentionDeferreds[1].resolve({questions:[],open_reviews:[]});
  bootstrapDeferreds[1].resolve(BLANK_BOOTSTRAP);
  await secondCall;

  const hasNorthstarNote=()=>api.state.data.notes.some(n=>n.evidenceId==='ev-northstar');
  check('the newer (blank-project) call applied -- no Northstar evidence present', !hasNorthstarNote());
  check('the newer call set the active project to the blank project', stubApi._activeProjectId==='project_new', stubApi._activeProjectId);

  // Now let the STALE, older (Northstar) response finally arrive.
  attentionDeferreds[0].resolve({questions:[],open_reviews:[]});
  bootstrapDeferreds[0].resolve(NORTHSTAR_BOOTSTRAP);
  // Give any (incorrectly) still-pending .then() handlers a turn to run.
  await new Promise(r=>setTimeout(r,0));

  check('the stale Northstar response did NOT overwrite notes with its evidence', !hasNorthstarNote(), JSON.stringify(api.state.data.notes.map(n=>n.evidenceId)));
  check('the stale Northstar response did NOT reset the active project back', stubApi._activeProjectId==='project_new', stubApi._activeProjectId);

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail>0) process.exit(1);
})();
