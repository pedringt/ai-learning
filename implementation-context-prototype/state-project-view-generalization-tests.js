// Deterministic coverage for state.md #113: the Project/Current State page's
// organization (top-level areas, universal Stage/Outcome facts, uncategorized
// fallback) must come entirely from each Current State item's own area_id/
// area_name/area_description/area_sort_order (set server-side, from
// project-defined data -- see review_service.py's list_state()), never from
// area names/keyword vocabulary hardcoded in context-project-view.js. Same
// lightweight vm harness as state-review-decision-ui-tests.js -- exercises
// the pure rendering layer (STATE_PROJECT_VIEW.render/visibleAreas), not
// hydration or the live subnav DOM sync in context-app.js, which is covered
// by test_browser_user_flows.py's Playwright suite.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const context={window:{},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-project-view.js'),'utf8'),context);
const PROJECT_VIEW=context.window.STATE_PROJECT_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const noHistory=[];
const noPending=()=>[];

// --- A contrasting, deliberately non-software fixture (an office move) ----
// Proves the acceptance criterion directly: a materially different project
// (different area names, different domain vocabulary, zero AI/pilot/support
// language) renders coherently through the exact same render() function.
const officeMove=[
  {id:'f-stage',title:'Project stage',statement:'Lease is signed; vendor selection is next.',state:'current'},
  {id:'f-outcome',title:'Project outcome',statement:'Relocate the team with minimal downtime and no lost equipment.',state:'current'},
  {id:'f-lease',title:'Lease date',statement:'The new lease begins November 1.',state:'current',projectArea:'facilities',areaName:'Location & facilities',areaDescription:'Where the office is and what it needs.',areaSortOrder:10,topics:[]},
  {id:'f-capacity',title:'Capacity',statement:'The new space holds 40 desks, up from 28.',state:'current',projectArea:'facilities',areaName:'Location & facilities',areaDescription:'Where the office is and what it needs.',areaSortOrder:10,topics:[]},
  {id:'f-mover',title:'Moving vendor',statement:'Acme Movers is booked for the move weekend.',state:'current',projectArea:'vendors',areaName:'Vendors & logistics',areaDescription:'Who is doing the move.',areaSortOrder:20,topics:[]},
  {id:'f-budget',title:'Budget',statement:'The move budget is capped at $85,000.',state:'current',projectArea:'budget',areaName:'Budget',areaDescription:'What the move costs and what has been approved.',areaSortOrder:30,topics:[]},
];
const officeHtml=PROJECT_VIEW.render({backendState:'loaded',projectName:'Juniper Office Move',knowledge:officeMove,history:noHistory,pendingFor:noPending});
check('a non-software project renders its own area names, not a software-project vocabulary',
  officeHtml.includes('Location &amp; facilities') && officeHtml.includes('Vendors &amp; logistics') && officeHtml.includes('Budget'));
check('a non-software project never mentions AI/pilot/support concepts it was not given',
  !/pilot|assistant|support rep|tier 1|security\b/i.test(officeHtml));
check('the Current State page uses the stable section title instead of repeating the project name',
  officeHtml.includes('<h2>Current State</h2>') && !officeHtml.includes('<h2>Juniper Office Move</h2>'));
check('Current State uses the shared page header with normal page actions',
  officeHtml.includes('class="page-head project-page-head current-state-page-head"') &&
  officeHtml.includes('class="current-state-page-actions"') &&
  officeHtml.includes('>Copy context</button>') && officeHtml.includes('>Project settings</button>'));
check('Stage and Outcome sit below the page header before the evidence callout',
  officeHtml.indexOf('</header><dl class="project-document-meta">')>0 &&
  officeHtml.indexOf('class="project-document-meta"')<officeHtml.indexOf('class="something-changed-cta"'));
check('the evidence callout remains below metadata with a primary Add Evidence action',
  officeHtml.includes('<strong>Something changed?</strong>') &&
  officeHtml.includes('class="btn primary" data-action="something-changed">Add Evidence</button>'));
check('Stage/Outcome come from the topic-labeled universal facts, not a fixed id',
  officeHtml.includes('Lease is signed; vendor selection is next.') && officeHtml.includes('Relocate the team with minimal downtime'));
check('universal Stage/Outcome facts are excluded from area body sections',
  !officeHtml.includes('project-stage') && !officeHtml.includes('project-outcome'));

// --- visibleAreas(): the same list the page body and (via context-app.js's
// syncProjectSubnav) the subnav both derive from ----------------------------
const areas=PROJECT_VIEW.visibleAreas(officeMove);
check('visibleAreas returns exactly the areas that have at least one current fact, in sort order',
  areas.map(a=>a.id).join(',')==='facilities,vendors,budget');
check('an area with zero current facts never appears',
  !areas.some(a=>a.id==='nonexistent'));

const retiredOnly=[{id:'f-old',title:'Old',statement:'x',state:'retired',projectArea:'facilities',areaName:'Location & facilities',areaSortOrder:10}];
check('a retired-only area is invisible (matches the empty-section-hiding behavior)',
  PROJECT_VIEW.visibleAreas(retiredOnly).length===0);

// --- Uncategorized fallback -------------------------------------------------
// #113 acceptance criterion, verbatim: uncategorized facts get a reasonable
// generic fallback rather than silently becoming "product".
const noArea=[{id:'k-loose',title:'Something',statement:'A fact nobody has sorted yet.',state:'current',topics:[]}];
const noAreaHtml=PROJECT_VIEW.render({backendState:'loaded',projectName:'Test',knowledge:noArea,history:noHistory,pendingFor:noPending});
check('an item with no area falls back to General, not "product"',
  noAreaHtml.includes('>General<') && !noAreaHtml.includes('Product'));
check('visibleAreas reports the fallback id as general, never product',
  PROJECT_VIEW.visibleAreas(noArea)[0].id==='general');

// --- No facts at all ---------------------------------------------------
const emptyHtml=PROJECT_VIEW.render({backendState:'loaded',projectName:'Empty',knowledge:[],history:noHistory,pendingFor:noPending});
check('an empty project shows the no-Current-State-yet empty state, not a crash',
  emptyHtml.includes('No Current State yet.'));

// --- Loading/error states are unaffected by the generalization -------------
check('loading state renders its own placeholder',
  PROJECT_VIEW.render({backendState:'loading'}).includes('Loading Current State'));
check('error state never substitutes placeholder facts',
  PROJECT_VIEW.render({backendState:'error'}).includes('not substituting placeholder facts'));

console.log(`\n${pass} passed, ${fail} failed`); if(fail)process.exit(1);
