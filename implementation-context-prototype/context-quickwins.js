(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

  const starters = [
    ['What should I know?', 'What should I know right now? Give me a concise briefing with Project snapshot, Changed recently, Needs attention, and Still unclear.'],
    ['Prep me for a meeting', 'Prep me for a project meeting. Focus on settled decisions, recent changes, what needs attention, and questions we still need answered.'],
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
      .ask-related-summary{margin-top:18px;padding-top:16px;border-top:1px dashed var(--line,#d7d3e3)}
      .ask-related-summary strong{display:block;margin-bottom:5px}
      .ask-related-summary p{margin:0 0 8px;color:var(--muted,#666)}
      .open-items-section:nth-of-type(3){opacity:.82}
      .open-items-section:nth-of-type(3) .open-items-section-head{background:color-mix(in srgb,var(--surface,#fff) 94%,#777 6%)}
    `;
    document.head.appendChild(style);
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
      details.innerHTML=`<summary>Based on ${unique.length} State ${unique.length===1?'item':'items'}</summary>${unique.map(row=>`<article><strong>${esc(row.badge)}</strong><p>${esc(row.text)}</p></article>`).join('')}`;
      const actions=answer.querySelector('.ask-state-actions');
      const safety=answer.querySelector('.ask-open-items-safety');
      if(actions)answer.insertBefore(details,actions);else if(safety)answer.insertBefore(details,safety);else answer.appendChild(details);
    });
  }

  function compactRelatedItems(scope=document){
    scope.querySelectorAll('.ask-open-items-safety').forEach(box=>{
      if(box.dataset.quickwinCompact==='true')return;
      const links=[...box.querySelectorAll('a,button')];
      if(links.length<2)return;
      const reviewCount=links.filter(x=>/review/i.test(x.textContent)).length;
      const questionCount=links.filter(x=>/question/i.test(x.textContent)).length;
      box.classList.add('ask-related-summary');
      box.innerHTML=`<strong>Related open items</strong><p>${reviewCount?`${reviewCount} ${reviewCount===1?'item needs':'items need'} review`:''}${reviewCount&&questionCount?' · ':''}${questionCount?`${questionCount} open ${questionCount===1?'question':'questions'}`:''}</p><button type="button" class="text-link" data-view="open-items">View open items →</button>`;
      box.dataset.quickwinCompact='true';
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

  function enhance(scope=document){addStyles();addAskStarters(scope);addGrounding(scope);compactRelatedItems(scope);improveOpenItemsSummary(scope);improveEmptyStates(scope);clarifyReviewCompletion(scope);clarifyReviewActions(scope);}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
