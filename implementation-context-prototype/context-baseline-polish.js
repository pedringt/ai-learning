(() => {
  const BASELINE_AREA_DESCRIPTION='Baseline section created from human-authorized project material.';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const BASELINE_SUCCESS_COPY='Added as Evidence. State is using it to update your Starting State. Questions and conflicts stay in Review.';

  function baselineIsBlank(banner){
    const meta=String(banner?.querySelector('.baseline-setup-meta')?.textContent||'').trim();
    return /^0 draft facts\s*·\s*0 questions(?:\s*·|$)/i.test(meta)
      && !/analyzing|failed|need(?:s)? review/i.test(meta);
  }

  function ensureManualButton(banner){
    const existing=banner?.querySelector('[data-baseline-start-manual]');
    if(!banner||!baselineIsBlank(banner)){
      existing?.remove();
      return;
    }
    if(existing)return;
    const review=banner.querySelector('[data-baseline-review-starting]');
    if(!review)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='btn secondary baseline-start-manual';
    button.dataset.baselineStartManual='';
    button.textContent='Start from scratch';
    review.before(button);
  }

  function syncBaselinePresentation(){
    const banner=document.getElementById('baselineSetupBanner');
    const active=!!banner&&!banner.hidden;
    document.body.classList.toggle('state-baseline-active',active);

    const copy=banner?.querySelector('.baseline-setup-copy');
    if(copy) copy.textContent=copy.textContent.replace('Starting State State assembles','Starting State that State assembles');

    const dialogBody=document.getElementById('dialogBody');
    dialogBody?.querySelectorAll('p').forEach(paragraph=>{
      const text=String(paragraph.textContent||'').trim();
      if(text==='Added as Evidence. Current State did not need a Review.' || text==='Added as Evidence. Review Starting State to see what State extracted. Questions and conflicts stay in Review.') paragraph.textContent=BASELINE_SUCCESS_COPY;
    });

    // Older baseline accepts stored setup-process copy as an area description.
    // It is not project truth, so never render it as wiki content. New Starting
    // State confirmations create areas without this description.
    document.querySelectorAll('.project-outline-description').forEach(node=>{
      if(String(node.textContent||'').trim()===BASELINE_AREA_DESCRIPTION) node.remove();
    });

    if(!active)return;
    ensureManualButton(banner);
    const patience=document.querySelector('.analysis-patience');
    if(patience)patience.textContent='Larger starting sources can take a little while to analyze. You can review the Starting State when they finish.';
  }

  function addStyles(){
    if(document.getElementById('state-baseline-polish-styles'))return;
    const style=document.createElement('style');
    style.id='state-baseline-polish-styles';
    style.textContent=`
      body.state-baseline-active .state-reviewer-guide{display:none!important}
      #baselineSetupBanner{padding:10px 12px!important;border-radius:10px!important;box-shadow:none!important}
      #baselineSetupBanner .baseline-review-button,#baselineSetupBanner .baseline-start-manual{width:auto!important;min-height:32px!important;padding:6px 10px!important;font-size:12px!important}
      #baselineSetupBanner .baseline-start-manual{margin-left:auto;margin-right:-8px}
      .baseline-manual-list{display:grid;gap:10px;margin:14px 0}.baseline-manual-row{padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--surface2)}
      .baseline-manual-grid{display:grid;grid-template-columns:minmax(120px,.7fr) minmax(140px,1fr);gap:8px;margin-bottom:8px}
      .baseline-manual-field{display:flex;flex-direction:column;gap:4px}.baseline-manual-field span{font-size:10px;font-weight:750;color:var(--muted)}
      .baseline-manual-field input,.baseline-manual-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);font:inherit;padding:7px 8px}
      .baseline-manual-field textarea{resize:vertical;min-height:64px;line-height:1.4}.baseline-manual-row-head{display:flex;justify-content:flex-end;margin-bottom:5px}
      .baseline-manual-remove{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;padding:0}.baseline-manual-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:14px}
      .baseline-manual-status{margin-right:auto;font-size:11px;color:var(--muted)}
      @media(max-width:760px){#baselineSetupBanner .baseline-start-manual{margin:0;width:100%!important}.baseline-manual-grid{grid-template-columns:1fr}.baseline-manual-actions{align-items:stretch;flex-direction:column}.baseline-manual-status{margin-right:0}.baseline-manual-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function manualRowHtml(){
    return `<div class="baseline-manual-row"><div class="baseline-manual-row-head"><button type="button" class="baseline-manual-remove" data-baseline-remove-manual>Remove</button></div><div class="baseline-manual-grid"><label class="baseline-manual-field"><span>Section</span><input data-baseline-manual-area maxlength="80" value="General"></label><label class="baseline-manual-field"><span>Title</span><input data-baseline-manual-topic maxlength="120" placeholder="e.g. Purpose"></label></div><label class="baseline-manual-field"><span>What should Current State say?</span><textarea data-baseline-manual-statement maxlength="4000" rows="3" placeholder="Write one fact you already know to be true."></textarea></label></div>`;
  }

  function showManualDialog(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(!overlay||!body)return;
    body.innerHTML=`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Start from scratch</h2><p>Already know what the project should treat as true? Add those facts directly. State will save exactly what you enter as Evidence and place the facts in the Starting State draft. Nothing becomes Current State until you confirm it.</p><div class="baseline-manual-list">${manualRowHtml()}</div><button type="button" class="btn secondary" data-baseline-add-manual>Add another fact</button><div class="baseline-manual-actions"><span class="baseline-manual-status"></span><button type="button" class="btn secondary" data-action="close-dialog">Cancel</button><button type="button" class="btn primary" data-baseline-save-manual>Add to Starting State</button></div>`;
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
      setTimeout(()=>document.querySelector('[data-baseline-review-starting]')?.click(),200);
    }catch(error){
      button.disabled=false;button.textContent='Add to Starting State';if(status)status.textContent=error.message||'Could not add those facts.';
    }
  }

  function start(){
    addStyles();syncBaselinePresentation();
    new MutationObserver(()=>requestAnimationFrame(syncBaselinePresentation))
      .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-baseline-start-manual]')){event.preventDefault();showManualDialog();return;}
      if(event.target.closest?.('[data-baseline-add-manual]')){event.preventDefault();const list=document.querySelector('.baseline-manual-list');if(!list)return;if(list.children.length>=20){const status=document.querySelector('.baseline-manual-status');if(status)status.textContent='Starting State can add up to 20 facts at a time.';return;}list.insertAdjacentHTML('beforeend',manualRowHtml());return;}
      const remove=event.target.closest?.('[data-baseline-remove-manual]');
      if(remove){event.preventDefault();const row=remove.closest('.baseline-manual-row');const list=row?.parentElement;if(row&&list){if(list.children.length===1){row.querySelectorAll('input,textarea').forEach(input=>{input.value=input.hasAttribute('data-baseline-manual-area')?'General':'';});}else row.remove();}return;}
      const save=event.target.closest?.('[data-baseline-save-manual]');
      if(save&&!save.disabled){event.preventDefault();saveManualFacts(save);}
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
