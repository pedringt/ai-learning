// Baseline Setup (#450). One module for what context-baseline-setup.js,
// context-baseline-polish.js and context-baseline-dogfood-fixes.js used to split:
// the banner (one renderer now; two used to redraw over each other), the Starting State
// draft dialog, manual entry, starting material, confirm and retry, and the Workspace
// empty states while Baseline Setup is active. Nothing here makes a fact Current State
// without the person confirming the Starting State.
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let latestSummary=null,refreshTimer=null,pollingTimer=null;
  const projectId=()=>document.getElementById('projectSwitcher')?.dataset?.projectId||'';
  const apiBase=()=>window.STATE_API?.base||'';
  const baselineActive=()=>latestSummary?.status==='baseline_setup'||document.body.classList.contains('state-baseline-active');
  function setText(node,text){if(node&&node.textContent!==text)node.textContent=text}

  function ensureBanner(){
    let banner=document.getElementById('baselineSetupBanner');
    if(banner) return banner;
    const root=document.getElementById('viewRoot');
    if(!root?.parentElement) return null;
    banner=document.createElement('section');
    banner.id='baselineSetupBanner';
    banner.className='baseline-setup-banner';
    banner.hidden=true;
    banner.setAttribute('aria-live','polite');
    root.parentElement.insertBefore(banner,root);
    return banner;
  }

  function endpoint(path){ const base=window.STATE_API?.base; return base ? `${base}${path}` : null; }

  async function baselineRequest(path, options={}){
    const url=endpoint(path); if(!url) throw new Error('State API is not ready');
    const id=projectId();
    const headers={...(options.headers||{}),...(id?{'X-State-Project-Id':id}:{})};
    const response=await fetch(url,{...options,headers});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const detail=payload?.detail;
      const message=detail?.error_details?.error_message || (typeof detail==='string'?detail:null) || `API error ${response.status}`;
      const error=new Error(message); error.status=response.status; error.payload=payload; throw error;
    }
    return payload;
  }

  function showDialog(html){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(!overlay||!body) return false;
    body.innerHTML=html;
    overlay.hidden=false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(()=>overlay.querySelector('[role="dialog"]')?.focus());
    return true;
  }

  function closeDialog(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(overlay) overlay.hidden=true;
    if(body) body.innerHTML='';
    document.body.classList.remove('modal-open');
  }

  // ---- Banner (the dogfood renderer; context-baseline-setup.js's older renderer is gone) ----
  async function fetchDraft(){
    const base=apiBase(),id=projectId();if(!base||!id)return null;
    const response=await fetch(`${base}/api/baseline/draft`,{headers:{'X-State-Project-Id':id}});
    if(response.status===404)return null;
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.detail?.error_details?.error_message||`API error ${response.status}`);
    return payload;
  }

  function countText(summary){
    const c=summary?.counts||{},facts=(c.current_items||0)+(c.proposed_items||0),questions=(c.current_questions||0)+(c.proposed_questions||0);
    const parts=[`${facts} draft fact${facts===1?'':'s'}`,`${questions} question${questions===1?'':'s'}`];
    if(c.needs_individual_review)parts.push(`${c.needs_individual_review} need${c.needs_individual_review===1?'s':''} review`);
    if(c.failed_evidence)parts.push(`${c.failed_evidence} failed`);
    return parts.join(' · ');
  }

  function renderOwnedBanner(summary){
    const banner=document.getElementById('baselineSetupBanner');if(!banner)return;latestSummary=summary;
    if(!summary||summary.status!=='baseline_setup'){
      if(!banner.hidden||banner.innerHTML){banner.hidden=true;banner.innerHTML='';banner.removeAttribute('data-baseline-dogfood-owned');banner.removeAttribute('data-dogfood-signature')}
      document.body.classList.remove('state-baseline-active');syncWorkspaceEmptyStates();return;
    }
    const c=summary.counts||{},facts=(c.current_items||0)+(c.proposed_items||0),questions=(c.current_questions||0)+(c.proposed_questions||0),processing=c.processing_evidence||0,failed=c.failed_evidence||0,attention=c.needs_individual_review||0;
    const blank=!facts&&!questions&&!processing&&!failed&&!attention;
    let title,copy,meta='',actions='';
    if(blank){
      title='Set up Current State';
      copy='Add existing project material, or enter what you already know. State will assemble an editable Starting State before anything becomes current.';
      actions='<div class="baseline-dogfood-actions"><button type="button" class="btn primary" data-baseline-add-starting>Add starting material</button><button type="button" class="btn secondary" data-baseline-start-manual>Enter Current State manually</button></div>';
    }else if(processing){
      title='Building your Starting State';
      copy='State saved your starting material as Evidence and is organizing it now. You can add another source while this one finishes.';
      meta=`${processing} source${processing===1?'':'s'} analyzing${facts||questions?` · ${countText(summary)}`:''}`;
      actions='<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button></div>';
    }else if(failed){
      title='Some starting material needs attention';copy='State could not finish analyzing one or more starting sources. Your material is saved. Retry the analysis, or review what was assembled.';meta=countText(summary);
      actions='<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button><button type="button" class="btn secondary" data-baseline-review-starting>Review Starting State</button><button type="button" class="btn primary" data-baseline-retry-failed>Retry failed analysis</button></div>';
    }else{
      title='Starting State ready to review';
      copy=!facts&&questions?'State found unresolved Questions but no durable Starting State facts. Add more material or review the source before confirming an empty baseline.':'Review the project picture State assembled. You can edit, move, remove, or add missing facts before confirming it.';
      meta=countText(summary);
      actions='<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button><button type="button" class="btn primary" data-baseline-review-starting>Review Starting State</button></div>';
    }
    const signature=JSON.stringify({title,copy,meta,actions,retryMessage:failed&&!processing?(window.STATE_BASELINE_SETUP?.retryMessage||''):''});
    if(banner.dataset.dogfoodSignature===signature&&banner.querySelector('[data-baseline-dogfood-owned]'))return;
    banner.dataset.dogfoodSignature=signature;banner.dataset.baselineDogfoodOwned='true';
    banner.innerHTML=`<div class="baseline-setup-row" data-baseline-dogfood-owned><div class="baseline-setup-copy-wrap"><p class="baseline-setup-title">${esc(title)}</p><p class="baseline-setup-copy">${esc(copy)}</p>${meta?`<div class="baseline-setup-meta">${esc(meta)}</div>`:''}${failed&&!processing?`<div class="baseline-retry-status" data-baseline-retry-status aria-live="polite">${esc(window.STATE_BASELINE_SETUP?.retryMessage||'')}</div>`:''}</div>${actions}</div>`;
    banner.hidden=false;document.body.classList.add('state-baseline-active');syncWorkspaceEmptyStates();
  }

  async function refresh(){clearTimeout(refreshTimer);try{renderOwnedBanner(await fetchDraft())}catch(error){console.warn('Baseline dogfood status unavailable',error)}}
  function scheduleRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,delay)}
  function pollUntilSettled(){
    clearTimeout(pollingTimer);const id=projectId();let attempts=0;
    const tick=async()=>{if(!id||projectId()!==id)return;attempts++;try{const summary=await fetchDraft();renderOwnedBanner(summary);if(summary?.status==='baseline_setup'&&(summary.counts?.processing_evidence||0)>0&&attempts<200){pollingTimer=setTimeout(tick,1500);return}}catch(error){if(attempts<200){pollingTimer=setTimeout(tick,1500);return}}window.STATE_ASK_TEST_API?.hydrateBackend?.();document.dispatchEvent(new Event('state-project-record-changed'))};
    pollingTimer=setTimeout(tick,250);
  }

  // ---- Starting State draft dialog ----
  function groupedFacts(items){
    const groups=[];
    const byName=new Map();
    for(const item of items||[]){
      const name=String(item.area_name||'General').trim()||'General';
      if(!byName.has(name)){const group={name,items:[]};byName.set(name,group);groups.push(group);}
      byName.get(name).items.push(item);
    }
    return groups;
  }

  function factHtml(item){
    if(item.kind==='current'){
      return `<article class="baseline-draft-fact is-current"><div class="baseline-draft-fact-head"><span class="baseline-draft-badge">Already in Current State</span></div><p class="baseline-draft-current-title">${esc(item.topic||'Current fact')}</p><p class="baseline-draft-current-copy">${esc(item.statement)}</p></article>`;
    }
    return `<article class="baseline-draft-fact" data-proposal-id="${esc(item.proposal_id)}"><div class="baseline-draft-fact-head"><span class="baseline-draft-badge">Draft fact</span><button type="button" class="baseline-draft-remove" data-baseline-remove-fact>Remove</button></div><div class="baseline-draft-grid"><label class="baseline-draft-field"><span>Section</span><input data-baseline-area value="${esc(item.area_name||'General')}" maxlength="80"></label><label class="baseline-draft-field"><span>Title</span><input data-baseline-topic value="${esc(item.topic||'')}" maxlength="120"></label></div><label class="baseline-draft-field"><span>What Current State should say</span><textarea data-baseline-statement rows="3">${esc(item.statement)}</textarea></label></article>`;
  }

  function attentionHtml(items){
    if(!items?.length) return '';
    return `<section class="baseline-draft-attention"><h3>Needs your attention before confirmation</h3><p class="baseline-draft-intro">State keeps real Questions, conflicts, risks, and changes to already-current facts in Review instead of hiding them inside a bulk approval.</p><ul>${items.map(item=>`<li>${esc(item.decision_question||'Review required')}</li>`).join('')}</ul><button type="button" class="btn secondary" data-baseline-open-reviews>Open Reviews</button></section>`;
  }

  function questionsHtml(questions){
    if(!questions?.length) return '';
    return `<section class="baseline-draft-section"><h3>Questions</h3>${questions.map(q=>`<div class="baseline-draft-question"><span class="baseline-draft-badge">${q.kind==='proposed'?'Needs Review':'Open Question'}</span>${esc(q.text)}</div>`).join('')}</section>`;
  }

  function draftDialogHtml(summary){
    const c=summary.counts||{};
    const groups=groupedFacts(summary.draft?.items||[]);
    const facts=groups.map(group=>`<section class="baseline-draft-area"><h4 class="baseline-draft-area-title">${esc(group.name)}</h4>${group.items.map(factHtml).join('')}</section>`).join('') || '<p class="baseline-draft-intro">No Starting State facts yet. Add project material first, or confirm an intentionally empty baseline.</p>';
    const attention=attentionHtml(summary.needs_individual_review||[]);
    const questions=questionsHtml(summary.draft?.questions||[]);
    const factCount=(c.current_items||0)+(c.proposed_items||0);
    const questionCount=(c.current_questions||0)+(c.proposed_questions||0);
    let status='Confirming is one human authorization for the routine draft facts shown here.';
    if(c.processing_evidence) status='Some Evidence is still being analyzed. Wait for it to finish before confirming.';
    else if(c.failed_evidence) status='Some starting material could not be analyzed. Retry the analysis before confirming.';
    else if(c.needs_individual_review) status='Resolve the flagged Reviews first. Routine draft facts do not need separate Review clicks.';
    else if(!factCount&&questionCount) status='State found Questions but no Starting State facts. This may be incomplete; review the source before confirming.';
    return `<div class="baseline-draft-dialog"><span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Review your Starting State</h2><p class="baseline-draft-intro">This is the project picture State assembled from your starting material. Edit routine facts, move them between sections, or remove misunderstandings. Nothing below becomes Current State until you confirm it.</p>${attention}<section class="baseline-draft-section"><h3>Starting State</h3><button type="button" class="btn secondary small baseline-add-fact" data-baseline-add-fact>+ Add missing fact</button>${facts}</section>${questions}<div class="baseline-draft-actions"><span class="baseline-draft-status">${esc(status)}</span>${c.failed_evidence&&!c.processing_evidence?'<button type="button" class="btn secondary" data-baseline-retry-failed>Retry failed analysis</button>':''}<button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="button" class="btn primary" data-baseline-confirm-starting ${summary.can_confirm?'':'disabled'}>Confirm Starting State</button></div></div>`;
  }

  // The review dialog is a snapshot of the draft. If it is opened while
  // Evidence is still being analyzed (#230), it must keep itself current:
  // watch the draft until analysis settles and redraw when it changes.
  let dialogRequest=0,dialogPollTimer=null,shownSignature='';
  const DIALOG_POLL_MS=1500,DIALOG_POLL_MAX=200;
  const draftDialogOpen=()=>!!document.querySelector('.baseline-draft-dialog');
  const draftSignature=summary=>JSON.stringify([summary.status,summary.can_confirm,summary.counts||{},summary.draft||{},summary.needs_individual_review||[]]);
  const FACT_FIELDS=['area','topic','statement'];

  function captureEdits(){
    const edits=new Map();
    document.querySelectorAll('.baseline-draft-fact[data-proposal-id]').forEach(card=>{
      const edit={removed:card.dataset.removed==='true'};
      FACT_FIELDS.forEach(field=>{edit[field]=card.querySelector(`[data-baseline-${field}]`)?.value;});
      edits.set(card.dataset.proposalId,edit);
    });
    const active=document.activeElement,card=active?.closest?.('.baseline-draft-fact[data-proposal-id]');
    const field=card&&FACT_FIELDS.find(name=>active.matches(`[data-baseline-${name}]`));
    return {edits,focus:field?{id:card.dataset.proposalId,field}:null};
  }

  function restoreEdits({edits,focus}){
    document.querySelectorAll('.baseline-draft-fact[data-proposal-id]').forEach(card=>{
      const edit=edits.get(card.dataset.proposalId);if(!edit)return;
      FACT_FIELDS.forEach(field=>{const input=card.querySelector(`[data-baseline-${field}]`);if(input&&edit[field]!==undefined)input.value=edit[field];});
      if(edit.removed)card.querySelector('[data-baseline-remove-fact]')?.click();
    });
    if(!focus)return;
    const card=[...document.querySelectorAll('.baseline-draft-fact[data-proposal-id]')].find(node=>node.dataset.proposalId===focus.id);
    const input=card?.querySelector(`[data-baseline-${focus.field}]`);
    if(input&&!input.disabled){input.focus();input.setSelectionRange?.(input.value.length,input.value.length);}
  }

  function renderDraftDialog(summary){
    const kept=captureEdits();
    shownSignature=draftSignature(summary);
    showDialog(draftDialogHtml(summary));
    restoreEdits(kept);
    watchOpenDraft(summary);
  }

  function watchOpenDraft(summary){
    clearTimeout(dialogPollTimer);
    if(!(summary?.counts?.processing_evidence>0))return;
    const id=projectId(),requestId=dialogRequest;let attempts=0;
    const stale=()=>requestId!==dialogRequest||projectId()!==id||!draftDialogOpen();
    const tick=async()=>{
      if(stale())return;
      attempts++;
      let pending=true;
      try{
        const next=await baselineRequest('/api/baseline/draft');
        if(stale())return;
        latestDraft=next;
        if(next.status!=='baseline_setup'){closeDialog();renderOwnedBanner(next);return;}
        const changed=draftSignature(next)!==shownSignature;
        // Redrawing would discard a half-typed new fact; wait for that form to close.
        if(changed&&!document.querySelector('[data-baseline-new-fact-form]')){renderDraftDialog(next);return;}
        pending=changed||(next.counts?.processing_evidence||0)>0;
      }catch(error){ /* keep watching; the next tick retries */ }
      if(pending&&attempts<DIALOG_POLL_MAX)dialogPollTimer=setTimeout(tick,DIALOG_POLL_MS);
    };
    dialogPollTimer=setTimeout(tick,DIALOG_POLL_MS);
  }

  async function openDraft(){
    const requestId=++dialogRequest;
    clearTimeout(dialogPollTimer);
    showDialog('<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Loading Starting State...</h2>');
    try{
      const summary=await baselineRequest('/api/baseline/draft');
      if(requestId!==dialogRequest)return; // a newer open superseded this response
      latestDraft=summary;
      if(summary.status!=='baseline_setup'){ closeDialog(); renderOwnedBanner(summary); return; }
      renderDraftDialog(summary);
    }catch(error){
      if(requestId!==dialogRequest)return;
      showDialog(`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Starting State is unavailable.</h2><p>${esc(error.message||'Please try again.')}</p><div class="dialog-actions"><button class="btn primary" type="button" data-action="close-dialog">Close</button></div>`);
    }
  }

  window.STATE_BASELINE_SETUP={openDraft,retryFailedAnalysis,get retryMessage(){return retryMessage}};

  function collectDecisions(){
    return [...document.querySelectorAll('.baseline-draft-fact[data-proposal-id]')].map(card=>({
      proposal_id:card.dataset.proposalId,
      decision:card.dataset.removed==='true'?'reject':'accept',
      statement:card.querySelector('[data-baseline-statement]')?.value||'',
      topic:card.querySelector('[data-baseline-topic]')?.value||'',
      area_name:card.querySelector('[data-baseline-area]')?.value||'General',
    }));
  }

  // Retry every source whose analysis failed (#231). The backend already supports this
  // (POST /api/evidence/{id}/reanalyze, the same call the Notes view uses); the Baseline
  // UI told the person to retry but never offered it.
  // The message lives here, not only in the DOM: the banner is re-rendered by two renderers
  // whenever the view refreshes, and would otherwise lose it a moment after a failed retry.
  let retrying=false,retryMessage='';
  async function retryFailedAnalysis(button){
    if(retrying)return;retrying=true;
    const buttons=[...document.querySelectorAll('[data-baseline-retry-failed]')],labels=new Map(buttons.map(b=>[b,b.textContent]));
    const say=text=>{retryMessage=text;document.querySelectorAll('[data-baseline-retry-status]').forEach(node=>{node.textContent=text});const dialogStatus=document.querySelector('.baseline-draft-status');if(dialogStatus&&text)dialogStatus.textContent=text};
    buttons.forEach(b=>{b.disabled=true;b.textContent='Retrying…'});say('');
    let recovered=false;
    try{
      const payload=await baselineRequest('/api/evidence');
      const failed=(payload?.items||payload||[]).filter(item=>item.processing_status==='failed');
      for(let i=0;i<failed.length;i++){
        if(failed.length>1)buttons.forEach(b=>{b.textContent=`Retrying ${i+1} of ${failed.length}…`});
        await window.STATE_API.retryEvidenceAnalysis(failed[i].id);
      }
      recovered=true;retryMessage='';
    }catch(error){
      const detail=String(error?.message||'').trim();
      say(`Retry did not finish${detail?': '+detail.replace(/[.\s]+$/,''):''}. Your starting material is still saved; you can try again.`);
    }finally{
      retrying=false;
      buttons.forEach(b=>{b.disabled=false;b.textContent=labels.get(b)});
      window.STATE_ASK_TEST_API?.hydrateBackend?.();
      document.dispatchEvent(new Event('state-project-record-changed'));
      if(recovered&&draftDialogOpen())openDraft();
    }
  }

  async function confirmStartingState(button){
    button.disabled=true; button.textContent='Confirming...';
    try{
      const payload=await baselineRequest('/api/baseline/confirm',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({items:collectDecisions()}),
      });
      closeDialog();
      latestDraft=null;
      renderOwnedBanner(null);
      document.dispatchEvent(new Event('state-project-record-changed'));
      if(payload.status==='established') window.location.reload();
    }catch(error){
      button.disabled=false; button.textContent='Confirm Starting State';
      const status=document.querySelector('.baseline-draft-status');
      if(status) status.textContent=error.message||'Starting State could not be confirmed. Refresh and try again.';
      if(error.status===409) setTimeout(openDraft,300);
    }
  }

  // ---- Manual entry (from context-baseline-polish.js) ----
  function manualRowHtml(){
    return `<div class="baseline-manual-row"><div class="baseline-manual-row-head"><button type="button" class="baseline-manual-remove" data-baseline-remove-manual>Remove</button></div><div class="baseline-manual-grid"><label class="baseline-manual-field"><span>Section</span><input data-baseline-manual-area maxlength="80" value="General"></label><label class="baseline-manual-field"><span>Title</span><input data-baseline-manual-topic maxlength="120" placeholder="e.g. Purpose"></label></div><label class="baseline-manual-field"><span>What should Current State say?</span><textarea data-baseline-manual-statement maxlength="4000" rows="3" placeholder="Write one fact you already know to be true."></textarea></label></div>`;
  }

  function showManualDialog(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(!overlay||!body)return;
    body.innerHTML=`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Enter Current State manually</h2><p>Enter facts you already know should be part of the Starting State. Add as many as you need, then review everything before confirming Current State.</p><div class="baseline-manual-list">${manualRowHtml()}</div><button type="button" class="btn secondary" data-baseline-add-manual>Add another fact</button><div class="baseline-manual-actions"><span class="baseline-manual-status"></span><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="button" class="btn primary" data-baseline-save-manual>Add to Starting State</button></div>`;
    overlay.hidden=false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(()=>body.querySelector('[data-baseline-manual-statement]')?.focus());
  }

  function closeManualDialog(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(overlay)overlay.hidden=true;
    if(body)body.innerHTML='';
    document.body.classList.remove('modal-open');
  }

  function collectManualItems(){
    return [...document.querySelectorAll('.baseline-manual-row')].map(row=>({
      area_name:row.querySelector('[data-baseline-manual-area]')?.value||'General',
      topic:row.querySelector('[data-baseline-manual-topic]')?.value||'',
      statement:row.querySelector('[data-baseline-manual-statement]')?.value||'',
    })).filter(item=>item.statement.trim());
  }

  async function saveManualFacts(button){
    const status=document.querySelector('.baseline-manual-status');
    const items=collectManualItems();
    if(!items.length){if(status)status.textContent='Add at least one fact first.';return;}
    const base=window.STATE_API?.base;
    const projectId=document.getElementById('projectSwitcher')?.dataset?.projectId||'';
    if(!base||!projectId){if(status)status.textContent='State is not ready yet.';return;}
    button.disabled=true;button.textContent='Adding...';if(status)status.textContent='';
    try{
      const response=await fetch(`${base}/api/baseline/manual`,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-State-Project-Id':projectId},
        body:JSON.stringify({items}),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=payload?.detail;
        throw new Error(detail?.error_details?.error_message||(typeof detail==='string'?detail:null)||`API error ${response.status}`);
      }
      closeManualDialog();
      window.STATE_ASK_TEST_API?.hydrateBackend?.();
      document.dispatchEvent(new Event('state-project-record-changed'));
      setTimeout(openDraft,200);
    }catch(error){
      button.disabled=false;button.textContent='Add to Starting State';if(status)status.textContent=error.message||'Could not add those facts.';
    }
  }

  // ---- Starting material and inline new facts (from context-baseline-dogfood-fixes.js) ----
  function startingMaterialDialog(){
    showDialog(`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Add starting material</h2><p>Add one existing project source. State saves it as Evidence, then uses it to build the editable Starting State. You can add another source after this one.</p><textarea id="baselineStartingText" rows="7" aria-label="Starting material" placeholder="Paste project notes, a plan, decisions, or other starting material..."></textarea><div class="baseline-starting-upload"><span>or</span><label class="btn secondary" for="baselineStartingFile">Upload a file</label><input id="baselineStartingFile" type="file" accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden><span class="baseline-starting-filename" aria-live="polite"></span></div><div class="baseline-starting-status" aria-live="polite"></div><div class="dialog-actions"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="button" data-baseline-save-starting-text>Add pasted notes</button></div>`);
    requestAnimationFrame(()=>document.getElementById('baselineStartingText')?.focus());
  }
  function setStartingStatus(message){setText(document.querySelector('.baseline-starting-status'),message||'')}
  async function submitStartingText(button){const text=document.getElementById('baselineStartingText')?.value.trim();if(!text){setStartingStatus('Paste some starting material first, or upload a file.');return}button.disabled=true;button.textContent='Adding…';setStartingStatus('Saving Evidence…');try{await window.STATE_API.submitEvidence(text,'manual_note');closeDialog();scheduleRefresh(50);pollUntilSettled()}catch(error){button.disabled=false;button.textContent='Add pasted notes';setStartingStatus(error?.message||'Could not add that starting material.')}}
  async function submitStartingFile(file){if(!file)return;setText(document.querySelector('.baseline-starting-filename'),file.name);setStartingStatus('Uploading and saving Evidence…');try{await window.STATE_API.uploadEvidence(file);closeDialog();scheduleRefresh(50);pollUntilSettled()}catch(error){setStartingStatus(error?.message||'Could not upload that file.')}}

  function insertAddFactForm(){
    const section=[...document.querySelectorAll('.baseline-draft-dialog .baseline-draft-section')].find(s=>s.querySelector(':scope > h3')?.textContent.trim()==='Starting State');if(!section||section.querySelector('[data-baseline-new-fact-form]'))return;
    section.insertAdjacentHTML('beforeend',`<div class="baseline-inline-new-fact" data-baseline-new-fact-form><div class="baseline-draft-grid"><label class="baseline-draft-field"><span>Section</span><input data-baseline-new-area maxlength="80" placeholder="e.g. Product & authority"></label><label class="baseline-draft-field"><span>Title</span><input data-baseline-new-topic maxlength="120" placeholder="e.g. Authority model"></label></div><label class="baseline-draft-field"><span>What Current State should say</span><textarea data-baseline-new-statement rows="3" placeholder="Add one fact that should be part of the Starting State."></textarea></label><div class="baseline-inline-new-actions"><span class="baseline-inline-new-status" aria-live="polite"></span><button type="button" class="btn secondary small" data-baseline-cancel-new-fact>Cancel</button><button type="button" class="btn primary small" data-baseline-save-new-fact>Add fact</button></div></div>`);
    section.querySelector('[data-baseline-new-area]')?.focus();
  }
  async function saveNewFact(button){
    const area=document.querySelector('[data-baseline-new-area]')?.value.trim(),topic=document.querySelector('[data-baseline-new-topic]')?.value.trim(),statement=document.querySelector('[data-baseline-new-statement]')?.value.trim(),status=document.querySelector('.baseline-inline-new-status');
    if(!statement){setText(status,'Add the fact first.');return}if(!area){setText(status,'Give the fact a section so it stays organized.');return}if(!topic){setText(status,'Give the fact a short title.');return}
    const base=apiBase(),id=projectId();if(!base||!id)return;button.disabled=true;button.textContent='Adding…';setText(status,'');
    try{const response=await fetch(`${base}/api/baseline/manual`,{method:'POST',headers:{'Content-Type':'application/json','X-State-Project-Id':id},body:JSON.stringify({items:[{area_name:area,topic,statement}]})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.detail?.error_details?.error_message||(typeof payload?.detail==='string'?payload.detail:null)||`API error ${response.status}`);document.querySelector('[data-baseline-new-fact-form]')?.remove();openDraft();scheduleRefresh(50)}catch(error){button.disabled=false;button.textContent='Add fact';setText(status,error?.message||'Could not add that fact.')}
  }

  // ---- Workspace empty states while Baseline Setup is active ----
  // Each rewrite works from any of its states, so whichever mode applies last wins. The first
  // sync for a new project can run before its Baseline status has loaded (established mode),
  // and the old one-way rewrites left established copy behind once Baseline mode arrived.
  const HINT_ORIGINAL='No changes recorded yet.';
  const HINT_BASELINE='Changes will appear here after Starting State is confirmed and Current State begins changing.';
  const HINT_ESTABLISHED='Changes will appear here as Current State is updated.';
  function syncWorkspaceEmptyStates(){
    const baseline=baselineActive();
    const attention=document.querySelector('.workspace-attention.is-clear'),title=attention?.querySelector('h3');
    if(attention&&title&&/caught up|workspace is ready/i.test(title.textContent||'')){
      const mode=baseline?'baseline':'established';
      if(attention.dataset.dogfoodEmptyMode!==mode){
        attention.dataset.dogfoodEmptyMode=mode;attention.classList.add('dogfood-caught-up');const copy=title.parentElement?.querySelector('p'),link=attention.querySelector('.text-button');
        if(mode==='baseline'){setText(title,'Your workspace is ready');setText(copy,'Add starting material above to establish Current State. Reviews and blocking Questions will appear here when they need attention.');if(link){link.hidden=true;link.classList.remove('dogfood-quiet-link');setText(link,'Open Items →')}}
        else{setText(title,"You're caught up");setText(copy,'Nothing needs your attention right now.');if(link){link.hidden=false;setText(link,'Open Items');link.classList.add('dogfood-quiet-link')}}
      }
    }
    document.querySelectorAll('.workspace-recent .workspace-section-hint').forEach(node=>{const text=node.textContent.trim();if(text===HINT_ORIGINAL||text===HINT_BASELINE||text===HINT_ESTABLISHED)setText(node,baseline?HINT_BASELINE:HINT_ESTABLISHED)});
    if(baseline)document.querySelectorAll('.workspace-status-card .workspace-status-item').forEach(item=>{const strong=item.querySelector('.workspace-status-value'),support=item.querySelector('.workspace-status-row>span');if(strong?.textContent.trim()==='Not yet established'){setText(strong,'Starting State not confirmed');setText(support,'Confirm Starting State to establish the project baseline.')}else if(/^0 established facts?$/.test(strong?.textContent.trim()||''))setText(support,'Starting material you confirm will appear here.')});
  }

  // ---- Event wiring, in the order the three old files registered it ----
  // Capture phase, at load (dogfood): while Baseline Setup is active, the Workspace's
  // "+ Add Evidence" opens "Add starting material" instead.
  document.addEventListener('click',event=>{
    const addEvidence=event.target.closest?.('[data-action="add-info"]');if(addEvidence&&baselineActive()){event.preventDefault();event.stopImmediatePropagation();startingMaterialDialog();return}
    if(event.target.closest?.('[data-baseline-add-starting]')){event.preventDefault();startingMaterialDialog();return}
    if(event.target.closest?.('[data-baseline-add-fact]')){event.preventDefault();insertAddFactForm();return}
    if(event.target.closest?.('[data-baseline-cancel-new-fact]')){event.preventDefault();document.querySelector('[data-baseline-new-fact-form]')?.remove();return}
    const saveNew=event.target.closest?.('[data-baseline-save-new-fact]');if(saveNew&&!saveNew.disabled){event.preventDefault();saveNewFact(saveNew);return}
    const saveText=event.target.closest?.('[data-baseline-save-starting-text]');if(saveText&&!saveText.disabled){event.preventDefault();submitStartingText(saveText);return}
  },true);
  document.addEventListener('change',event=>{if(event.target?.id==='baselineStartingFile'){const file=event.target.files?.[0];if(file)submitStartingFile(file)}});
  document.addEventListener('state-project-record-changed',()=>{scheduleRefresh(80);setTimeout(syncWorkspaceEmptyStates,120)});
  document.addEventListener('state-baseline-analysis-started',()=>{scheduleRefresh(40);pollUntilSettled()});
  // Bubble phase, at load (setup): review, remove/restore a draft fact, open Reviews, retry, confirm.
  document.addEventListener('click',event=>{
    const review=event.target.closest?.('[data-baseline-review-starting]');
    if(review){event.preventDefault();openDraft();return;}

    const remove=event.target.closest?.('[data-baseline-remove-fact]');
    if(remove){
      event.preventDefault();
      const card=remove.closest('.baseline-draft-fact');
      const removed=card?.dataset.removed==='true';
      if(card){card.dataset.removed=removed?'false':'true';card.classList.toggle('is-removed',!removed);}
      remove.textContent=removed?'Remove':'Restore';
      card?.querySelectorAll('input,textarea').forEach(input=>{input.disabled=!removed;});
      return;
    }

    const openReviews=event.target.closest?.('[data-baseline-open-reviews]');
    if(openReviews){
      event.preventDefault();closeDialog();document.querySelector('[data-view="open-items"]')?.click();return;
    }

    const retryFailed=event.target.closest?.('[data-baseline-retry-failed]');
    if(retryFailed&&!retryFailed.disabled){event.preventDefault();retryFailedAnalysis(retryFailed);return;}

    const confirm=event.target.closest?.('[data-baseline-confirm-starting]');
    if(confirm&&!confirm.disabled){event.preventDefault();confirmStartingState(confirm);}
  });

  function start(){
    ensureBanner();
    // Manual entry clicks (polish registered these at DOMContentLoaded, after setup's).
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-baseline-start-manual]')){event.preventDefault();showManualDialog();return;}
      if(event.target.closest?.('[data-baseline-add-manual]')){event.preventDefault();const list=document.querySelector('.baseline-manual-list');if(!list)return;if(list.children.length>=20){const status=document.querySelector('.baseline-manual-status');if(status)status.textContent='Starting State can add up to 20 facts at a time.';return;}list.insertAdjacentHTML('beforeend',manualRowHtml());return;}
      const remove=event.target.closest?.('[data-baseline-remove-manual]');
      if(remove){event.preventDefault();const row=remove.closest('.baseline-manual-row');const list=row?.parentElement;if(row&&list){if(list.children.length===1){row.querySelectorAll('input,textarea').forEach(input=>{input.value=input.hasAttribute('data-baseline-manual-area')?'General':'';});}else row.remove();}return;}
      const save=event.target.closest?.('[data-baseline-save-manual]');
      if(save&&!save.disabled){event.preventDefault();saveManualFacts(save);}
    });
    const switcher=document.getElementById('projectSwitcher');
    if(switcher)new MutationObserver(()=>scheduleRefresh(50)).observe(switcher,{attributes:true,attributeFilter:['data-project-id','data-name']});
    // Any view change re-checks Baseline status (debounced, one fetch) and the Workspace empty states.
    const root=document.getElementById('viewRoot');
    if(root){
      let syncQueued=false;
      new MutationObserver(()=>{
        scheduleRefresh(250);
        if(syncQueued)return;syncQueued=true;requestAnimationFrame(()=>{syncQueued=false;syncWorkspaceEmptyStates();});
      }).observe(root,{childList:true,subtree:true});
    }
    scheduleRefresh(0);syncWorkspaceEmptyStates();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
