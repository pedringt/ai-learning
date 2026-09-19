const assert = require('assert');
const H = require('./state-product-health.js');

(async()=>{
  let pass=0;
  async function check(name,fn){try{await fn();pass++;console.log('✓',name)}catch(error){console.error('✗',name);throw error}}

  await check('only the first timeout is eligible for automatic retry',()=>{
    const error=new Error('This is taking longer than expected.');error.isTimeout=true;
    assert.equal(H.shouldRetry(error,0),true);
    assert.equal(H.shouldRetry(error,1),false);
    assert.equal(H.shouldRetry(new Error('API error 500'),0),false);
  });

  await check('startup helper retries once after a timeout',async()=>{
    let calls=0,retries=0;
    const value=await H.withStartupRetry(async()=>{calls++;if(calls===1){const e=new Error('slow');e.isTimeout=true;throw e;}return 'ready';},()=>retries++);
    assert.equal(value,'ready');assert.equal(calls,2);assert.equal(retries,1);
  });

  await check('startup helper does not loop on a second timeout',async()=>{
    let calls=0;
    try{await H.withStartupRetry(async()=>{calls++;const e=new Error('slow');e.isTimeout=true;throw e;});assert.fail('expected error');}
    catch(error){assert.equal(calls,2);}
  });

  await check('project registry keeps all projects after scoped responses',()=>{
    const all=[{id:'northstar',name:'Northstar'},{id:'juniper-office-move',name:'Juniper Office Move'}];
    const scoped=[{id:'northstar',name:'Northstar'}];
    const merged=H.mergeProjectRegistry(all,scoped);
    assert.deepEqual(merged.map(project=>project.id).sort(),['juniper-office-move','northstar']);
  });

  await check('project registry can build from scoped-first then all-project response',()=>{
    const scoped=[{id:'northstar',name:'Northstar'}];
    const all=[{id:'northstar',name:'Northstar'},{id:'juniper-office-move',name:'Juniper Office Move'}];
    const merged=H.mergeProjectRegistry(H.mergeProjectRegistry([],scoped),all);
    assert.deepEqual(merged.map(project=>project.id).sort(),['juniper-office-move','northstar']);
  });

  await check('analytics API base prefers shared runtime configuration',()=>{
    assert.equal(H.apiBase({STATE_API_BASE:'https://configured.example/'}),'https://configured.example');
    assert.equal(H.apiBase({location:{hostname:'preview-git-staging.example'}}),'https://state-api-staging.onrender.com');
    assert.equal(H.apiBase({location:{hostname:'example.com'}}),'https://state-api-6waw.onrender.com');
  });

  await check('dashboard payload content minimizer rejects project-content fields',()=>{
    assert.equal(H.contentFree({overview:{demo_sessions_30d:2},usage:{ask_completed_30d:1}}),true);
    assert.equal(H.contentFree({review:{decision_question:'Should we launch?'}}),false);
    assert.equal(H.contentFree({history:{new_statement:'Secret'}}),false);
    assert.equal(H.contentFree({ask_query:'Secret'}),false);
  });

  await check('formatters keep missing telemetry visibly missing',()=>{
    assert.equal(H.hoursLabel(null),'Not enough data');
    assert.equal(H.latencyLabel(null),'Not enough data');
    assert.equal(H.hoursLabel(36),'1.5d');
    assert.equal(H.latencyLabel(4200),'4.2s');
  });

  await check('quality summary exposes only aggregate Review and controlled-eval metrics',()=>{
    const summary=H.qualitySummary({
      live_review_quality:{resolved_reviews:10,accepted_as_proposed_rate:.5,material_edit_rate:.2,rejection_or_not_applied_rate:.1},
      controlled_evals:{
        latest_review_interpretation:{interpretation_accuracy:.8},
        latest_ask_quality:{ask_grounding:.9},
        recent:[{suite:'ask_quality',ask_grounding:.9}],
      },
    });
    assert.equal(summary.resolvedReviews,10);
    assert.equal(summary.acceptedAsProposedRate,.5);
    assert.equal(summary.materialEditRate,.2);
    assert.equal(summary.latestReview.interpretation_accuracy,.8);
    assert.equal(summary.latestAsk.ask_grounding,.9);
    assert.equal(summary.recent.length,1);
    assert.equal(H.contentFree(summary),true);
  });

  // --- #225: the original eval panel must not claim there are no controlled evals ---
  const helpers={
    esc:v=>String(v??''),
    metric:(v,label)=>`[${v}|${label}]`,
    pct:v=>v==null?'Not measured':`${Math.round(Number(v)*1000)/10}%`,
    empty:t=>`<div class="empty">${t}</div>`,
  };

  await check('empty consequentiality panel describes only that suite, not all controlled evals',()=>{
    const html=H.consequentialityEvalMarkup(null,helpers);
    assert.match(html,/Controlled consequentiality eval/);
    assert.match(html,/No consequentiality eval has been recorded yet/);
    assert.match(html,/ingested without storing test-case content/);
    assert.doesNotMatch(html,/No controlled eval run/);
  });

  await check('recorded consequentiality run renders its metrics and a plain build label',()=>{
    const html=H.consequentialityEvalMarkup({run_kind:'controlled_eval',suite:'consequentiality',recall:1,precision:.5,build:'local',provider:'anthropic'},helpers);
    assert.match(html,/Consequential-change recall/);
    assert.match(html,/Build: local run/);
    assert.doesNotMatch(html,/No consequentiality eval/);
  });

  // --- #226: run history, build wording, and single-run variance ---
  await check('build label says "local run" and never shows a bare "unknown"',()=>{
    assert.equal(H.buildLabel('local'),'local run');
    assert.equal(H.buildLabel('473e098be6c4'),'473e098be6c4');
    assert.equal(H.buildLabel(null),'unknown build');
    assert.equal(H.buildLabel('unknown'),'unknown build');
  });

  await check('run time label is a fixed-format UTC string for SQLite and ISO timestamps',()=>{
    assert.equal(H.runTimeLabel('2026-09-19 17:51:01'),'2026-09-19 17:51 UTC');
    assert.equal(H.runTimeLabel('2026-09-19T17:51:01Z'),'2026-09-19 17:51 UTC');
    assert.equal(H.runTimeLabel(null),'');
    assert.equal(H.runTimeLabel('not a date'),'');
  });

  await check('recent run label carries suite, model, build and time',()=>{
    const label=H.recentRunLabel({suite:'review_interpretation',model_identifier:'claude-haiku-4-5-20251001',build:'local',created_at:'2026-09-19 17:51:01'});
    assert.equal(label,'review interpretation · claude-haiku-4-5-20251001 · local run · 2026-09-19 17:51 UTC');
    assert.equal(H.recentRunLabel({suite:'ask_quality'}),'ask quality · unknown build');
  });

  await check('recent run parts keep the time separate so the date never wraps mid-value',()=>{
    const parts=H.recentRunParts({suite:'ask_quality',model_identifier:'claude-haiku-4-5-20251001',build:'local',created_at:'2026-09-19 18:24:01'});
    assert.equal(parts.title,'ask quality · claude-haiku-4-5-20251001 · local run');
    assert.equal(parts.when,'2026-09-19 18:24 UTC');
    assert.equal(H.recentRunParts({suite:'ask_quality'}).when,'');
  });

  await check('metric range needs at least two runs of the same suite',()=>{
    const runs=[
      {suite:'review_interpretation',interpretation_accuracy:.875},
      {suite:'ask_quality',overall_pass_rate:.5},
      {suite:'review_interpretation',interpretation_accuracy:.75},
      {suite:'review_interpretation',interpretation_accuracy:null},
    ];
    assert.deepEqual(H.metricRange(runs,'review_interpretation','interpretation_accuracy'),{min:.75,max:.875,count:2});
    assert.equal(H.metricRange(runs,'ask_quality','overall_pass_rate'),null);
    assert.equal(H.metricRange([],'ask_quality','overall_pass_rate'),null);
    assert.equal(H.metricRange(undefined,'ask_quality','overall_pass_rate'),null);
  });

  console.log(`\n${pass} passed, 0 failed`);
})().catch(()=>process.exit(1));
