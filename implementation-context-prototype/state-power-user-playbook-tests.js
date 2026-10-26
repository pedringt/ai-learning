// Oct 21: the AI Power-User Playbook (ai-power-user-playbook.html) is a curated Library page of
// techniques. These checks keep its entry format, the discovery prompt Paige asked to preserve
// word for word, its Library entry, and its links intact as entries are added or edited.
// Oct 26: whether a technique belongs is an editorial call, not a test, so there is no size
// ceiling; the checks below keep the counts, categories, and entry structure accurate instead.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const page='ai-power-user-playbook.html';
const html=fs.readFileSync(path.join(root,page),'utf8');
const entries=[...html.matchAll(/<details class="pb-entry" id="([^"]+)"[\s\S]*?<\/details>/g)];
const ids=entries.map(m=>m[1]);

const sections=[...html.matchAll(/<section class="pb-section" data-cat="([a-z]+)"[\s\S]*?<\/section>/g)];
const chipCounts=new Map([...html.matchAll(/class="pb-chip" data-filter="([a-z]+)"[^>]*>[^<]*<span>(\d+)<\/span>/g)].map(m=>[m[1],Number(m[2])]));
const inSection=m=>(m[0].match(/<details class="pb-entry"/g)||[]).length;
check('the All filter shows the real total',chipCounts.get('all')===entries.length,`${chipCounts.get('all')} vs ${entries.length}`);
check('every category has a filter and every filter a category',
  sections.map(m=>m[1]).sort().join()===[...chipCounts.keys()].filter(k=>k!=='all').sort().join());
check('each category filter and heading shows its real count',
  sections.every(m=>chipCounts.get(m[1])===inSection(m)&&Number((m[0].match(/class="pb-section-count">(\d+)</)||[])[1])===inSection(m)),
  sections.map(m=>`${m[1]}:${inSection(m)}`).join(' '));
check('every technique sits inside a category',sections.reduce((n,m)=>n+inSection(m),0)===entries.length);
check('technique ids are unique',new Set(ids).size===ids.length);
check('the page shows the real technique count',html.includes(`>${entries.length} techniques<`));
check('every technique says what it does, when to use it, and gives an example',
  entries.every(m=>/class="pb-entry-what"/.test(m[0])&&/When to use it:/.test(m[0])&&/Example:/.test(m[0])),
  ids.filter((id,i)=>!/When to use it:[\s\S]*Example:/.test(entries[i][0])).join(', '));
check('every technique has a prompt or a checklist',entries.every(m=>/pb-prompt-text|pb-steps/.test(m[0])));
check('every prompt has its own copy button',(html.match(/class="pb-prompt"/g)||[]).length===(html.match(/class="pb-copy"/g)||[]).length);
check('every technique carries one type label',entries.every(m=>/<span class="pb-type">(Prompt|Technique|Product principle)<\/span>/.test(m[0])));
check('every technique has problem keywords for search',entries.every(m=>/data-keywords="[^"]{10,}"/.test(m[0])));
check('eight categories, each with a filter',(html.match(/class="pb-section"/g)||[]).length===8&&(html.match(/class="pb-chip"/g)||[]).length===9);

const PRESERVED='Identify the five assumptions that would most change our recommended solution. Turn each into a neutral discovery question. Explain how different answers would affect scope, architecture, or whether AI is appropriate.';
const discovery=entries.find(m=>m[1]==='decision-changing-assumptions');
check('the assumption-test prompt is preserved word for word under its label',
  !!discovery&&discovery[0].includes(`<div class="pb-prompt-text">${PRESERVED}</div>`)&&discovery[0].includes('AI Client Discovery: Assumption-Test Questions'));

check('no em dashes in the page',!html.includes('—'));

const missing=[...html.matchAll(/href="([^"#:]+)(?:#[^"]*)?"/g)].map(m=>m[1]).filter(f=>!fs.existsSync(path.join(root,f)));
check('every internal link points to a file that exists',missing.length===0,missing.join(', '));

const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const section=(index.match(/<details class="learning-stage" id="working-with-ai">[\s\S]*?<\/details>/)||[''])[0];
check('the Library lists the playbook under Working Effectively with AI',/href="ai-power-user-playbook\.html"/.test(section));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
