// #228 step 5: the portfolio points at State's own subdomain, and the old
// in-portfolio app paths redirect there on the production host only.
//
// The redirects must NOT apply on staging/preview hosts: Deep QA still targets
// the portfolio's old staging path until #228 step 6 repoints it, and a
// redirect there would send it to the production State app.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const SUBDOMAIN='https://state.contextswitch.tech/';
const PROD_HOST='contextswitch.tech';
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

const oldPath=anchors.filter(a=>a.href.includes('implementation-context-prototype'));
check('no portfolio page links to the old in-portfolio State path',oldPath.length===0,oldPath.map(a=>a.page).join(', '));

const toState=anchors.filter(a=>a.href===SUBDOMAIN);
check('the portfolio links to State\'s own subdomain (8 links across 6 pages)',toState.length===8&&new Set(toState.map(a=>a.page)).size===6,`${toState.length} links, ${new Set(toState.map(a=>a.page)).size} pages`);
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
check('the legacy Vercel redirect points to Context Switch',redirects.some(r=>r.source==='/:path*'&&(r.has||[]).some(h=>h.value==='ai-learning-rouge.vercel.app')&&r.destination==='https://contextswitch.tech/:path*'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
