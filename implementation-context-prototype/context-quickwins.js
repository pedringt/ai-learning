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

  function addStyles() {
    if (document.getElementById('state-quickwin-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-quickwin-styles';
    style.textContent = `
      :root{
        --mock-blue:#1769e8;
        --mock-blue-soft:#eaf2ff;
        --mock-blue-line:#d8e5f7;
        --mock-red:#c72f3b;
        --mock-red-soft:#fff6f7;
        --mock-red-line:#f1cfd4;
        --mock-green:#20a971;
        --mock-green-soft:#e8f8f1;
        --mock-purple:#6f4bd8;
        --mock-purple-soft:#f0ebff;
        --mock-warm:#9a650c;
        --mock-warm-soft:#fff3d8;
        --mock-surface:#ffffff;
        --mock-canvas:#f8faff;
      }
      body:not(.v88-dark){background:var(--mock-canvas)}
      body:not(.v88-dark) .software-shell,
      body:not(.v88-dark) .app-workspace,
      body:not(.v88-dark) .view-root{background:var(--mock-canvas)!important}
      body:not(.v88-dark) .app-sidebar{background:#fbfcff!important;border-color:#e4eaf3!important}
      body:not(.v88-dark) .app-sidebar .project-switcher{background:#fff;border-color:#dfe6f0;box-shadow:0 1px 2px rgba(31,49,82,.03)}

      .sidebar-nav .nav-item{display:flex!important;align-items:center;gap:10px!important;border-radius:9px!important;margin:2px 0;padding:10px 12px!important;border-bottom:0!important;transition:background .14s ease,color .14s ease}
      .nav-icon{width:18px;height:18px;display:inline-grid;place-items:center;flex:0 0 18px;color:#52688f}
      .nav-icon svg,.mock-icon svg{width:100%;height:100%;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      body:not(.v88-dark) .sidebar-nav .nav-item.active{background:var(--mock-blue-soft)!important;color:#0d57c6!important}
      body:not(.v88-dark) .sidebar-nav .nav-item.active .nav-icon{color:var(--mock-blue)}
      body:not(.v88-dark) .sidebar-nav .nav-item:hover{background:#f1f5fb!important}

      .workspace-record-orientation{max-width:760px;margin:5px 0 0;color:#53627f;font-size:13.5px;line-height:1.52}
      .overview-heading{padding-top:12px!important;margin-bottom:18px!important}
      .overview-heading-row{align-items:flex-start!important}
      .overview-heading-row>div{min-width:0}
      .overview-heading-row h2{font-size:32px!important;letter-spacing:-.025em!important;color:#0d1730!important}
      .overview-heading .eyebrow{color:#596b8d!important;letter-spacing:.11em!important}
      .overview-heading-row .overview-add{background:var(--mock-blue)!important;border-color:var(--mock-blue)!important;color:#fff!important;box-shadow:0 6px 16px rgba(23,105,232,.18)!important;padding:10px 15px!important;border-radius:10px!important}
      .overview-heading-row .overview-add:hover{background:#0f5fd9!important;border-color:#0f5fd9!important}
      .overview-heading .overview-stage{display:flex!important;align-items:center;gap:10px!important;border:0!important;padding:0!important;margin:11px 0 0!important;font-size:12px!important;color:#50617f!important}
      .workspace-stage-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--mock-warm-soft);color:#80530b;font-weight:750;white-space:nowrap}
      .workspace-stage-pill::before{content:'◉';font-size:9px}
      .workspace-stage-divider{width:1px;height:16px;background:#dfe5ef}
      .workspace-next-step{font-weight:650;color:#51617d}
      .workspace-next-arrow{color:var(--mock-blue);font-weight:900;font-size:16px;line-height:1}

      .workspace-attention{border:1px solid var(--mock-red-line)!important;background:linear-gradient(180deg,#fff9fa,var(--mock-red-soft))!important;border-radius:14px!important;padding:18px!important;box-shadow:none!important}
      .workspace-attention-head{align-items:flex-start!important;gap:16px!important;margin-bottom:12px!important}
      .workspace-attention-head>div{position:relative;padding-left:50px;min-height:38px}
      .workspace-attention-head .eyebrow{display:none}
      .workspace-attention-head h3{margin:0 0 3px!important;font-size:18px!important;line-height:1.25!important;color:#7c1720!important}
      .workspace-attention-head p{margin:0!important;color:#6d5971!important;font-size:12.5px!important}
      .attention-head-icon{position:absolute;left:0;top:0;width:38px;height:38px;border:2px solid #ef5361;border-radius:50%;display:grid;place-items:center;color:#df3343;background:#fff}
      .attention-head-icon svg{width:21px;height:21px}
      .workspace-attention .text-button{color:var(--mock-blue)!important;font-size:12px!important}
      .attention-list{border:1px solid #eadde0!important;border-radius:10px!important;overflow:hidden;background:#fff}
      .attention-item{padding:13px 14px!important;border:0!important;border-top:1px solid #edf0f5!important;background:#fff!important;align-items:center!important}
      .attention-item:first-child{border-top:0!important}
      .attention-item:hover{background:#fbfcff!important}
      .attention-item-copy{position:relative;padding-left:47px;min-height:38px;justify-content:center}
      .attention-kind{display:inline-flex!important;width:max-content;padding:2px 8px;border-radius:999px;background:#ffe8eb;color:#a32231!important;font-size:9.5px!important;letter-spacing:0!important;text-transform:none!important;margin-bottom:3px!important}
      .attention-item.blocker .attention-kind{background:#e8f2ff;color:#125ab6!important}
      .attention-item-copy strong{font-size:13px!important;color:#101b32!important}
      .attention-item-copy>span:last-child{font-size:11.5px!important;color:#64718a!important;line-height:1.4!important}
      .attention-row-icon{position:absolute;left:0;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:9px;display:grid;place-items:center}
      .attention-row-icon.review{background:var(--mock-purple-soft);color:var(--mock-purple)}
      .attention-row-icon.blocker{background:var(--mock-blue-soft);color:var(--mock-blue)}
      .attention-row-icon svg{width:18px;height:18px}
      .attention-arrow{color:#5d6d89!important}

      .workspace-below-grid{gap:14px!important;margin-top:14px!important;max-width:none!important}
      .workspace-recent,.workspace-status-card{background:#fff!important;border:1px solid #e0e7f1!important;border-radius:13px!important;padding:16px 18px!important;box-shadow:0 1px 2px rgba(31,49,82,.02)}
      .workspace-recent-head{position:relative;padding-left:48px;min-height:36px;align-items:flex-start!important;margin-bottom:8px!important}
      .workspace-recent-head .eyebrow{font-size:0!important;letter-spacing:0!important;text-transform:none!important;color:#0f1830!important}
      .workspace-recent-head .eyebrow::after{content:'What Changed';font-size:16px;font-weight:820;letter-spacing:-.01em}
      .section-icon{position:absolute;left:0;top:0;width:36px;height:36px;border-radius:9px;display:grid;place-items:center}
      .section-icon.changed{background:var(--mock-green-soft);color:var(--mock-green)}
      .section-icon.current{background:var(--mock-blue-soft);color:var(--mock-blue)}
      .section-icon svg{width:19px;height:19px}
      .workspace-section-hint{margin-left:48px!important;margin-top:-20px!important;margin-bottom:14px!important;color:#64718a!important;font-size:11.5px!important}
      .recent-update-row{padding:10px 0!important;border-color:#edf1f6!important}
      .recent-update-row strong{font-size:12.5px!important;color:#111b31!important}
      .recent-update-row span{font-size:10.5px!important;color:#6a768d!important}
      .workspace-recent-head .text-button{color:var(--mock-blue)!important;font-size:11.5px!important}

      .workspace-status-card{position:relative}
      .workspace-status-card>.eyebrow{display:block;position:relative;padding-left:48px;min-height:36px;font-size:0!important;letter-spacing:0!important;text-transform:none!important;color:#0f1830!important}
      .workspace-status-card>.eyebrow::after{content:'Current State';font-size:16px;font-weight:820;letter-spacing:-.01em}
      .workspace-status-card>.eyebrow .section-icon{position:absolute}
      .workspace-status-body{margin-top:3px!important}
      .workspace-status-item{padding:11px 0!important;border-color:#edf1f6!important}
      .workspace-status-value{font-size:13px!important;color:#111b31!important}
      .workspace-status-row span{font-size:11px!important;color:#69758c!important}
      .workspace-status-row .text-button{color:var(--mock-blue)!important;font-size:11px!important}

      .ask-state-launcher{background:var(--mock-blue)!important;color:#fff!important;border-color:var(--mock-blue)!important;opacity:1!important;box-shadow:0 10px 26px rgba(23,105,232,.26)!important}
      .ask-state-launcher:hover{background:#0f5fd9!important;transform:translateY(-1px)}
      body:not(.v88-dark) .ask-state-drawer{background:#fbfdff!important;border-color:#dde6f1!important}
      body:not(.v88-dark) .ask-state-drawer-head{background:#fff!important;border-color:#e4eaf2!important}
      body:not(.v88-dark) .ask-state-drawer-head h2{color:#0d1730!important}
      body:not(.v88-dark) .ask-state-drawer-controls{background:#fbfdff!important;border-color:#e6ebf3!important}
      body:not(.v88-dark) .ask-state-drawer-form input{border-color:#d9e3f0!important;background:#fff!important}
      body:not(.v88-dark) .ask-state-drawer-form button{background:var(--mock-blue)!important;border-color:var(--mock-blue)!important;color:#fff!important}
      body:not(.v88-dark) .ask-state-starters button{border-color:#e0e7f1!important;background:#fff!important;color:#30415f!important}
      body:not(.v88-dark) .ask-state-starters button:hover{background:var(--mock-blue-soft)!important;color:#0d57c6!important}

      @media(max-width:700px){
        .workspace-record-orientation{max-width:100%;font-size:12.5px;line-height:1.5;margin-top:5px}
        .overview-heading{margin-bottom:14px!important}
        .overview-heading-row{gap:10px!important}
        .overview-heading-row h2{font-size:27px!important}
        .overview-heading-row .overview-add{width:100%!important;order:3;margin-top:2px!important}
        .overview-heading-row>div{width:100%}
        .overview-heading .overview-stage{flex-wrap:wrap!important;gap:7px!important;margin-top:9px!important}
        .workspace-stage-divider{display:none}
        .workspace-next-step{font-size:11.5px}
        .workspace-attention{padding:14px!important;border-radius:12px!important}
        .workspace-attention-head{gap:10px!important}
        .workspace-attention-head>div{padding-left:42px}
        .attention-head-icon{width:32px;height:32px}
        .attention-head-icon svg{width:18px;height:18px}
        .workspace-attention-head h3{font-size:16px!important}
        .workspace-attention-head .text-button{font-size:11px!important}
        .attention-item{padding:11px 10px!important}
        .attention-item-copy{padding-left:42px}
        .attention-row-icon{width:31px;height:31px}
        .workspace-below-grid{grid-template-columns:1fr!important}
        .workspace-recent,.workspace-status-card{padding:14px!important}
      }

      @media(max-width:760px){
        .mobile-primary-nav .nav-icon{display:none}
      }

      body.v88-dark .workspace-stage-pill{background:#3a2d19;color:#efbd66}
      body.v88-dark .workspace-stage-divider{background:#3b3a45}
      body.v88-dark .workspace-attention{background:#241a1d!important;border-color:#51323a!important}
      body.v88-dark .workspace-attention-head h3{color:#f2c3ca!important}
      body.v88-dark .attention-list,body.v88-dark .attention-item{background:#17171d!important;border-color:#34313d!important}
      body.v88-dark .workspace-recent,body.v88-dark .workspace-status-card{background:#17171d!important;border-color:#34313d!important}
    `;
    document.head.appendChild(style);
  }

  function navIconKey(btn){
    const view=btn.dataset.view;
    if(view==='overview')return 'workspace';
    if(view==='open-items')return 'open';
    if(view==='project-overview')return 'state';
    if(view==='notes')return 'notes';
    if(view==='history')return 'history';
    if(view==='settings')return 'settings';
    return null;
  }

  function decorateNav(scope=document){
    scope.querySelectorAll('.sidebar-nav .nav-item').forEach(btn=>{
      if(btn.querySelector('.nav-icon'))return;
      const key=navIconKey(btn); if(!key)return;
      const icon=document.createElement('span'); icon.className='nav-icon'; icon.innerHTML=ICONS[key];
      btn.prepend(icon);
    });
  }

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
    if(stage && stage.dataset.mockStyled!=='true'){
      const raw=stage.textContent.trim();
      const parts=raw.split('·').map(s=>s.trim()).filter(Boolean);
      const current=parts[0]||raw;
      const next=(parts[1]||'').replace(/\s+next$/i,'').trim();
      stage.innerHTML=`<span class="workspace-stage-pill">${esc(current)}</span>${next?`<span class="workspace-stage-divider" aria-hidden="true"></span><span class="workspace-next-step">Next: ${esc(next.charAt(0).toUpperCase()+next.slice(1))}</span><span class="workspace-next-arrow" aria-hidden="true">›</span>`:''}`;
      stage.dataset.mockStyled='true';
    }
  }

  function decorateWorkspace(scope=document){
    const attention=scope.querySelector('.workspace-attention');
    if(attention){
      const headCopy=attention.querySelector('.workspace-attention-head>div');
      if(headCopy && !headCopy.querySelector('.attention-head-icon')){
        const icon=document.createElement('span');icon.className='attention-head-icon mock-icon';icon.innerHTML=ICONS.alert;headCopy.prepend(icon);
      }
      attention.querySelectorAll('.attention-item').forEach(item=>{
        const copy=item.querySelector('.attention-item-copy'); if(!copy||copy.querySelector('.attention-row-icon'))return;
        const kind=item.classList.contains('blocker')?'blocker':'review';
        const icon=document.createElement('span');icon.className=`attention-row-icon ${kind} mock-icon`;icon.innerHTML=ICONS[kind==='blocker'?'question':'review'];copy.prepend(icon);
      });
    }
    const recentHead=scope.querySelector('.workspace-recent-head');
    if(recentHead && !recentHead.querySelector('.section-icon')){
      const icon=document.createElement('span');icon.className='section-icon changed mock-icon';icon.innerHTML=ICONS.changed;recentHead.prepend(icon);
    }
    const status=scope.querySelector('.workspace-status-card');
    const eyebrow=status?.querySelector(':scope > .eyebrow');
    if(eyebrow && !eyebrow.querySelector('.section-icon')){
      const icon=document.createElement('span');icon.className='section-icon current mock-icon';icon.innerHTML=ICONS.current;eyebrow.prepend(icon);
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

  function enhance(scope=document){
    addStyles();decorateNav(scope);addWorkspaceOrientation(scope);decorateWorkspace(scope);addGrounding(scope);improveOpenItemsSummary(scope);clarifyQuestionsAwaitingReview(scope);improveEmptyStates(scope);clarifyReviewCompletion(scope);clarifyReviewActions(scope);clarifyNotesProcessedFilter(scope);improveProjectProvenanceSummary(scope);
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance(document);});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();