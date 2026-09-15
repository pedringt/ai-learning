(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let activeRequest = 0;

  function ensureStyles(){
    if(document.getElementById('state-baseline-setup-styles')) return;
    const style=document.createElement('style');
    style.id='state-baseline-setup-styles';
    style.textContent=`
      .baseline-setup-banner{margin:0 0 18px;padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 8px 24px rgba(20,18,30,.05)}
      .baseline-setup-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between}
      .baseline-setup-title{font-weight:800;font-size:15px;margin:0 0 5px}.baseline-setup-copy{margin:0;color:var(--muted);font-size:13px;line-height:1.5;max-width:760px}
      .baseline-setup-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.baseline-setup-stat{font-size:11px;font-weight:750;padding:5px 8px;border-radius:999px;background:var(--surface2);color:var(--muted)}
      .baseline-setup-warning{margin:10px 0 0;font-size:12px;color:var(--muted)}
      .baseline-setup-actions{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:170px}.baseline-setup-actions button{white-space:nowrap}.baseline-setup-hint{font-size:11px;color:var(--muted);text-align:right;max-width:220px}
      @media(max-width:760px){.baseline-setup-head{flex-direction:column}.baseline-setup-actions{align-items:flex-start;min-width:0}.baseline-setup-hint{text-align:left}}
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
  function endpoint(path){
    const base=window.STATE_API?.base;
    return base ? `${base}${path}` : null;
  }
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

  function render(summary){
    const banner=ensureBanner(); if(!banner) return;
    if(!summary || summary.status!=='baseline_setup'){
      banner.hidden=true; banner.innerHTML=''; return;
    }
    const c=summary.counts||{};
    const warning=(c.suspected_omissions||0)>0
      ? `<p class="baseline-setup-warning"><strong>${c.suspected_omissions}</strong> Evidence item${c.suspected_omissions===1?'':'s'} may deserve another look because at least one interpretation chunk produced no Review. That is a prompt to inspect, not proof something is missing.</p>`:'';
    const ready=!!summary.can_finish;
    const hint=ready
      ? 'Finishing switches future Evidence to normal ongoing interpretation.'
      : `${c.pending_reviews||0} pending Review${c.pending_reviews===1?'':'s'}${(c.failed_evidence||0)?` · ${c.failed_evidence} failed Evidence`:''}${(c.processing_evidence||0)?` · ${c.processing_evidence} unfinished Evidence`:''}`;
    banner.innerHTML=`<div class="baseline-setup-head"><div><p class="baseline-setup-title">Baseline Setup</p><p class="baseline-setup-copy">Add the project's starting material and review what State extracts. Baseline Setup stays active across multiple notes and accepted facts until you explicitly finish it.</p><div class="baseline-setup-stats"><span class="baseline-setup-stat">${c.current_state||0} maintained facts</span><span class="baseline-setup-stat">${c.questions||0} open questions</span><span class="baseline-setup-stat">${c.project_areas||0} sections</span><span class="baseline-setup-stat">${c.evidence||0} Evidence items</span></div>${warning}</div><div class="baseline-setup-actions"><button type="button" class="primary-button" data-baseline-finish ${ready?'':'disabled'}>Finish Baseline Setup</button><span class="baseline-setup-hint">${esc(hint)}</span></div></div>`;
    banner.hidden=false;
    const button=banner.querySelector('[data-baseline-finish]');
    if(button&&!button.disabled) button.addEventListener('click', finishBaseline, {once:true});
  }

  async function refresh(){
    const requestId=++activeRequest;
    const banner=ensureBanner();
    if(!projectId()){ if(banner) banner.hidden=true; return; }
    try{
      const summary=await baselineRequest('/api/baseline');
      if(requestId===activeRequest) render(summary);
    }catch(error){
      // Feature previews can point at an older staging backend until the
      // backend branch is promoted. A missing endpoint should not break the
      // rest of State or show a misleading error banner.
      if(requestId===activeRequest && banner) banner.hidden=true;
      if(error.status!==404) console.warn('Baseline Setup status unavailable',error);
    }
  }

  async function finishBaseline(event){
    const button=event.currentTarget;
    if(!window.confirm('Finish Baseline Setup? Future Evidence will use State\'s normal ongoing interpretation rules.')){
      button.addEventListener('click',finishBaseline,{once:true}); return;
    }
    button.disabled=true; button.textContent='Finishing…';
    try{
      const summary=await baselineRequest('/api/baseline/finish',{method:'POST'});
      render(summary);
    }catch(error){
      button.disabled=false; button.textContent='Finish Baseline Setup';
      const hint=document.querySelector('#baselineSetupBanner .baseline-setup-hint');
      if(hint) hint.textContent=error.message||'Baseline Setup could not be finished yet.';
      button.addEventListener('click',finishBaseline,{once:true});
    }
  }

  function start(){
    ensureStyles(); ensureBanner();
    const switcher=document.getElementById('projectSwitcher');
    if(switcher){
      new MutationObserver(()=>refresh()).observe(switcher,{attributes:true,attributeFilter:['data-project-id','data-name']});
    }
    // Evidence submission and Review resolution re-render #viewRoot. Debounce a
    // lightweight status refresh so counts/Finish readiness update without the
    // baseline module needing to reach into context-app.js's private state.
    const root=document.getElementById('viewRoot');
    if(root){
      let refreshTimer=null;
      new MutationObserver(()=>{
        clearTimeout(refreshTimer);
        refreshTimer=setTimeout(refresh,250);
      }).observe(root,{childList:true,subtree:true});
    }
    refresh();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
