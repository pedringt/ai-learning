// Nov 3 (Paige, revised): Why / source is left out only when existing structured fields show it
// would repeat the card -- exactly one recorded source, no related open Review / unresolved / does-not
// text, and an Establishes text that is empty or identical (whitespace-normalized) to the source or
// the proposal. No word-overlap guessing: a rationale that merely paraphrases keeps the block. A
// linked Question doesn't by itself keep it. A pure addition drops the empty "Current understanding"
// box and is labelled "Proposed addition to Current State". "Read full note" appears only on a
// shortened excerpt, opens that same Evidence in Notes and writes nothing. Missing-source Reviews keep
// their layout and block.
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

// Northstar's seeded Reviews (seed_demo.py), as the API returns them.
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
const LAUNCH='Security asked for explicit launch-blocking thresholds for agreed high-risk failure categories.';
const launch={
  id:'demo-review-launch', review_type:'proposed_update',
  decision_question:'Should launch readiness explicitly require a severe-failure threshold?',
  why_consequential:'The evaluation plan needs a deterministic launch gate rather than only aggregate quality metrics -- and directly answers the open threshold question.',
  proposals:[{id:'p-launch',state_item_id:'k-launch',operation:'update',status:'pending',
    proposed_statement:'Pilot launch requires an agreed threshold for severe unsupported-claim failures as well as acceptable escalation behavior.',
    rationale:LAUNCH}],
  affected_state_items:[{id:'k-launch',topic:'Launch',statement:'Pilot launch requires acceptable escalation behavior.'}],
  evidence_id:'demo-review-launch-evidence', evidence_content:LAUNCH,
  evidence_items:[{id:'demo-review-launch-evidence',content:LAUNCH,source_type:'demo_seed',source_name:null,submitted_at:'2026-08-28 09:30:00'}],
  resolves_question_ids:['q-thresholds'], related_open_reviews:[],
};
const budgetR=api.mapApiReview(budget,''), launchR=api.mapApiReview(launch,'');
const budgetHtml=openItems.reviewCard(budgetR,true,true), launchHtml=openItems.reviewCard(launchR,true,true);

// 1. Structured rule, no word overlap.
check('the budget Review keeps Why / source: its rationale paraphrases the source but is not identical',
  !openItems.isStraightforwardReview(budgetR)&&hasReasoning(budgetHtml)&&budgetHtml.includes('<strong>Establishes:</strong> The Q3 planning session recorded'),budgetHtml);
check('the launch Review drops Why / source: its rationale is the source text verbatim',
  openItems.isStraightforwardReview(launchR)&&!hasReasoning(launchHtml)&&!launchHtml.includes('Establishes'),launchHtml);
check('whitespace differences alone still count as identical',
  openItems.isStraightforwardReview({...launchR,establishes:`  ${LAUNCH.replace(/ /g,'\n ')} `}));
check('an Establishes identical to the proposed statement counts as repetition',
  openItems.isStraightforwardReview({...budgetR,establishes:budget.proposals[0].proposed_statement}));
check('an empty Establishes counts as adding nothing',openItems.isStraightforwardReview({...budgetR,establishes:''}));
check('a near-copy (one word changed) keeps the reasoning -- no overlap guessing',
  !openItems.isStraightforwardReview({...launchR,establishes:LAUNCH.replace('agreed','proposed')}));
check('the rule source has no word-overlap scoring',!/contentWords|STOP_WORDS|addsNothingBeyond|0\.8/.test(fs.readFileSync(path.join(dir,'context-open-items-view.js'),'utf8')));

// 2. Linked Question: same structured test; the Question link itself is untouched.
check('a linked Question does not by itself keep a Why / source that only repeats the source',(launchR.resolvesQuestionIds||[]).includes('q-thresholds')&&!hasReasoning(launchHtml));
const launchExplained=api.mapApiReview({...launch,proposals:[{...launch.proposals[0],rationale:'Security asked for thresholds; this answers the open threshold question but not who signs off.'}]},'');
check('a linked-Question Review whose reasoning explains the answer keeps it',hasReasoning(openItems.reviewCard(launchExplained,true,false))&&openItems.reviewCard(launchExplained,true,false).includes('not who signs off'));
check('the linked Question mapping is unchanged',launchR.resolvesQuestionId==='q-thresholds');
check('decision buttons on the simplified card are unchanged',
  launchHtml.includes('data-action="review-update" data-review="demo-review-launch">Update Current State<')&&launchHtml.includes('data-action="open-adjust-review" data-review="demo-review-launch">Adjust<')&&launchHtml.includes('data-action="review-keep" data-review="demo-review-launch" title="Do not apply this evidence to Current State.">Leave unchanged<'));

// 3. Other Reviews keep their reasoning even with a verbatim rationale.
const verbatim=r=>({...r,establishes:LAUNCH});
const keeps=(name,review)=>{const h=openItems.reviewCard(review,true,false);check(`${name} keeps Why / source`,!openItems.isStraightforwardReview(review)&&hasReasoning(h),h);};
keeps('two sources',verbatim(api.mapApiReview({...launch,evidence_items:[launch.evidence_items[0],{id:'e-old',content:'Older note.',source_type:'slack',submitted_at:'2026-08-01'}]},'')));
keeps('an at-risk Review',api.mapApiReview({...launch,review_type:'state_at_risk',proposals:[]},''));
keeps('a related open Review',verbatim(api.mapApiReview({...launch,related_open_reviews:[{id:'r2',review_type:'proposed_update',decision_question:'Other?'}]},'')));
keeps('a meaningful "Still unresolved"',{...launchR,unresolved:'Who signs off on the threshold.'});
keeps('a "Does not establish" line',{...launchR,doesNot:'Which categories count as severe.'});

// 4. Pure additions.
check('a pure addition drops the empty Current understanding box',!budgetHtml.includes('Current understanding')&&!budgetHtml.includes('No matching Current State item exists yet.'),budgetHtml);
check('a pure addition is labelled "Proposed addition to Current State"',budgetHtml.includes('<span>Proposed addition to Current State</span><p>The pilot budget is approved at $40,000'),budgetHtml);
check('an update keeps Current understanding and "Proposed change"',launchHtml.includes('<span>Current understanding</span><p>Pilot launch requires acceptable escalation behavior.</p>')&&launchHtml.includes('<span>Proposed change</span>'),launchHtml);
const createWithItem=openItems.reviewCard(api.mapApiReview({...budget,affected_state_items:[{id:'k-b',statement:'Budget is pending.'}]},''),true,false);
check('a create that touches an existing item keeps Current understanding',createWithItem.includes('Current understanding')&&createWithItem.includes('Proposed change'),createWithItem);

// 5. "Read full note" only on shortened excerpts.
check('the budget excerpt is shortened and offers "Read full note"',figure(budgetHtml).includes('&hellip;&rdquo;')&&links(budgetHtml).length===1,figure(budgetHtml));
check('the launch excerpt is complete and has no link',!figure(launchHtml).includes('&hellip;')&&links(launchHtml).length===0,figure(launchHtml));
check('the link is a real button with a text span for the focus ring',/^<button type="button" class="text-button review-source-link"/.test(links(budgetHtml)[0]||'')&&budgetHtml.includes('<span class="review-source-link-text">Read full note</span>'));
const css=fs.readFileSync(path.join(dir,'context-tool.css'),'utf8');
check('the link has a 44px-tall target',/\.review-source-excerpt \.review-source-link\{[^}]*min-height:44px/.test(css));
check('the link keeps a visible keyboard focus ring',/\.review-source-link:focus-visible \.review-source-link-text\{outline:3px solid/.test(css));
check('the link carries the quoted Evidence id and the Review id',
  links(budgetHtml)[0].includes('data-evidence-id="demo-review-q3-planning-evidence"')&&links(budgetHtml)[0].includes('data-review-id="demo-review-create-budget"'));
const LONG='Newest source text. '+'More detail about the decision and who was there. '.repeat(8);
const multi=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[
  {id:'e-new',content:LONG,source_type:'manual_note',submitted_at:'2026-09-03'},
  {id:'e-old',content:'Older source text.',source_type:'slack',submitted_at:'2026-09-01'}]},''),true,false);
check('with several sources the link opens the quoted (newest) one',links(multi).length===1&&links(multi)[0].includes('data-evidence-id="e-new"'),links(multi)[0]);

// openReviewSource: opens Notes with that Evidence's note expanded; no writes.
const s=api.state;
const note=(id,ev,text,extra={})=>({id,title:'Project update',text,source:'Project update',date:'Aug 31',dateISO:'2026-08-31T13:30:00',status:'pending',reviewIds:[],evidenceId:ev,backendManaged:true,...extra});
s.data.notes=[note('api-note-other','e-other','Another note entirely.'),note('api-note-demo-review-q3-planning-evidence','demo-review-q3-planning-evidence',Q3)];
s.data.reviews=[budgetR];
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

// Missing source Evidence: unchanged layout and protection.
const missing=openItems.reviewCard(api.mapApiReview({...budget,evidence_content:null,evidence_items:[]},'Text the browser happened to hold'),true,false);
check('a missing-source Review is never simplified',!openItems.isStraightforwardReview(api.mapApiReview({...launch,evidence_items:[]},'')));
check('a missing-source Review still says no source is recorded',figure(missing).includes('No source evidence is recorded for this Review.')&&!figure(missing).includes('<blockquote>'),figure(missing));
check('a missing-source addition keeps its Current understanding box as before',missing.includes('Current understanding')&&missing.includes('<span>Proposed change</span>'),missing);
check('a missing-source Review offers no "Read full note"',links(missing).length===0,missing);
check('a missing-source Review keeps Why / source and Establishes',hasReasoning(missing)&&missing.includes('<strong>Evidence:</strong> No source evidence is recorded')&&missing.includes('<strong>Establishes:</strong>'),missing);
check('Update Current State and Adjust stay disabled with the reason; Leave unchanged stays enabled',
  / disabled aria-describedby="review-blocked-demo-review-create-budget"/.test(btn(missing,'review-update'))&&/ disabled/.test(btn(missing,'open-adjust-review'))&&!/ disabled/.test(btn(missing,'review-keep'))&&missing.includes('can&rsquo;t change Current State'),missing);
const legacy=openItems.reviewCard({...launchR,evidenceItems:undefined},true,false);
check('an older caller with no evidence list keeps the old layout (Why / source, no excerpt, no link)',hasReasoning(legacy)&&!legacy.includes('review-source-excerpt')&&links(legacy).length===0,legacy);

// Escaping of the link attributes
const hostile=openItems.reviewCard(api.mapApiReview({...budget,id:'r"x',evidence_items:[{id:'e"><img src=x>',content:LONG,source_type:'manual_note',submitted_at:''}]},''),true,false);
check('link attributes are escaped',links(hostile).length===1&&!hostile.includes('<img'),links(hostile)[0]);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
