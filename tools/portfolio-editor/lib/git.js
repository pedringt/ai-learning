'use strict';
// Git operations for the portfolio editor (#617).
//
// Drafts are commits on a local `content` branch in a dedicated clone (never
// Paige's working checkout). The branch is kept rebased on the publish base
// (normally `staging`), so publishing is a fast-forward push with no merge
// commits. Nothing is force-pushed and history is never rewritten after it
// leaves this machine.

const {execFileSync,spawnSync}=require('child_process');
const fs=require('fs'),path=require('path');
const {blockMap,setBlock}=require('./html');

const BRANCH='content';
const SUBJECT=/^(Content|Restore): /;

class GitError extends Error{}

function git(dir,args,opts={}){
  const r=spawnSync('git',args,{cwd:dir,encoding:'utf8',maxBuffer:64*1024*1024,...opts});
  if(r.status!==0&&!opts.allowFail)throw new GitError(`git ${args.join(' ')} failed:\n${(r.stderr||r.stdout||'').trim()}`);
  return opts.allowFail?r:r.stdout.trim();
}

const remoteBase=base=>`origin/${base}`;
const isDirty=dir=>git(dir,['status','--porcelain']).length>0;
const busy=dir=>['rebase-merge','rebase-apply','MERGE_HEAD','REVERT_HEAD'].some(f=>fs.existsSync(path.join(dir,'.git',f)));

// Create the editor's own clone the first time, and make sure it is on the
// drafts branch.
function ensureClone({dir,remote,base}){
  if(!fs.existsSync(path.join(dir,'.git'))){
    fs.mkdirSync(path.dirname(dir),{recursive:true});
    const filter=/^https?:/.test(remote)?['--filter=blob:none']:[];
    git(path.dirname(dir),['clone',...filter,'--no-checkout',remote,dir]);
    git(dir,['checkout','-b',BRANCH,remoteBase(base)]);
  }
  const current=git(dir,['rev-parse','--abbrev-ref','HEAD']);
  if(current!==BRANCH){
    const exists=git(dir,['rev-parse','--verify','--quiet',`refs/heads/${BRANCH}`],{allowFail:true}).status===0;
    git(dir,exists?['checkout',BRANCH]:['checkout','-b',BRANCH,remoteBase(base)]);
  }
}

// Bring drafts up to date with the latest site. A conflict stops cleanly and
// leaves the drafts exactly as they were.
function sync({dir,base,fetch=true}){
  if(busy(dir))return {ok:false,conflict:true,message:'The drafts folder is in the middle of an unfinished git operation. Ask Claude to look at it.'};
  if(isDirty(dir))return {ok:false,dirty:true,message:'The drafts folder has unsaved changes made outside the editor. Ask Claude to look at it before editing.'};
  if(fetch){
    const f=git(dir,['fetch','--prune','origin'],{allowFail:true});
    if(f.status!==0)return {ok:true,offline:true,message:'Couldn’t reach GitHub, so the newest site changes weren’t loaded. You can still save drafts.'};
  }
  const r=git(dir,['rebase',remoteBase(base)],{allowFail:true});
  if(r.status===0)return {ok:true};
  git(dir,['rebase','--abort'],{allowFail:true});
  // Git compares whole lines, and several blocks can share a line. Replay the
  // drafts block by block instead; only a change to the same block conflicts.
  const replayed=replay({dir,base});
  if(replayed.ok)return {ok:true};
  return {ok:false,conflict:true,files:replayed.files,message:`A newer site change edited the same text as one of your drafts${replayed.files.length?` (${replayed.files.join(', ')})`:''}. Nothing was overwritten. Ask Claude to combine them.`};
}

const show=(dir,spec)=>{const r=git(dir,['show',spec],{allowFail:true});return r.status===0?r.stdout:null};

// The block edits one commit made: [{file,id,before,after}], or null if it
// changed anything outside marked blocks.
function blockChanges(dir,sha){
  const files=git(dir,['diff-tree','--no-commit-id','--name-only','-r',sha]).split('\n').filter(Boolean);
  const changes=[];
  for(const file of files){
    const old=show(dir,`${sha}^:${file}`),neu=show(dir,`${sha}:${file}`);
    if(old===null||neu===null)return null;
    const a=blockMap(old),b=blockMap(neu);
    if([...a.keys()].join()!==[...b.keys()].join())return null;
    let rebuilt=old;
    for(const [id,before] of a){
      const after=b.get(id);
      if(after===before)continue;
      changes.push({file,id,before,after});
      rebuilt=setBlock(rebuilt,id,after);
    }
    if(rebuilt!==neu)return null;
  }
  return changes;
}

// Apply block edits to the working files. A block that no longer holds the
// expected text is a conflict and nothing is written.
function applyChanges(dir,changes,reverse=false){
  const files=new Map();
  for(const c of changes){
    const [from,to]=reverse?[c.after,c.before]:[c.before,c.after];
    if(!files.has(c.file))files.set(c.file,fs.readFileSync(path.join(dir,c.file),'utf8'));
    const src=files.get(c.file),current=blockMap(src).get(c.id);
    if(current===to)continue;
    if(current!==from)return {ok:false,files:[c.file]};
    files.set(c.file,setBlock(src,c.id,to));
  }
  let changed=false;
  for(const [file,src] of files){
    const p=path.join(dir,file);
    if(fs.readFileSync(p,'utf8')!==src){fs.writeFileSync(p,src);changed=true}
  }
  return {ok:true,changed,files:[...files.keys()]};
}

// Rebuild the drafts on top of the latest base, one block edit at a time.
// The drafts branch never leaves this machine before publishing, so moving it
// is safe; a backup ref keeps the old drafts until the replay succeeds.
function replay({dir,base}){
  const commits=log(dir,`${remoteBase(base)}..${BRANCH}`).reverse();
  const plans=commits.map(c=>({...c,changes:blockChanges(dir,c.sha),body:git(dir,['log','-1','--format=%b',c.sha])}));
  if(plans.some(p=>!p.changes))return {ok:false,files:[]};
  const backup=git(dir,['rev-parse','HEAD']);
  git(dir,['update-ref','refs/editor/backup',backup]);
  git(dir,['reset','--quiet','--hard',remoteBase(base)]);
  for(const p of plans){
    const r=applyChanges(dir,p.changes);
    if(!r.ok){git(dir,['reset','--quiet','--hard',backup]);return {ok:false,files:r.files}}
    if(!r.changed)continue;
    git(dir,['add','--',...r.files]);
    git(dir,['commit','--quiet','-m',p.subject,...(p.body.trim()?['-m',p.body.trim()]:[])]);
  }
  return {ok:true};
}

function log(dir,range,limit){
  const out=git(dir,['log','--no-merges',...(limit?[`-n${limit}`]:[]),'--format=%H%x1f%cI%x1f%s',range]);
  return out?out.split('\n').map(l=>{const [sha,date,subject]=l.split('\x1f');return {sha,date,subject}}):[];
}

// Commits on the drafts branch that are not on the publish base yet.
const drafts=({dir,base})=>log(dir,`${remoteBase(base)}..${BRANCH}`);

function history({dir,base,limit=40}){
  const pending=new Set(drafts({dir,base}).map(c=>c.sha));
  return log(dir,BRANCH,400).filter(c=>SUBJECT.test(c.subject)).slice(0,limit).map(c=>({...c,published:!pending.has(c.sha)}));
}

function commit(dir,files,subject){
  git(dir,['add','--',...files]);
  git(dir,['commit','--quiet','-m',subject,'-m','Saved with the portfolio editor (#617).']);
  return git(dir,['rev-parse','HEAD']);
}

// Undo one earlier save with a new commit. Only editor commits can be undone.
function restore({dir,base,sha}){
  const target=history({dir,base,limit:400}).find(c=>c.sha===sha);
  if(!target)return {ok:false,message:'That change isn’t in the editor’s history.'};
  if(isDirty(dir)||busy(dir))return {ok:false,message:'The drafts folder has unfinished changes. Ask Claude to look at it.'};
  const changes=blockChanges(dir,sha);
  const later='A later change edited the same text, so this can’t be undone automatically. Edit the text directly instead.';
  if(!changes)return {ok:false,message:later};
  const r=applyChanges(dir,changes,true);
  if(!r.ok)return {ok:false,message:later};
  if(!r.changed)return {ok:false,message:'That change is already undone.'};
  const label=target.subject.replace(SUBJECT,'');
  return {ok:true,sha:commit(dir,r.files,`Restore: undo ${label}`.slice(0,120))};
}

// Send drafts to the publish base: sync, run the portfolio checks, then a
// fast-forward push. Refuses rather than overwriting anything.
function publish({dir,base,runChecks}){
  const s=sync({dir,base});
  if(!s.ok||s.offline)return {ok:false,...s,message:s.offline?'Couldn’t reach GitHub, so nothing was published.':s.message};
  const pending=drafts({dir,base});
  if(!pending.length)return {ok:false,message:'There are no drafts to publish.'};
  const checks=runChecks(dir);
  if(!checks.ok)return {ok:false,checksFailed:true,output:checks.output,message:'The site checks failed, so nothing was published. Ask Claude to look at the result.'};
  const r=git(dir,['push','origin',`${BRANCH}:${base}`],{allowFail:true});
  if(r.status!==0){
    const moved=/non-fast-forward|fetch first|rejected/.test(r.stderr);
    return {ok:false,message:moved?'The site changed on GitHub while publishing. Nothing was overwritten. Click Publish again.':`GitHub refused the publish: ${r.stderr.trim().split('\n').pop()}`};
  }
  git(dir,['fetch','origin',base],{allowFail:true});
  return {ok:true,published:pending.length};
}

module.exports={BRANCH,GitError,git,ensureClone,sync,drafts,history,commit,restore,publish,isDirty};
