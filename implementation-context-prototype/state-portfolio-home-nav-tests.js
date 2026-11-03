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
check('the hero names Paige with the accepted description before the headline',
  /<p class="rd-identity"><span class="rd-name">Paige Edrington<\/span><span class="rd-descriptor">Software QA and project management, applied to AI\.<\/span><\/p><h1/.test(hero));
check('the existing headline is kept',hero.includes('AI doesn’t know <span>what it doesn’t know.</span></h1>'));
check('no spoken "I\'m Paige" introduction',!/I[’']m Paige/.test(html));

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
check('the homepage State card describes the practical problem and keeps demo + case-study links',
  homeCard.includes('what the team should treat as true right now')&&homeCard.includes('data-state-app-link')&&homeCard.includes('href="implementation-context.html"'));
check('the authority-boundary explanation is not repeated in the homepage card or the catalog entry',
  ![homeCard,catalog].some(t=>/authoriz|human-approved|boundary|people approve/i.test(t)));

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

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
