'use strict';
// Drafts, history, restore and publish against throwaway local repositories.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const g=require('../lib/git');

const ENV={GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'t@example.com',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'t@example.com',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
Object.assign(process.env,ENV);

function setup(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pe-git-'));
  const remote=path.join(tmp,'remote.git'),seed=path.join(tmp,'seed'),dir=path.join(tmp,'content');
  g.git(tmp,['init','--quiet','--bare','-b','staging',remote]);
  g.git(tmp,['clone','--quiet',remote,seed],{allowFail:true});
  fs.writeFileSync(path.join(seed,'page.html'),'<p data-edit="a-1">One</p>\n<p data-edit="a-2">Two</p>\n');
  g.git(seed,['checkout','--quiet','-b','staging']);
  g.git(seed,['add','.']);g.git(seed,['commit','--quiet','-m','seed']);g.git(seed,['push','--quiet','origin','staging']);
  g.ensureClone({dir,remote,base:'staging'});
  return {tmp,remote,seed,dir,base:'staging'};
}
const edit=(dir,from,to)=>{const p=path.join(dir,'page.html');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(from,to))};
const save=(ctx,from,to,label)=>{edit(ctx.dir,from,to);return g.commit(ctx.dir,['page.html'],`Content: Page – “${label}”`)};
const upstream=(ctx,from,to)=>{g.git(ctx.seed,['pull','--quiet','--rebase','origin','staging']);edit(ctx.seed,from,to);g.git(ctx.seed,['commit','--quiet','-am','agent change']);g.git(ctx.seed,['push','--quiet','origin','staging'])};
const ok={ok:true,output:''};

test('saves become drafts on the content branch, and history lists them',()=>{
  const ctx=setup();
  assert.equal(g.git(ctx.dir,['rev-parse','--abbrev-ref','HEAD']),'content');
  save(ctx,'One','Uno','Uno');
  assert.equal(g.drafts(ctx).length,1);
  const h=g.history(ctx);
  assert.equal(h[0].subject,'Content: Page – “Uno”');
  assert.equal(h[0].published,false);
});

test('publish runs the checks, fast-forwards staging, and leaves no merge commit',()=>{
  const ctx=setup();
  save(ctx,'One','Uno','Uno');
  upstream(ctx,'Two','Dos');// an agent changed different text meanwhile
  const r=g.publish({...ctx,runChecks:()=>ok});
  assert.equal(r.ok,true);
  assert.equal(r.published,1);
  assert.equal(g.git(ctx.remote,['show','staging:page.html']),'<p data-edit="a-1">Uno</p>\n<p data-edit="a-2">Dos</p>');
  assert.equal(g.git(ctx.remote,['log','--merges','--oneline','staging']),'');
  assert.equal(g.drafts(ctx).length,0);
  assert.equal(g.history(ctx)[0].published,true);
});

test('failing checks block publishing',()=>{
  const ctx=setup();
  save(ctx,'One','Uno','Uno');
  const before=g.git(ctx.remote,['rev-parse','staging']);
  const r=g.publish({...ctx,runChecks:()=>({ok:false,output:'boom'})});
  assert.equal(r.ok,false);
  assert.equal(r.output,'boom');
  assert.equal(g.git(ctx.remote,['rev-parse','staging']),before);
});

test('an edit to the same text upstream stops cleanly and keeps the draft',()=>{
  const ctx=setup();
  const draft=save(ctx,'One','Uno','Uno');
  upstream(ctx,'One','Eins');
  const r=g.publish({...ctx,runChecks:()=>ok});
  assert.equal(r.ok,false);
  assert.equal(r.conflict,true);
  assert.equal(g.git(ctx.dir,['rev-parse','HEAD']),draft);
  assert.equal(g.isDirty(ctx.dir),false);
  assert.match(g.git(ctx.remote,['show','staging:page.html']),/Eins/);
});

test('restore undoes one save with a new commit',()=>{
  const ctx=setup();
  const first=save(ctx,'One','Uno','Uno');
  save(ctx,'Two','Dos','Dos');
  const r=g.restore({...ctx,sha:first});
  assert.equal(r.ok,true);
  assert.equal(fs.readFileSync(path.join(ctx.dir,'page.html'),'utf8'),'<p data-edit="a-1">One</p>\n<p data-edit="a-2">Dos</p>\n');
  assert.match(g.history(ctx)[0].subject,/^Restore: undo Page – “Uno”/);
  assert.equal(g.restore({...ctx,sha:'0'.repeat(40)}).ok,false);
});

test('restore refuses when a later save changed the same text',()=>{
  const ctx=setup();
  const first=save(ctx,'One','Uno','Uno');
  save(ctx,'Uno','Un','Un');
  const r=g.restore({...ctx,sha:first});
  assert.equal(r.ok,false);
  assert.equal(g.isDirty(ctx.dir),false);
});

test('drafts survive an upstream edit to a different block on the same line',()=>{
  const ctx=setup();
  edit(ctx.seed,'One</p>\n<p','One</p><p');// put both blocks on one line upstream first
  g.git(ctx.seed,['commit','--quiet','-am','one line']);g.git(ctx.seed,['push','--quiet','origin','staging']);
  assert.equal(g.sync(ctx).ok,true);
  save(ctx,'One','Uno','Uno');
  upstream(ctx,'Two','Dos');
  const r=g.publish({...ctx,runChecks:()=>ok});
  assert.equal(r.ok,true,r.message);
  assert.equal(g.git(ctx.remote,['show','staging:page.html']),'<p data-edit="a-1">Uno</p><p data-edit="a-2">Dos</p>');
  assert.equal(g.git(ctx.remote,['log','-1','--format=%s','staging']),'Content: Page – “Uno”');
});
