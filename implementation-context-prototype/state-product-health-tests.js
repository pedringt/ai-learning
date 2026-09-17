const assert = require('assert');
const H = require('../state-product-health.js');

(async()=>{
  let pass=0;
  async function check(name,fn){try{await fn();pass++;console.log('✓',name)}catch(error){console.error('✗',name);throw error}}

  await check('only the first timeout is eligible for automatic retry',()=>{
    const error=new Error('This is taking longer than expected.');error.isTimeout=true;
    assert.equal(H.shouldRetry(error,0),true);
    assert.equal(H.shouldRetry(error,1),false);
    assert.equal(H.shouldRetry(new Error('API error 500'),0),false);
  });

  await check('startup helper retries once after a timeout',async()=>{
    let calls=0,retries=0;
    const value=await H.withStartupRetry(async()=>{calls++;if(calls===1){const e=new Error('slow');e.isTimeout=true;throw e;}return 'ready';},()=>retries++);
    assert.equal(value,'ready');assert.equal(calls,2);assert.equal(retries,1);
  });

  await check('startup helper does not loop on a second timeout',async()=>{
    let calls=0;
    try{await H.withStartupRetry(async()=>{calls++;const e=new Error('slow');e.isTimeout=true;throw e;});assert.fail('expected error');}
    catch(error){assert.equal(calls,2);}
  });

  await check('dashboard payload content minimizer rejects project-content fields',()=>{
    assert.equal(H.contentFree({overview:{demo_sessions_30d:2},usage:{ask_completed_30d:1}}),true);
    assert.equal(H.contentFree({review:{decision_question:'Should we launch?'}}),false);
    assert.equal(H.contentFree({history:{new_statement:'Secret'}}),false);
    assert.equal(H.contentFree({ask_query:'Secret'}),false);
  });

  await check('formatters keep missing telemetry visibly missing',()=>{
    assert.equal(H.hoursLabel(null),'Not enough data');
    assert.equal(H.latencyLabel(null),'Not enough data');
    assert.equal(H.hoursLabel(36),'1.5d');
    assert.equal(H.latencyLabel(4200),'4.2s');
  });

  console.log(`\n${pass} passed, 0 failed`);
})().catch(()=>process.exit(1));
