// Regression coverage (Oct 27): on a cold load the Workspace showed the red "Needs your attention"
// alert icon beside "Opening action items…" before anything was known to need attention. The
// loading card now uses a neutral clock icon, and state-app.css keeps its ring and color muted.
const fs=require('fs'), path=require('path');
const dir=__dirname;
const app=fs.readFileSync(path.join(dir,'context-app.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'state-app.css'),'utf8');

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const loadingLine=app.split('\n').find(line=>line.includes('workspace-attention is-loading'))||'';
check('the loading card exists',!!loadingLine);
check('the loading card uses the loading icon, not the alert icon',loadingLine.includes("workspaceIcon('loading')")&&!loadingLine.includes("workspaceIcon('alert')"),loadingLine);
check('a loading icon is defined',/\bloading:'<svg /.test(app));
const rule=css.match(/\.workspace-attention\.is-loading \.attention-head-icon\{([^}]*)\}/)?.[1]||'';
check('the loading icon has a neutral ring and color',/border-color:var\(--line/.test(rule)&&/color:var\(--muted/.test(rule),rule);
check('the loading icon rule carries no red',!/#ef5361|#df3343/i.test(rule),rule);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
