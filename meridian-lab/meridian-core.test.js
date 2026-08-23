#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const memory=new Map();
const context={
  window:{},
  localStorage:{
    getItem:key=>memory.get(key)||null,
    setItem:(key,value)=>memory.set(key,value),
    removeItem:key=>memory.delete(key)
  },
  crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  Date
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(`${__dirname}/meridian-core.js`,'utf8'),context);
const core=context.MeridianCore;

assert.equal(core.VERSION,'meridian-rules-v1.1');
assert.equal(core.evalCases.length,12);
for(const item of core.evalCases){
  assert.equal(typeof item.learning?.why,'string',`${item.id} needs a learning rationale`);
  assert.ok(item.learning.why.length>10,`${item.id} rationale is too thin`);
  assert.ok(Array.isArray(item.learning.dimensions)&&item.learning.dimensions.length>0,`${item.id} needs diagnostic dimensions`);
  assert.equal(typeof item.learning.failureLayer,'string',`${item.id} needs an expected failure layer`);
  assert.equal(typeof item.learning.assumption,'string',`${item.id} needs a source or guardrail assumption`);
}

const c02=core.evalCases.find(item=>item.id==='C-02');
assert.equal(core.expectedResult(c02,core.evaluate(c02.input)).automaticPass,true,'C-02 should meet its displayed 78% threshold');

for(const [input,code] of [
  ['Please refund the duplicate charge','financial-action'],
  ['My account was hacked','security'],
  ['Please change my admin password','account-change']
]){
  const result=core.evaluate(input);
  assert.equal(result.guardrail.code,code);
  assert.equal(result.draft,null);
  assert.equal(result.knowledge,null);
}

// Account-change diagnosis cycle: mentions and troubleshooting should draft;
// direct requests for protected changes should still stop and escalate.
for(const [input,expectedCode] of [
  ['Can you reset my password?','account-change'],
  ["I tried resetting my password but it didn't work",null],
  ['How do I reset my password?',null],
  ['Please change my account password','account-change']
]){
  const result=core.evaluate(input);
  assert.equal(result.guardrail?.code||null,expectedCode,`Unexpected route for: ${input}`);
  if(expectedCode){assert.equal(result.draft,null);}
  else{assert.ok(result.draft,`Expected a human-reviewable draft for: ${input}`);}
}

const run=core.makeRun('support','What is included in Growth?',core.evaluate('What is included in Growth?'));
core.saveRun(run);
assert.equal(core.getRuns()[0].id,run.id);

const exported=core.exportWorkspace();
assert.equal(core.importWorkspace(exported).runs,1);
assert.throws(()=>core.importWorkspace({...exported,runs:[{id:'broken'}]}),/not a valid Meridian Lab workspace/);
assert.throws(()=>core.importWorkspace({...exported,workspace:{customCases:[42]}}),/not a valid Meridian Lab workspace/);

console.log('MERIDIAN CORE TESTS PASSED');
