// #627: the investigator called GitHub without its token, so it shared GitHub's 60-requests-an-hour anonymous limit
// across Vercel's egress; once hit, investigations failed with "Could not verify the current project branch."
const assert=require('assert');
const path=require('path');
const investigate=require(path.join(__dirname,'..','api','project-health-investigate.js'));
const {githubHeaders,fetchBranch,PROJECTS}=investigate._test;

(async()=>{
  const saved=process.env.GITHUB_TOKEN;
  try{
    delete process.env.GITHUB_TOKEN;
    assert.deepStrictEqual(githubHeaders(),{Accept:'application/vnd.github+json'},'no token: anonymous request');
    process.env.GITHUB_TOKEN='test-token';
    assert.strictEqual(githubHeaders().Authorization,'Bearer test-token','token set: authenticated request');

    const seen=[];const realFetch=global.fetch;
    global.fetch=async(url,options)=>{seen.push({url,auth:options?.headers?.Authorization});return {ok:true,status:200,json:async()=>({name:'main',commit:{sha:'abc1234'}})};};
    try{
      const project=Object.values(PROJECTS)[0];
      await fetchBranch(project,Object.keys(project.branches)[0]);
    }finally{global.fetch=realFetch;}
    const github=seen.filter(s=>String(s.url).startsWith('https://api.github.com/'));
    assert.ok(github.length>0,'fetchBranch called GitHub');
    assert.ok(github.every(s=>s.auth==='Bearer test-token'),'every GitHub call carried the token: '+JSON.stringify(github));
    console.log('Project Health GitHub auth tests passed');
  }finally{
    if(saved===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=saved;
  }
})().catch(error=>{console.error(error);process.exit(1);});
