// #228: production portfolio links open State's own subdomain. The staging
// homepage keeps its two Open State links on the same-origin in-portfolio app
// route so staging QA does not accidentally send users to production.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const SUBDOMAIN='https://state.contextswitch.tech/';
const PROD_HOST='www.contextswitch.tech';
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name)}else{fail++;console.error('FAIL',name,detail)}}

const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
const anchors=[];
for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  for(const m of html.matchAll(/<a\b[^>]*>/g)){
    const tag=m[0],href=(tag.match(/\bhref="([^"]*)"/)||[])[1]||'';
    anchors.push({page,tag,href});
  }
}

const stagingAppLinks=anchors.filter(a=>a.page==='index.html'&&a.href==='/implementation-context-prototype/');
check('the staging homepage keeps both Open State links on its same-origin app route',stagingAppLinks.length===2,
  `${stagingAppLinks.length} links`);
const unexpectedOldPath=anchors.filter(a=>a.href.includes('implementation-context-prototype')&&!(a.page==='index.html'&&a.href==='/implementation-context-prototype/'));
check('no other portfolio link targets the old in-portfolio State path',unexpectedOldPath.length===0,unexpectedOldPath.map(a=>a.page).join(', '));

const toState=anchors.filter(a=>a.href===SUBDOMAIN);
check('non-homepage portfolio links point to State\'s own subdomain (6 links across 5 pages)',toState.length===6&&new Set(toState.map(a=>a.page)).size===5,`${toState.length} links, ${new Set(toState.map(a=>a.page)).size} pages`);
check('every State link opens in a new tab safely',toState.every(a=>/target="_blank"/.test(a.tag)&&/rel="[^"]*noopener/.test(a.tag)));

const cfg=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const redirects=cfg.redirects||[];
const legacy=redirects.filter(r=>/^\/(implementation-context-prototype|state-product-health)/.test(r.source));
const sources=legacy.map(r=>r.source);
check('old app paths and the old dashboard URL redirect to the subdomain',
  ['/implementation-context-prototype','/implementation-context-prototype/index.html','/implementation-context-prototype/:path*','/state-product-health'].every(s=>sources.includes(s))&&legacy.every(r=>r.destination.startsWith(SUBDOMAIN)),
  sources.join(', '));
check('those redirects apply on the production host only (never on staging/preview)',
  legacy.length>0&&legacy.every(r=>(r.has||[]).length===1&&r.has[0].type==='host'&&r.has[0].value===PROD_HOST),
  JSON.stringify(legacy.map(r=>r.has)));
check('those redirects are temporary until the move has proven stable',legacy.every(r=>r.permanent===false));
check('the specific index.html rule comes before the catch-all so it is not shadowed',
  sources.indexOf('/implementation-context-prototype/index.html')<sources.indexOf('/implementation-context-prototype/:path*'));
check('the legacy Vercel redirect points to Context Switch',redirects.some(r=>r.source==='/:path*'&&(r.has||[]).some(h=>h.value==='ai-learning-rouge.vercel.app')&&r.destination==='https://www.contextswitch.tech/:path*'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
