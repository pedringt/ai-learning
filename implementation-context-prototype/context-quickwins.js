(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const starters = [
    ['What should I know?', 'What should I know right now? Give me a concise briefing with Project snapshot, Changed recently, Needs attention, and Still unclear.'],
    ['Give me a meeting brief', 'Give me a concise meeting brief from what State currently knows. Focus on settled decisions, recent changes, what needs attention, and questions we still need answered.'],
    ['What changed recently?', 'What changed recently? Separate accepted Current State changes from pending evidence or unresolved information.'],
    ['What needs my attention?', 'What needs my attention right now? Prioritize Reviews and blocking questions, then mention other important unresolved items.'],
    ['What are we still unsure about?', 'What are we still unsure about? Show unresolved questions and pending evidence without turning them into facts.']
  ];

  function addStyles() {
    if (document.getElementById('state-quickwin-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-quickwin-styles';
    style.textContent = `
      @media (min-width: 1180px){.ask-quick-starts{display:flex!important;flex-wrap:nowrap!important;gap:8px!important}.ask-quick-starts button{font-size:13px!important;padding:9px 12px!important;white-space:nowrap!important;flex:0 1 auto!important}}
      @media (max-width:1179px){.ask-quick-starts{display:flex!important;flex-wrap:wrap!important;gap:8px!important}}
      .open-items-count-summary{display:inline-block;margin-bottom:4px}
      .ask-grounding{margin-top:18px}
      .ask-grounding summary{cursor:pointer;font-weight:700}
      .ask-grounding article{padding:10px 0;border-bottom:1px solid var(--line,#ddd)}
      .ask-grounding article:last-child{border-bottom:0}
      .ask-grounding p{margin:4px 0 0}
      .open-question-row.is-awaiting-review .open-item-label{font-weight:700}
      .open-question-row.is-awaiting-review .question-awaiting-review-note{display:block;margin-top:4px;font-size:12px;line-height:1.35;color:var(--muted,#666)}
      .orientation-box{background:var(--surface2);border-left:3px solid var(--accent);padding:12px 13px;border-radius:6px;font-size:12px;line-height:1.55;color:var(--ink);margin:18px 0}
      .orientation-box strong{color:var(--accent);font-weight:800}
      .demo-orientation-list{display:grid;gap:10px;margin:16px 0;padding:0;list-style:none}
      .demo-orientation-list li{padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface2)}
      .demo-orientation-list strong{display:block;margin-bottom:3px;color:var(--ink)}
      .demo-orientation-list span{display:block;font-size:12px;line-height:1.5;color:var(--muted)}
      .demo-concepts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0 18px}
      .demo-concept{padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
      .demo-concept strong{display:block;font-size:12px;margin-bottom:4px}
      .demo-concept span{display:block;font-size:11px;line-height:1.45;color:var(--muted)}
      @media (max-width:600px){
        .demo-flow{display:grid!important;grid-template-columns:1fr!important;gap:3px!important}
        .demo-flow li{display:grid!important;grid-template-columns:1fr!important;gap:1px!important}
        .demo-flow li:not(:last-child)::after{content:'↓'!important;display:block!important;margin-left:6px!important}
        .demo-concepts{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function improveFirstRunOrientation(scope=document){
    const projectNav=scope.querySelector('.project-nav-toggle');
    if(projectNav && projectNav.textContent.trim()!=='Project State') projectNav.textContent='Project State';

    const overview=scope.querySelector('.overview.pristine');
    if(!overview) return;
    const askPanel=overview.querySelector('.ask-panel');
    const hasResult=!!askPanel?.querySelector('.ask-session-row,.answer-stage.has-result,.ask-live-answer,.ask-live-loading,.ask-live-error');
    const existingOrientation=overview.querySelector('.orientation-box');

    if(hasResult){
      existingOrientation?.remove();
      return;
    }

    if(!existingOrientation && askPanel){
      const box=document.createElement('div');
      box.className='orientation-box';
      box.innerHTML='<strong>How Project State stays current:</strong> New information is captured as evidence. State proposes what it may change, and you decide what becomes part of Project State.';
      overview.insertBefore(box,askPanel);
    }

    const title=askPanel?.querySelector('label[for="askInput"]');
    if(title) title.textContent='Understand decisions • Ask follow-ups • Prep for meetings';
    const description=title?.closest('.ask-title-row')?.querySelector('p');
    if(description) description.textContent="Summarize Project State, identify what's still pending, or create a meeting brief.";
    const input=askPanel?.querySelector('#askInput');
    if(input && !hasResult) input.placeholder='What do you need right now?';
  }

  function showOrientationHelp(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(!overlay||!body)return;
    body.innerHTML=`<span class="eyebrow">How this works</span>
      <h2 id="dialogTitle">State keeps the project’s working understanding current.</h2>
      <p>State separates what the team currently treats as true from the information and questions that still need judgment.</p>
      <ul class="demo-orientation-list">
        <li><strong>1. Information comes in</strong><span>Notes, Slack, documents, and other project sources are captured as Evidence.</span></li>
        <li><strong>2. State interprets what changed</strong><span>AI compares new Evidence with Project State and identifies possible changes or unresolved questions.</span></li>
        <li><strong>3. You decide what becomes current</strong><span>Important changes go to Review. AI can propose a change, but it cannot update Project State on its own.</span></li>
        <li><strong>4. Project State stays maintained</strong><span>Accepted changes update the definitive project view. Previous decisions remain visible in History.</span></li>
        <li><strong>5. Ask works from that maintained context</strong><span>Use Ask to catch up, understand decisions, find unresolved questions, or prepare for meetings.</span></li>
      </ul>
      <p class="demo-flow-principle">AI interprets → software enforces → people decide</p>
      <div class="demo-concepts">
        <div class="demo-concept"><strong>Project State</strong><span>What the team currently treats as true.</span></div>
        <div class="demo-concept"><strong>Evidence</strong><span>Information State keeps without automatically treating it as truth.</span></div>
        <div class="demo-concept"><strong>Open Items</strong><span>Changes and questions that still need attention.</span></div>
      </div>
      <div class="demo-start"><span class="meta-label">Good places to start</span><button class="demo-start-action" data-action="demo-start-ask"><strong>Ask about Northstar</strong><span>Put a useful project question in Ask →</span></button><button class="demo-start-action" data-action="demo-start-note"><strong>Add a sample note</strong><span>Try new project information and see how Review handles it →</span></button><button class="demo-start-action" data-action="demo-start-project"><strong>Explore Project State</strong><span>Read the definitive view of what the team currently treats as true →</span></button></div>
      <div class="demo-reset-help"><div><strong>Want to start over?</strong><span>Restore the curated Northstar starting scenario. You can also reset Northstar from Settings.</span></div><button class="text-button demo-reset-link" data-action="confirm-demo-reset">Reset example data →</button></div>
      <div class="dialog-actions demo-help-actions"><button class="btn primary" data-action="close-dialog">Got it</button></div>`;
    overlay.hidden=false;
    overlay.scrollTop=0;
    document.body.classList.add('modal-open');
    const dialog=overlay.querySelector('.dialog');
    if(dialog){dialog.scrollTop=0;dialog.focus({preventScroll:true});}
  }

  function installOrientationHelpOverride(){
    if(document.documentElement.dataset.orientationHelpInstalled==='true')return;
    document.documentElement.dataset.orientationHelpInstalled='true';
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-action="show-demo-help"]');
      if(!button)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showOrientationHelp();
    },true);
  }

  function addAskStarters(scope = document) {
    const panel = scope.querySelector('.ask-panel');
    if (!panel || panel.querySelector('.ask-live-answer, .ask-live-loading, .ask-live-error, .ask-quick-starts')) return;
    const existing = panel.querySelector('.prompt-suggestions');
    if (!existing) return;
    existing.classList.remove('single-suggestion');
    existing.classList.add('ask-quick-starts', 'ask-refinement-chips');
    existing.innerHTML = starters.map(([label,prompt]) => `<button type="button" data-prompt="${esc(prompt)}">${esc(label)}</button>`).join('');
  }

  function addGrounding(scope = document) {
    scope.querySelectorAll('.ask-live-answer').forEach(answer => {
      if (answer.querySelector('.ask-grounding')) return;
      const rows = [...answer.querySelectorAll('.ask-answer-item')].map(row => {
        const badge = row.querySelector('.ask-record-badge')?.textContent?.trim() || '';
        const text = row.querySelector('.ask-item-text')?.textContent?.trim() || '';
        return badge && text ? {badge,text} : null;
      }).filter(Boolean);
      const unique=[]; const seen=new Set();
      rows.forEach(row=>{const key=`${row.badge}:${row.text}`;if(!seen.has(key)){seen.add(key);unique.push(row);}});
      if(!unique.length)return;
      const details=document.createElement('details');
      details.className='evidence ask-grounding';
      details.innerHTML=`<summary>Grounded in State's project record</summary><p>${unique.length} project ${unique.length===1?'item is':'items are'} shown in this answer.</p>${unique.map(row=>`<article><strong>${esc(row.badge)}</strong><p>${esc(row.text)}</p></article>`).join('')}`;
      const actions=answer.querySelector('.ask-state-actions');
      const safety=answer.querySelector('.ask-open-items-safety');
      if(actions)answer.insertBefore(details,actions);else if(safety)answer.insertBefore(details,safety);else answer.appendChild(details);
    });
  }

  function improveOpenItemsSummary(scope=document){
    const page=scope.querySelector('.open-items-page'); if(!page)return;
    const head=page.querySelector('.page-head p'); if(!head||head.dataset.quickwinCounts==='true')return;
    const sections=[...page.querySelectorAll('.open-items-section')]; if(sections.length<3)return;
    const readCount=s=>{const n=Number(s.querySelector('.open-items-section-count')?.textContent?.trim()||'0');return Number.isFinite(n)?n:null;};
    const [reviews,blockers,questions]=sections.slice(0,3).map(readCount); if([reviews,blockers,questions].some(v=>v===null))return;
    const summary=document.createElement('strong');summary.className='open-items-count-summary';summary.textContent=`${reviews} ${reviews===1?'needs review':'need review'} · ${blockers} blocking · ${questions} ${questions===1?'other question':'other questions'}`;
    head.prepend(summary,document.createElement('br'));head.dataset.quickwinCounts='true';
  }

  async function clarifyQuestionsAwaitingReview(scope=document){
    const page=scope.querySelector('.open-items-page');
    if(!page || page.dataset.awaitingReviewChecked==='true' || !window.STATE_API?.getReviews)return;
    page.dataset.awaitingReviewChecked='true';
    try{
      const payload=await window.STATE_API.getReviews('open');
      if(!page.isConnected)return;
      const reviews=payload?.items||payload||[];
      const questionIds=new Set(reviews.flatMap(review=>review.resolves_question_ids||[]).filter(Boolean).map(String));
      if(!questionIds.size)return;
      page.querySelectorAll('.open-question-row[data-question-id]').forEach(row=>{
        if(!questionIds.has(String(row.dataset.questionId)))return;
        row.classList.add('is-awaiting-review');
        const label=row.querySelector('.open-item-label');
        if(label)label.textContent='Answer found · Awaiting review';
        const copy=row.querySelector('.open-question-copy');
        if(copy && !copy.querySelector('.question-awaiting-review-note')){
          const note=document.createElement('span');
          note.className='question-awaiting-review-note';
          note.textContent='Evidence may answer this question. Review it before State treats the question as resolved.';
          copy.appendChild(note);
        }
        row.setAttribute('aria-label',`Answer found, awaiting review: ${row.querySelector('.open-question-title')?.textContent?.trim()||'open question'}`);
      });
    }catch(error){
      console.warn('Could not derive questions awaiting review.',error);
      delete page.dataset.awaitingReviewChecked;
    }
  }

  function improveEmptyStates(scope=document){
    scope.querySelectorAll('.open-items-empty').forEach(node=>{
      const text=node.textContent.trim();
      if(text==='Nothing needs your decision right now.')node.textContent='Nothing needs review. Current State is up to date with accepted evidence.';
      else if(text==='Nothing is currently blocked on an answer.')node.textContent='Nothing is blocking the project right now.';
      else if(text==='No other open questions.')node.textContent='Nothing else is unresolved right now.';
    });
  }

  function clarifyReviewCompletion(scope=document){
    const title=scope.querySelector('#dialogTitle'); if(!title)return;
    if(title.textContent.trim()==='Evidence reviewed.'){
      title.textContent='Review complete.';
      const p=title.nextElementSibling;
      if(p&&/preserved as reviewed material/i.test(p.textContent))p.textContent='Current State was not changed. The original evidence remains in Notes, and this review is recorded in History.';
    }
  }

  function clarifyReviewActions(scope=document){
    scope.querySelectorAll('button').forEach(btn=>{
      const text=btn.textContent.trim();
      if(text==='Accept as reviewed evidence'){
        btn.textContent='Accept evidence';
        btn.title='Keep this as reviewed project evidence without automatically changing Current State.';
      } else if(text==='Leave unchanged'){
        btn.title='Do not apply this evidence to Current State.';
      }
    });
  }

  function clarifyNotesProcessedFilter(scope=document){
    const select=scope.querySelector('#notesStatusFilter');
    if(!select)return;
    const reviewedOption=select.querySelector('option[value="reviewed"]');
    if(reviewedOption && reviewedOption.textContent!=='Processed') reviewedOption.textContent='Processed';
    if(select.value==='reviewed'){
      const summary=scope.querySelector('#notesFilterSummary span');
      if(summary) summary.textContent=summary.textContent.replace(/Reviewed/g,'Processed');
    }
  }

  function improveProjectProvenanceSummary(scope=document){
    scope.querySelectorAll('.project-maintained-facts').forEach(details=>{
      const summary=details.querySelector(':scope > summary');
      if(!summary)return;
      const count=details.querySelectorAll('.project-maintained-fact').length;
      if(!count)return;
      const hasProvenance=!!details.querySelector('.project-fact-provenance');
      summary.textContent=`See ${count} maintained Current State ${count===1?'fact':'facts'}${hasProvenance?' · sources & history':''}`;
    });
  }

  function enhance(scope=document){addStyles();installOrientationHelpOverride();improveFirstRunOrientation(scope);addAskStarters(scope);addGrounding(scope);improveOpenItemsSummary(scope);clarifyQuestionsAwaitingReview(scope);improveEmptyStates(scope);clarifyReviewCompletion(scope);clarifyReviewActions(scope);clarifyNotesProcessedFilter(scope);improveProjectProvenanceSummary(scope);}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
