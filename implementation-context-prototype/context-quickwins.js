(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function addStyles() {
    if (document.getElementById('state-quickwin-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-quickwin-styles';
    style.textContent = `
      .open-items-count-summary{display:inline-block;margin-bottom:4px}
      .ask-grounding{margin-top:18px}
      .ask-grounding summary{cursor:pointer;font-weight:700}
      .ask-grounding article{padding:10px 0;border-bottom:1px solid var(--line,#ddd)}
      .ask-grounding article:last-child{border-bottom:0}
      .ask-grounding p{margin:4px 0 0}
      .open-question-row.is-awaiting-review .open-item-label{font-weight:700}
      .open-question-row.is-awaiting-review .question-awaiting-review-note{display:block;margin-top:4px;font-size:12px;line-height:1.35;color:var(--muted,#666)}
    `;
    document.head.appendChild(style);
  }

  // The first-run orientation banner and this module's own "How this works"
  // override/Ask starters were removed as part of the 2026-09-07 UX review
  // batch -- superseded by the native Workspace orientation section, the
  // native showDemoHelp() modal in context-app.js, and context-product-polish.js's
  // Ask State drawer/starters, respectively. Keeping both was exactly the
  // "layering duplicate overrides" pattern that batch was meant to remove.

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
      const reviews=payload?.items||payload||[];
      const questionIds=new Set(reviews.flatMap(review=>review.resolves_question_ids||[]).filter(Boolean).map(String));
      if(!questionIds.size)return;
      // Open Items re-renders progressively as other backend resources
      // finish hydrating, which can replace `page` with a new DOM node while
      // the request above was in flight. Query the live page again rather
      // than bailing on the now-possibly-detached original reference --
      // the fetched question IDs are still correct either way.
      const currentPage=document.querySelector('.open-items-page');
      if(!currentPage)return;
      currentPage.querySelectorAll('.open-question-row[data-question-id]').forEach(row=>{
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

  function enhance(scope=document){addStyles();addGrounding(scope);improveOpenItemsSummary(scope);clarifyQuestionsAwaitingReview(scope);improveEmptyStates(scope);clarifyReviewCompletion(scope);clarifyReviewActions(scope);clarifyNotesProcessedFilter(scope);improveProjectProvenanceSummary(scope);}
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();