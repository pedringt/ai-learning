// Nov 4 (Paige): the seven portfolio case studies present attribution the same way, and the
// Legal AI case study's section labels are real headings. Wording inside each credit stays
// project-specific; only the label and placement are standardized.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const caseStudies=['implementation-context.html','tastemake.html','project-health-case-study.html',
  'debugging-ai-systems.html','legal-ai-governance.html','meridian.html','state-architecture-cost.html'];

for(const page of caseStudies){
  const html=fs.readFileSync(path.join(root,page),'utf8');
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
}

const tastemake=fs.readFileSync(path.join(root,'tastemake.html'),'utf8');
const tasteHero=tastemake.slice(tastemake.indexOf('<header class="meridian-case-hero'),tastemake.indexOf('</header>'));
check('Tastemake hero keeps only the Status line',/<div class="case-meta"><span><b>Status<\/b>/.test(tasteHero)&&!/My role|AI collaborator/.test(tasteHero));

const legal=fs.readFileSync(path.join(root,'legal-ai-governance.html'),'utf8');
for(const label of ['How I tested the idea','What held up','What I corrected along the way'])
  check(`Legal AI: "${label}" is an h2 heading`,legal.includes(`<h2 class="kicker">${label}</h2>`)&&!legal.includes(`<div class="kicker">${label}</div>`));
check('Legal AI: the label headings keep the kicker look',/\.legal-paper \.paper-section>h2\.kicker:not\(#_\):not\(#_\)\{font-size:12px!important/.test(legal));
// Nov 4 (Paige): the recommendation section opens with its own heading; the old "Where I landed" label is gone.
check('Legal AI: the recommendation opens with its own h2, with no extra label or duplicate heading',
  legal.includes('<section class="paper-section"><h2>Why I wouldn&rsquo;t pursue an offering yet</h2>')&&!legal.includes('Where I landed'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
