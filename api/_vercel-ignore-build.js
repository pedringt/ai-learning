'use strict';
// The portfolio (`ai-learning`) Vercel project's Ignored Build Step (#627; root vercel.json runs `node` on this file).
// Exit 0 skips the build, exit 1 builds. It skips only when every file changed since the last deployed commit is one
// the site never serves; anything it cannot check builds.
//
// Why not `git diff`: the root .vercelignore allowlist starts with `/*`, which also removes `.git` before this step
// runs ("Removed 483 ignored files", Nov 8), so the git version never skipped. Re-including `.git` could publish the
// repository on the site, so this asks GitHub's compare API instead (unauthenticated, 60 requests an hour per IP).
// The leading underscore keeps this file from becoming a function.

const REPO='pedringt/ai-learning';
// Not served by the site (see .vercelignore). `*.md` only at the root: content/*.md is served.
const NOT_SERVED=/^((docs|state-project-complete|qa|scripts|tools|\.github)\/|[^/]*\.md$)/;
// GitHub lists at most 300 changed files; a longer list may hide a served one.
const MAX_FILES=300;

async function shouldSkip(previous,current,fetchImpl=fetch){
  if(!previous||!current||previous===current)return false;
  try{
    const response=await fetchImpl('https://api.github.com/repos/'+REPO+'/compare/'+previous+'...'+current,
      {headers:{Accept:'application/vnd.github+json','User-Agent':'vercel-ignore-build'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return false;
    const compare=await response.json();
    const files=Array.isArray(compare.files)?compare.files:[];
    // "ahead": the last deployed commit is in this push's history, so the file list is everything since it.
    return compare.status==='ahead'&&files.length>0&&files.length<MAX_FILES&&files.every(file=>NOT_SERVED.test(file.filename));
  }catch(_){return false;}
}

if(require.main===module){
  shouldSkip(process.env.VERCEL_GIT_PREVIOUS_SHA,process.env.VERCEL_GIT_COMMIT_SHA).then(skip=>{
    console.log(skip?'Only files the site does not serve changed: skipping the build.':'Building.');
    process.exit(skip?0:1);
  },()=>process.exit(1));
}

module.exports={shouldSkip,NOT_SERVED,MAX_FILES};
