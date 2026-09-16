(() => {
  let latestSummary=null;
  let refreshTimer=null;
  let pollingTimer=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function projectId(){return document.getElementById('projectSwitcher')?.dataset?.projectId||''}
  function baselineActive(){return latestSummary?.status==='baseline_setup'||document.body.classList.contains('state-baseline-active')}
  function apiBase(){return window.STATE_API?.base||''}

  function showDialog(html){
    const overlay=document.getElementById('overlay'),body=document.getElementById('dialogBody');
    if(!overlay||!body)return false;
    body.innerHTML=html;overlay.hidden=false;document.body.classList.add('modal-open');
    requestAnimationFrame(()=>overlay.querySelector('[role="dialog"]')?.focus());
    return true;
  }
  function closeDialog(){
    const overlay=document.getElementById('overlay'),body=document.getElementById('dialogBody');
    if(overlay)overlay.hidden=true;if(body)body.innerHTML='';document.body.classList.remove('modal-open');
  }

  async function fetchDraft(){
    const base=apiBase(),id=projectId();
    if(!base||!id)return null;
    const response=await fetch(`${base}/api/baseline/draft`,{headers:{'X-State-Project-Id':id}});
    if(response.status===404)return null;
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.detail?.error_details?.error_message||`API error ${response.status}`);
    return payload;
  }

  function countText(summary){
    const c=summary?.counts||{};
    const facts=(c.current_items||0)+(c.proposed_items||0);
    const questions=(c.current_questions||0)+(c.proposed_questions||0);
    const parts=[`${facts} draft fact${facts===1?'':'s'}`,`${questions} question${questions===1?'':'s'}`];
    if(c.needs_individual_review)parts.push(`${c.needs_individual_review} need${c.needs_individual_review===1?'s':''} review`);
    if(c.failed_evidence)parts.push(`${c.failed_evidence} failed`);
    return parts.join(' · ');
  }

  function renderOwnedBanner(summary){
    const banner=document.getElementById('baselineSetupBanner');
    if(!banner)return;
    latestSummary=summary;
    if(!summary||summary.status!=='baseline_setup'){
      banner.hidden=true;banner.innerHTML='';banner.removeAttribute('data-baseline-dogfood-owned');
      document.body.classList.remove('state-baseline-active');
      syncWorkspaceEmptyStates();
      return;
    }

    const c=summary.counts||{};
    const facts=(c.current_items||0)+(c.proposed_items||0);
    const questions=(c.current_questions||0)+(c.proposed_questions||0);
    const processing=c.processing_evidence||0;
    const failed=c.failed_evidence||0;
    const attention=c.needs_individual_review||0;
    const blank=!facts&&!questions&&!processing&&!failed&&!attention;
    let title,copy,meta='',actions='';

    if(blank){
      title='Set up Current State';
      copy='Add existing project material, or enter what you already know. State will assemble an editable Starting State before anything becomes current.';
      actions=`<div class="baseline-dogfood-actions"><button type="button" class="btn primary" data-baseline-add-starting>Add starting material</button><button type="button" class="btn secondary" data-baseline-start-manual>Enter Current State manually</button></div>`;
    }else if(processing){
      title='Building your Starting State';
      copy='State saved your starting material as Evidence and is organizing it now. You can add another source while this one finishes.';
      meta=`${processing} source${processing===1?'':'s'} analyzing${facts||questions?` · ${countText(summary)}`:''}`;
      actions=`<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button></div>`;
    }else if(failed){
      title='Some starting material needs attention';
      copy='State could not finish analyzing every starting source. Review what was assembled, or add the source again after fixing the problem.';
      meta=countText(summary);
      actions=`<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button><button type="button" class="btn primary" data-baseline-review-starting>Review Starting State</button></div>`;
    }else{
      title='Starting State ready to review';
      copy=(!facts&&questions)
        ?'State found unresolved Questions but no durable Starting State facts. Add more material or review the source before confirming an empty baseline.'
        :'Review the project picture State assembled. You can edit, move, remove, or add missing facts before confirming it.';
      meta=countText(summary);
      actions=`<div class="baseline-dogfood-actions"><button type="button" class="btn secondary" data-baseline-add-starting>Add more material</button><button type="button" class="btn primary" data-baseline-review-starting>Review Starting State</button></div>`;
    }

    const signature=JSON.stringify({title,copy,meta,actions});
    if(banner.dataset.dogfoodSignature===signature&&banner.querySelector('[data-baseline-dogfood-owned]'))return;
    banner.dataset.dogfoodSignature=signature;
    banner.dataset.baselineDogfoodOwned='true';
    banner.innerHTML=`<div class="baseline-setup-row" data-baseline-dogfood-owned><div class="baseline-setup-copy-wrap"><p class="baseline-setup-title">${esc(title)}</p><p class="baseline-setup-copy">${esc(copy)}</p>${meta?`<div class="baseline-setup-meta">${esc(meta)}</div>`:''}</div>${actions}</div>`;
    banner.hidden=false;document.body.classList.add('state-baseline-active');
    syncWorkspaceEmptyStates();
  }

  async function refresh(){
    clearTimeout(refreshTimer);
    try{renderOwnedBanner(await fetchDraft())}catch(error){console.warn('Baseline dogfood status unavailable',error)}
  }
  function scheduleRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,delay)}

  function pollUntilSettled(){
    clearTimeout(pollingTimer);
    const id=projectId();
    let attempts=0;
    const tick=async()=>{
      if(!id||projectId()!==id)return;
      attempts++;
      try{
        const summary=await fetchDraft();renderOwnedBanner(summary);
        if(summary?.status==='baseline_setup'&&(summary.counts?.processing_evidence||0)>0&&attempts<200){pollingTimer=setTimeout(tick,1500);return}
      }catch(error){if(attempts<200){pollingTimer=setTimeout(tick,1500);return}}
      window.STATE_ASK_TEST_API?.hydrateBackend?.();
      document.dispatchEvent(new Event('state-project-record-changed'));
    };
    pollingTimer=setTimeout(tick,250);
  }

  function startingMaterialDialog(){
    showDialog(`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Add starting material</h2><p>Add one existing project source. State saves it as Evidence, then uses it to build the editable Starting State. You can add another source after this one.</p><textarea id="baselineStartingText" rows="7" aria-label="Starting material" placeholder="Paste project notes, a plan, decisions, or other starting material..."></textarea><div class="baseline-starting-upload"><span>or</span><label class="btn secondary" for="baselineStartingFile">Upload a file</label><input id="baselineStartingFile" type="file" accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden><span class="baseline-starting-filename" aria-live="polite"></span></div><div class="baseline-starting-status" aria-live="polite"></div><div class="dialog-actions"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="button" data-baseline-save-starting-text>Add pasted notes</button></div>`);
    requestAnimationFrame(()=>document.getElementById('baselineStartingText')?.focus());
  }

  function setStartingStatus(message){const node=document.querySelector('.baseline-starting-status');if(node)node.textContent=message||''}
  async function submitStartingText(button){
    const text=document.getElementById('baselineStartingText')?.value.trim();
    if(!text){setStartingStatus('Paste some starting material first, or upload a file.');return}
    button.disabled=true;button.textContent='Adding…';setStartingStatus('Saving Evidence…');
    try{
      await window.STATE_API.submitEvidence(text,'manual_note');
      closeDialog();scheduleRefresh(50);pollUntilSettled();
    }catch(error){button.disabled=false;button.textContent='Add pasted notes';setStartingStatus(error?.message||'Could not add that starting material.')}
  }
  async function submitStartingFile(file){
    if(!file)return;
    const name=document.querySelector('.baseline-starting-filename');if(name)name.textContent=file.name;
    setStartingStatus('Uploading and saving Evidence…');
    try{
      await window.STATE_API.uploadEvidence(file);
      closeDialog();scheduleRefresh(50);pollUntilSettled();
    }catch(error){setStartingStatus(error?.message||'Could not upload that file.')}
  }

  function insertAddFactForm(){
    const section=[...document.querySelectorAll('.baseline-draft-dialog .baseline-draft-section')].find(s=>s.querySelector(':scope > h3')?.textContent.trim()==='Starting State');
    if(!section||section.querySelector('[data-baseline-new-fact-form]'))return;
    section.insertAdjacentHTML('beforeend',`<div class="baseline-inline-new-fact" data-baseline-new-fact-form><div class="baseline-draft-grid"><label class="baseline-draft-field"><span>Section</span><input data-baseline-new-area maxlength="80" placeholder="e.g. Product & authority"></label><label class="baseline-draft-field"><span>Title</span><input data-baseline-new-topic maxlength="120" placeholder="e.g. Authority model"></label></div><label class="baseline-draft-field"><span>What Current State should say</span><textarea data-baseline-new-statement rows="3" placeholder="Add one fact that should be part of the Starting State."></textarea></label><div class="baseline-inline-new-actions"><span class="baseline-inline-new-status" aria-live="polite"></span><button type="button" class="btn secondary small" data-baseline-cancel-new-fact>Cancel</button><button type="button" class="btn primary small" data-baseline-save-new-fact>Add fact</button></div></div>`);
    section.querySelector('[data-baseline-new-area]')?.focus();
  }

  async function saveNewFact(button){
    const area=document.querySelector('[data-baseline-new-area]')?.value.trim();
    const topic=document.querySelector('[data-baseline-new-topic]')?.value.trim();
    const statement=document.querySelector('[data-baseline-new-statement]')?.value.trim();
    const status=document.querySelector('.baseline-inline-new-status');
    if(!statement){if(status)status.textContent='Add the fact first.';return}
    if(!area){if(status)status.textContent='Give the fact a section so it stays organized.';return}
    if(!topic){if(status)status.textContent='Give the fact a short title.';return}
    const base=apiBase(),id=projectId();if(!base||!id)return;
    button.disabled=true;button.textContent='Adding…';if(status)status.textContent='';
    try{
      const response=await fetch(`${base}/api/baseline/manual`,{method:'POST',headers:{'Content-Type':'application/json','X-State-Project-Id':id},body:JSON.stringify({items:[{area_name:area,topic,statement}]})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.detail?.error_details?.error_message||(typeof payload?.detail==='string'?payload.detail:null)||`API error ${response.status}`);
      document.querySelector('[data-baseline-new-fact-form]')?.remove();
      document.querySelector('[data-baseline-review-starting]')?.click();
      scheduleRefresh(50);
    }catch(error){button.disabled=false;button.textContent='Add fact';if(status)status.textContent=error?.message||'Could not add that fact.'}
  }

  function enhanceDraftDialog(){
    const dialog=document.querySelector('.baseline-draft-dialog');
    if(!dialog)return;
    const section=[...dialog.querySelectorAll('.baseline-draft-section')].find(s=>s.querySelector(':scope > h3')?.textContent.trim()==='Starting State');
    if(section&&!section.querySelector('[data-baseline-add-fact]')){
      const h3=section.querySelector(':scope > h3');
      const button=document.createElement('button');button.type='button';button.className='btn secondary small baseline-add-fact';button.dataset.baselineAddFact='';button.textContent='+ Add missing fact';h3?.after(button);
    }
  }

  function renameManualDialog(){
    const body=document.getElementById('dialogBody');
    const heading=body?.querySelector('h2');
    if(heading?.textContent.trim()==='Start from scratch'){
      heading.textContent='Enter Current State manually';
      const p=heading.nextElementSibling;
      if(p?.tagName==='P')p.textContent='Enter facts you already know should be part of the Starting State. Add as many as you need, then review everything before confirming Current State.';
    }
  }

  function syncWorkspaceEmptyStates(){
    const attention=document.querySelector('.workspace-attention.is-clear');
    const attentionTitle=attention?.querySelector('h3');
    if(attention&&attentionTitle&&/caught up|workspace is ready/i.test(attentionTitle.textContent||'')){
      attention.classList.add('dogfood-caught-up');
      const copy=attentionTitle.parentElement?.querySelector('p');
      const link=attention.querySelector('.text-button');
      if(baselineActive()){
        attentionTitle.textContent='Your workspace is ready';
        if(copy)copy.textContent='Add starting material above to establish Current State. Reviews and blocking Questions will appear here when they need attention.';
        if(link)link.hidden=true;
      }else{
        attentionTitle.textContent="You're caught up";
        if(copy)copy.textContent='Nothing needs your attention right now.';
        if(link){link.hidden=false;link.textContent='Open Items';link.classList.add('dogfood-quiet-link')}
      }
    }

    document.querySelectorAll('.workspace-recent .workspace-section-hint').forEach(node=>{
      if(node.textContent.trim()==='No changes recorded yet.')node.textContent=baselineActive()?'Changes will appear here after Starting State is confirmed and Current State begins changing.':'Changes will appear here as Current State is updated.';
    });

    if(baselineActive()){
      document.querySelectorAll('.workspace-status-card .workspace-status-item').forEach(item=>{
        const strong=item.querySelector('.workspace-status-value'),support=item.querySelector('.workspace-status-row>span');
        if(strong?.textContent.trim()==='Not yet established'){
          strong.textContent='Starting State not confirmed';
          if(support)support.textContent='Confirm Starting State to establish the project baseline.';
        }else if(/^0 established facts?$/.test(strong?.textContent.trim()||'')){
          if(support)support.textContent='Starting material you confirm will appear here.';
        }
      });
    }
  }

  function addStyles(){
    if(document.getElementById('state-baseline-dogfood-fixes-styles'))return;
    const style=document.createElement('style');style.id='state-baseline-dogfood-fixes-styles';style.textContent=`
      #baselineSetupBanner .baseline-setup-row{align-items:center}
      #baselineSetupBanner .baseline-dogfood-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto}
      #baselineSetupBanner .baseline-dogfood-actions .btn{width:auto!important;min-height:34px!important;padding:7px 11px!important;font-size:12px!important;white-space:nowrap}
      .baseline-draft-actions [data-baseline-confirm-starting]{white-space:nowrap!important;flex:0 0 auto;min-width:max-content}
      .baseline-add-fact{margin:2px 0 10px}
      .baseline-inline-new-fact{margin:8px 0 14px;padding:12px;border:1px dashed var(--line);border-radius:9px;background:var(--surface2)}
      .baseline-inline-new-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:8px}.baseline-inline-new-status{margin-right:auto;color:var(--muted);font-size:11px}
      .baseline-starting-upload{display:flex;align-items:center;gap:8px;margin:5px 0 12px;color:var(--muted);font-size:12px}.baseline-starting-upload label{cursor:pointer;padding:7px 10px}.baseline-starting-filename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.baseline-starting-status{min-height:18px;color:var(--muted);font-size:11px}
      html body .workspace-attention.is-clear.dogfood-caught-up{border-color:color-mix(in srgb,var(--good) 24%,var(--line))!important;background:color-mix(in srgb,var(--surface) 94%,#eaf7ee)!important;box-shadow:none!important}
      html body .workspace-attention.is-clear.dogfood-caught-up .attention-head-icon{background:#eaf7ee!important;border-color:#cfe8d7!important;color:#277b45!important;box-shadow:none!important}
      html body .workspace-attention.is-clear.dogfood-caught-up .attention-head-icon::before{color:#277b45!important}
      html body .workspace-attention .dogfood-quiet-link{color:var(--muted)!important;font-weight:650!important;font-size:11.5px!important}
      @media(max-width:760px){#baselineSetupBanner .baseline-dogfood-actions{width:100%;flex-direction:column;align-items:stretch}#baselineSetupBanner .baseline-dogfood-actions .btn{width:100%!important}.baseline-draft-actions [data-baseline-confirm-starting]{width:100%!important}.baseline-inline-new-actions{align-items:stretch;flex-direction:column}.baseline-inline-new-status{margin-right:0}.baseline-inline-new-actions .btn{width:100%}}
    `;document.head.appendChild(style);
  }

  function sync(){enhanceDraftDialog();renameManualDialog();syncWorkspaceEmptyStates()}

  document.addEventListener('click',event=>{
    const addEvidence=event.target.closest?.('[data-action="add-info"]');
    if(addEvidence&&baselineActive()){
      event.preventDefault();event.stopImmediatePropagation();startingMaterialDialog();return;
    }
    if(event.target.closest?.('[data-baseline-add-starting]')){event.preventDefault();startingMaterialDialog();return}
    if(event.target.closest?.('[data-baseline-add-fact]')){event.preventDefault();insertAddFactForm();return}
    if(event.target.closest?.('[data-baseline-cancel-new-fact]')){event.preventDefault();document.querySelector('[data-baseline-new-fact-form]')?.remove();return}
    const saveNew=event.target.closest?.('[data-baseline-save-new-fact]');if(saveNew&&!saveNew.disabled){event.preventDefault();saveNewFact(saveNew);return}
    const saveText=event.target.closest?.('[data-baseline-save-starting-text]');if(saveText&&!saveText.disabled){event.preventDefault();submitStartingText(saveText);return}
  },true);

  document.addEventListener('change',event=>{
    if(event.target?.id==='baselineStartingFile'){const file=event.target.files?.[0];if(file)submitStartingFile(file)}
  });

  document.addEventListener('state-project-record-changed',()=>{scheduleRefresh(80);setTimeout(sync,120)});
  document.addEventListener('state-baseline-analysis-started',()=>{scheduleRefresh(40);pollUntilSettled()});

  function start(){
    addStyles();
    const banner=document.getElementById('baselineSetupBanner');
    if(banner)new MutationObserver(()=>{if(!banner.querySelector('[data-baseline-dogfood-owned]'))scheduleRefresh(0)}).observe(banner,{childList:true,subtree:true});
    const switcher=document.getElementById('projectSwitcher');
    if(switcher)new MutationObserver(()=>scheduleRefresh(50)).observe(switcher,{attributes:true,attributeFilter:['data-project-id']});
    new MutationObserver(()=>requestAnimationFrame(sync)).observe(document.body,{childList:true,subtree:true});
    scheduleRefresh(0);sync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
