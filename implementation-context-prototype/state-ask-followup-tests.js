const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=__dirname;
const calls=[];
const prior={
  canHandle(){return true}, canStream(){return true}, render(){return ''}, renderStream(){return ''}, portableText(){return ''}, activateWaitStates(){},
  async submitStream(query,previous){calls.push({kind:'stream',query,previous});return {answer:{headline:'new'}}},
  async submit(query,previous){calls.push({kind:'submit',query,previous});return {answer:{headline:'new'}}},
};
const context={window:{STATE_ASK:prior},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir,'context-ask-followup.js'),'utf8'),context);
const ask=context.window.STATE_ASK;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const previous={answer:{headline:'Prior answer'}};
check('first question is new',ask.followupIntent('Who owns the pilot?',null)==='new');
check('topic-shift follow-up is new',ask.followupIntent('What other contacts do I have?',previous)==='new');
check('security topic shift is new',ask.followupIntent('What about the security risks?',previous)==='new');
check('source follow-up is dependent',ask.followupIntent('What source supports that?',previous)==='dependent');
check('short why follow-up is dependent',ask.followupIntent('Why?',previous)==='dependent');
check('how do you know is dependent',ask.followupIntent('How do you know?',previous)==='dependent');
check('where did you get that is dependent',ask.followupIntent('Where did you get that?',previous)==='dependent');
check('pronoun follow-up is dependent',ask.followupIntent('Can you explain that?',previous)==='dependent');
check('shorten is transformation',ask.followupIntent('Make it shorter',previous)==='transform');
check('agenda is transformation',ask.followupIntent('Turn it into an agenda',previous)==='transform');
check('dependent renders as replacement',ask.followupMode('Why?',previous)==='replace');
check('topic shift renders as new',ask.followupMode('What is the budget?',previous)==='new');
(async()=>{
  calls.length=0;
  const fresh=await ask.submit('What is the pilot budget?',previous);
  check('fresh question does not send previous answer',calls[0]?.previous===null);
  check('fresh response is marked new',fresh.followup_mode==='new');
  calls.length=0;
  const dependent=await ask.submit('Why?',previous);
  check('dependent follow-up sends previous answer',calls[0]?.previous===previous);
  check('dependent response replaces visible artifact',dependent.followup_mode==='replace');
  calls.length=0;
  const transformed=await ask.submitStream('Make it 3 bullets',previous,{});
  check('transformation sends previous answer',calls[0]?.previous===previous);
  check('transformation replaces visible artifact',transformed.followup_mode==='replace');
  console.log(`\n${pass} passed, ${fail} failed`);if(fail)process.exit(1);
})().catch(err=>{console.error(err);process.exit(1)});
