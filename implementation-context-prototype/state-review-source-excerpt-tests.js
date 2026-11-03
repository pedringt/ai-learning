// #593: an expanded Review shows a short quote of its stored source Evidence beside the proposed
// change, before Why / source. The quote must come from the Evidence records the backend returned,
// never from the AI rationale; truncation is visible and the full text stays under Why / source;
// a Review with no recorded Evidence says so instead of falling back to other text.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;

const stub={innerHTML:'',hidden:true,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
const document={getElementById(id){return stub},querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:stub,contains(){return true},activeElement:null};
const context={window:{},document,navigator:{clipboard:{writeText(){}}},location:{protocol:'file:',search:''},requestAnimationFrame(fn){fn()},HTMLElement:function(){},console,setTimeout,URLSearchParams,history:{replaceState(){}}};
vm.createContext(context);
for(const file of ['context-data.js','context-notes-view.js','context-open-items-view.js','context-project-view.js','context-backend-sync.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
context.window.STATE_API=null;
for(const file of ['context-app-dialogs.js','context-app-navigation.js','context-app-hydration.js','context-app-review-actions.js','context-app.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
const api=context.window.STATE_ASK_TEST_API;
const openItems=context.window.STATE_OPEN_ITEMS_VIEW;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const figure=html=>(html.match(/<figure class="review-source-excerpt[\s\S]*?<\/figure>/)||[''])[0];
const why=html=>(html.match(/<details class="reasoning">[\s\S]*?<\/details>/)||[''])[0];

const SOURCE='Q3 planning session: the pilot budget is approved at $40,000 for discovery and first implementation.';
const RATIONALE='The Q3 planning session recorded the pilot budget as approved at $40,000 for the first phase.';
const budget={
  id:'r-budget', review_type:'missing_understanding',
  decision_question:'Is the approved pilot budget ready to be recorded?', why_consequential:'Current State does not record it yet.',
  proposals:[{id:'p1',state_item_id:null,operation:'create',status:'pending',proposed_statement:'The pilot budget is approved at $40,000.',rationale:RATIONALE}],
  affected_state_items:[], evidence_content:SOURCE,
  evidence_items:[{id:'e-q3',content:SOURCE,source_type:'manual_note',source_name:null,submitted_at:'2026-08-31'}],
};

// mapApiReview
const mapped=api.mapApiReview(budget,'');
check('mapApiReview carries the stored Evidence records as evidenceItems',
  Array.isArray(mapped.evidenceItems)&&mapped.evidenceItems.length===1&&mapped.evidenceItems[0].content===SOURCE,JSON.stringify(mapped.evidenceItems));
check('each source gets a human-readable label (type and date, no raw source_type)',
  /^Project update · \S/.test(mapped.evidenceItems[0].label)&&!mapped.evidenceItems[0].label.includes('manual_note'),mapped.evidenceItems[0].label);
check('a backend payload without evidence_items leaves evidenceItems undefined (no claim either way)',
  api.mapApiReview({...budget,evidence_items:undefined},'').evidenceItems===undefined);

// The excerpt beside the proposal
const html=openItems.reviewCard(mapped,true,false);
const fig=figure(html);
check('an expanded Review shows a source excerpt',fig.includes('<blockquote>')&&fig.includes('$40,000 for discovery and first implementation'),html);
check('the excerpt sits with the proposed change, before the decision buttons and Why / source',
  html.indexOf('Proposed change')<html.indexOf('review-source-excerpt')&&html.indexOf('review-source-excerpt')<html.indexOf('review-actions')&&html.indexOf('review-source-excerpt')<html.indexOf('Why / source'),html);
check('the excerpt names its source',fig.includes('<figcaption>Source · Project update · '),fig);
check('the excerpt quotes the Evidence, not the AI rationale',!fig.includes('recorded the pilot budget as approved'),fig);
check('the AI rationale stays under Why / source, apart from the quote',why(html).includes(RATIONALE)&&!fig.includes(RATIONALE),why(html));
check('a short source is not marked as shortened',!fig.includes('&hellip;')&&!fig.includes('Shortened'),fig);
check('Update Current State / Adjust / Leave unchanged are unchanged',
  html.includes('data-action="review-update" data-review="r-budget">Update Current State<')&&html.includes('data-action="open-adjust-review" data-review="r-budget">Adjust<')&&html.includes('data-action="review-keep" data-review="r-budget" title="Do not apply this evidence to Current State.">Leave unchanged<'),html);

// Long note: visible truncation, full text still reachable
const longText=`Weekly sync notes. ${'The team walked through every open vendor question in turn and agreed who follows up with whom. '.repeat(8)}Final line: retention is thirty days.`;
const longHtml=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[{id:'e-long',content:longText,source_type:'slack',source_name:'#pilot-security',submitted_at:'2026-09-02'}]},''),true,false);
const longFig=figure(longHtml);
check('a long source is cut short with a visible ellipsis',longFig.includes('&hellip;&rdquo;')&&!longFig.includes('retention is thirty days'),longFig);
check('a shortened excerpt says the full text is under Why / source',longFig.includes('Shortened. Full text under Why / source.'),longFig);
check('the full source text is still under Why / source',why(longHtml).includes('Final line: retention is thirty days.'),why(longHtml));
check('a named source shows its name in the label',longFig.includes('Slack · #pilot-security · '),longFig);

// Multiple sources
const multi=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[
  {id:'e-new',content:'Newest source text.',source_type:'manual_note',submitted_at:'2026-09-03'},
  {id:'e-old',content:'Older source text.',source_type:'slack',submitted_at:'2026-09-01'}]},''),true,false);
check('with several sources the excerpt quotes the newest and counts the rest',
  figure(multi).includes('Newest source text.')&&!figure(multi).includes('Older source text.')&&figure(multi).includes('1 more source. Full text under Why / source.'),figure(multi));
check('every source is listed in full under Why / source',why(multi).includes('Newest source text.')&&why(multi).includes('Older source text.'),why(multi));

// Missing evidence: explicit, no fallback text
const missing=openItems.reviewCard(api.mapApiReview({...budget,evidence_content:null,evidence_items:[]},'Text the browser happened to hold'),true,false);
check('a Review with no recorded Evidence says so beside the proposal',figure(missing).includes('No source evidence is recorded for this Review.'),missing);
check('the missing state quotes nothing and falls back to nothing',!figure(missing).includes('<blockquote>')&&!missing.includes('Text the browser happened to hold'),missing);
check('Why / source agrees that no source evidence is recorded',why(missing).includes('No source evidence is recorded'),why(missing));

// Review types the excerpt does not apply to / older callers
const risk=openItems.reviewCard(api.mapApiReview({...budget,review_type:'state_at_risk',proposals:[]},''),true,false);
check('a check-only Review keeps its full "What the evidence says" block and gets no second copy',risk.includes('What the evidence says')&&!risk.includes('review-source-excerpt'),risk);
const legacy=openItems.reviewCard({...mapped,evidenceItems:undefined},true,false);
check('a Review with no evidence list renders as before (no excerpt, old Evidence line)',!legacy.includes('review-source-excerpt')&&why(legacy).includes(`<strong>Evidence:</strong> ${SOURCE.replace('$','$')}`),why(legacy));

// Escaping
const hostile=openItems.reviewCard(api.mapApiReview({...budget,evidence_items:[{id:'e-x',content:'<img src=x onerror=alert(1)>',source_type:'<b>x</b>',submitted_at:''}]},''),true,false);
check('source text and labels are escaped',!hostile.includes('<img')&&!hostile.includes('<b>x'),figure(hostile));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
