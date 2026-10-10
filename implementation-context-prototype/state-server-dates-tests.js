// #476: the API sends UTC timestamps without a zone ("2026-10-10 00:40:00"). Browsers read
// those as local time, so an action at 5:40 pm in California showed as tomorrow. The two
// parsers (context-backend-sync.js formatBackendDate, context-notes-view.js
// localCalendarKey) must read them as UTC and show the viewer's local day.
process.env.TZ='America/Los_Angeles';
const fs=require('fs'), path=require('path');
const dir=__dirname;

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

function extract(file,name){
  const src=fs.readFileSync(path.join(dir,file),'utf8');
  const start=src.indexOf(`const ${name} =`)>=0?src.indexOf(`const ${name} =`):src.indexOf(`function ${name}(`);
  if(start<0)throw new Error(`${name} not found in ${file}`);
  const end=src.indexOf('\n  }\n',start)>=0&&src.slice(start,start+12).startsWith('function')?src.indexOf('\n  }\n',start)+4:src.indexOf('\n',start);
  return src.slice(start,end);
}

for(const file of ['context-backend-sync.js','context-notes-view.js']){
  const parse=new Function(`${extract(file,'parseServerTime')}; return parseServerTime;`)();
  const d=parse('2026-10-10 00:40:00');
  check(`${file}: zone-less timestamp is read as UTC`, d.toISOString()==='2026-10-10T00:40:00.000Z', d.toISOString());
  check(`${file}: and lands on Oct 9 in California`, d.getDate()===9, String(d));
  check(`${file}: an explicit zone is respected`, parse('2026-10-10T00:40:00+00:00').toISOString()==='2026-10-10T00:40:00.000Z');
  check(`${file}: ISO "T" form without a zone is UTC too`, parse('2026-10-10T00:40:00.123').toISOString()==='2026-10-10T00:40:00.123Z');
}

const formatBackendDate=new Function(`${extract('context-backend-sync.js','parseServerTime')}; ${extract('context-backend-sync.js','formatBackendDate')}; return formatBackendDate;`)();
check('formatBackendDate shows the local day for an evening action', formatBackendDate('2026-10-10 00:40:00')==='Oct 9', formatBackendDate('2026-10-10 00:40:00'));
check('formatBackendDate keeps a bare calendar date as that day', formatBackendDate('2026-10-09')==='Oct 9', formatBackendDate('2026-10-09'));
check('formatBackendDate still handles garbage', formatBackendDate('not a date')==='not a date');

const localCalendarKey=new Function(`${extract('context-notes-view.js','parseServerTime')}; ${extract('context-notes-view.js','localCalendarKey')}; return localCalendarKey;`)();
check('Notes date filter puts an evening note on the local day', localCalendarKey('2026-10-10 00:40:00')==='2026-10-09', localCalendarKey('2026-10-10 00:40:00'));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
