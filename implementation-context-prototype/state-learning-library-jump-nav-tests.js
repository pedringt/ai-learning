// Oct 11: on the two Learning Library pages the "On this page" highlight came from an
// IntersectionObserver band, which never fires on a fast jump, so jumping back to the top left
// a stale item highlighted (or none). The highlight now follows the scroll position; this keeps
// both pages on that version. The browser check is in the Oct 11 session notes (jumpnav.py).
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
for(const page of ['ai-durable-knowledge.html','ai-professional-edge.html']){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  check(`${page}: highlight follows the scroll position`,/const spy=links=>/.test(html)&&/spy\(links\)/.test(html));
  check(`${page}: no observer band for the jump menu`,!/IntersectionObserver/.test(html));
  check(`${page}: the bottom of the page highlights the last section`,/innerHeight\+scrollY>=doc\.scrollHeight-2/.test(html));
}
// Oct 21: AI Professional Edge builds its sections after fetching the markdown, so a link to
// ai-professional-edge.html#section landed at the top. It now scrolls to the hash once rendered.
const edge=fs.readFileSync(path.join(root,'ai-professional-edge.html'),'utf8');
check('ai-professional-edge.html: a #section link scrolls there once the sections render',/setupNav\(\);jumpToHash\(\)/.test(edge)&&/function jumpToHash\(\)/.test(edge));
console.log(`\n${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
