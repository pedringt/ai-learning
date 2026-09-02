(() => {
  const API = window.STATE_API;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

  function isMeetingPrep(query){
    const q=norm(query);
    return /\b(prep|prepare|brief|agenda|talking points)\b/.test(q) && /\b(security|meeting)\b/.test(q);
  }
  function isRefinement(query){
    const q=norm(query);
    return /\b(shorter|shorten|brief|agenda|15 minutes|minutes|leadership|slack|talking points|focus|format|turn this|make it)\b/.test(q);
  }
  function canHandle(query, previousPayload){
    return !!API?.ask && (isMeetingPrep(query) || !!previousPayload);
  }
  async function submit(query, previousPayload=null){
    return API.ask(query, previousPayload?.answer || null);
  }

  const labelFor = type => ({
    review:'Needs review', blocking_question:'Blocking', question:'Open question', state:'Current State', history:'History', evidence:'Project evidence'
  }[type] || '');

  function itemHtml(item){
    const badge=item.record_type!=='none'?`<span class="ask-record-badge ask-record-${esc(item.record_type)}">${esc(labelFor(item.record_type))}</span>`:'';
    const cleanDetail=String(item.detail||'').replace(/^blocks:\s*/i,'');
    const detail=cleanDetail?`<span class="ask-item-detail">${item.record_type==='blocking_question'?'Blocks: ':''}${esc(cleanDetail)}</span>`:'';
    let action='';
    if(item.record_type==='review' && item.record_id) action=`<button class="text-button ask-item-action" data-action="open-related-review" data-review-id="${esc(item.record_id)}">Review now →</button>`;
    if((item.record_type==='question'||item.record_type==='blocking_question') && item.record_id) action=`<button class="text-button ask-item-action" data-action="go-open-question" data-question-id="${esc(item.record_id)}">See question →</button>`;
    return `<li class="ask-answer-item"><div>${badge}<span class="ask-item-text">${esc(item.text)}</span>${detail}</div>${action}</li>`;
  }

  function render(payload){
    const a=payload?.answer;
    if(!a) return '<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>State did not receive a grounded answer.</p></div>';
    const sections=(a.sections||[]).filter(s=>(s.items||[]).length).map(s=>`<section class="ask-answer-section ask-section-${esc(s.kind)}"><h3>${esc(s.title)}</h3><ul>${s.items.map(itemHtml).join('')}</ul></section>`).join('');
    const refinements=(a.suggested_refinements||[]).slice(0,3).map(x=>`<button data-prompt="${esc(x)}">${esc(x)}</button>`).join('');
    const remaining=payload.open_items_remaining||{count:0,reviews:0};
    const footer=remaining.count>0?`<aside class="ask-open-items-safety"><strong>Before you move on</strong><p>${remaining.reviews?`${remaining.reviews} ${remaining.reviews===1?'Review':'Reviews'} and `:''}${Math.max(0,remaining.count-remaining.reviews)} other open ${Math.max(0,remaining.count-remaining.reviews)===1?'item':'items'} still need attention.</p><button class="text-button" data-view="open-items">Review open items →</button></aside>`:'';
    return `<div class="ask-live-answer"><div class="ask-answer-head"><div class="result-label">${esc(a.job==='meeting_prep'?'Meeting prep':'State Ask')}</div><button class="text-button ask-copy-answer" data-action="copy-result">Copy</button></div><h2>${esc(a.headline)}</h2><p class="result-lede">${esc(a.summary)}</p>${sections}${refinements?`<div class="ask-refinement-chips">${refinements}</div>`:''}${footer}</div>`;
  }

  window.STATE_ASK = Object.freeze({canHandle, submit, render});
})();
