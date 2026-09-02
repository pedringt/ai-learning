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
    return `<li class="ask-answer-item"><div>${badge}<span class="ask-item-text">${esc(item.text)}</span>${detail}</div></li>`;
  }

  function stateActions(a){
    const seen=new Set(), actions=[];
    for(const section of a.sections||[]){
      for(const item of section.items||[]){
        if(!item.record_id || seen.has(`${item.record_type}:${item.record_id}`)) continue;
        seen.add(`${item.record_type}:${item.record_id}`);
        if(item.record_type==='review') actions.push(`<button class="text-button" data-action="open-related-review" data-review-id="${esc(item.record_id)}">Review now →</button>`);
        if(item.record_type==='blocking_question'||item.record_type==='question') actions.push(`<button class="text-button" data-action="go-open-question" data-question-id="${esc(item.record_id)}">Open question →</button>`);
      }
    }
    return actions.length?`<aside class="ask-state-actions"><span class="meta-label">In State</span><div>${actions.join('')}</div></aside>`:'';
  }

  function meetingNotesScaffold(){
    return `<section class="ask-meeting-notes"><h3>Meeting notes</h3><div class="meeting-note-block"><strong>Decisions</strong><span>—</span></div><div class="meeting-note-block"><strong>Answers / new information</strong><span>—</span></div><div class="meeting-note-block"><strong>Actions</strong><span>☐</span></div><div class="meeting-note-block"><strong>Follow-ups</strong><span>—</span></div></section>`;
  }

  function copyLabel(job){
    return ({meeting_prep:'Copy meeting brief',project_update:'Copy update',catch_up:'Copy summary',current_fact:'Copy answer',why_or_provenance:'Copy explanation',drafting:'Copy draft'}[job]||'Copy answer');
  }

  function portableText(payload){
    const a=payload?.answer;
    if(!a) return '';
    const lines=[a.headline,'',a.summary];
    for(const section of a.sections||[]){
      if(!(section.items||[]).length) continue;
      lines.push('',section.title);
      for(const item of section.items){
        lines.push(`- ${item.text}`);
        const detail=String(item.detail||'').replace(/^blocks:\s*/i,'').trim();
        if(detail) lines.push(`  ${item.record_type==='blocking_question'?'Blocks: ':''}${detail}`);
      }
    }
    if(a.job==='meeting_prep') lines.push('','Meeting notes','','Decisions','- ','','Answers / new information','- ','','Actions','- [ ] ','','Follow-ups','- ');
    return lines.join('\n').trim();
  }

  function render(payload){
    const a=payload?.answer;
    if(!a) return '<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>State did not receive a grounded answer.</p></div>';
    const sections=(a.sections||[]).filter(s=>(s.items||[]).length).map(s=>`<section class="ask-answer-section ask-section-${esc(s.kind)}"><h3>${esc(s.title)}</h3><ul>${s.items.map(itemHtml).join('')}</ul></section>`).join('');
    const refinements=(a.suggested_refinements||[]).slice(0,3).map(x=>`<button data-prompt="${esc(x)}">${esc(x)}</button>`).join('');
    const remaining=payload.open_items_remaining||{count:0,reviews:0};
    const footer=remaining.count>0?`<aside class="ask-open-items-safety"><strong>Before you move on</strong><p>${remaining.reviews?`${remaining.reviews} ${remaining.reviews===1?'Review':'Reviews'} and `:''}${Math.max(0,remaining.count-remaining.reviews)} other open ${Math.max(0,remaining.count-remaining.reviews)===1?'item':'items'} still need attention.</p><button class="text-button" data-view="open-items">Review open items →</button></aside>`:'';
    const notes=a.job==='meeting_prep'?meetingNotesScaffold():'';
    return `<div class="ask-live-answer"><div class="ask-answer-head"><div class="result-label">${esc(a.job==='meeting_prep'?'Meeting prep':'State Ask')}</div><button class="btn secondary ask-copy-answer" data-action="copy-result">${esc(copyLabel(a.job))}</button></div><h2>${esc(a.headline)}</h2><p class="result-lede">${esc(a.summary)}</p>${sections}${notes}${refinements?`<div class="ask-refinement-chips">${refinements}</div>`:''}${stateActions(a)}${footer}</div>`;
  }

  window.STATE_ASK = Object.freeze({canHandle, submit, render, portableText, copyLabel});
})();
