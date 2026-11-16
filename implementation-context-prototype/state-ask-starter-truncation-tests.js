// #684 (Paige, Nov 16): a starter answer that lists only some open items says how many it shows of how many and links
// to Open Items, on screen and in Copy. Before, "What are we still unsure about?" showed 6 of 16 open Questions and 4 of
// 7 Reviews with nothing saying so.
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'context-ask.js'),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('ok',name);}else{fail++;console.error('FAIL',name,detail);}}

function load(counts){
  const n=(k,make)=>Array.from({length:counts[k]||0},(_,i)=>make(i));
  const data={
    state:n('state',i=>({id:`s${i}`,statement:`Fact ${i}`})),
    reviews:n('reviews',i=>({id:`r${i}`,decision_question:`Review ${i}?`})),
    questions:[...n('blockers',i=>({id:`b${i}`,text:`Blocker ${i}?`,blocking:true,blocks:'Launch'})),...n('ordinary',i=>({id:`q${i}`,text:`Question ${i}?`,blocking:false}))],
    history:n('history',i=>({id:`h${i}`,new_statement:`Change ${i}`})),
  };
  const API={getState:async()=>({items:data.state}),getReviews:async()=>({items:data.reviews}),getQuestions:async()=>({items:data.questions}),getHistory:async()=>({items:data.history}),ask:async()=>{throw new Error('starters never call the backend');}};
  const window={STATE_API:API};
  vm.runInNewContext(src,{window,performance:{now:()=>0},console});
  return window.STATE_ASK;
}

(async()=>{
  // Northstar's counts in the Nov 16 QA pass: 3 blocking + 13 other open Questions, 7 Reviews.
  const ASK=load({state:25,reviews:7,blockers:3,ordinary:13,history:10});
  const unsure=await ASK.submit('What are we still unsure about?');
  const byTitle=Object.fromEntries(unsure.answer.sections.map(s=>[s.title,s]));
  check('every blocking Question fits, so no line',!byTitle['Blocking questions'].more);
  check('open Questions: 6 of 13',JSON.stringify(byTitle['Open questions'].more)===JSON.stringify({parts:[{type:'question',shown:6,total:13}],anchor:'open-items-questions'}),JSON.stringify(byTitle['Open questions'].more));
  check('Reviews: 4 of 7',byTitle['Evidence still awaiting review'].more?.parts?.[0]?.total===7&&byTitle['Evidence still awaiting review'].more.anchor==='open-items-reviews');
  const html=ASK.render(unsure,null);
  check('the line is shown',html.includes('Showing 6 of 13 other open Questions.')&&html.includes('Showing 4 of 7 Reviews.'),html);
  check('with a link to that part of Open Items',html.includes('data-view="open-items" data-anchor="open-items-questions"')&&html.includes('See all in Open Items →'));
  const copy=ASK.portableText(unsure,null);
  check('Copy says it too',copy.includes('Showing 6 of 13 other open Questions. See all in Open Items.')&&copy.includes('Showing 4 of 7 Reviews. See all in Open Items.'),copy);

  const changed=await ASK.submit('What changed recently?');
  const pending=changed.answer.sections.find(s=>s.title==='Still pending');
  check('"What changed recently?": Still pending says 3 of 7',ASK.render(changed,null).includes('Showing 3 of 7 Reviews.'),JSON.stringify(pending));

  const know=await ASK.submit('What should I know right now?');
  const attention=know.answer.sections.find(s=>s.title==='Needs attention');
  check('a mixed section names each truncated kind',ASK.render(know,null).includes('Showing 3 of 7 Reviews.')&&!JSON.stringify(attention.more).includes('blocking'),JSON.stringify(attention.more));
  const meeting=await ASK.submit('Give me a meeting brief');
  check('meeting brief: 3 of 13 other open Questions',ASK.render(meeting,null).includes('Showing 3 of 13 other open Questions.'));

  const small=load({state:2,reviews:2,blockers:1,ordinary:2,history:1});
  for(const q of ['What are we still unsure about?','What changed recently?','What should I know right now?','What needs my attention right now?','Give me a meeting brief']){
    const p=await small.submit(q);
    check(`nothing left out, no line: ${q}`,!small.render(p,null).includes('ask-section-more')&&!small.portableText(p,null).includes('Showing'));
  }
  const attn=load({reviews:6,blockers:6,ordinary:2});
  check('"What needs my attention?": 5 of 6 blocking Questions, linked to blockers',(h=>h.includes('Showing 5 of 6 blocking Questions.')&&h.includes('data-anchor="open-items-blockers"'))(attn.render(await attn.submit('What needs my attention right now?'),null)));
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
