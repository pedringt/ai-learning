// Nov 3 (Paige): a straightforward Review (like Northstar's $40,000 pilot budget) shows the proposed
// change, one source excerpt with its type/date, and a quiet "Read full note" link, with no Why /
// source block or Establishes line that only repeats them. Reviews with conflicting or multiple
// sources, a linked Question, a related open Review, an at-risk or Question type, a retirement, or a
// rationale that adds something keep their reasoning. "Read full note" opens the same Evidence record
// (by id) in Notes and writes nothing. Missing-source Reviews keep their existing layout and block.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};
const fetchCalls=[];
const context={window:{scrollTo(){}},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){},pushState(){}},CSS:{escape:s=>String(s)},fetch:(...a)=>{fetchCalls.push(a);return Promise.reject(new Error('no network in tests'))}};
context.window.fetch=context.fetch;
vm.createContext(context);
for(const file of ['context-data.js','context-notes-view.js','context-open-items-view.js','context-project-view.js','context-backend-sync.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
context.window.STATE_API=null;
for(const file of ['context-app-dialogs.js','context-app-navigation.js','context-app-hydration.js','context-app-review-actions.js','context-app.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;
const openItems=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const figure=html=>(html.match(/<figure class="review-source-excerpt[\s\S]*?<\/figure>/)||[''])[0];
const hasReasoning=html=>html.includes('<details class="reasoning">');
const links=html=>[...html.matchAll(/<button[^>]*data-action="open-review-source"[^>]*>/g)].map(m=>m[0]);
const btn=(h,action)=>(h.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))||[''])[0];

// Northstar's seeded budget Review (seed_demo.py demo-review-create-budget), as the API returns it.
const Q3='Q3 planning session: the pilot budget is approved at $40,000 for discovery and first implementation. Separately, the team agreed the evaluation criteria and sample definition need to be revised together before the next test round.';
const budget={
  id:'demo-review-create-budget', review_type:'missing_understanding',
  decision_question:'Is the approved pilot budget ready to be recorded?',
  why_consequential:'The Q3 planning note reports an approved budget figure that Current State does not record yet.',
  proposals:[{id:'p-budget',state_item_id:null,operation:'create',status:'pending',
    proposed_statement:'The pilot budget is approved at $40,000, covering discovery and the first implementation phase.',
    rationale:'The Q3 planning session recorded the pilot budget as approved at $40,000 for discovery and the first implementation phase.'}],
  affected_state_items:[], evidence_id:'demo-review-q3-planning-evidence', evidence_content:Q3, evidence_source_type:'demo_seed',
  evidence_items:[{id:'demo-review-q3-planning-evidence',content:Q3,source_type:'demo_seed',source_name:null,submitted_at:'2026-08-31 13:30:00'}],
  resolves_question_ids:[], related_open_reviews:[],
};
const simple=api.mapApiReview(budget,'');
const html=openItems.reviewCard(simple,true,true);

// 1. Straightforward Review: proposal + one excerpt + link, nothing that repeats them.
check('the $40,000 budget Review counts as straightforward',openItems.isStraightforwardReview(simple));
check('it shows the proposed change',html.includes('Proposed change')&&html.includes('The pilot budget is approved at $40,000, covering discovery and the first implementation phase.'),html);
check('it shows exactly one source excerpt',(html.match(/<figure class="review-source-excerpt/g)||[]).length===1&&figure(html).includes('$40,000 for discovery and first implementation'),html);
check('the excerpt names its source type and date',/<figcaption>Source · [^<]+ · [A-Z][a-z]{2} \d{1,2}/.test(figure(html)),figure(html));
check('it has a "Read full note" link',links(html).length===1&&figure(html).includes('>Read full note</button>'),figure(html));
check('it has no Why / source block',!hasReasoning(html)&&!html.includes('Why / source'),html);
check('it has no Establishes paragraph',!html.includes('Establishes'),html);
check('the AI rationale is not shown anywhere',!html.includes('recorded the pilot budget as approved'),html);
check('the decision buttons are unchanged',
  html.includes('data-action="review-update" data-review="demo-review-create-budget">Update Current State<')&&html.includes('data-action="open-adjust-review" data-review="demo-review-create-budget">Adjust<')&&html.includes('data-action="review-keep" data-review="demo-review-create-budget" title="Do not apply this evidence to Current State.">Leave unchanged<'),html);
check('the link is a real button (keyboard reachable, not a disabled control)',/^<button type="button" class="text-button review-source-link"/.test(links(html)[0]||'')&&!/disabled|tabindex="-1"/.test(links(html)[0]||''),links(html)[0]);
const longSimple=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[{...budget.evidence_items[0],content:`${Q3} ${'The meeting then moved through staffing and the rollout calendar in detail. '.repeat(4)}`}]},''),true,false);
check('a shortened excerpt on a simple Review keeps its ellipsis but does not point to a missing Why / source',
  figure(longSimple).includes('&hellip;&rdquo;')&&!longSimple.includes('Why / source')&&links(longSimple).length===1,figure(longSimple));

// 2. Reviews that keep their reasoning.
const keeps=(name,review)=>{
  const h=openItems.reviewCard(review,true,false);
  check(`${name} keeps Why / source and Establishes`,!openItems.isStraightforwardReview(review)&&hasReasoning(h)&&h.includes('<strong>Establishes:</strong>'),h);
};
keeps('a Review with two (possibly conflicting) sources',api.mapApiReview({...budget,evidence_items:[
  {id:'e-new',content:'Finance: the pilot budget is $40,000.',source_type:'slack',submitted_at:'2026-09-02'},
  {id:'e-old',content:'Kickoff: the pilot budget is $25,000.',source_type:'manual_note',submitted_at:'2026-08-20'}]},''));
keeps('an at-risk Review (uncertain authority)',api.mapApiReview({...budget,id:'r-risk',review_type:'state_at_risk',proposals:[],
  decision_question:'Are the vendor\'s stated retention terms authoritative enough for pilot planning?',
  why_consequential:'The vendor described proposed terms, but Security and Legal have not confirmed the agreement.'},''));
keeps('a Review that would answer a linked Question',api.mapApiReview({...budget,resolves_question_ids:['q-thresholds']},''));
keeps('a Review with a related open Review',api.mapApiReview({...budget,related_open_reviews:[{id:'r-2',review_type:'proposed_update',decision_question:'Is the budget $25,000?'}]},''));
keeps('a retirement',api.mapApiReview({...budget,proposals:[{...budget.proposals[0],operation:'retire',state_item_id:'k-x'}],affected_state_items:[{id:'k-x',statement:'Budget is pending.'}]},''));
keeps('a grouped Review with two proposals',api.mapApiReview({...budget,proposals:[budget.proposals[0],{...budget.proposals[0],id:'p-2'}]},''));
keeps('a Review whose rationale adds reasoning beyond the proposal and source',api.mapApiReview({...budget,
  proposals:[{...budget.proposals[0],rationale:'Finance owns this figure and Legal signed off, so it supersedes the draft estimate from kickoff.'}]},''));
keeps('a Review with a meaningful "Still unresolved"',{...simple,unresolved:'Whether Finance has signed off on the figure.'});
const withDoesNot={...simple,doesNot:'Whether the budget covers the second phase.'};
check('a Review that records what it does not establish keeps it',hasReasoning(openItems.reviewCard(withDoesNot,true,false))&&openItems.reviewCard(withDoesNot,true,false).includes('Does not establish'));
const reasoned=openItems.reviewCard(api.mapApiReview({...budget,resolves_question_ids:['q-thresholds']},''),true,false);
check('a reasoned Review still offers "Read full note" beside its excerpt',links(reasoned).length===1);

// 3. The link targets the quoted Evidence record.
check('the link carries the quoted Evidence id and the Review id',
  links(html)[0].includes('data-evidence-id="demo-review-q3-planning-evidence"')&&links(html)[0].includes('data-review-id="demo-review-create-budget"'),links(html)[0]);
const multi=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[
  {id:'e-new',content:'Newest source text.',source_type:'manual_note',submitted_at:'2026-09-03'},
  {id:'e-old',content:'Older source text.',source_type:'slack',submitted_at:'2026-09-01'}]},''),true,false);
check('with several sources the link opens the one that is quoted (newest)',links(multi).length===1&&links(multi)[0].includes('data-evidence-id="e-new"')&&figure(multi).includes('Newest source text.'),links(multi)[0]);

// openReviewSource: opens Notes with that Evidence's note expanded; no writes.
const s=api.state;
const note=(id,ev,text,extra={})=>({id,title:'Project update',text,source:'Project update',date:'Aug 31',dateISO:'2026-08-31T13:30:00',status:'pending',reviewIds:[],evidenceId:ev,backendManaged:true,...extra});
s.data.notes=[note('api-note-other','e-other','Another note entirely.'),note('api-note-demo-review-q3-planning-evidence','demo-review-q3-planning-evidence',Q3)];
s.data.reviews=[simple];
s.backendStatus.evidence='loaded';s.backendStatus.drafts='loaded';
s.notesSearch='retention'; s.notesFilter='all'; s.notesDateFilter='all';
s.expandedNotes.clear(); s.view='open-items';
api.openReviewSource('demo-review-q3-planning-evidence','demo-review-create-budget');
check('Read full note opens the Notes view',s.view==='notes',s.view);
check('it expands exactly the note for that Evidence id',s.expandedNotes.has('api-note-demo-review-q3-planning-evidence')&&!s.expandedNotes.has('api-note-other')&&s.expandedNotes.size===1,[...s.expandedNotes].join(','));
check('a search that would hide the note is cleared so the note is visible',s.notesSearch==='',s.notesSearch);
check('the rendered Notes page shows that note\'s complete text',stub.innerHTML.includes('class="note-full-text">'+Q3.replace('$','$'))||stub.innerHTML.includes(Q3),stub.innerHTML.slice(0,300));
s.notesFilter='pending'; s.view='open-items';
api.openReviewSource('demo-review-q3-planning-evidence','demo-review-create-budget');
check('a filter that already shows the note is left alone',s.notesFilter==='pending',s.notesFilter);
// Evidence list unavailable: the Review's own stored text is shown instead, still read-only.
s.data.notes=[]; s.view='open-items';
api.openReviewSource('demo-review-q3-planning-evidence','demo-review-create-budget');
check('without a Notes row, the full stored source text opens in a dialog',stub.innerHTML.includes('review-source-dialog-text')&&stub.innerHTML.includes(Q3)&&s.view==='open-items',stub.innerHTML.slice(0,300));
check('Read full note makes no network request',fetchCalls.length===0,JSON.stringify(fetchCalls));
const src=fs.readFileSync(path.join(dir,'context-app.js'),'utf8');
const fn=src.slice(src.indexOf('function openReviewSource'),src.indexOf('\n  }\n',src.indexOf('function openReviewSource')));
check('openReviewSource calls no API or write helper',!/API\.|fetch\(|decideReview|executeReviewDecision|hydrateBackend|sync/.test(fn),fn);

// 4. Missing source Evidence: unchanged layout and protection.
const missing=openItems.reviewCard(api.mapApiReview({...budget,evidence_content:null,evidence_items:[]},'Text the browser happened to hold'),true,false);
check('a missing-source Review is not treated as straightforward',!openItems.isStraightforwardReview(api.mapApiReview({...budget,evidence_items:[]},'')));
check('a missing-source Review still says no source is recorded',figure(missing).includes('No source evidence is recorded for this Review.')&&!figure(missing).includes('<blockquote>'),figure(missing));
check('a missing-source Review offers no "Read full note"',links(missing).length===0,missing);
check('a missing-source Review keeps Why / source and Establishes',hasReasoning(missing)&&missing.includes('<strong>Evidence:</strong> No source evidence is recorded')&&missing.includes('<strong>Establishes:</strong>'),missing);
check('Update Current State and Adjust stay disabled with the reason; Leave unchanged stays enabled',
  / disabled aria-describedby="review-blocked-demo-review-create-budget"/.test(btn(missing,'review-update'))&&/ disabled/.test(btn(missing,'open-adjust-review'))&&!/ disabled/.test(btn(missing,'review-keep'))&&missing.includes('can&rsquo;t change Current State'),missing);
const legacy=openItems.reviewCard({...simple,evidenceItems:undefined},true,false);
check('an older caller with no evidence list keeps the old layout (Why / source, no excerpt, no link)',hasReasoning(legacy)&&!legacy.includes('review-source-excerpt')&&links(legacy).length===0,legacy);

// Escaping of the link attributes
const hostile=openItems.reviewCard(api.mapApiReview({...budget,id:'r"x',evidence_items:[{id:'e"><img src=x>',content:'Budget approved at $40,000 for discovery.',source_type:'manual_note',submitted_at:''}]},''),true,false);
check('link attributes are escaped',!hostile.includes('<img'),links(hostile)[0]);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
