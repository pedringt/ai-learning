(() => {
  const API = window.STATE_API;
  const DATA = window.PROJECT_CONTEXT_DATA || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asList = (payload, keys = []) => {
    if (Array.isArray(payload)) return payload;
    for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  };

  const starters = [
    ['What should I know?', 'What should I know right now? Give me a concise briefing with Project snapshot, Changed recently, Needs attention, and Still unclear.'],
    ['Prep me for my next meeting', 'Give me a concise meeting brief from what State currently knows. Focus on settled decisions, recent changes, what needs attention, and questions we still need answered.'],
    ['Why did we keep human review?', 'Why did we keep human review for the pilot? Use Current State and History, and keep any unresolved assumptions separate.'],
    ["What's blocking implementation?", 'What is blocking implementation planning right now? Prioritize blocking questions and pending Reviews that need to be settled before implementation.'],
    ['What are we still unsure about?', 'What are we still unsure about? Show unresolved questions and pending evidence without turning them into facts.']
  ];

  let capturedAttentionHtml = '';
  let fallbackAttentionLoading = false;
  let copyContextData = null;

  function addStyles(){
    if(document.getElementById('state-product-polish-styles')) return;
    const style=document.createElement('style');
    style.id='state-product-polish-styles';
    style.textContent=`
      .overview .workspace-attention + .ask-panel{margin-top:36px!important;padding-top:30px!important;border-top:1px solid var(--line)!important}
      .overview .orientation-box + .workspace-attention,.overview .workspace-context-banner + .workspace-attention{margin-top:22px!important}
      .workspace-context-banner{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--surface2);border-left:3px solid var(--accent);padding:12px 13px;border-radius:6px;font-size:12px;line-height:1.55;color:var(--ink);margin:18px 0}
      .workspace-context-banner strong{color:var(--accent);font-weight:800}
      .orientation-box .workspace-context-link{display:inline-block;margin-left:10px}
      .ask-title-row label[for="askInput"]{font-size:0!important;line-height:1!important}
      .ask-title-row label[for="askInput"]::after{content:'Ask State';font-size:18px;line-height:1.25;font-weight:800;color:var(--ink);letter-spacing:0;text-transform:none}
      .ask-title-row>div>p{display:none!important}
      .ask-state-description{display:block!important;margin:5px 0 0!important;color:var(--muted)!important;font-size:13px!important;line-height:1.5!important}
      .ask-session-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .ask-another-button{flex:0 0 auto;margin-top:2px}
      .ask-authority-strip{display:flex;align-items:center;gap:8px;margin:0 0 16px;padding:9px 11px;border-radius:8px;background:var(--surface2);font-size:12px;color:var(--muted)}
      .ask-authority-strip strong{color:var(--ink)}
      .ask-context-links{display:flex;flex-wrap:wrap;gap:14px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
      .project-head-copy-context{margin-left:auto}
      .copy-context-intro{margin-bottom:16px}
      .copy-context-options{display:grid;gap:9px;margin:16px 0}
      .copy-context-option{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--surface);cursor:pointer}
      .copy-context-option input{margin-top:4px}
      .copy-context-option strong,.copy-context-option span{display:block}
      .copy-context-option span{margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}
      .copy-context-task{margin-top:14px}
      .copy-context-task label{display:block;font-weight:800;font-size:12px;margin-bottom:6px}
      .copy-context-task input{width:100%;border:1px solid #cfc9bd;background:#fff;border-radius:9px;padding:11px 12px;color:var(--ink);outline:none}
      .copy-context-status{min-height:18px;margin:8px 0 0!important;font-size:12px}
      @media(max-width:700px){.workspace-context-banner,.ask-session-row{align-items:flex-start;flex-direction:column}.project-head-copy-context{margin-left:0}.overview .workspace-attention + .ask-panel{margin-top:28px!important;padding-top:24px!important}}
    `;
    document.head.appendChild(style);
  }

  function captureAttention(){
    const overview=document.querySelector('.overview.pristine');
    if(!overview || overview.querySelector('.ask-session-row')) return;
    const attention=overview.querySelector('.workspace-attention');
    if(attention) capturedAttentionHtml=attention.outerHTML;
  }

  async function restoreAttentionFromApi(overview, askPanel){
    if(fallbackAttentionLoading || !API?.getAttention || !overview?.isConnected || !askPanel?.isConnected) return;
    fallbackAttentionLoading=true;
    const loading=document.createElement('section');
    loading.className='workspace-attention ux-restored-attention is-loading';
    loading.innerHTML='<div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>Opening action items…</h3></div></div>';
    askPanel.before(loading);
    try{
      const payload=await API.getAttention();
      if(!loading.isConnected) return;
      const reviews=asList(payload?.open_reviews || [], ['items','reviews']);
      const questions=asList(payload?.questions || [], ['items','questions']);
      const blockers=questions.filter(q=>q.blocking);
      const total=reviews.length+blockers.length;
      loading.classList.remove('is-loading');
      loading.classList.toggle('is-clear',!total);
      loading.innerHTML=total
        ? `<div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>${total===1?'1 item is waiting on you':`${total} items are waiting on you`}</h3><p>Keep these in view while you work with the answer below.</p></div><button class="text-button" data-view="open-items">View Open Items →</button></div>`
        : '<div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>Nothing needs action right now</h3><p>No Reviews or blocking questions are waiting on you.</p></div><button class="text-button" data-view="open-items">View Open Items →</button></div>';
    }catch(_){
      if(loading.isConnected){
        loading.classList.remove('is-loading');
        loading.classList.add('is-clear');
        loading.innerHTML='<div class="workspace-attention-head"><div><span class="eyebrow">Needs your attention</span><h3>Open Items are still available</h3><p>Keep working with the answer below, or inspect pending decisions directly.</p></div><button class="text-button" data-view="open-items">View Open Items →</button></div>';
      }
    }finally{fallbackAttentionLoading=false;}
  }

  function ensureWorkspaceContext(){
    const overview=document.querySelector('.overview.pristine');
    if(!overview) return;
    const askPanel=overview.querySelector('.ask-panel');
    if(!askPanel) return;
    const hasResult=!!askPanel.querySelector('.ask-session-row,.answer-stage.has-result,.ask-live-answer,.ask-live-loading,.ask-live-error');

    if(!hasResult){
      const orientation=overview.querySelector('.orientation-box');
      if(orientation && !orientation.querySelector('.workspace-context-link')){
        const link=document.createElement('button');
        link.type='button';
        link.className='text-button workspace-context-link';
        link.dataset.view='project-overview';
        link.textContent='Browse Current State →';
        orientation.appendChild(link);
      }
      overview.querySelector('.workspace-context-banner')?.remove();
      return;
    }

    if(!overview.querySelector('.workspace-context-banner')){
      const banner=document.createElement('div');
      banner.className='workspace-context-banner';
      banner.innerHTML='<span><strong>How Current State stays maintained:</strong> New information is captured as Evidence. State proposes what it may change, and you decide what becomes part of Current State.</span><button type="button" class="text-button" data-view="project-overview">Browse Current State →</button>';
      const heading=overview.querySelector('.overview-heading');
      (heading?.nextElementSibling || askPanel).before(banner);
    }

    if(!overview.querySelector('.workspace-attention')){
      if(capturedAttentionHtml){
        const holder=document.createElement('div');
        holder.innerHTML=capturedAttentionHtml;
        const attention=holder.firstElementChild;
        if(attention) askPanel.before(attention);
      }else restoreAttentionFromApi(overview,askPanel);
    }
  }

  function enhanceAskTitle(){
    const panel=document.querySelector('.overview.pristine .ask-panel');
    if(!panel) return;
    const label=panel.querySelector('.ask-title-row label[for="askInput"]');
    if(label) label.setAttribute('aria-label','Ask State');
    const wrap=label?.closest('.ask-title-row')?.querySelector('div');
    if(wrap && !wrap.querySelector('.ask-state-description')){
      const p=document.createElement('p');
      p.className='ask-state-description';
      p.textContent="Summarize Current State, find a decision, see what's pending, or prepare for a meeting.";
      wrap.appendChild(p);
    }
  }

  function enhanceAskStarters(){
    const starts=document.querySelector('.overview.pristine .ask-quick-starts');
    if(!starts || starts.dataset.productStarters==='true') return;
    starts.dataset.productStarters='true';
    starts.innerHTML=starters.map(([label,prompt])=>`<button type="button" data-prompt="${esc(prompt)}">${esc(label)}</button>`).join('');
  }

  function addAskAnother(){
    const row=document.querySelector('.overview.pristine .ask-session-row');
    if(!row || row.querySelector('[data-action="new-ask"]')) return;
    const button=document.createElement('button');
    button.type='button';
    button.className='text-button ask-another-button';
    button.dataset.action='new-ask';
    button.textContent='Ask another question';
    row.appendChild(button);
  }

  function addAskAuthority(){
    document.querySelectorAll('.overview.pristine .answer-content').forEach(answer=>{
      const badges=[...answer.querySelectorAll('.ask-record-badge,.knowledge-status')].map(x=>x.textContent.trim().toLowerCase());
      if(!badges.length) return;
      const hasCurrent=badges.some(x=>x.includes('current state'));
      const hasHistory=badges.some(x=>x.includes('history')||x.includes('historical'));
      const hasOpen=badges.some(x=>x.includes('review')||x.includes('blocking')||x.includes('open question')||x.includes('pending'));
      const hasEvidence=badges.some(x=>x.includes('evidence'));
      if(!answer.querySelector('.ask-authority-strip')){
        const strip=document.createElement('div');
        strip.className='ask-authority-strip';
        let text="Grounded in State's project record";
        if(hasCurrent&&hasOpen) text='Accepted Current State and pending items are kept separate';
        else if(hasCurrent) text='Grounded in accepted Current State';
        else if(hasOpen) text='Pending and unresolved items are not treated as settled facts';
        else if(hasHistory) text='Grounded in recorded History';
        strip.innerHTML=`<strong>State context</strong><span>${esc(text)}</span>`;
        answer.prepend(strip);
      }
      if(!answer.querySelector('.ask-context-links')){
        const actions=[];
        if(hasCurrent) actions.push('<button type="button" class="text-button" data-view="project-overview">View Current State →</button>');
        if(hasHistory) actions.push('<button type="button" class="text-button" data-view="history">View History →</button>');
        if(hasOpen && !answer.querySelector('[data-view="open-items"]')) actions.push('<button type="button" class="text-button" data-view="open-items">View Open Items →</button>');
        if(hasEvidence) actions.push('<button type="button" class="text-button" data-view="notes">View Notes →</button>');
        if(actions.length){
          const row=document.createElement('div');
          row.className='ask-context-links';
          row.innerHTML=actions.join('');
          answer.appendChild(row);
        }
      }
    });
  }

  function enhanceCurrentStateHeader(){
    const head=document.querySelector('.project-document-head');
    if(!head) return;
    head.querySelector('.project-fact-count')?.remove();
    const eyebrow=head.querySelector('.eyebrow');
    if(eyebrow && /^current project$/i.test(eyebrow.textContent.trim())) eyebrow.remove();
    const row=head.querySelector('.project-head-row');
    if(row && !row.querySelector('[data-action="copy-context"]')){
      const button=document.createElement('button');
      button.type='button';
      button.className='btn secondary project-head-copy-context';
      button.dataset.action='copy-context';
      button.textContent='Copy context';
      const settings=row.querySelector('.project-settings-button');
      if(settings) row.insertBefore(button,settings); else row.appendChild(button);
    }
  }

  function clarifyReviewReceipt(){
    const note=document.querySelector('#dialogBody .review-receipt-note');
    if(note && /definitive Project view/i.test(note.textContent)) note.textContent='State updated Current State and recorded the accepted change in History.';
    const button=document.querySelector('#dialogBody [data-action="review-receipt-project"]');
    if(button && button.textContent.trim()!=='View in Current State') button.textContent='View in Current State';
  }

  function loadedFallbackContext(){
    const state=(DATA.knowledge||[]).filter(x=>x.state==='current');
    const reviews=(DATA.reviews||[]).filter(x=>x.status==='pending');
    const questions=(DATA.questions||[]).filter(x=>x.status==='open');
    return {state,reviews,questions};
  }

  async function loadCopyContext(){
    if(!API) return loadedFallbackContext();
    try{
      const [stateRaw,reviewsRaw,questionsRaw]=await Promise.all([API.getState(),API.getReviews('open'),API.getQuestions('open')]);
      return {
        state:asList(stateRaw,['state','items','results']),
        reviews:asList(reviewsRaw,['reviews','items','results']),
        questions:asList(questionsRaw,['questions','items','results'])
      };
    }catch(_){return loadedFallbackContext();}
  }

  function openCopyContextDialog(){
    const overlay=document.getElementById('overlay');
    const body=document.getElementById('dialogBody');
    if(!overlay||!body) return;
    body.innerHTML='<span class="eyebrow">Copy context</span><h2 id="dialogTitle">Take Current State with you.</h2><p class="copy-context-intro">Copy a clean project context package to paste into Claude, ChatGPT, another AI tool, or wherever you are continuing the work.</p><div class="copy-context-options"><label class="copy-context-option"><input type="radio" name="copyContextMode" value="working" checked><span><strong>Working context</strong><span>Current State plus pending Reviews and open Questions. Recommended when another tool needs to understand both what is settled and what is not.</span></span></label><label class="copy-context-option"><input type="radio" name="copyContextMode" value="state"><span><strong>Current State only</strong><span>Only the project understanding the team currently treats as accepted.</span></span></label></div><div class="copy-context-task"><label for="copyContextTask">What are you working on? <span class="quiet-meta">Optional</span></label><input id="copyContextTask" autocomplete="off" placeholder="e.g. Prepare the pilot implementation plan"></div><p class="copy-context-status" id="copyContextStatus" role="status"></p><div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-action="copy-context-confirm" disabled>Loading context…</button></div>';
    overlay.hidden=false;
    overlay.scrollTop=0;
    document.body.classList.add('modal-open');
    overlay.querySelector('.dialog')?.focus({preventScroll:true});
    copyContextData=null;
    loadCopyContext().then(data=>{
      copyContextData=data;
      const button=body.querySelector('[data-action="copy-context-confirm"]');
      if(button){button.disabled=false;button.textContent='Copy to clipboard';}
    });
  }

  function stateTitle(item){return item.title||item.topic||item.name||'Current State';}
  function stateStatement(item){return item.statement||item.current_statement||item.text||item.value||'';}
  function reviewText(item){return item.decision_question||item.title||item.summary||item.why_consequential||item.proposed||'Review pending';}
  function questionText(item){return item.text||item.question||item.title||'Open question';}

  function buildContextText(mode,task){
    const data=copyContextData||loadedFallbackContext();
    const project=DATA.project?.name || document.querySelector('.project-title-line h2')?.textContent?.trim() || 'Project';
    const lines=['PROJECT CONTEXT FROM STATE',`Project: ${project}`];
    if(task) lines.push(`Task: ${task}`);
    lines.push('', 'Use the following as maintained project context. Treat items under CURRENT STATE as accepted project understanding. Do not turn pending Reviews or open Questions into decided facts. If something conflicts with this context, call it out rather than smoothing it over.', '', 'CURRENT STATE');
    const current=(data.state||[]).filter(item=>item.state===undefined || item.state==='current');
    if(current.length) current.forEach(item=>{const statement=stateStatement(item);if(statement) lines.push(`- ${stateTitle(item)}: ${statement}`);});
    else lines.push('- No accepted Current State items were available.');
    if(mode==='working'){
      lines.push('', 'PENDING REVIEWS');
      if(data.reviews?.length) data.reviews.forEach(item=>lines.push(`- ${reviewText(item)}`)); else lines.push('- None currently open.');
      lines.push('', 'OPEN QUESTIONS');
      if(data.questions?.length) data.questions.forEach(item=>lines.push(`- ${item.blocking?'[Blocking] ':''}${questionText(item)}`)); else lines.push('- None currently open.');
    }
    return lines.join('\n').trim();
  }

  async function writeClipboard(text){
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
    const area=document.createElement('textarea');
    area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }

  async function confirmCopyContext(){
    const body=document.getElementById('dialogBody');
    if(!body || !copyContextData) return;
    const mode=body.querySelector('input[name="copyContextMode"]:checked')?.value||'working';
    const task=body.querySelector('#copyContextTask')?.value.trim()||'';
    const button=body.querySelector('[data-action="copy-context-confirm"]');
    const status=body.querySelector('#copyContextStatus');
    try{
      await writeClipboard(buildContextText(mode,task));
      if(button) button.textContent='Copied';
      if(status) status.textContent='Context copied. Paste it wherever you are continuing the work.';
    }catch(_){
      if(status) status.textContent='Copy failed. Your browser may be blocking clipboard access.';
    }
  }

  function enhance(){
    addStyles();
    ensureWorkspaceContext();
    enhanceAskTitle();
    enhanceAskStarters();
    addAskAnother();
    addAskAuthority();
    enhanceCurrentStateHeader();
    clarifyReviewReceipt();
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('.overview.pristine .ask-panel')) captureAttention();
    const copy=event.target.closest?.('[data-action="copy-context"]');
    if(copy){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openCopyContextDialog();return;}
    const confirm=event.target.closest?.('[data-action="copy-context-confirm"]');
    if(confirm){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();confirmCopyContext();}
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter' && event.target?.id==='askInput') captureAttention();
  },true);

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();
