#!/usr/bin/env node
'use strict';
// Adds data-edit markers to new copy on the editor's pages (#617).
//
//   node tools/portfolio-editor/mark.js          # add missing markers
//   node tools/portfolio-editor/mark.js --check  # report only; exit 1 if any are missing
//
// Blocks whose markup the editor can't round-trip safely (decorative arrows,
// custom attributes) get data-edit-skip instead, so they stay hand-edited.

const fs=require('fs'),path=require('path');
const {PAGES,scanBlocks}=require('./lib/html');

const root=path.join(__dirname,'..','..');
const check=process.argv.includes('--check');
let missing=0;

for(const [file,slug] of Object.entries(PAGES)){
  const p=path.join(root,file);
  let src=fs.readFileSync(p,'utf8');
  const blocks=scanBlocks(src);
  const todo=blocks.filter(b=>b.inScope&&!b.id&&!b.skip);
  if(!todo.length)continue;
  missing+=todo.length;
  if(check){
    for(const b of todo)console.log(`${file}: unmarked <${b.tag}> ${b.inner.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,70)}`);
    continue;
  }
  const used=blocks.map(b=>b.id).filter(Boolean).map(id=>Number((id.match(/-(\d+)$/)||[])[1])||0);
  let next=Math.max(0,...used)+1;
  const ids=new Map(todo.map(b=>[b,b.safe?`${slug}-${next++}`:null]));
  // Insert from the end so earlier offsets stay valid.
  for(const b of [...todo].reverse()){
    const at=b.openEnd-1;// just before the start tag's closing >, so class-first selectors and tests still match
    const id=ids.get(b);
    src=src.slice(0,at)+(id?` data-edit="${id}"`:' data-edit-skip')+src.slice(at);
  }
  fs.writeFileSync(p,src);
  const skipped=todo.filter(b=>!b.safe).length;
  console.log(`${file}: marked ${todo.length-skipped}${skipped?`, skipped ${skipped}`:''}`);
}

if(check&&missing){console.error(`${missing} block(s) need markers. Run: node tools/portfolio-editor/mark.js`);process.exit(1)}
if(!missing)console.log('All editable blocks are marked.');
