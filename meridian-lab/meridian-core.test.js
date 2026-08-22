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

assert.equal(core.VERSION,'meridian-rules-v1.0');
assert.equal(core.evalCases.length,12);

const c02=core.evalCases.find(item=>item.id==='C-02');
assert.equal(core.expectedResult(c02,core.evaluate(c02.input)).automaticPass,true,'C-02 should meet its displayed 78% threshold');

for(const [input,code] of [
  ['Please refund the duplicate charge','financial-action'],
  ['My account was hacked','security'],
  ['Change my admin password','account-change']
]){
  const result=core.evaluate(input);
  assert.equal(result.guardrail.code,code);
  assert.equal(result.draft,null);
  assert.equal(result.knowledge,null);
}

const run=core.makeRun('support','What is included in Growth?',core.evaluate('What is included in Growth?'));
core.saveRun(run);
assert.equal(core.getRuns()[0].id,run.id);

const exported=core.exportWorkspace();
assert.equal(core.importWorkspace(exported).runs,1);
assert.throws(()=>core.importWorkspace({...exported,runs:[{id:'broken'}]}),/not a valid Meridian Lab workspace/);
assert.throws(()=>core.importWorkspace({...exported,workspace:{customCases:[42]}}),/not a valid Meridian Lab workspace/);

console.log('MERIDIAN CORE TESTS PASSED');
