// Oct 12 (Cowork): State's delivery read "Unknown" because Project Health judged the newest State commit,
// and Vercel deploys only the last commit of a push, so that commit had no deploy status. Delivery now uses
// the newest release commit Vercel reported on, falling back to the newest when none has a status.
const path=require('path');
const api=require(path.join(__dirname,'..','api','project-health-github.js'));
const T=api._test;
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✓',name)}else{fail++;console.error('✗',name,detail)}}
const project=T.PROJECTS.state||Object.values(T.PROJECTS).find(p=>p.id==='state');
const commit=(sha,minutesAgo,message)=>({sha,commit:{message,committer:{date:new Date(Date.now()-minutesAgo*60000).toISOString()}}});
const vercel=state=>({state,statuses:[{context:'Vercel – state',state,description:'Deployment has completed'}]});

function fakeGh(statusBySha){
  const asked=[];
  const gh=async p=>{
    asked.push(p);
    if(/\/branches\//.test(p)) return {name:'main',commit:{sha:'tip'}};
    if(/\/commits\?sha=/.test(p)) return [commit('newest',1,'Make area identity project-scoped'),commit('deployed',2,'Docs for #136'),commit('older',30,'Earlier change')];
    const m=p.match(/\/commits\/([^/]+)\/status$/); if(m) return statusBySha[m[1]]||{state:'pending',statuses:[]};
    if(/check-runs/.test(p)) return {check_runs:[]};
    return null;
  };
  return {gh,asked};
}

(async()=>{
  check('a Vercel status counts as a deploy status',T.hasDeployStatus(vercel('success')));
  check('no statuses is not a deploy status',!T.hasDeployStatus({statuses:[]}));

  let f=fakeGh({deployed:vercel('success')});
  let picked=await T.newestDeployedCommit(f.gh,project.repo,[commit('newest',1,'x'),commit('deployed',2,'y')]);
  check('skips a commit Vercel never deployed and picks the newest one it did',picked&&picked.commit.sha==='deployed',picked&&picked.commit.sha);

  f=fakeGh({});
  picked=await T.newestDeployedCommit(f.gh,project.repo,[commit('a',1,'x'),commit('b',2,'y')]);
  check('returns nothing when no candidate has a deploy status (caller falls back to the newest)',picked===null);

  f=fakeGh({deployed:vercel('success')});
  const delivery=await T.loadDelivery(f.gh,project,'main');
  const statusCalls=f.asked.filter(p=>/\/status$/.test(p));
  check('delivery is judged on the deployed commit',f.asked.some(p=>p.includes('/commits/deployed/status')),statusCalls.join(' '));
  check('its status is fetched once, not twice',statusCalls.filter(p=>p.includes('/deployed/')).length===1,statusCalls.join(' '));
  check('delivery is not Unknown when the push tip has no status of its own',JSON.stringify(delivery).toLowerCase().indexOf('no vercel status found')===-1,JSON.stringify(delivery).slice(0,300));
  check('it looks back only a few commits',T.DEPLOY_STATUS_LOOKBACK<=4);

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
