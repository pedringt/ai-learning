const path=require('path');
const diagnostic=require(path.join(__dirname,'..','api','state-diagnostic.js'));

let pass=0,fail=0;
function check(name,ok,detail=''){
  if(ok){pass++;console.log('✓',name)}
  else{fail++;console.error('✗',name,detail)}
}

function response(payload,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return payload;},
    async text(){return JSON.stringify(payload);},
  };
}

async function main(){
  const calls=[];
  const payloads={
    '/api/bootstrap':{
      project:{id:'project-ai-notes',name:'AI Notes',seeded:false},
      state:[{id:'s1',statement:'The plan contains nine exercises.'}],
      evidence:[{id:'e1',content:'Nine-exercise learning plan',processing_status:'processed'}],
      open_reviews:[{id:'r-open'}],
      resolved_reviews:[{id:'r-done'}],
      history:[{id:'h1'}],
      questions:[{id:'q-open',status:'open'}],
      rules:[{id:'rule-1'}],
      drafts:[{id:'draft-private'}],
    },
    '/api/project-areas':{items:[{id:'learning',name:'Learning Plan'}]},
    '/api/questions?status=resolved':{items:[{id:'q-resolved',status:'resolved'}]},
    '/api/questions?status=stopped':{items:[{id:'q-stopped',status:'stopped'}]},
  };
  const fetchImpl=async(url,options={})=>{
    const parsed=new URL(url);
    calls.push({path:parsed.pathname+parsed.search,headers:options.headers||{}});
    return response(payloads[parsed.pathname+parsed.search]);
  };

  const result=await diagnostic.collectDiagnostic({
    projectId:'project-ai-notes',
    fetchImpl,
    apiBase:'https://state-api-staging.example',
  });

  check('diagnostic keeps selected project metadata',result.project.id==='project-ai-notes');
  check('diagnostic includes Evidence',result.evidence.length===1&&result.evidence[0].id==='e1');
  check('diagnostic keeps open and resolved Reviews separate',result.reviews.open[0].id==='r-open'&&result.reviews.resolved[0].id==='r-done');
  check('diagnostic includes Current State and project areas',result.current_state[0].id==='s1'&&result.project_areas[0].name==='Learning Plan');
  check('diagnostic includes every Question status',result.questions.open[0].id==='q-open'&&result.questions.resolved[0].id==='q-resolved'&&result.questions.stopped[0].id==='q-stopped');
  check('diagnostic includes History and rules',result.history[0].id==='h1'&&result.rules[0].id==='rule-1');
  check('private drafts are intentionally excluded from diagnostic export',!Object.prototype.hasOwnProperty.call(result,'drafts'));
  check('counts summarize the exported project',result.counts.evidence===1&&result.counts.current_state===1&&result.counts.resolved_questions===1);
  check('every upstream project read carries the selected project header',calls.length===4&&calls.every(call=>call.headers['X-State-Project-Id']==='project-ai-notes'),JSON.stringify(calls));

  const listedCalls=[];
  const projects=await diagnostic.listProjects({
    apiBase:'https://state-api-staging.example',
    fetchImpl:async(url,options={})=>{
      listedCalls.push({url,headers:options.headers||{}});
      return response({items:[{id:'project-ai-notes'},{id:'project-state'}],active:{id:'project-ai-notes'}});
    },
  });
  check('project discovery is available before choosing an id',projects.items.length===2&&projects.active.id==='project-ai-notes');
  check('project discovery does not invent a project-scoping header',Object.keys(listedCalls[0].headers).length===0);

  let missingId=false;
  try{await diagnostic.collectDiagnostic({fetchImpl,apiBase:'https://state-api-staging.example'});}catch(error){missingId=/projectId is required/.test(error.message);}
  check('project diagnostic requires an explicit project id',missingId);

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail>0) process.exit(1);
}

main().catch(error=>{console.error(error);process.exit(1);});
