(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const LEGACY_EVIDENCE_SUCCESS='Added as Evidence. Current State did not need a Review.';
  const BASELINE_EVIDENCE_SUCCESS='Added as Evidence. Review Starting State to see what State extracted. Questions and conflicts stay in Review.';
  let activeRequest = 0;
  let latestDraft = null;


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

  function projectId(){ return document.getElementById('projectSwitcher')?.dataset?.projectId || ''; }
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

  function renderBanner(summary){
    const banner=ensureBanner(); if(!banner) return;
    latestDraft=summary;
    if(!summary || summary.status!=='baseline_setup'){
      banner.hidden=true; banner.innerHTML=''; document.body.classList.remove('state-baseline-active'); return;
    }
    const c=summary.counts||{};
    const factCount=(c.current_items||0)+(c.proposed_items||0);
    const questionCount=(c.current_questions||0)+(c.proposed_questions||0);
    const attention=c.needs_individual_review||0;
    const processing=c.processing_evidence||0;
    const failed=c.failed_evidence||0;
    const statusParts=[`${factCount} draft fact${factCount===1?'':'s'}`,`${questionCount} question${questionCount===1?'':'s'}`];
    if(!factCount&&questionCount) statusParts.push('Starting State may be incomplete');
    if(attention) statusParts.push(`${attention} need${attention===1?'s':''} review`);
    if(processing) statusParts.push(`${processing} analyzing`);
    if(failed) statusParts.push(`${failed} failed`);
    banner.innerHTML=`<div class="baseline-setup-row"><div class="baseline-setup-copy-wrap"><p class="baseline-setup-title">Set up Current State</p><p class="baseline-setup-copy">Add the project's starting material, then review the Starting State that State assembles. Questions and conflicts stay in Review.</p><div class="baseline-setup-meta">${esc(statusParts.join(' · '))}</div></div><button type="button" class="btn secondary baseline-review-button" data-baseline-review-starting>Review Starting State</button></div>`;
    banner.hidden=false;
    document.body.classList.add('state-baseline-active');
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

  function rewriteBaselineEvidenceSuccess(){
    if(!document.body.classList.contains('state-baseline-active')) return;
    const body=document.getElementById('dialogBody');
    if(!body) return;
    body.querySelectorAll('p').forEach(paragraph=>{
      if(String(paragraph.textContent||'').trim()===LEGACY_EVIDENCE_SUCCESS){
        paragraph.textContent=BASELINE_EVIDENCE_SUCCESS;
      }
    });
  }

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
    return `<div class="baseline-draft-dialog"><span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Review your Starting State</h2><p class="baseline-draft-intro">This is the project picture State assembled from your starting material. Edit routine facts, move them between sections, or remove misunderstandings. Nothing below becomes Current State until you confirm it.</p>${attention}<section class="baseline-draft-section"><h3>Starting State</h3>${facts}</section>${questions}<div class="baseline-draft-actions"><span class="baseline-draft-status">${esc(status)}</span>${c.failed_evidence&&!c.processing_evidence?'<button type="button" class="btn secondary" data-baseline-retry-failed>Retry failed analysis</button>':''}<button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="button" class="btn primary" data-baseline-confirm-starting ${summary.can_confirm?'':'disabled'}>Confirm Starting State</button></div></div>`;
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
        if(next.status!=='baseline_setup'){closeDialog();renderBanner(next);return;}
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
      if(summary.status!=='baseline_setup'){ closeDialog(); renderBanner(summary); return; }
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
      const banner=ensureBanner(); if(banner){banner.hidden=true;banner.innerHTML='';}
      document.body.classList.remove('state-baseline-active');
      document.dispatchEvent(new Event('state-project-record-changed'));
      if(payload.status==='established') window.location.reload();
    }catch(error){
      button.disabled=false; button.textContent='Confirm Starting State';
      const status=document.querySelector('.baseline-draft-status');
      if(status) status.textContent=error.message||'Starting State could not be confirmed. Refresh and try again.';
      if(error.status===409) setTimeout(openDraft,300);
    }
  }

  async function refresh(){
    const requestId=++activeRequest;
    const banner=ensureBanner();
    if(!projectId()){if(banner)banner.hidden=true;return;}
    try{
      const summary=await baselineRequest('/api/baseline/draft');
      if(requestId===activeRequest) renderBanner(summary);
    }catch(error){
      if(requestId===activeRequest&&banner){banner.hidden=true;banner.innerHTML='';}
      if(error.status!==404) console.warn('Baseline Setup status unavailable',error);
    }
  }

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
    const switcher=document.getElementById('projectSwitcher');
    if(switcher)new MutationObserver(()=>refresh()).observe(switcher,{attributes:true,attributeFilter:['data-project-id','data-name']});
    const root=document.getElementById('viewRoot');
    if(root){
      let timer=null;
      new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,250);}).observe(root,{childList:true,subtree:true});
    }
    const dialogBody=document.getElementById('dialogBody');
    if(dialogBody)new MutationObserver(()=>rewriteBaselineEvidenceSuccess()).observe(dialogBody,{childList:true,subtree:true,characterData:true});
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
