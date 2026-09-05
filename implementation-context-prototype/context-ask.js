(() => {
  const API = window.STATE_API;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

  function starterKind(query, previousPayload){
    if(previousPayload) return null;
    const q=norm(query);
    if(q.startsWith('what should i know right now')) return 'know';
    if(q.startsWith('give me a concise meeting brief from what state currently knows') || q.startsWith('give me a meeting brief')) return 'meeting';
    if(q.startsWith('what changed recently')) return 'changed';
    if(q.startsWith('what needs my attention right now') || q.startsWith('what needs my attention')) return 'attention';
    if(q.startsWith('what are we still unsure about')) return 'unsure';
    return null;
  }
  function asList(payload, keys=[]){
    if(Array.isArray(payload)) return payload;
    for(const key of keys) if(Array.isArray(payload?.[key])) return payload[key];
    return [];
  }
  const item=(text,record_type='none',record_id=null,detail=null)=>({text:String(text||'').trim()||'Project context',record_type,record_id,detail:detail||null});
  const section=(kind,title,items)=>({kind,title,items:items.filter(Boolean)});

  async function fastStarterPayload(kind){
    const started=performance.now();
    const [stateRaw,reviewsRaw,questionsRaw,historyRaw]=await Promise.all([
      API.getState(), API.getReviews('open'), API.getQuestions('open'), API.getHistory()
    ]);
    const state=asList(stateRaw,['state','items','results']);
    const reviews=asList(reviewsRaw,['reviews','items','results']);
    const questions=asList(questionsRaw,['questions','items','results']);
    const history=asList(historyRaw,['history','items','results']);
    const blockers=questions.filter(q=>!!q.blocking);
    const ordinary=questions.filter(q=>!q.blocking);
    const stateItem=s=>item(s.statement||s.current_statement||s.text||s.topic,'state',s.id);
    const reviewItem=r=>item(r.decision_question||r.title||r.why_consequential||'Review needed','review',r.id,r.why_consequential||null);
    const questionItem=q=>item(q.text||q.question||'Open question',q.blocking?'blocking_question':'question',q.id,q.blocking?(q.blocks||null):null);
    const historyItem=h=>item(h.new_statement||h.after||h.decision_question||h.reason||'Accepted project change','history',h.id,h.old_statement&&h.new_statement?`Before: ${h.old_statement}`:null);
    const totalOpen=reviews.length+questions.length;
    let answer;
    if(kind==='know'){
      answer={job:'catch_up',headline:'Here is what matters right now.',summary:`${reviews.length} ${reviews.length===1?'Review needs':'Reviews need'} attention, ${blockers.length} ${blockers.length===1?'question is':'questions are'} blocking, and ${ordinary.length} other ${ordinary.length===1?'question remains':'questions remain'} open.`,sections:[
        section('established','Project snapshot',state.slice(0,4).map(stateItem)),
        section('changes','Changed recently',history.slice(0,3).map(historyItem)),
        section('needs_review','Needs attention',[...reviews.slice(0,3).map(reviewItem),...blockers.slice(0,3).map(questionItem)]),
        section('questions','Still unclear',ordinary.slice(0,4).map(questionItem))
      ],source_ids:[],uncertainty_ids:[...reviews.map(x=>x.id),...questions.map(x=>x.id)],suggested_refinements:['Make this shorter','Focus only on blockers','Give me a meeting brief']};
    } else if(kind==='meeting'){
      answer={job:'meeting_prep',headline:'Meeting brief',summary:'Carry the settled project state, the decisions that need attention, and the questions worth getting answered.',sections:[
        section('needs_review','Decisions needed',reviews.slice(0,3).map(reviewItem)),
        section('questions','Questions to get answered',[...blockers.slice(0,3).map(questionItem),...ordinary.slice(0,3).map(questionItem)]),
        section('changes','Recent changes',history.slice(0,3).map(historyItem)),
        section('established','Useful context',state.slice(0,3).map(stateItem))
      ],source_ids:[],uncertainty_ids:[...reviews.map(x=>x.id),...questions.map(x=>x.id)],suggested_refinements:['Make this shorter','Turn this into an agenda','Make it leadership-ready']};
    } else if(kind==='changed'){
      answer={job:'historical',headline:'Recent accepted changes',summary:'These are recorded project changes. Pending Reviews and open Questions remain separate from accepted Current State.',sections:[
        section('changes','What changed',history.slice(0,6).map(historyItem)),
        section('needs_review','Still pending',reviews.slice(0,3).map(reviewItem))
      ],source_ids:[],uncertainty_ids:reviews.map(x=>x.id),suggested_refinements:['Make this shorter','Show only the biggest changes','What needs my attention?']};
    } else if(kind==='attention'){
      answer={job:'attention_check',headline:'What needs your attention',summary:blockers.length?'Start with Reviews and confirmed blockers. Ordinary open Questions come after those.':'Start with Reviews. No open Question is currently marked blocking.',sections:[
        section('needs_review','Needs your review',reviews.slice(0,5).map(reviewItem)),
        section('questions','Blocking questions',blockers.slice(0,5).map(questionItem)),
        section('open_attention','Other open questions',ordinary.slice(0,4).map(questionItem))
      ],source_ids:[],uncertainty_ids:[...reviews.map(x=>x.id),...questions.map(x=>x.id)],suggested_refinements:['Focus only on blockers','Make this 3 bullets','Give me a meeting brief']};
    } else {
      answer={job:'general_project_synthesis',headline:'What is still unresolved',summary:'These items are intentionally not being treated as settled project truth.',sections:[
        section('questions','Blocking questions',blockers.slice(0,5).map(questionItem)),
        section('questions','Open questions',ordinary.slice(0,6).map(questionItem)),
        section('needs_review','Evidence still awaiting review',reviews.slice(0,4).map(reviewItem))
      ],source_ids:[],uncertainty_ids:[...reviews.map(x=>x.id),...questions.map(x=>x.id)],suggested_refinements:['Focus only on blockers','What needs my attention?','Give me a meeting brief']};
    }
    answer.sections=answer.sections.filter(s=>s.items.length);
    const selectedOpen=new Set(answer.sections.flatMap(s=>s.items.filter(i=>['review','blocking_question','question'].includes(i.record_type)).map(i=>i.record_id)));
    return {answer,selection:{job:answer.job,state_ids:answer.sections.flatMap(s=>s.items.filter(i=>i.record_type==='state').map(i=>i.record_id)),review_ids:answer.sections.flatMap(s=>s.items.filter(i=>i.record_type==='review').map(i=>i.record_id)),blocking_question_ids:answer.sections.flatMap(s=>s.items.filter(i=>i.record_type==='blocking_question').map(i=>i.record_id)),question_ids:answer.sections.flatMap(s=>s.items.filter(i=>i.record_type==='question').map(i=>i.record_id)),history_ids:answer.sections.flatMap(s=>s.items.filter(i=>i.record_type==='history').map(i=>i.record_id)),evidence_ids:[]},open_items_remaining:{count:Math.max(0,totalOpen-selectedOpen.size),reviews:Math.max(0,reviews.length-answer.sections.flatMap(s=>s.items).filter(i=>i.record_type==='review').length)},followup_mode:'new',timing:{pipeline:'deterministic_starter_ui',context_ms:Math.round(performance.now()-started),provider_ms:0,validation_ms:0,total_ms:Math.round(performance.now()-started)}};
  }

  function isMeetingPrep(query){const q=norm(query);return /\b(prep|prepare|brief|agenda|talking points)\b/.test(q)&&/\b(security|meeting)\b/.test(q);}
  function followupMode(query,previousPayload){return previousPayload?'append':'new';}
  function canHandle(query){return !!API?.ask&&!!String(query||'').trim();}
  async function preview(query){if(!API?.askPreview||!isMeetingPrep(query))return null;return API.askPreview(query);}
  function canStream(query){return !starterKind(query,null)&&!!API?.askStream&&!!String(query||'').trim();}
  async function submitStream(query,previousPayload=null,handlers={}){return API.askStream(query,previousPayload?.answer||null,handlers);}
  async function submit(query,previousPayload=null){const kind=starterKind(query,previousPayload);if(kind)return fastStarterPayload(kind);return API.ask(query,previousPayload?.answer||null);}

  const labelFor=type=>({review:'Needs review',blocking_question:'Blocking',question:'Open question',state:'Current State',history:'History',evidence:'Project evidence'}[type]||'');
  function itemHtml(i){const badge=i.record_type!=='none'?`<span class="ask-record-badge ask-record-${esc(i.record_type)}">${esc(labelFor(i.record_type))}</span>`:'';const d=String(i.detail||'').replace(/^blocks:\s*/i,'');const detail=d?`<span class="ask-item-detail">${i.record_type==='blocking_question'?'Blocks: ':''}${esc(d)}</span>`:'';const link=i.record_type==='review'&&i.record_id?`<button class="text-button ask-item-link" data-action="open-related-review" data-review-id="${esc(i.record_id)}">Review →</button>`:(i.record_type==='blocking_question'||i.record_type==='question')&&i.record_id?`<button class="text-button ask-item-link" data-action="go-open-question" data-question-id="${esc(i.record_id)}">Open →</button>`:'';return `<li class="ask-answer-item"><div>${badge}<span class="ask-item-text">${esc(i.text)}</span>${detail}${link}</div></li>`;}
  function stateActions(a){const seen=new Set(),r=[],q=[];for(const s of a.sections||[])for(const i of s.items||[]){if(!i.record_id||seen.has(`${i.record_type}:${i.record_id}`))continue;seen.add(`${i.record_type}:${i.record_id}`);if(i.record_type==='review')r.push(i);if(i.record_type==='blocking_question'||i.record_type==='question')q.push(i);}if(!r.length&&!q.length)return'';const bits=[];if(r.length)bits.push(`${r.length} ${r.length===1?'Review':'Reviews'}`);if(q.length)bits.push(`${q.length} ${q.length===1?'Question':'Questions'}`);return `<aside class="ask-state-actions"><span class="meta-label">Related open items</span><div><span>${esc(bits.join(' · '))}</span> <button class="text-button" data-view="open-items">View open items →</button></div></aside>`;}
  function meetingNotesScaffold(){return `<section class="ask-meeting-notes"><h3>Meeting notes</h3><div class="meeting-note-block"><strong>Decisions</strong><span>Add notes here</span></div><div class="meeting-note-block"><strong>Answers / new information</strong><span>Add notes here</span></div><div class="meeting-note-block"><strong>Actions</strong><span>☐ Add actions here</span></div><div class="meeting-note-block"><strong>Follow-ups</strong><span>Add notes here</span></div></section>`;}
  function portableText(p){const a=p?.answer;if(!a)return'';const lines=[a.headline,'',a.summary];for(const s of a.sections||[]){if(!(s.items||[]).length)continue;lines.push('',s.title);for(const i of s.items){lines.push(`- ${i.text}`);const d=String(i.detail||'').replace(/^blocks:\s*/i,'').trim();if(d)lines.push(`  ${i.record_type==='blocking_question'?'Blocks: ':''}${d}`);}}if(a.job==='meeting_prep')lines.push('','Meeting notes','','Decisions','- ','','Answers / new information','- ','','Actions','- [ ] ','','Follow-ups','- ');return lines.join('\n').trim();}

  function decodeJsonStringFragment(fragment){
    try{return JSON.parse(`"${fragment}"`);}catch(_){return fragment.replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\');}
  }
  function streamedFields(raw){
    const out=[];const re=/"(headline|summary|title|text|detail)"\s*:\s*"/g;let match;
    while((match=re.exec(raw))){
      let i=re.lastIndex,j=i,escaped=false,complete=false;
      for(;j<raw.length;j++){
        const ch=raw[j];
        if(escaped){escaped=false;continue;}
        if(ch==='\\'){escaped=true;continue;}
        if(ch==='"'){complete=true;break;}
      }
      const value=decodeJsonStringFragment(raw.slice(i,j))
        .replace(/\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b/gi,'')
        .replace(/\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b/gi,'')
        .replace(/\s+([,.;:])/g,'$1')
        .replace(/\s{2,}/g,' ')
        .trim();
      out.push({key:match[1],value,complete});
      if(!complete)break;
      re.lastIndex=j+1;
    }
    return out;
  }
  function renderStream(raw,preview=null){
    const fields=streamedFields(raw||'');
    if(!fields.length){
      const counts=preview?.counts||{};const bits=[];
      if(counts.reviews)bits.push(`${counts.reviews} ${counts.reviews===1?'Review':'Reviews'}`);
      if(counts.blockers)bits.push(`${counts.blockers} ${counts.blockers===1?'blocker':'blockers'}`);
      if(counts.questions)bits.push(`${counts.questions} open ${counts.questions===1?'question':'questions'}`);
      const msg=bits.length?`Grounded in ${bits.join(', ')}. Drafting the answer…`:'Grounded context ready. Drafting the answer…';
      return `<div class="ask-live-loading has-grounded-preview"><span class="ask-loading-mark" aria-hidden="true"></span><div><strong>Grounded context ready</strong><p>${esc(msg)}</p></div></div>`;
    }
    let body='';
    for(const field of fields){
      const cursor=field.complete?'':'<span class="ask-stream-cursor" aria-hidden="true"></span>';
      if(field.key==='headline')body+=`<h2>${esc(field.value)}${cursor}</h2>`;
      else if(field.key==='summary')body+=`<p class="result-lede">${esc(field.value)}${cursor}</p>`;
      else if(field.key==='title')body+=`<h3 class="ask-stream-section-title">${esc(field.value)}${cursor}</h3>`;
      else if(field.key==='text')body+=`<div class="ask-stream-item">${esc(field.value)}${cursor}</div>`;
      else if(field.key==='detail'&&field.value)body+=`<div class="ask-stream-detail">${esc(field.value)}${cursor}</div>`;
    }
    return `<div class="ask-live-answer ask-streaming-draft" aria-busy="true"><div class="result-label">State Ask · Drafting</div>${body}</div>`;
  }

  function render(payload){const a=payload?.answer;if(!a)return '<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>State did not receive a grounded answer.</p></div>';const sections=(a.sections||[]).filter(s=>(s.items||[]).length).map(s=>`<section class="ask-answer-section ask-section-${esc(s.kind)}"><h3>${esc(s.title)}</h3><ul>${s.items.map(itemHtml).join('')}</ul></section>`).join('');const refinements=(a.suggested_refinements||[]).slice(0,3).map(x=>`<button data-prompt="${esc(x)}">${esc(x)}</button>`).join('');const remaining=payload.open_items_remaining||{count:0,reviews:0};const footer=remaining.count>0?`<aside class="ask-open-items-safety"><strong>Related open items</strong><p>${remaining.reviews?`${remaining.reviews} ${remaining.reviews===1?'Review':'Reviews'} · `:''}${Math.max(0,remaining.count-remaining.reviews)} other open ${Math.max(0,remaining.count-remaining.reviews)===1?'item':'items'}</p><button class="text-button" data-view="open-items">View open items →</button></aside>`:'';const notes=a.job==='meeting_prep'?meetingNotesScaffold():'';return `<div class="ask-live-answer"><div class="ask-answer-head"><div class="result-label">${esc(a.job==='meeting_prep'?'Meeting prep':'State Ask')}</div><div class="ask-answer-actions"><button class="btn secondary ask-copy-answer" data-action="copy-result">Copy</button><button class="btn secondary ask-new-session" data-action="new-ask">New ask</button></div></div><h2>${esc(a.headline)}</h2><p class="result-lede">${esc(a.summary)}</p>${sections}${notes}${refinements?`<div class="ask-refinement-chips">${refinements}</div>`:''}${stateActions(a)}${footer}</div>`;}
  const INITIAL_WAIT_MESSAGES=['Finding the project context that matters for this question…','Checking Current State against open Reviews and Questions…','Keeping unresolved information unresolved…','Shaping the grounded answer around the useful parts…'];const LONG_WAIT_MESSAGES=['Still working — validating the answer against the project record…','Still working — making sure Reviews qualify rather than silently replace Current State…'];const REFINEMENT_WAIT_MESSAGES=['Refining the existing answer without changing the underlying project truth…','Keeping the same grounding while changing the format and emphasis…','Still working — checking the refinement against the project record…'];const waitTimers=new WeakMap();
  function rotateStatus(node,target,messages,longMessages=null){if(!node||!target||waitTimers.has(node))return;const started=Date.now();let index=0;const timer=window.setInterval(()=>{if(!node.isConnected){window.clearInterval(timer);waitTimers.delete(node);return;}const pool=longMessages&&Date.now()-started>=10000?longMessages:messages;target.textContent=pool[index%pool.length];index+=1;},3000);waitTimers.set(node,timer);}
  function activateWaitStates(scope){const root=scope||document;root.querySelectorAll('.ask-live-loading').forEach(node=>rotateStatus(node,node.querySelector('p'),INITIAL_WAIT_MESSAGES,LONG_WAIT_MESSAGES));root.querySelectorAll('.ask-followup-working').forEach(node=>rotateStatus(node,node,REFINEMENT_WAIT_MESSAGES));}
  window.STATE_ASK=Object.freeze({canHandle,canStream,followupMode,preview,submitStream,submit,renderStream,render,portableText,activateWaitStates});
})();
