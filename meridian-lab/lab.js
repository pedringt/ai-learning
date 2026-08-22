(function(){
  'use strict';
  const core=window.MeridianCore;
  const $=(selector,scope=document)=>scope.querySelector(selector);
  const $$=(selector,scope=document)=>Array.from(scope.querySelectorAll(selector));
  const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  let pendingParentRunId=null;

  function setTheme(){
    const button=$('#theme-toggle');
    const dark=document.body.classList.contains('v88-dark');
    button.textContent=dark?'☀':'☾';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  }
  const savedTheme=localStorage.getItem('ai-cs-theme');
  if(savedTheme==='dark'||(!savedTheme&&matchMedia('(prefers-color-scheme: dark)').matches))document.body.classList.add('v88-dark');
  setTheme();$('#theme-toggle').addEventListener('click',()=>{document.body.classList.toggle('v88-dark');localStorage.setItem('ai-cs-theme',document.body.classList.contains('v88-dark')?'dark':'light');setTheme();});
  const portfolioMenu=$('.portfolio-menu');
  document.addEventListener('click',event=>{if(portfolioMenu?.open&&!portfolioMenu.contains(event.target))portfolioMenu.removeAttribute('open');});

  function route(){
    const allowed=['support','evals','knowledge','history','dashboard'];
    const name=allowed.includes(location.hash.slice(1))?location.hash.slice(1):'support';
    $$('.view').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
    $$('.lab-nav a').forEach(link=>{const current=link.dataset.route===name;link.classList.toggle('current',current);current?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current');});
    if(name==='history')renderHistory();if(name==='dashboard')renderDashboard();if(name==='evals')renderEvalStats();
    document.title=`${({support:'Support Tool',evals:'Eval Runner',knowledge:'Knowledge Base',history:'Learning Log',dashboard:'Learning Dashboard'})[name]} · Meridian Lab`;
  }
  addEventListener('hashchange',route);route();

  function resultMarkup(result,options={}){
    const routeLabel=result.guardrail?result.guardrail.label:(result.knowledge?'Continue with human review':'Human review needed');
    const routeClass=result.guardrail?'risk':(result.knowledge?'good':'warn');
    return `<div class="result-route"><strong>${escape(routeLabel)}</strong><span class="badge ${routeClass}">${result.guardrail?'Escalate':'Review required'}</span></div>
      <div class="result-block"><span class="result-label">Classification</span><p>${escape(result.classification.category)} · ${Math.round(result.classification.confidence*100)}% confidence</p></div>
      <div class="result-block"><span class="result-label">Route / guardrail</span><p>${escape(result.guardrail?result.guardrail.message:'Continue to supported retrieval and a human-reviewed draft.')}</p></div>
      <div class="result-block"><span class="result-label">Retrieved source</span><p>${result.knowledge?`<span class="source-link">${escape(result.knowledge.id)}</span> · ${escape(result.knowledge.title)}`:'No source used'}</p></div>
      <div class="result-block"><span class="result-label">Draft preview</span><p class="draft">${escape(result.draft||'No draft created because the request requires escalation.')}</p></div>
      <div class="result-block"><span class="result-label">Pipeline</span><p>${escape(result.engineVersion)}${options.saved?' · Run saved locally':''}</p></div>`;
  }

  function learningReviewMarkup(run){
    const fieldId=escape(run.id);
    return `<div class="learning-review" data-review-run="${fieldId}"><div class="result-block"><span class="result-label">Learning review</span><p>Capture the likely cause and what you want to try next. You can revise this later in the Learning Log.</p></div><div class="review-grid"><div><label class="field-label" for="review-diagnosis-${fieldId}">Diagnosis</label><select class="review-diagnosis" id="review-diagnosis-${fieldId}"><option value="">Choose a failure area</option><option>Classification / taxonomy</option><option>Retrieval</option><option>Knowledge quality</option><option>Guardrail</option><option>Draft quality</option><option>Confidence / routing</option><option>Test-case problem</option><option>Needs investigation</option><option>No failure observed</option></select></div><div><label class="field-label" for="review-question-${fieldId}">Next question</label><input class="review-question" id="review-question-${fieldId}" type="text" placeholder="What should I test or change next?"></div><div class="wide"><label class="field-label" for="review-note-${fieldId}">Notes</label><textarea class="review-note" id="review-note-${fieldId}" placeholder="What did you notice? What evidence supports the diagnosis?"></textarea></div></div><div class="actions"><button class="btn save-review" type="button">Save learning note</button><span class="save-status" aria-live="polite"></span></div></div>`;
  }

  function bindLearningReview(scope){
    const review=$('[data-review-run]',scope);if(!review)return;
    $('.save-review',review).addEventListener('click',()=>{core.updateRun(review.dataset.reviewRun,{diagnosis:$('.review-diagnosis',review).value,note:$('.review-note',review).value.trim(),nextQuestion:$('.review-question',review).value.trim()});$('.save-status',review).textContent='Saved';renderEvalStats();});
  }

  function runSupport(){
    const input=$('#support-input');const error=$('#support-error');const text=input.value.trim();
    if(!text){error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
    error.hidden=true;input.removeAttribute('aria-invalid');const result=core.evaluate(text);const run=core.saveRun(core.makeRun('support',text,result));
    $('#support-empty').hidden=true;const target=$('#support-result');target.classList.remove('active');target.innerHTML=resultMarkup(result,{saved:true})+learningReviewMarkup(run);target.classList.add('active');bindLearningReview(target);$('#support-reset').hidden=false;$('#support-status').textContent=`Analysis updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. You can edit the ticket and analyze again, or start another ticket.`;
  }
  function resetSupport(){const input=$('#support-input');input.value='';input.removeAttribute('aria-invalid');$('#support-error').hidden=true;$('#support-result').classList.remove('active');$('#support-result').innerHTML='';$('#support-empty').hidden=false;$('#support-reset').hidden=true;$('#support-status').textContent='Ready for a new ticket.';input.focus();}
  $('#support-run').addEventListener('click',runSupport);$('#support-example').addEventListener('click',()=>{$('#support-input').value="My dashboard is showing yesterday's data. How do I refresh it?";$('#support-input').focus();});$('#support-reset').addEventListener('click',resetSupport);$('#support-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();runSupport();}});

  function runExploratory(){
    const input=$('#eval-freeform');const error=$('#eval-error');const text=input.value.trim();
    if(!text){error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
    error.hidden=true;input.removeAttribute('aria-invalid');const result=core.evaluate(text);const extra=pendingParentRunId?{parentRunId:pendingParentRunId}:{};const run=core.saveRun(core.makeRun('exploratory-eval',text,result,extra));pendingParentRunId=null;
    const target=$('#eval-freeform-result');target.innerHTML=resultMarkup(result,{saved:true})+learningReviewMarkup(run);target.classList.add('active');bindLearningReview(target);renderEvalStats();
  }
  $('#eval-freeform-run').addEventListener('click',runExploratory);

  function suiteRuns(){return core.getRuns().filter(run=>run.kind==='suite-eval');}
  function latestSuiteByCase(){const map={};suiteRuns().forEach(run=>{if(!map[run.caseId])map[run.caseId]=run;});return map;}
  function renderCases(){
    const latest=latestSuiteByCase();
    $('#case-grid').innerHTML=core.evalCases.map(item=>{const run=latest[item.id];const badge=run?`<span class="badge ${run.score==='pass'?'good':run.score==='fail'?'risk':'warn'}">${escape(run.score||'unscored')}</span>`:`<span class="badge">Not run</span>`;return `<button class="case-card" type="button" data-case="${item.id}"><div class="case-top"><span class="case-id">${item.id} · ${item.type}</span>${badge}</div><p>${escape(item.input)}</p></button>`;}).join('');
    $$('.case-card').forEach(button=>button.addEventListener('click',()=>runCase(button.dataset.case)));
  }
  function runCase(id){
    const item=core.evalCases.find(test=>test.id===id);const result=core.evaluate(item.input);const comparison=core.expectedResult(item,result);
    const extra={caseId:item.id,automaticPass:comparison.automaticPass,score:null};if(pendingParentRunId)extra.parentRunId=pendingParentRunId;const run=core.saveRun(core.makeRun('suite-eval',item.input,result,extra));pendingParentRunId=null;
    const target=$('#case-detail');target.dataset.runId=run.id;target.innerHTML=`<h3>${item.id} result</h3><p class="panel-intro">Automatic expectation check: <span class="badge ${comparison.automaticPass?'good':'risk'}">${comparison.automaticPass?'Matched':'Did not match'}</span></p><div class="comparison"><div><span class="result-label">Expected</span><strong>${escape(comparison.expected)}</strong></div><div><span class="result-label">Actual</span><strong>${escape(comparison.actual)}</strong></div></div>${resultMarkup(result)}<div class="score-row"><button class="btn" data-score="pass" type="button">Pass after review</button><button class="btn btn-danger" data-score="fail" type="button">Fail after review</button></div>${learningReviewMarkup(run)}`;target.classList.add('active');
    $$('.score-row button',target).forEach(button=>button.addEventListener('click',()=>scoreRun(run.id,button.dataset.score)));bindLearningReview(target);target.scrollIntoView({behavior:'smooth',block:'nearest'});renderCases();renderEvalStats();
  }
  function scoreRun(id,score){
    core.updateRun(id,{score});renderCases();renderEvalStats();
  }
  function renderEvalStats(){
    const latest=Object.values(latestSuiteByCase());const scored=latest.filter(run=>run.score);const passed=scored.filter(run=>run.score==='pass').length;const diagnosed=core.getRuns().filter(run=>run.diagnosis).length;
    $('#eval-stats').innerHTML=`<div class="stat"><span>Cases run</span><strong>${latest.length}/12</strong></div><div class="stat"><span>Human scored</span><strong>${scored.length}</strong></div><div class="stat"><span>Review pass</span><strong>${scored.length?Math.round(passed/scored.length*100)+'%':'—'}</strong></div><div class="stat"><span>Runs diagnosed</span><strong>${diagnosed}</strong></div>`;
  }
  renderCases();renderEvalStats();

  function renderSavedCases(){
    const cases=core.getWorkspace().customCases||[];$('#saved-cases').innerHTML=cases.length?`<span class="result-label">Saved practice cases</span>${cases.map((item,index)=>`<button class="saved-case" type="button" data-custom-case="${index}" title="${escape(item)}">${escape(item.slice(0,48))}${item.length>48?'…':''}</button>`).join('')}`:'';
    $$('[data-custom-case]').forEach(button=>button.addEventListener('click',()=>{$('#eval-freeform').value=cases[Number(button.dataset.customCase)];$('#eval-freeform').focus();}));
  }
  const workspace=core.getWorkspace();$('#session-objective').value=workspace.objective||'';renderSavedCases();
  $('#save-objective').addEventListener('click',()=>{core.saveWorkspace({objective:$('#session-objective').value.trim()});$('#objective-status').textContent='Saved for new runs';});
  $('#save-practice-case').addEventListener('click',()=>{const text=$('#eval-freeform').value.trim();if(!text){$('#eval-error').hidden=false;$('#eval-freeform').focus();return;}const current=core.getWorkspace();if(!current.customCases.includes(text))current.customCases.unshift(text);core.saveWorkspace({customCases:current.customCases.slice(0,30)});renderSavedCases();});

  function renderKnowledge(filter=''){
    const q=filter.trim().toLowerCase();const items=core.knowledge.filter(item=>!q||[item.id,item.title,item.category,item.content,item.status].join(' ').toLowerCase().includes(q));
    $('#kb-list').innerHTML=items.map(item=>`<article class="kb-item"><div class="kb-item-head"><div><h3>${escape(item.id)} · ${escape(item.title)}</h3><span class="badge">${escape(item.category)}</span></div><span class="badge ${item.status==='current'?'good':'risk'}">${escape(item.status)}</span></div><p>${escape(item.content)}</p></article>`).join('')||'<div class="empty-state"><strong>No matching articles</strong>Try a broader search.</div>';
  }
  $('#kb-search').addEventListener('input',event=>renderKnowledge(event.target.value));renderKnowledge();

  function renderHistory(){
    const runs=core.getRuns();$('#history-list').innerHTML=runs.length?runs.map(run=>{const fieldId=escape(run.id);return `<article class="history-item" data-history-item="${fieldId}"><div class="history-summary"><div><span class="badge">${escape(run.kind.replaceAll('-',' '))}</span>${run.parentRunId?'<span class="iteration-link">Rerun</span>':''}<br><time datetime="${escape(run.createdAt)}">${new Date(run.createdAt).toLocaleString()}</time></div><div><strong class="history-input" title="${escape(run.input)}">${escape(run.input)}</strong><small>${escape(run.result.classification.category)}${run.result.knowledge?' · '+escape(run.result.knowledge.id):''}</small></div><div><span class="badge ${run.score==='pass'?'good':run.score==='fail'?'risk':run.result.guardrail?'risk':'warn'}">${escape(run.score|| (run.result.guardrail?'escalated':'review'))}</span></div></div>${run.objective?`<p class="history-objective"><strong>Objective:</strong> ${escape(run.objective)}</p>`:''}<div class="history-actions"><button class="btn" type="button" data-edit-run="${fieldId}">${run.diagnosis||run.note?'Edit reflection':'Add reflection'}</button><button class="btn" type="button" data-rerun="${fieldId}">Rerun this case</button></div><div class="history-review" data-review-editor="${fieldId}"><div class="review-grid"><div><label class="field-label" for="history-diagnosis-${fieldId}">Diagnosis</label><select class="history-diagnosis" id="history-diagnosis-${fieldId}"><option value="">Choose a failure area</option>${['Classification / taxonomy','Retrieval','Knowledge quality','Guardrail','Draft quality','Confidence / routing','Test-case problem','Needs investigation','No failure observed'].map(value=>`<option${run.diagnosis===value?' selected':''}>${value}</option>`).join('')}</select></div><div><label class="field-label" for="history-question-${fieldId}">Next question</label><input class="history-question" id="history-question-${fieldId}" type="text" value="${escape(run.nextQuestion||'')}"></div><div class="wide"><label class="field-label" for="history-note-${fieldId}">Notes</label><textarea class="history-note" id="history-note-${fieldId}">${escape(run.note||'')}</textarea></div></div><div class="actions"><button class="btn save-history-review" type="button">Save reflection</button><span class="save-status" aria-live="polite"></span></div></div></article>`;}).join(''):'<div class="empty-state"><strong>No learning entries yet</strong>Use the Support Tool or Eval Runner and the experiment will appear here.</div>';
    $$('[data-edit-run]').forEach(button=>button.addEventListener('click',()=>{$(`[data-review-editor="${button.dataset.editRun}"]`).classList.toggle('active');}));
    $$('[data-rerun]').forEach(button=>button.addEventListener('click',()=>{const run=runs.find(item=>item.id===button.dataset.rerun);pendingParentRunId=run.id;$('#eval-freeform').value=run.input;if(run.objective){core.saveWorkspace({objective:run.objective});$('#session-objective').value=run.objective;}location.hash='evals';$('#eval-freeform').focus();}));
    $$('.save-history-review').forEach(button=>button.addEventListener('click',()=>{const editor=button.closest('[data-review-editor]');core.updateRun(editor.dataset.reviewEditor,{diagnosis:$('.history-diagnosis',editor).value,note:$('.history-note',editor).value.trim(),nextQuestion:$('.history-question',editor).value.trim()});$('.save-status',editor).textContent='Saved';}));
  }
  $('#clear-history').addEventListener('click',()=>{if(confirm('Clear all Meridian Lab runs stored in this browser?')){core.clearRuns();renderHistory();renderCases();renderEvalStats();}});

  $('#export-workspace').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(core.exportWorkspace(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`meridian-lab-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);});
  $('#import-workspace').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{core.importWorkspace(JSON.parse(reader.result));const restored=core.getWorkspace();$('#session-objective').value=restored.objective||'';renderSavedCases();renderHistory();renderCases();renderEvalStats();$('#import-status').textContent='Workspace restored.';}catch(error){$('#import-status').textContent=error.message;}};reader.readAsText(file);event.target.value='';});

  function renderDashboard(){
    const runs=core.getRuns();const diagnosed=runs.filter(run=>run.diagnosis).length;const reruns=runs.filter(run=>run.parentRunId).length;const questions=runs.filter(run=>run.nextQuestion).length;
    $('#dashboard-stats').innerHTML=`<div class="stat"><span>Experiments</span><strong>${runs.length}</strong></div><div class="stat"><span>Diagnosed</span><strong>${diagnosed}</strong></div><div class="stat"><span>Linked reruns</span><strong>${reruns}</strong></div><div class="stat"><span>Next questions</span><strong>${questions}</strong></div>`;
  }
})();
