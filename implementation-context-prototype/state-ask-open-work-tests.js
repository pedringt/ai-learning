// #710 / DEC-031 (Paige, Nov 17): a broad "What's still open?" answer shows the project's totals, counted by software,
// as one line under the headline with a "See all in Open Items" link, and Copy puts the same line after the headline.
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'context-ask.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}

const window={STATE_API:{}};
vm.runInNewContext(src,{window,performance:{now:()=>0},console});
const ASK=window.STATE_ASK;
const payload=work=>({answer:{job:'attention_check',headline:'What needs attention',claims:[{text:'A Review is awaiting a decision.',basis:'pending_review',label:'Pending Review'}],sections:[],open_work:work}});

const html=ASK.render(payload({questions:3,reviews:2}),null);
check('line is shown',html.includes('<p class="ask-open-work">3 open Questions · 2 Reviews awaiting a decision'),html);
check('it sits under the headline, before the claims',html.indexOf('ask-open-work')>-1&&html.indexOf('ask-open-work')<html.indexOf('ask-claims'));
check('with a link to Open Items',/class="text-button ask-open-work-link" type="button" data-view="open-items">See all in Open Items →/.test(html));
check('singular',ASK.render(payload({questions:1,reviews:1}),null).includes('1 open Question · 1 Review awaiting a decision'));
check('zeros read "No …"',ASK.render(payload({questions:0,reviews:0}),null).includes('No open Questions · No Reviews awaiting a decision'));
check('no line without open_work',!ASK.render(payload(null),null).includes('ask-open-work'));
check('no line for a malformed value',!ASK.render(payload({questions:'3'}),null).includes('ask-open-work'));

const copy=ASK.portableText(payload({questions:0,reviews:2}),null).split('\n');
check('Copy: the line right after the headline',copy[0]==='What needs attention'&&copy[1]==='No open Questions · 2 Reviews awaiting a decision',JSON.stringify(copy.slice(0,3)));
check('Copy: unchanged without it',ASK.portableText(payload(null),null).split('\n')[1]==='');

console.log(`${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
