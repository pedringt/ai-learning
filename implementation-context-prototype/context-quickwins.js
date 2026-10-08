(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const ICONS = {
    workspace:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6H10v6H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
    open:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    state:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/></svg>',
    notes:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h5"/></svg>',
    history:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9A8 8 0 1 1 6 17.5"/><path d="M4.5 4.5V9H9M12 7.5V12l3 2"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/></svg>',
    review:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8l3 3V20H7z"/><path d="M15 3.5V7h3M10 11h5M10 14h5M10 17h3"/></svg>',
    question:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H10l-4 3v-3H5z"/><path d="M10 9a2.2 2.2 0 1 1 3.8 1.5c-.9.8-1.8 1.1-1.8 2M12 15h.01"/></svg>',
    changed:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 5-5 3 3 7-8"/><path d="M15 6h4v4"/></svg>',
    current:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M8 4v16M11 8h4M11 12h4M11 16h3"/></svg>',
    alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 17h.01"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>'
  };

  function addWorkspaceOrientation(scope=document){
    const heading=scope.querySelector('.overview-heading-row > div');
    if(!heading)return;
    const title=heading.querySelector('h2');
    if(title && !heading.querySelector('.workspace-record-orientation')){
      const orientation=document.createElement('p');
      orientation.className='workspace-record-orientation';
      orientation.textContent='See what needs attention, what changed, and what the team currently treats as true.';
      title.insertAdjacentElement('afterend',orientation);
    }
    const stage=heading.querySelector('.overview-stage');
    // QA follow-up (2026-09-14): this pill/dot treatment assumes a short
    // "current phase · next step" pair split on a literal middle-dot -- it
    // was built against a specific old wording. The actual seeded stage
    // text uses "is nearly complete; implementation planning is next..."
    // (a semicolon, and a "next" phrase that's itself a full clause, not a
    // short label), so the split silently found nothing and stuffed an
    // entire long sentence into one dot-prefixed pill sized for a couple
    // words -- exactly the "extremely long and weird" rendering flagged in
    // QA. Rather than chase this specific wording with another magic
    // separator (fragile the same way against the next rewording, and
    // against any other project's own stage text), only pill-ify when a
    // short, clean split actually exists; anything else stays as plain
    // flowing text instead of being forced into a shape built for a phrase
    // a fraction of its length.
    const MAX_PILL_PHRASE_LENGTH=60;
    if(stage && stage.dataset.mockStyled!=='true'){
      const raw=stage.textContent.trim();
      const parts=raw.split('·').map(s=>s.trim()).filter(Boolean);
      const current=parts[0]||raw;
      const next=(parts[1]||'').replace(/\s+next$/i,'').trim();
      if(current.length<=MAX_PILL_PHRASE_LENGTH && (!next||next.length<=MAX_PILL_PHRASE_LENGTH)){
        stage.innerHTML=`<span class="workspace-stage-pill">${esc(current)}</span>${next?`<span class="workspace-stage-divider" aria-hidden="true"></span><span class="workspace-next-step">Next: ${esc(next.charAt(0).toUpperCase()+next.slice(1))}</span><span class="workspace-next-arrow" aria-hidden="true">›</span>`:''}`;
      }else{
        // Other files style .overview-stage itself (not just its inner
        // pill span) as a small fixed-size capsule -- this modifier
        // overrides that back to plain flowing text for the un-pill-ified
        // case, rather than leaving long prose squeezed into a pill-shaped
        // box regardless of what's inside it.
        stage.classList.add('overview-stage--plain');
      }
      stage.dataset.mockStyled='true';
    }
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

  async function clarifyQuestionsAwaitingReview(scope=document){
    const page=scope.querySelector('.open-items-page');
    if(!page || page.dataset.awaitingReviewChecked==='true' || !window.STATE_API?.getReviews)return;
    page.dataset.awaitingReviewChecked='true';
    try{
      const payload=await window.STATE_API.getReviews('open');
      const reviews=payload?.items||payload||[];
      const questionIds=new Set(reviews.flatMap(review=>review.resolves_question_ids||[]).filter(Boolean).map(String));
      if(!questionIds.size)return;
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

  function enhance(scope=document){
    addWorkspaceOrientation(scope);addGrounding(scope);clarifyQuestionsAwaitingReview(scope);
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();