(() => {
  const API = window.STATE_API;
  const root = document.getElementById('viewRoot');
  if (!API || !root) return;

  let provenancePromise = null;
  let focusedStateId = null;
  let decorating = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalizeBootstrap(payload) {
    return {
      history: Array.isArray(payload?.history) ? payload.history : [],
      resolvedReviews: Array.isArray(payload?.resolved_reviews) ? payload.resolved_reviews : [],
      openReviews: Array.isArray(payload?.open_reviews) ? payload.open_reviews : [],
    };
  }

  function loadProvenance() {
    if (!provenancePromise) {
      provenancePromise = API.getBootstrap()
        .then(normalizeBootstrap)
        .finally(() => { provenancePromise = null; });
    }
    return provenancePromise;
  }

  function affectedStateIds(review) {
    const linked = (review?.affected_state_items || []).map(item => item?.id).filter(Boolean);
    const proposed = (review?.proposals || []).map(item => item?.state_item_id).filter(Boolean);
    return new Set([...linked, ...proposed]);
  }

  function supportingResolvedReview(review) {
    return review?.status === 'resolved' && ['updated', 'confirmed_current'].includes(review?.resolution);
  }

  function buildTrace(stateId, data) {
    const history = data.history.filter(item => item?.state_item_id === stateId).sort((a,b)=>String(b?.changed_at||'').localeCompare(String(a?.changed_at||'')));
    const resolvedReviews = data.resolvedReviews.filter(review => supportingResolvedReview(review) && affectedStateIds(review).has(stateId));
    const openReviews = data.openReviews.filter(review => affectedStateIds(review).has(stateId));
    const reviewById = new Map(resolvedReviews.map(review => [review.id, review]));
    for (const transition of history) {
      if (transition?.review_id && !reviewById.has(transition.review_id)) {
        reviewById.set(transition.review_id,{id:transition.review_id,status:'resolved',resolution:transition.resolution,decision_question:transition.decision_question,evidence_items:transition.evidence_items||[]});
      }
    }
    const acceptedReviews=[...reviewById.values()];
    const evidence=[]; const seenEvidence=new Set();
    for(const review of acceptedReviews){
      for(const item of review?.evidence_items||[]){
        if(!item?.id||seenEvidence.has(item.id)) continue;
        seenEvidence.add(item.id); evidence.push(item);
      }
    }
    return {history,acceptedReviews,evidence,openReviews};
  }

  function hasAcceptedProvenance(trace){return trace.acceptedReviews.length>0&&trace.evidence.length>0;}
  function sourceLabel(sourceType){
    const value=String(sourceType||'Manual').toLowerCase();
    if(value==='slack') return 'Slack';
    if(value==='google_docs'||value==='docs') return 'Google Docs';
    if(value==='notion') return 'Notion';
    if(['manual','note','notes','evidence'].includes(value)) return 'Manual note';
    return String(sourceType||'Evidence').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  function sourceDetail(item){return item?.source_name||item?.source||item?.channel_name||item?.title||'';}
  function sourceHref(item){return item?.source_url||item?.permalink||item?.url||'';}

  function traceMarkup(trace){
    if(!hasAcceptedProvenance(trace)) return '';
    const latestTransition=trace.history[0]||{};
    const latestReview=trace.acceptedReviews.find(review=>review?.id===latestTransition?.review_id)||trace.acceptedReviews[0]||{};
    const why=latestTransition?.proposal_rationale||latestReview?.why_consequential||latestReview?.decision_question||'Reviewed evidence supported this Current State change.';
    const evidenceItems=trace.evidence.slice(0,3).map(item=>{
      const label=sourceLabel(item?.source_type);
      const detail=sourceDetail(item);
      const href=sourceHref(item);
      return `<li><div class="history-source-line"><span class="history-source-badge">${esc(label)}</span>${detail?`<span class="history-source-detail">${esc(detail)}</span>`:''}${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">View source →</a>`:''}</div><p>${esc(item?.content||'')}</p></li>`;
    }).join('');
    return `<div class="history-provenance-detail" role="note"><strong>Why State treats this as current</strong><p>${esc(why)}</p>${evidenceItems?`<div class="history-provenance-evidence"><span>Based on</span><ul>${evidenceItems}</ul></div>`:''}</div>`;
  }

  function rememberHistoryTarget(event){
    const projectLink=event.target.closest('.project-history-link[data-knowledge-id]');
    const historyEntry=event.target.closest('.history-entry[data-knowledge-id]');
    if(projectLink?.dataset?.knowledgeId) focusedStateId=projectLink.dataset.knowledgeId;
    if(historyEntry?.dataset?.knowledgeId) focusedStateId=historyEntry.dataset.knowledgeId;
    if(event.target.closest('[data-action="clear-history-topic"]')) focusedStateId=null;
  }

  async function decorateFocusedHistory(){
    if(decorating||!focusedStateId) return;
    const topicContext=root.querySelector('.history-context [data-action="clear-history-topic"]');
    const entryBody=root.querySelector('.history-list .history-entry .history-entry-body');
    if(!topicContext||!entryBody||entryBody.querySelector('.history-provenance-detail')) return;
    decorating=true;
    try{
      const data=await loadProvenance(); const trace=buildTrace(focusedStateId,data); const markup=traceMarkup(trace);
      if(markup&&entryBody.isConnected&&!entryBody.querySelector('.history-provenance-detail')) entryBody.insertAdjacentHTML('beforeend',markup);
    }catch(error){} finally{decorating=false;}
  }

  root.addEventListener('click',rememberHistoryTarget,true);
  const style=document.createElement('style');
  style.textContent=`
    .history-provenance-detail{margin-top:16px;padding-top:14px;border-top:1px solid var(--border,#d9dde3);font-size:13px;line-height:1.45}
    .history-provenance-detail>strong{display:block;margin-bottom:5px;font-size:13px}
    .history-provenance-detail>p{margin:0;color:var(--muted,#626779)}
    .history-provenance-evidence{margin-top:12px}
    .history-provenance-evidence>span{display:block;margin-bottom:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#626779)}
    .history-provenance-evidence ul{margin:0;padding:0;list-style:none}
    .history-provenance-evidence li{padding:9px 0;border-top:1px solid var(--border,#e2e4e8)}
    .history-provenance-evidence li>p{margin:5px 0 0}
    .history-source-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .history-source-badge{font-size:11px;font-weight:700}
    .history-source-detail{font-size:12px;color:var(--muted,#626779)}
    .history-source-line a{margin-left:auto;font-size:12px;font-weight:600;text-decoration:none}
  `;
  document.head.appendChild(style);
  const observer=new MutationObserver(()=>requestAnimationFrame(decorateFocusedHistory));
  observer.observe(root,{childList:true,subtree:true});
  window.STATE_PROVENANCE=Object.freeze({buildTrace,traceMarkup,hasAcceptedProvenance,affectedStateIds,supportingResolvedReview,normalizeBootstrap});
})();