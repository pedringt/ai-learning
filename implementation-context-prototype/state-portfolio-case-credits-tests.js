// Nov 4 (Paige): the seven portfolio case studies present attribution the same way, and the
// Legal AI case study's section labels are real headings. Wording inside each credit stays
// project-specific; only the label and placement are standardized.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
// Editor markers (#617) are invisible attributes; compare the markup without them.
const withoutEditMarkers=s=>s.replace(/ data-edit(?:="[^"]*"|-skip)/g,'');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const caseStudies=['implementation-context.html','tastemake.html','project-health-case-study.html',
  'debugging-ai-systems.html','legal-ai-governance.html','meridian.html','state-architecture-cost.html'];

for(const page of caseStudies){
  const html=withoutEditMarkers(fs.readFileSync(path.join(root,page),'utf8'));
  const credits=html.match(/<div class="case-meta case-credits">[\s\S]*?<\/div>/g)||[];
  check(`${page}: exactly one credits block`,credits.length===1,String(credits.length));
  const block=credits[0]||'';
  check(`${page}: credits read "My role" then "AI collaborator"`,/^<div class="case-meta case-credits"><span><b>My role<\/b> [^<]+<\/span><span><b>AI collaborator<\/b> [^<]+<\/span><\/div>$/.test(block),block.slice(0,160));
  check(`${page}: no other AI credit label is used`,!/<b>AI(’|&rsquo;|')s role<\/b>/.test(html));
  // Credits sit at the bottom: after the page's last h2, never in the hero.
  const lastH2=html.lastIndexOf('<h2');
  const heroEnd=html.indexOf('</header>',html.indexOf('meridian-case-hero'));
  check(`${page}: credits come after the last section heading, not in the hero`,
    html.indexOf(block)>lastH2&&html.indexOf(block)>heroEnd);
  // Nov 5 (staging QA): the v7.3 Tastemake rewrite dropped this link; every case study keeps it.
  check(`${page}: ends with the Back to Applied Work link`,
    /<footer class="case-study-footer">[\s\S]*?<a href="index\.html#portfolio">Back to Applied Work →<\/a>[\s\S]*?<\/footer>/.test(html));
}

const tastemake=withoutEditMarkers(fs.readFileSync(path.join(root,'tastemake.html'),'utf8'));
const tasteHero=tastemake.slice(tastemake.indexOf('<header class="meridian-case-hero'),tastemake.indexOf('</header>'));
check('Tastemake hero keeps only the Status line',/<div class="case-meta"><span><b>Status<\/b>/.test(tasteHero)&&!/My role|AI collaborator/.test(tasteHero));
// Nov 4 (Paige): the v7.3 case study is five sections, with one comparison figure and a findings list.
// Nov 5 (Paige): heading wording is edited in the portfolio editor (#617), so wording is never checked.
// Nov 7 (Paige): a sixth section, the shorter second example ("Better information wasn't enough"), sits
// after the findings and before "What's next". Checked by section and order, each with one heading.
const TASTE_SECTIONS=['narrative-open','product-model','seam-learning','next-tests','feedback-example','current-conclusion'];
const tasteSections=[...tastemake.matchAll(/<section class="section ([\w-]+)">([\s\S]*?)<\/section>/g)].map(m=>({name:m[1],h2s:(m[2].match(/<h2>[^<]+<\/h2>/g)||[]).length}));
check('Tastemake: six sections in the approved order',JSON.stringify(tasteSections.map(x=>x.name))===JSON.stringify(TASTE_SECTIONS),JSON.stringify(tasteSections.map(x=>x.name)));
check('Tastemake: each section has exactly one heading',tasteSections.length===TASTE_SECTIONS.length&&tasteSections.every(x=>x.h2s===1),JSON.stringify(tasteSections));
check('Tastemake: the second example keeps its research-prototype label',
  /<section class="section feedback-example">[\s\S]*<figure class="progression"[\s\S]*Research prototype only, not part of Tastemake\.[\s\S]*hand-written suggestions[\s\S]*<\/figure>/.test(tastemake));
check('Tastemake: the two tests are one labelled figure, 98% beside 53%',
  /<figure class="test-compare" aria-labelledby="test-compare-label">[\s\S]*>98%<[\s\S]*>53%<[\s\S]*<\/figure>/.test(tastemake));
check('Tastemake: the three findings are a list with their own headings',
  (tastemake.match(/<li class="finding"><h3 class="finding-title">/g)||[]).length===3&&tastemake.includes('<ul class="findings-list" role="list">'));
check('Tastemake: the old correction table and pipeline list are gone',!tastemake.includes('taste-effects')&&!tastemake.includes('How the work is split today'));

const legal=withoutEditMarkers(fs.readFileSync(path.join(root,'legal-ai-governance.html'),'utf8'));
// Section labels are h2 headings styled as kickers; their wording is edited in the portfolio editor.
check('Legal AI: the three section labels are h2 headings',(legal.match(/<h2 class="kicker">[^<]+<\/h2>/g)||[]).length===3&&!/<div class="kicker">/.test(legal));
check('Legal AI: the label headings keep the kicker look',/\.legal-paper \.paper-section>h2\.kicker:not\(#_\):not\(#_\)\{font-size:12px!important/.test(legal));
// Nov 4 (Paige): the recommendation section opens with its own heading; the old "Where I landed" label is gone.
check('Legal AI: the recommendation opens with its own h2, with no extra label or duplicate heading',
  /<section class="paper-section"><h2>[^<]+<\/h2>/.test(legal)&&!legal.includes('Where I landed'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
