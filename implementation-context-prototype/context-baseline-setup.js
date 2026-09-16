(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let activeRequest = 0;
  let latestDraft = null;

  function ensureStyles(){
    if(document.getElementById('state-baseline-setup-styles')) return;
    const style=document.createElement('style');
    style.id='state-baseline-setup-styles';
    style.textContent=`
      .baseline-setup-banner{margin:0 0 14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:none}
      .baseline-setup-row{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .baseline-setup-copy-wrap{min-width:0}.baseline-setup-title{font-weight:800;font-size:13px;margin:0 0 2px;color:var(--ink)}
      .baseline-setup-copy{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
      .baseline-setup-meta{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.35}
      .baseline-review-button{flex:0 0 auto;min-height:32px!important;padding:6px 10px!important;white-space:nowrap}
      .baseline-draft-dialog{min-width:0}.baseline-draft-intro{margin-bottom:16px;color:var(--muted)}
      .baseline-draft-attention{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)}
      .baseline-draft-attention h3,.baseline-draft-section h3{margin:0 0 8px;font-size:14px}
      .baseline-draft-attention ul{margin:7px 0 0;padding-left:18px}.baseline-draft-attention li{margin:4px 0;font-size:13px}
      .baseline-draft-section{margin-top:18px}.baseline-draft-area{margin:12px 0 0;padding-top:12px;border-top:1px solid var(--line)}
      .baseline-draft-area-title{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}
      .baseline-draft-fact{margin:0 0 10px;padding:10px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
      .baseline-draft-fact.is-current{padding:8px 10px;background:transparent}.baseline-draft-fact.is-removed{opacity:.6}
      .baseline-draft-fact-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:7px}
      .baseline-draft-badge{font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
      .baseline-draft-remove{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 0}
      .baseline-draft-grid{display:grid;grid-template-columns:minmax(120px,.7fr) minmax(140px,1fr);gap:8px;margin-bottom:8px}
      .baseline-draft-field{display:flex;flex-direction:column;gap:4px}.baseline-draft-field span{font-size:10px;font-weight:750;color:var(--muted)}
      .baseline-draft-field input,.baseline-draft-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);font:inherit;padding:7px 8px}
      .baseline-draft-field textarea{resize:vertical;min-height:64px;line-height:1.4}
      .baseline-draft-current-title{font-weight:750;font-size:12px;margin:0 0 3px}.baseline-draft-current-copy{margin:0;font-size:13px;line-height:1.45}
      .baseline-draft-question{padding:8px 0;border-top:1px solid var(--line);font-size:13px}.baseline-draft-question:first-of-type{border-top:0}
      .baseline-draft-question .baseline-draft-badge{display:block;margin-bottom:3px}
      .baseline-draft-actions{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
      .baseline-draft-status{margin-right:auto;font-size:11px;color:var(--muted);max-width:360px}
      @media(max-width:760px){.baseline-setup-row{align-items:flex-start;flex-direction:column}.baseline-review-button{width:100%}.baseline-draft-grid{grid-template-columns:1fr}.baseline-draft-actions{align-items:stretch;flex-direction:column}.baseline-draft-status{margin-right:0}.baseline-draft-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

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
    if(attention) statusParts.push(`${attention} need${attention===1?'s':''} review`);
    if(processing) statusParts.push(`${processing} analyzing`);
    if(failed) statusParts.push(`${failed} failed`);
    banner.innerHTML=`<div class="baseline-setup-row"><div class="baseline-setup-copy-wrap"><p class="baseline-setup-title">Set up Current State</p><p class="baseline-setup-copy">Add the project's starting material, then review the Starting State State assembles. Questions and conflicts stay in Review.</p><div class="baseline-setup-meta">${esc(statusParts.join(' · '))}</div></div><button type="button" class="btn secondary baseline-review-button" data-baseline-review-starting>Review Starting State</button></div>`;
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
    let status='Confirming is one human authorization for the routine draft facts shown here.';
    if(c.processing_evidence) status='Some Evidence is still being analyzed. Wait for it to finish before confirming.';
    else if(c.failed_evidence) status='Retry failed Evidence before confirming.';
    else if(c.needs_individual_review) status='Resolve the flagged Reviews first. Routine draft facts do not need separate Review clicks.';
    return `<div class="baseline-draft-dialog"><span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Review your Starting State</h2><p class="baseline-draft-intro">This is the project picture State assembled from your starting material. Edit routine facts, move them between sections, or remove misunderstandings. Nothing below becomes Current State until you confirm it.</p>${attention}<section class="baseline-draft-section"><h3>Starting State</h3>${facts}</section>${questions}<div class="baseline-draft-actions"><span class="baseline-draft-status">${esc(status)}</span><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="button" class="btn primary" data-baseline-confirm-starting ${summary.can_confirm?'':'disabled'}>Confirm Starting State</button></div></div>`;
  }

  async function openDraft(){
    showDialog('<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Loading Starting State...</h2>');
    try{
      const summary=await baselineRequest('/api/baseline/draft');
      latestDraft=summary;
      if(summary.status!=='baseline_setup'){ closeDialog(); renderBanner(summary); return; }
      showDialog(draftDialogHtml(summary));
    }catch(error){
      showDialog(`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Starting State is unavailable.</h2><p>${esc(error.message||'Please try again.')}</p><div class="dialog-actions"><button class="btn primary" type="button" data-action="close-dialog">Close</button></div>`);
    }
  }

  function collectDecisions(){
    return [...document.querySelectorAll('.baseline-draft-fact[data-proposal-id]')].map(card=>({
      proposal_id:card.dataset.proposalId,
      decision:card.dataset.removed==='true'?'reject':'accept',
      statement:card.querySelector('[data-baseline-statement]')?.value||'',
      topic:card.querySelector('[data-baseline-topic]')?.value||'',
      area_name:card.querySelector('[data-baseline-area]')?.value||'General',
    }));
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

    const confirm=event.target.closest?.('[data-baseline-confirm-starting]');
    if(confirm&&!confirm.disabled){event.preventDefault();confirmStartingState(confirm);}
  });

  function start(){
    ensureStyles();ensureBanner();
    const switcher=document.getElementById('projectSwitcher');
    if(switcher)new MutationObserver(()=>refresh()).observe(switcher,{attributes:true,attributeFilter:['data-project-id','data-name']});
    const root=document.getElementById('viewRoot');
    if(root){
      let timer=null;
      new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,250);}).observe(root,{childList:true,subtree:true});
    }
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
