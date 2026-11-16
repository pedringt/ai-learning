// DEC-025 (Nov 15): shared investigation records with outcomes Paige records, nothing closing on its own, and
// project-specific next decisions. No model calls, no network.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const M=require('../project-health-model.js');
const proxy=require('../api/project-health-investigations.js')._test;
const investigate=require('../api/project-health-investigate.js')._test;

let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log('✓',name);}catch(error){fail++;console.error('✗',name,'\n ',error.message);}}

const RECORD={id:'phinv_0123456789abcdef',project:'state',trigger:'AI eval failure · review_direct_reversal',summary:'Latest Update understanding run (build 42db6a9) failed 1 scenario: review_direct_reversal',
  evidence:['Update understanding eval run'],outcome:null,outcomeNote:'',outcomeAt:null,createdAt:'2026-11-09 23:40:00.000000',lastSeenAt:'2026-11-09 23:40:00.000000'};
const project=id=>M.PROJECTS.find(p=>p.id===id);
// A project with every core signal healthy, so overallAttention reads good.
const healthyTastemake=history=>({...M.emptyProjectData(project('tastemake')),fresh:true,
  delivery:{vercel:{kind:'good'}},externalQuality:{attention:[{kind:'good',title:'Healthy'}]},
  activity:{available:true,deployments:{recent_failures:[]},runtime:{available:true,issues:[]}},
  platform:{analytics:{configured:true,available:true},aiTelemetry:{configured:true,available:true}},investigationHistory:history});

function fakeRes(){return {headers:{},code:null,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};}
function fakeFetch(respond){const calls=[];const impl=async(url,options)=>{calls.push({url:String(url),options});return respond(String(url),options);};impl.calls=calls;return impl;}
const ok=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

(async()=>{
  // ---- Model ----
  await check('four outcomes; Accepted limitation and Resolved close a record',()=>{
    assert.deepStrictEqual(Object.values(M.INVESTIGATION_OUTCOMES),['Awaiting evidence','Investigating','Accepted limitation','Resolved']);
    assert.ok(M.investigationIsOpen({outcome:null}));
    assert.ok(M.investigationIsOpen({outcome:'awaiting_evidence'}));
    assert.ok(M.investigationIsOpen({outcome:'investigating'}));
    assert.ok(!M.investigationIsOpen({outcome:'accepted_limitation'}));
    assert.ok(!M.investigationIsOpen({outcome:'resolved'}));
  });
  await check('a record maps to a history row with its outcome',()=>{
    const row=M.investigationRecordRow(RECORD);
    assert.strictEqual(row.observedAt,RECORD.createdAt);
    assert.strictEqual(row.outcome,null);
    assert.deepStrictEqual(row.evidence,RECORD.evidence);
  });
  await check('nothing closes on its own: an open record on a Healthy project asks for an outcome',()=>{
    const row=M.investigationRecordRow({...RECORD,project:'tastemake'});
    const data=healthyTastemake([row]);
    assert.strictEqual(M.overallAttention(data).kind,'good');
    assert.strictEqual(M.investigationOutcomeText(row,data),'no outcome recorded yet · Project now reads Healthy: record an outcome');
    const signal=M.operationalSignals(data).find(item=>item.label==='Open investigation');
    assert.ok(signal,'the record stays open');
    assert.match(signal.detail,/Project now reads Healthy: record an outcome\.$/);
    const resolved={...row,outcome:'resolved',outcomeAt:'2026-11-10 08:00:00.000000'};
    assert.strictEqual(M.investigationOutcomeText(resolved,healthyTastemake([resolved])),'Resolved');
    assert.ok(!M.operationalSignals(healthyTastemake([resolved])).some(item=>item.label==='Open investigation'));
  });
  await check('the Releases timeline shows a recorded outcome as its own event, and never infers one',()=>{
    const open=M.investigationRecordRow(RECORD);
    const items=M.activityTimelineItems({...M.emptyProjectData(project('state')),investigationHistory:[open]});
    assert.ok(items.some(item=>item.title===RECORD.trigger));
    assert.ok(!items.some(item=>/outcome|resolved/i.test(item.title)));
    const closed={...open,outcome:'accepted_limitation',outcomeNote:'Known wording gap',outcomeAt:'2026-11-10 08:00:00.000000'};
    const event=M.activityTimelineItems({...M.emptyProjectData(project('state')),investigationHistory:[closed]}).find(item=>/^Investigation outcome/.test(item.title));
    assert.strictEqual(event.title,'Investigation outcome: Accepted limitation');
    assert.strictEqual(event.detail,RECORD.trigger+' · Known wording gap');
  });
  await check('next decision: a warning\'s own action, and the project\'s own text when calm',()=>{
    const narc={...M.emptyProjectData(project('narc')),fresh:true,delivery:{vercel:{kind:'good'}},
      externalQuality:{attention:[{kind:'warn',title:'Full first-run playtest still pending',nextAction:'Complete the ~15-minute first-run playtest and record confusing choices, broken transitions and whether the ending makes sense.'}]}};
    assert.match(M.operationalNextDecision(narc),/^Complete the ~15-minute first-run playtest/);
    const noAction={...narc,externalQuality:{attention:[{kind:'warn',title:'Something new'}]}};
    assert.strictEqual(M.operationalNextDecision(noAction),'Decide whether the watched quality signal needs action before expanding scope.');
    const calm={...narc,externalQuality:{attention:[{kind:'good',title:'Healthy'}]}};
    assert.strictEqual(M.operationalNextDecision(calm),project('narc').nextDecision);
    assert.strictEqual(M.operationalNextDecision({...calm,openPullRequests:[{number:12,title:'Open work'}]}),project('narc').nextDecision,'open pull requests do not replace it');
    assert.strictEqual(project('narc').nextDecision,'Decide whether the first-play flow is clear enough before adding more branches and mechanics.');
  });
  await check('every project-quality warning carries a next action',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..','api','project-health-project-quality.js'),'utf8');
    const flagged=source.match(/kind:'(?:warn|bad)',title:'[^']+'/g)||[];
    assert.ok(flagged.length>=9,'found '+flagged.length);
    for(const line of source.split('\n').filter(item=>/kind:'(?:warn|bad)',title:/.test(item)))assert.match(line,/nextAction:'[^']+'/,line.slice(0,120));
  });

  // ---- Vercel proxy ----
  await check('the proxy passes only well-formed records through',()=>{
    assert.deepStrictEqual(proxy.safeRecord(RECORD).id,RECORD.id);
    assert.strictEqual(proxy.safeRecord({...RECORD,id:'nope'}),null);
    assert.strictEqual(proxy.safeRecord({...RECORD,project:'other'}),null);
    assert.strictEqual(proxy.safeRecord({...RECORD,outcome:'fixed'}).outcome,null);
  });
  await check('a State eval request carries no text, only an optional scenario id',async()=>{
    const fetchImpl=fakeFetch(()=>ok(200,{created:true,record:RECORD}));
    const res=fakeRes();
    await proxy.handler({method:'POST',headers:{},body:{action:'state-eval',scenarioId:'review_direct_reversal',summary:'injected'}},res,{fetchImpl});
    assert.strictEqual(res.code,200);
    assert.match(fetchImpl.calls[0].url,/\/api\/project-health-investigations\/state-eval$/);
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[0].options.body),{scenario_id:'review_direct_reversal'});
    const bad=fakeRes();
    await proxy.handler({method:'POST',headers:{},body:{action:'state-eval',scenarioId:'<script>'}},bad,{fetchImpl});
    assert.strictEqual(bad.code,400);
  });
  await check('an outcome needs the decision key, which is passed through and never stored',async()=>{
    const fetchImpl=fakeFetch(()=>ok(200,{...RECORD,outcome:'resolved',outcomeAt:'2026-11-10 08:00:00.000000'}));
    const noKey=fakeRes();
    await proxy.handler({method:'POST',headers:{},body:{action:'outcome',id:RECORD.id,outcome:'resolved'}},noKey,{fetchImpl});
    assert.strictEqual(noKey.code,401);
    assert.strictEqual(fetchImpl.calls.length,0);
    const badOutcome=fakeRes();
    await proxy.handler({method:'POST',headers:{'x-project-health-decision-key':'k'},body:{action:'outcome',id:RECORD.id,outcome:'fixed'}},badOutcome,{fetchImpl});
    assert.strictEqual(badOutcome.code,400);
    const saved=fakeRes();
    await proxy.handler({method:'POST',headers:{'x-project-health-decision-key':'k'},body:{action:'outcome',id:RECORD.id,outcome:'resolved',note:'Fixed'}},saved,{fetchImpl});
    assert.strictEqual(saved.code,200);
    assert.strictEqual(saved.body.outcome,'resolved');
    assert.strictEqual(fetchImpl.calls[0].options.headers['X-Project-Health-Decision-Key'],'k');
    assert.match(fetchImpl.calls[0].url,new RegExp('/api/project-health-investigations/'+RECORD.id+'/outcome$'));
  });

  // ---- AI investigator ----
  await check('the investigator\'s record: redacted first report line, source names, one key per environment and signal',()=>{
    const p=investigate.PROJECTS.tastemake;
    const report='## Current assessment\n**The build failed** while compiling; token ghp_abcdefghijklmnopqrstuvwxyz0123 leaked\nMore detail';
    const record=investigate.investigationRecord(p,'staging','vercel',report,[{label:'Vercel deployment'},{label:'Related commit'},{label:'Vercel deployment'}]);
    assert.strictEqual(record.project,'tastemake');
    assert.strictEqual(record.problem_key,'staging:vercel');
    assert.strictEqual(record.trigger,'Deployment failure · staging');
    assert.strictEqual(record.summary,'The build failed while compiling; token [REDACTED_TOKEN] leaked');
    assert.deepStrictEqual(record.evidence,['Vercel deployment','Related commit']);
    assert.strictEqual(investigate.investigationRecord(p,'production','github-check','x',[]).trigger,'Failed release check');
  });
  await check('the investigator writes the record with the usage key, and a missing key skips it',async()=>{
    const fetchImpl=fakeFetch(()=>ok(200,{created:true,record:{id:RECORD.id}}));
    assert.strictEqual(await investigate.recordInvestigation({project:'state'},{fetchImpl,key:'',env:'production'}),null);
    assert.strictEqual(fetchImpl.calls.length,0);
    assert.strictEqual(await investigate.recordInvestigation({project:'state'},{fetchImpl,key:'usage',env:'production'}),RECORD.id);
    assert.match(fetchImpl.calls[0].url,/^https:\/\/state-api-6waw\.onrender\.com\/api\/admin\/project-health-investigations$/);
    assert.strictEqual(fetchImpl.calls[0].options.headers['X-Project-Health-Usage-Key'],'usage');
    const failing=fakeFetch(()=>{throw new Error('down');});
    assert.strictEqual(await investigate.recordInvestigation({project:'state'},{fetchImpl:failing,key:'usage',env:'preview'}),null,'a failed write never breaks the investigation');
  });

  // ---- Page ----
  await check('the page no longer keeps investigation history in the browser',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..','project-health.js'),'utf8');
    assert.doesNotMatch(source,/project-health-investigations:/);
    assert.doesNotMatch(source,/reconcileInvestigationHistory|resolvedAt/);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
