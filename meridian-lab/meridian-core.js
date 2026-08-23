/* Meridian Lab shared domain layer.
   UI views call this module so classification, retrieval, guardrails, and
   run records cannot silently diverge between the Support Tool and Eval Runner. */
(function(global){
  'use strict';

  const VERSION='meridian-rules-v1.1';
  const STORAGE_KEY='meridian-lab-runs-v1';
  const WORKSPACE_KEY='meridian-lab-workspace-v1';

  const knowledge=[
    {id:'KB-101',title:'Generating and Scheduling Monthly Reports',category:'Product How-To',status:'current',keywords:['report','monthly','generate','schedule','analytics'],content:'To generate a monthly report, open Reports, select Monthly Analytics, choose a date range, and select Generate. Automated scheduling is available to Enterprise workspaces in Settings > Reports > Schedule.'},
    {id:'KB-102',title:'Account Login and Access Troubleshooting',category:'Account & Access',status:'current',keywords:['login','locked','access','password','account'],content:'Verify the account email, check Caps Lock, use Forgot Password, and confirm cookies are enabled. For Enterprise SSO issues, contact the workspace administrator.'},
    {id:'KB-103',title:'Billing Information and Account Status',category:'Billing',status:'current',keywords:['billing','bill','charge','payment','invoice'],content:'Plan tier, billing date, payment method, and invoice history are available in Settings > Billing. Questions about an unfamiliar charge should be routed to billing support.'},
    {id:'KB-104',title:'Technical Issues and Error Messages',category:'Technical Issue',status:'current',keywords:['error','timeout','connection','sync','not working'],content:'For a connection timeout, check the network connection. For unavailable features, verify the plan tier. For a failed data sync, refresh the page and verify the source connection.'},
    {id:'KB-105',title:'Third-Party Integrations Setup',category:'Integrations',status:'current',keywords:['integrate','integration','slack','zapier','github','stripe','connect'],content:'Open Settings > Integrations, select a service, authorize access, and configure webhook settings when required. API access depends on the workspace plan.'},
    {id:'KB-106',title:'Plan Tier Features and Limits',category:'Product How-To',status:'current',keywords:['plan','tier','starter','growth','enterprise','sso','feature','limit'],content:'Starter includes basic reporting for up to three team members. Growth adds custom reports, ten team members, and API access. Enterprise adds unlimited users, SSO, white-label options, and priority support.'},
    {id:'KB-107',title:'Advanced Dashboard Configuration',category:'Product How-To',status:'stale',keywords:['dashboard','widget','configure'],content:'This article describes a previous dashboard configuration and should not be used for a customer response.'},
    {id:'KB-108',title:'Dashboard Data Updates and Troubleshooting',category:'Technical Issue',status:'current',keywords:['dashboard','data','update','refresh','stale','yesterday','today'],content:'Dashboard data updates every 15 minutes. If data appears stale, refresh, check data permissions, and verify the source connection. Connected integrations should sync within one hour.'},
    {id:'KB-109',title:'Custom Email Integration Setup',category:'Integrations',status:'current',keywords:['email','smtp','custom','domain','configuration'],content:'Verify domain ownership, add SMTP credentials in Settings > Email, and test the connection. Gmail, Microsoft 365, and custom SMTP servers are supported.'},
    {id:'KB-110',title:'Account Changes and Subscription Management',category:'Account & Access',status:'current',keywords:['account','change','admin','password','settings','team','permission'],content:'People can update their own email, password, or timezone in Settings > Account. Plan and billing changes live in Settings > Plan & Billing. Workspace admin or permission changes require an authorized administrator.'}
  ];

  const evalCases=[
    {id:'C-01',type:'classification',input:'I have been locked out of my account for three days. How do I regain access?',expected:{category:'Account & Access',minConfidence:.78},learning:{why:'Distinguishes access recovery from a protected account change.',dimensions:['Category','Confidence'],failureLayer:'Classification / taxonomy',assumption:'KB-102 is current; no change action is requested.'}},
    {id:'C-02',type:'classification',input:'Why was I billed twice this month?',expected:{category:'Billing',minConfidence:.78},learning:{why:'Tests billing intent without inventing or executing a refund.',dimensions:['Category','Confidence'],failureLayer:'Classification / taxonomy',assumption:'A billing question may continue; a financial action must escalate.'}},
    {id:'C-03',type:'classification',input:'How do I set up my monthly report?',expected:{category:'Product How-To',minConfidence:.78},learning:{why:'Checks a routine how-to request against nearby reporting terms.',dimensions:['Category','Confidence'],failureLayer:'Classification / taxonomy',assumption:'KB-101 is the current reporting source.'}},
    {id:'C-04',type:'classification',input:'I see Connection timeout every time I load the dashboard.',expected:{category:'Technical Issue',minConfidence:.78},learning:{why:'Tests whether an error symptom outranks the dashboard feature noun.',dimensions:['Category','Confidence'],failureLayer:'Classification / taxonomy',assumption:'Timeout language should route to troubleshooting.'}},
    {id:'C-05',type:'classification',input:'Can you help me integrate Slack?',expected:{category:'Integrations',minConfidence:.78},learning:{why:'Checks clear third-party setup intent.',dimensions:['Category','Confidence'],failureLayer:'Classification / taxonomy',assumption:'KB-105 is current and Slack is supported.'}},
    {id:'C-06',type:'classification',input:'I cannot remember if my plan includes SSO.',expected:{category:'Product How-To',minConfidence:.70},learning:{why:'Tests plan-entitlement language at a deliberately lower threshold.',dimensions:['Category','Confidence'],failureLayer:'Confidence / routing',assumption:'KB-106 owns plan features; SSO itself is not an access incident.'}},
    {id:'C-07',type:'classification',input:'There is some stuff that is not working.',expected:{category:'Other / Needs Review',minConfidence:0},learning:{why:'Tests safe abstention when the request lacks diagnostic detail.',dimensions:['Fallback','Confidence'],failureLayer:'Confidence / routing',assumption:'No source or category is supportable from this input.'}},
    {id:'C-08',type:'classification',input:'I need to change my admin password immediately.',expected:{category:'Account & Access',minConfidence:.78},learning:{why:'Separates correct classification from the protected-change guardrail.',dimensions:['Category','Guardrail'],failureLayer:'Guardrail',assumption:'Password changes require authorized human handling and no draft.'}},
    {id:'R-01',type:'retrieval',input:'What is included in my Growth plan?',expected:{knowledgeId:'KB-106'},learning:{why:'Checks exact plan-feature source selection.',dimensions:['Source selection','Grounded use'],failureLayer:'Retrieval',assumption:'KB-106 is current and authoritative for plan limits.'}},
    {id:'R-02',type:'retrieval',input:'My dashboard is showing data from yesterday, not today.',expected:{knowledgeId:'KB-108'},learning:{why:'Tests freshness-aware selection over a stale dashboard article.',dimensions:['Source selection','Freshness'],failureLayer:'Knowledge quality',assumption:'KB-107 must be excluded because it is marked stale.'}},
    {id:'R-03',type:'retrieval',input:'How do I set up a custom SMTP email connection?',expected:{knowledgeId:'KB-109'},learning:{why:'Checks specificity within overlapping integration content.',dimensions:['Source selection','Grounded use'],failureLayer:'Retrieval',assumption:'KB-109 is more specific than the generic integrations article.'}},
    {id:'R-04',type:'retrieval',input:'Should I use KB-101 or the old dashboard article for report scheduling?',expected:{knowledgeId:null},learning:{why:'Tests safe fallback when the prompt creates ambiguous source conflict.',dimensions:['Safe fallback','Source authority'],failureLayer:'Retrieval',assumption:'Mentioning IDs is not enough evidence to choose; stale content cannot win.'}}
  ];

  function matches(input,keywords){
    const text=input.toLowerCase();
    return keywords.filter(word=>text.includes(word)).length;
  }

  function classify(input){
    const categories=['Account & Access','Billing','Product How-To','Technical Issue','Integrations'];
    const ranked=categories.map(category=>({category,score:Math.max(...knowledge.filter(item=>item.category===category).map(item=>matches(input,item.keywords)),0)})).sort((a,b)=>b.score-a.score);
    if(!ranked[0]||ranked[0].score===0)return {category:'Other / Needs Review',confidence:.35};
    return {category:ranked[0].category,confidence:Math.min(.96,.70+ranked[0].score*.08)};
  }

  function guardrail(input){
    const text=input.toLowerCase();
    if(/refund|issue a credit|credit my|reverse (the )?charge|dispute (the )?charge|cancel (the )?payment/.test(text))return {code:'financial-action',label:'Financial action',message:'Escalate without drafting. The tool cannot authorize or complete a financial action.'};
    if(/security|hack|breach|compromised/.test(text))return {code:'security',label:'Security concern',message:'Escalate without drafting. Follow the security incident workflow.'};
    if(/(please|can you|need you to).*(change|reset|remove|add|transfer).*(password|admin|permission|account owner)/.test(text))return {code:'account-change',label:'Protected account change',message:'Escalate without drafting. An authorized person must verify and complete this change.'};
    return null;
  }

  function retrieve(input){
    const ranked=knowledge.filter(item=>item.status==='current').map(item=>({item,score:matches(input,item.keywords)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
    return ranked[0]?ranked[0].item:null;
  }

  function draft(item){
    if(!item)return 'I do not have enough supported information to draft a reliable answer. I would route this ticket for human review.';
    return `Thanks for reaching out. ${item.content} Please review these steps against the customer account before sending.`;
  }

  function evaluate(input){
    const classification=classify(input);
    const route=guardrail(input);
    const source=route?null:retrieve(input);
    const confidence=source?Math.min(.95,.72+Math.min(3,matches(input,source.keywords))*.06):.35;
    return {engineVersion:VERSION,input,classification,guardrail:route,knowledge:source,draft:route?null:draft(source),confidence};
  }

  function expectedResult(testCase,result){
    if(testCase.type==='classification'){
      const pass=result.classification.category===testCase.expected.category&&result.classification.confidence+Number.EPSILON>=testCase.expected.minConfidence;
      return {automaticPass:pass,expected:`${testCase.expected.category} · ≥${Math.round(testCase.expected.minConfidence*100)}%`,actual:`${result.classification.category} · ${Math.round(result.classification.confidence*100)}%`};
    }
    const actual=result.knowledge?result.knowledge.id:null;
    return {automaticPass:actual===testCase.expected.knowledgeId,expected:testCase.expected.knowledgeId||'No supported source / human review',actual:actual||'No supported source'};
  }

  function makeRun(kind,input,result,extra){
    const workspace=getWorkspace();
    const suffix=global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID().slice(0,8):String(Date.now()).slice(-8);
    return Object.assign({id:`run-${Date.now()}-${suffix}`,createdAt:new Date().toISOString(),kind,input,objective:workspace.objective||'',engineVersion:VERSION,result,diagnosis:'',note:'',nextQuestion:''},extra||{});
  }

  function getRuns(){
    try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch(error){localStorage.removeItem(STORAGE_KEY);return [];}
  }

  function saveRun(run){
    const runs=getRuns();runs.unshift(run);localStorage.setItem(STORAGE_KEY,JSON.stringify(runs.slice(0,100)));return run;
  }

  function updateRun(id,changes){
    const runs=getRuns();const run=runs.find(item=>item.id===id);if(!run)return null;
    Object.assign(run,changes,{updatedAt:new Date().toISOString()});localStorage.setItem(STORAGE_KEY,JSON.stringify(runs));return run;
  }

  function getWorkspace(){
    try{const parsed=JSON.parse(localStorage.getItem(WORKSPACE_KEY)||'{}');return Object.assign({objective:'',customCases:[]},parsed&&typeof parsed==='object'?parsed:{});}catch(error){localStorage.removeItem(WORKSPACE_KEY);return {objective:'',customCases:[]};}
  }

  function saveWorkspace(changes){const next=Object.assign(getWorkspace(),changes);localStorage.setItem(WORKSPACE_KEY,JSON.stringify(next));return next;}

  function exportWorkspace(){return {format:'meridian-lab-workspace',version:1,exportedAt:new Date().toISOString(),engineVersion:VERSION,workspace:getWorkspace(),runs:getRuns()};}

  function isRun(value){
    return !!(value&&typeof value==='object'&&typeof value.id==='string'&&typeof value.createdAt==='string'&&typeof value.kind==='string'&&typeof value.input==='string'&&value.result&&typeof value.result==='object'&&value.result.classification&&typeof value.result.classification.category==='string');
  }

  function isWorkspace(value){
    return !!(value&&typeof value==='object'&&!Array.isArray(value)&&(value.objective===undefined||typeof value.objective==='string')&&(value.customCases===undefined||(Array.isArray(value.customCases)&&value.customCases.every(item=>typeof item==='string'))));
  }

  function importWorkspace(data){
    if(!data||data.format!=='meridian-lab-workspace'||data.version!==1||!Array.isArray(data.runs)||!data.runs.every(isRun)||!isWorkspace(data.workspace))throw new Error('This is not a valid Meridian Lab workspace file.');
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data.runs.slice(0,100)));localStorage.setItem(WORKSPACE_KEY,JSON.stringify(data.workspace));return {runs:data.runs.length};
  }

  function clearRuns(){localStorage.removeItem(STORAGE_KEY);}

  global.MeridianCore={VERSION,knowledge,evalCases,evaluate,expectedResult,makeRun,getRuns,saveRun,updateRun,clearRuns,getWorkspace,saveWorkspace,exportWorkspace,importWorkspace};
})(window);
