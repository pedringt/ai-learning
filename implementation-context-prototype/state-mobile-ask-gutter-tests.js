// Regression coverage (Oct 30): on phones the floating Ask button covered a Workspace "Review"
// badge. state-app.css keeps a right gutter on the attention rows and card links at phone width.
const fs=require('fs'), path=require('path');
const css=fs.readFileSync(path.join(__dirname,'state-app.css'),'utf8');

let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}

const block=query=>{const at=css.lastIndexOf(`@media(${query}){`);return at<0?'':css.slice(at,css.indexOf('\n}',at))};
const phone=block('max-width:760px');
check('attention rows keep a right gutter on phones',/\.workspace-attention \.attention-item\{padding-right:38px!important\}/.test(phone),phone);
check('the Current State link keeps a right gutter on phones',/\.workspace-status-card>\.eyebrow\{padding-right:34px!important\}/.test(phone),phone);
check('the attention heading link keeps a right gutter from 360px',/\.workspace-attention-head\{padding-right:38px!important\}/.test(block('min-width:360px) and (max-width:760px')));
check('the What Changed link keeps a right gutter while cards are one column',/\.workspace-recent-head\{padding-right:36px!important\}/.test(block('min-width:360px) and (max-width:700px')));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
