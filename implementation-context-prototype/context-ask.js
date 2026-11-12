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

  function followupMode(query,previousPayload){return previousPayload?'append':'new';}
  function canHandle(query){return !!API?.ask&&!!String(query||'').trim();}
  function canStream(query){return !starterKind(query,null)&&!!API?.askStream&&!!String(query||'').trim();}
  async function submitStream(query,previousPayload=null,handlers={},signal){return API.askStream(query,previousPayload?.answer||null,handlers,signal);}
  async function submit(query,previousPayload=null,signal){const kind=starterKind(query,previousPayload);if(kind)return fastStarterPayload(kind);return API.ask(query,previousPayload?.answer||null,signal);}

  const labelFor=type=>({review:'Needs review',blocking_question:'Blocking',question:'Open question',answered_question:'Answered question',state:'Current State',history:'History',evidence:'Project evidence'}[type]||'');
  // The answer's item list is a snapshot from when it was generated. An item
  // whose Review/Question has since been resolved must not keep appearing as
  // open work -- on screen or in anything copied out of the answer.
  function isItemResolved(i,liveStatus){
    // A "not currently in the live open set" check, not a status lookup:
    // once resolved, hydration prunes the record from local state rather
    // than flipping its status, so a find-by-id-then-check-status here
    // would see nothing and could default to treating it as still open.
    if(i.record_type==='review'&&i.record_id) return typeof liveStatus?.isReviewOpen==='function' ? !liveStatus.isReviewOpen(i.record_id) : false;
    if((i.record_type==='blocking_question'||i.record_type==='question')&&i.record_id) return typeof liveStatus?.isQuestionOpen==='function' ? !liveStatus.isQuestionOpen(i.record_id) : false;
    return false;
  }
  function itemHtml(i,liveStatus){
    const badge=i.record_type!=='none'?`<span class="ask-record-badge ask-record-${esc(i.record_type)}">${esc(labelFor(i.record_type))}</span>`:'';
    const d=String(i.detail||'').replace(/^blocks:\s*/i,'');
    const detail=d?`<span class="ask-item-detail">${i.record_type==='blocking_question'?'Blocks: ':''}${esc(d)}</span>`:'';
    let link='';
    // Callers filter resolved items out before reaching this point, so this
    // is a defensive re-check rather than the primary gate.
    if(isItemResolved(i,liveStatus)){/* resolved: no link */}
    else if(i.record_type==='review'&&i.record_id){
      link=`<button class="text-button ask-item-link ask-item-action" data-action="open-related-review" data-review-id="${esc(i.record_id)}">Review →</button>`;
    }else if((i.record_type==='blocking_question'||i.record_type==='question')&&i.record_id){
      link=`<button class="text-button ask-item-link ask-item-action" data-action="go-open-question" data-question-id="${esc(i.record_id)}">Open →</button>`;
    }else if(i.record_type==='answered_question'&&i.record_id){
      // #640 Draft 1: opens the Question's record view by id (status, Evidence used, provenance).
      link=`<button class="text-button ask-item-link ask-item-action" data-action="open-answered-question" data-question-id="${esc(i.record_id)}">Open →</button>`;
    }
    // The link is a sibling of the copy block, not nested inside it, so
    // .ask-answer-item's flex layout can place it beside the item instead of
    // stacking it on its own line underneath.
    return `<li class="ask-answer-item"><div>${badge}<span class="ask-item-text">${esc(i.text)}</span>${detail}</div>${link}</li>`;
  }
  function meetingNotesScaffold(){return `<section class="ask-meeting-notes"><h3>Meeting notes</h3><div class="meeting-note-block"><strong>Decisions</strong><span>Add notes here</span></div><div class="meeting-note-block"><strong>Answers / new information</strong><span>Add notes here</span></div><div class="meeting-note-block"><strong>Actions</strong><span>☐ Add actions here</span></div><div class="meeting-note-block"><strong>Follow-ups</strong><span>Add notes here</span></div></section>`;}
  // #544 (Oct 20, Paige): every answer says it covers only what State has on record.
  const SCOPE_NOTE="Based on what's recorded in State. There may be things it doesn't know about.";
  // #567: one fixed line when a claim or card failed the server's checks and was left out (WITHHELD_LINE in ask_display.py).
  const WITHHELD_LINE="Part of this answer couldn't be checked against State's records and was left out.";
  // #567 (Nov 11): every claim withheld (ALL_WITHHELD_LINE in ask_display.py). Draft copy.
  const ALL_WITHHELD_LINE="None of this answer could be checked against State's records, so none of it is shown. That doesn't mean it was wrong, or that State has nothing on this.";
  const hasWithheld=a=>!!(a?.withheld_claims||a?.withheld_items);
  // #567 (Paige, Nov 12): the software headline is a small label beside "State Ask", not a heading, so the first claim
  // reads as the answer. Older answers without claims keep their headline as the heading.
  // #567 (Nov 11): a hypothetical draft's assumption line and notes, set by the server, shown with the draft always.
  const hypotheticalLines=s=>s?.hypothetical?[s.hypothetical.line,...(s.hypothetical.notes||[])].filter(Boolean):[];
  const hypotheticalHtml=s=>hypotheticalLines(s).map((l,n)=>`<p class="${n?'ask-withheld-note':'ask-hypothetical-line'}">${esc(l)}</p>`).join('');
  const withheldLine=a=>!a?.streaming&&Array.isArray(a?.claims)&&a.withheld_claims&&!a.claims.some(c=>c?.text)?ALL_WITHHELD_LINE:WITHHELD_LINE;
  const labelled=(label,text)=>label?`[${label}] ${text}`:text;
  // #567: claims replace the summary; each keeps its chip, on screen and in copied text. An answer without claims
  // (a software-written starter answer) still shows its summary.
  function leadHtml(a){
    if(!Array.isArray(a.claims))return `<p class="result-lede">${esc(a.summary||'')}</p>`;
    const claims=a.claims.map(c=>`<li class="ask-claim">${c.label?`<span class="ask-record-badge ask-claim-${esc(c.basis||'none')}">${esc(c.label)}</span>`:''}<span class="ask-claim-text">${esc(c.text)}</span></li>`).join('');
    return `${claims?`<ul class="ask-claims">${claims}</ul>`:''}${hasWithheld(a)?`<p class="ask-withheld-note">${esc(withheldLine(a))}</p>`:''}`;
  }
  // Copy, in the same form as ask_display.displayed_lines: chips stay with the text they label.
  function portableText(p,liveStatus){const a=p?.answer;if(!a)return'';const lines=[a.headline,''];if(Array.isArray(a.claims)){for(const c of a.claims)lines.push(labelled(c.label,c.text));if(hasWithheld(a))lines.push(withheldLine(a));}else lines.push(a.summary);for(const s of a.sections||[]){const items=(s.items||[]).filter(i=>!isItemResolved(i,liveStatus));if(!items.length&&!s.hypothetical)continue;lines.push('',s.title,...hypotheticalLines(s));for(const i of items){lines.push(`- ${labelled(labelFor(i.record_type),i.text)}`);const d=String(i.detail||'').replace(/^blocks:\s*/i,'').trim();if(d)lines.push(`  ${i.record_type==='blocking_question'?'Blocks: ':''}${d}`);}}lines.push('',SCOPE_NOTE);if(a.job==='meeting_prep')lines.push('','Meeting notes','','Decisions','- ','','Answers / new information','- ','','Actions','- [ ] ','','Follow-ups','- ');return lines.join('\n').trim();}

  // #567: the browser never draws the model's raw text. The server sends each claim and each section only after it
  // has passed the same checks as the finished answer ({claims:[claim events], sections:[section events]}); the
  // finished answer then replaces this view. Anything else (a raw string from an older caller) shows the loading state.
  function renderStream(stream,preview=null){
    const claimEvents=Array.isArray(stream?.claims)?stream.claims:[];
    const sectionEvents=Array.isArray(stream?.sections)?stream.sections:[];
    const shown=claimEvents.filter(e=>e?.status==='shown'&&e.claim).map(e=>e.claim);
    const withheld=claimEvents.some(e=>e?.status==='withheld')||sectionEvents.some(e=>e?.withheld_items);
    const sections=sectionEvents.map(e=>e?.section).filter(s=>s&&((s.items||[]).length||s.hypothetical));
    if(!shown.length&&!sections.length&&!withheld){
      const counts=preview?.counts||{};const bits=[];
      if(counts.reviews)bits.push(`${counts.reviews} ${counts.reviews===1?'Review':'Reviews'}`);
      if(counts.blockers)bits.push(`${counts.blockers} ${counts.blockers===1?'blocker':'blockers'}`);
      if(counts.questions)bits.push(`${counts.questions} open ${counts.questions===1?'question':'questions'}`);
      const msg=bits.length?`Grounded in ${bits.join(', ')}. Checking the answer against the record…`:'Grounded context ready. Checking the answer against the record…';
      return `<div class="ask-live-loading has-grounded-preview"><span class="ask-loading-mark" aria-hidden="true"></span><div><strong>Grounded context ready</strong><p>${esc(msg)}</p><p class="ask-loading-note">Suggested prompts above answer instantly from what's already known -- this one runs a live check against the full project record.</p></div></div>`;
    }
    // Sections stream as they pass the checks (#246: the prompt asks for the final shape, so they rarely move when
    // the answer finishes).
    const sectionHtml=sections.map(s=>`<section class="ask-answer-section ask-section-${esc(s.kind)}"><h3>${esc(s.title)}</h3>${hypotheticalHtml(s)}<ul>${(s.items||[]).map(i=>itemHtml(i,null)).join('')}</ul></section>`).join('');
    return `<div class="ask-live-answer ask-streaming-draft" aria-busy="true"><div class="result-label">State Ask · Checking</div>${leadHtml({claims:shown,withheld_claims:withheld?1:0,streaming:true})}${sectionHtml}</div>`;
  }

  function render(payload,liveStatus){
    const a=payload?.answer;
    if(!a)return '<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>State did not receive a grounded answer.</p></div>';
    // Counting resolved-and-dropped items here (rather than tracking "did
    // the user resolve something" as separate state) means this can never
    // drift out of sync with what actually got filtered out below.
    let resolvedCount=0;
    const sections=(a.sections||[]).map(s=>{
      const items=(s.items||[]).filter(i=>{
        const resolved=isItemResolved(i,liveStatus);
        if(resolved) resolvedCount++;
        return !resolved;
      });
      return {...s,items};
    }).filter(s=>(s.items||[]).length||s.hypothetical).map(s=>`<section class="ask-answer-section ask-section-${esc(s.kind)}"><h3>${esc(s.title)}</h3>${hypotheticalHtml(s)}<ul>${(s.items||[]).map(i=>itemHtml(i,liveStatus)).join('')}</ul></section>`).join('');
    const refinements=(a.suggested_refinements||[]).slice(0,3).map(x=>`<button data-prompt="${esc(x)}">${esc(x)}</button>`).join('');
    const notes=a.job==='meeting_prep'?meetingNotesScaffold():'';
    // The item list, footer, and Copy all reflect resolutions live, but the
    // headline/summary text above them is still whatever was written when
    // this answer was generated -- it can't safely rewrite itself (see
    // isItemResolved). Surface that instead of leaving it silently stale.
    // state.md #115: this used to say data-action="refresh-answer", handled
    // only by context-app.js's now-deleted legacy submitAsk() fallback --
    // the live drawer never wired that attribute to anything, so clicking
    // it did nothing (harmless while submitAsk existed as an unused no-op
    // target, but would throw once that dead code was removed). Reuse the
    // drawer's own actually-wired refresh control instead.
    const staleNotice=resolvedCount>0?`<div class="ask-stale-notice"><span>${resolvedCount===1?'An item shown here has':`${resolvedCount} items shown here have`} since been resolved. This summary wasn't regenerated.</span><button class="text-button" type="button" data-review-batch-action="refresh-ask">Refresh this answer →</button></div>`:'';
    // #543: the model's suggested Question rides on the answer element for the Ask-to-Question handoff card.
    return `<div class="ask-live-answer"${a.suggested_question?` data-suggested-question="${esc(a.suggested_question)}"`:''}><div class="ask-answer-head"><div class="result-label">${esc(a.job==='meeting_prep'?'Meeting prep':'State Ask')}${Array.isArray(a.claims)&&a.headline?`<span class="ask-answer-kind"> · ${esc(a.headline)}</span>`:''}</div><div class="ask-answer-actions"><button class="btn secondary ask-copy-answer" data-action="copy-result">Copy</button><button class="btn secondary ask-new-session" data-action="new-ask">New ask</button></div></div>${Array.isArray(a.claims)?'':`<h2>${esc(a.headline)}</h2>`}${leadHtml(a)}${staleNotice}${sections}${notes}<p class="ask-scope-note">${esc(SCOPE_NOTE)}</p>${refinements?`<div class="ask-refinement-chips">${refinements}</div>`:''}</div>`;
  }
  const INITIAL_WAIT_MESSAGES=['Finding the project context that matters for this question…','Checking Current State against open Reviews and Questions…','Keeping unresolved information unresolved…','Shaping the grounded answer around the useful parts…'];const LONG_WAIT_MESSAGES=['Still working. Checking the answer against the project record…','Still working — making sure Reviews qualify rather than silently replace Current State…'];const REFINEMENT_WAIT_MESSAGES=['Refining the existing answer without changing the underlying project truth…','Keeping the same grounding while changing the format and emphasis…','Still working — checking the refinement against the project record…'];const waitTimers=new WeakMap();
  function rotateStatus(node,target,messages,longMessages=null){if(!node||!target||waitTimers.has(node))return;const started=Date.now();let index=0;const timer=window.setInterval(()=>{if(!node.isConnected){window.clearInterval(timer);waitTimers.delete(node);return;}const pool=longMessages&&Date.now()-started>=10000?longMessages:messages;target.textContent=pool[index%pool.length];index+=1;},3000);waitTimers.set(node,timer);}
  function activateWaitStates(scope){const root=scope||document;root.querySelectorAll('.ask-live-loading').forEach(node=>rotateStatus(node,node.querySelector('p'),INITIAL_WAIT_MESSAGES,LONG_WAIT_MESSAGES));root.querySelectorAll('.ask-followup-working').forEach(node=>rotateStatus(node,node,REFINEMENT_WAIT_MESSAGES));}
  window.STATE_ASK=Object.freeze({canHandle,canStream,followupMode,submitStream,submit,renderStream,render,portableText,activateWaitStates});
})();
