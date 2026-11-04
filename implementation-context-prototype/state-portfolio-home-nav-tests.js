// #588/#589: the portfolio homepage (index.html) opens with Paige's name and description, makes the
// work the primary call to action, gives each State entry point its own job, exposes the active
// primary view with aria-current, moves focus to the new view's heading only on user-initiated view
// changes, and hides the purely decorative hero notes from assistive technology.
// The browser check (keyboard, Back/Forward, phone picker, viewports) is in the #588/#589 report.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const between=(start,end)=>{const i=html.indexOf(start);return i<0?'':html.slice(i,html.indexOf(end,i));};

const hero=between('<div class="rd-hero-copy">','</aside>');
// Nov 3 (Paige): no identity line above the headline; her name stays in the contact footer and the résumé.
check('the hero opens with the headline, with no name or role line above it',/^<div class="rd-hero-copy"><h1/.test(hero)&&!/rd-identity|rd-descriptor/.test(html));
check('her name is still in the contact footer',/<span class="portfolio-contact-name">Paige Edrington<\/span>/.test(html));
check('the existing headline is kept',hero.includes('AI doesn’t know <span>what it doesn’t know.</span></h1>'));
check('no spoken "I\'m Paige" introduction',!/I[’']m Paige/.test(html));
// Nov 3 (Paige): the introduction no longer repeats the descriptor's background.
check('the hero introduction does not repeat the descriptor',hero.includes('I look for where AI needs more context, clearer direction, or closer review.')&&!/My background in/.test(hero));

const actions=[...between('<div class="rd-actions">','</div>').matchAll(/<a class="([^"]*)" href="([^"]*)">([^<]*)</g)].map(m=>({cls:m[1],href:m[2],text:m[3]}));
check('See the work is the first, primary action and opens Applied Work',
  actions[0]&&actions[0].href==='#portfolio'&&actions[0].text.startsWith('See the work')&&!actions[0].cls.includes('rd-button-secondary'),JSON.stringify(actions));
check('Explore my experience is secondary and targets Experience',
  actions[1]&&actions[1].href==='#experience'&&actions[1].text.startsWith('Explore my experience')&&actions[1].cls.includes('rd-button-secondary'),JSON.stringify(actions));
check('the Experience target still exists',html.includes('<section class="home-experience" id="experience"'));

// State keeps three entry points on the homepage, each with its own job.
const stateLinks=(html.match(/<a [^>]*data-state-app-link[^>]*>/g)||[]).length;
check('all three State entry points remain (hero, homepage card, Applied Work)',stateLinks===3,String(stateLinks));
const homeCard=between('<article class="home-feature-card home-feature-state-anchor">','</article>');
const catalog=between('<h3><a class="applied-card-primary-link" href="implementation-context.html">State</a></h3>','</div></div>');
// Nov 3 (Paige): the card names the scattered-decisions problem and who proposes and approves changes.
check('the homepage State card describes the practical problem and keeps demo + case-study links',
  homeCard.includes('As a project moves forward, decisions and open questions get scattered across notes and conversations. State keeps a current project record, with AI proposing updates and people approving changes.')&&!/documents/i.test(homeCard)&&homeCard.includes('data-state-app-link')&&homeCard.includes('href="implementation-context.html"'));
check('the authority-boundary explanation is not repeated in the homepage card or the catalog entry',
  ![homeCard,catalog].some(t=>/authoriz|human-approved|boundary/i.test(t)));

// #589: decorative notes hidden; the real State link and card copy stay exposed.
for(const cls of ['rd-review-human','rd-review-authority','rd-review-current'])
  check(`hero ${cls} note is hidden from assistive technology`,html.includes(`<div class="rd-review-note ${cls}" aria-hidden="true">`));
check('the yellow boundary note is hidden from assistive technology (the card says the same thing)',html.includes('<div class="rd-note" aria-hidden="true">'));
const card=between('<div class="rd-card">','<div class="rd-trace"');
check('the hero card heading, sentence and Open State link are not hidden',!/aria-hidden/.test(card.replace(/<span aria-hidden="true">↗<\/span>/,''))&&card.includes('data-state-app-link'));

// #589: aria-current and focus management in the router.
check('Home starts as the aria-current destination',html.includes('<button class="active" data-view="home" aria-current="page">Home</button>'));
const router=between('<script id="v895-router">','</script>');
check('render sets aria-current on the active nav item and removes it from the others',
  /if\(on\)b\.setAttribute\('aria-current','page'\); else b\.removeAttribute\('aria-current'\);/.test(router));
check('focus moves only when a user action changes the view',/if\(moveFocus&&changed\)/.test(router)&&/render\(name,true,true\)/.test(router));
check('Back/Forward update the view with focus, the initial load does not move focus',
  router.includes("window.addEventListener('popstate',()=>render(pageFromHash(),false,true));")&&/\n  render\(pageFromHash\(\),false\);/.test(router));
check('the brand goes Home through the router',router.includes("root.querySelector('[data-brand-home]')?.addEventListener('click',()=>go('home'));"));
for(const [page,heading] of [['home','<h1 tabindex="-1">'],['portfolio','<h2 class="section-title" tabindex="-1">'],['learn','class="route-title" role="heading" tabindex="-1">']])
  check(`the ${page} view heading is a programmatic focus target`,html.includes(heading));

// #589: the blue note covered the end of the State card sentence at 681-980px.
const css=fs.readFileSync(path.join(root,'site-components.css'),'utf8');
const tabletAt=css.indexOf('@media (max-width:980px) and (min-width:681px){\n  html body #ai-cs-mock .rd-hero h1');
const tablet=tabletAt<0?'':css.slice(tabletAt,css.indexOf('\n}',tabletAt));
check('at tablet widths the Current State note sits below the State card sentence',/\.rd-review-current\{right:-28px;top:262px\}/.test(tablet),tablet);

// #588/#598: every homepage footer links the accepted general résumé, a real two-page PDF at /resume.pdf.
const footers=[...html.matchAll(/<nav class="portfolio-contact"[\s\S]*?<\/nav>/g)].map(m=>m[0]);
check('each homepage footer (Home, Applied Work, Library) links the résumé PDF in a new tab',
  footers.length===3&&footers.every(f=>/<a href="resume\.pdf" target="_blank" rel="noopener">Résumé \(PDF\)<\/a><\/nav>$/.test(f)),String(footers.length));
// Nov 3 (Paige): every page with a contact footer links the résumé too; the 404 page is served at any address,
// so its link is root-relative.
const contactPages=fs.readdirSync(root).filter(f=>f.endsWith('.html')).filter(f=>fs.readFileSync(path.join(root,f),'utf8').includes('class="portfolio-contact"'));
const missing=contactPages.filter(f=>{const page=fs.readFileSync(path.join(root,f),'utf8');const href=f==='404.html'?'/resume.pdf':'resume.pdf';
  const blocks=page.match(/<(nav|footer) class="portfolio-contact"[\s\S]*?<\/(nav|footer)>/g)||[];
  return !blocks.length||!blocks.every(b=>b.includes('<a href="'+href+'" target="_blank" rel="noopener">Résumé (PDF)</a>'));});
check('every page with a contact footer links the résumé ('+contactPages.length+' pages)',contactPages.length>=17&&!missing.length,missing.join(', '));
const pdf=fs.readFileSync(path.join(root,'resume.pdf'));
check('resume.pdf is a PDF with two pages',pdf.slice(0,5).toString()==='%PDF-'&&(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length===2);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
