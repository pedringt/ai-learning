(() => {
  const API = window.STATE_API;
  const ASK = window.STATE_ASK;
  const DATA = window.PROJECT_CONTEXT_DATA || {};
  const APP = () => window.STATE_ASK_TEST_API;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asList = (payload, keys = []) => {
    if (Array.isArray(payload)) return payload;
    for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  };
  const truncate = (value, max = 190) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text;
  };

  const starters = [
    ['What should I know?', 'Give me the most consequential project briefing for right now. Prioritize what matters most, then keep accepted Current State, pending Reviews, and unresolved Questions clearly separate.'],
    ['Prep me for my next meeting', 'Prepare a concise meeting brief from the project record. Focus on settled decisions, decisions that need review, useful unresolved questions, and the most relevant recent change.'],
    ['Why did we keep human review?', 'Why did we keep human review for the pilot? Use Current State and History, and keep unresolved assumptions separate.'],
    ["What's blocking implementation?", 'What is blocking implementation planning right now? Distinguish confirmed blocking Questions from other unresolved items and pending Reviews.'],
    ['What are we still unsure about?', 'What is still unresolved? Keep open Questions and pending Evidence separate from accepted Current State.']
  ];

  const ui = {
    drawerOpen: false,
    query: '',
    payload: null,
    resolvedContext: [],
    answerStateSignature: null,
    stale: false,
    running: false,
    requestId: 0,
    copyContextData: null,
    inlineObserved: null,
  };

  function addStyles() {
    if (document.getElementById('state-product-polish-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-product-polish-styles';
    style.textContent = `
      .overview .workspace-attention + .ask-panel{margin-top:36px!important;padding-top:30px!important;border-top:1px solid var(--line)!important}
      .overview .orientation-box + .workspace-attention{margin-top:22px!important}
      .ask-panel.review-batch-ask{min-width:0}
      .ask-state-inline-card{min-width:0}
      .ask-state-inline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
      .ask-state-inline-head h3{margin:0 0 4px;font-size:18px}
      .ask-state-inline-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
      .ask-readonly-pill{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;color:var(--muted);background:var(--surface2)}
      .ask-state-inline-form,.ask-state-drawer-form{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;min-width:0;align-items:center}
      .ask-clear-btn{font-size:20px;color:var(--muted);padding:0 4px}
      .ask-state-inline-form input,.ask-state-drawer-form input{min-width:0;width:100%;box-sizing:border-box;border:1px solid #cfc9bd;background:#fff;border-radius:9px;padding:11px 12px;color:var(--ink);outline:none}
      .ask-state-inline-form input:focus,.ask-state-drawer-form input:focus{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 16%,transparent)}
      .ask-state-starters{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;min-width:0;padding-right:2px}
      .ask-state-starters button{max-width:100%;white-space:normal;text-align:left;border:1px solid var(--line);border-radius:999px;background:var(--surface);padding:7px 10px;font:inherit;font-size:12px;cursor:pointer;color:var(--ink)}
      .ask-state-starters button:hover{background:var(--surface2)}
      .ask-state-launcher{position:fixed;right:24px;bottom:24px;z-index:1200;border:1px solid var(--line);border-radius:12px;background:var(--ink);color:var(--surface);padding:11px 15px;font:inherit;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.16);cursor:pointer;transition:opacity .16s ease,transform .16s ease}
      .ask-state-launcher.is-hidden{opacity:0;pointer-events:none;transform:translateY(8px)}
      .ask-state-drawer{position:fixed;right:0;top:92px;height:calc(100dvh - 92px);width:min(470px,calc(100vw - 24px));z-index:1250;background:var(--surface);border-left:1px solid var(--line);box-shadow:-16px 0 40px rgba(0,0,0,.14);display:flex;flex-direction:column}
      .ask-state-drawer[hidden]{display:none}
      .ask-state-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 14px;border-bottom:1px solid var(--line)}
      .ask-state-drawer-head h2{margin:0 0 4px;font-size:20px}.ask-state-drawer-head p{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
      .ask-state-drawer-close{border:0;background:transparent;color:var(--muted);font-size:24px;line-height:1;cursor:pointer;padding:2px 4px}
      .ask-state-drawer-controls{padding:14px 18px;border-bottom:1px solid var(--line)}
      .ask-state-drawer-help{margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.4}
      .ask-state-drawer-result{padding:18px;overflow:auto;overscroll-behavior:contain;flex:1;min-height:0}
      .ask-state-drawer-result:empty::before{content:'Ask about decisions, open questions, project changes, evidence, or meeting context.';display:block;color:var(--muted);font-size:13px;line-height:1.55}
      .ask-state-drawer .ask-live-answer{max-width:none}.ask-state-drawer .ask-answer-head{gap:10px}.ask-state-drawer .ask-answer-actions{margin-left:auto}
      .ask-state-drawer .ask-answer-section{margin-top:18px}.ask-state-drawer .ask-answer-section h3{font-size:14px}
      .ask-state-stale{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 14px;padding:10px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface2);font-size:12px;line-height:1.4}
      .ask-state-stale button{flex:0 0 auto}
      .ask-readonly-message{padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)}
      .ask-readonly-message h3{margin:0 0 5px}.ask-readonly-message p{margin:0 0 12px;color:var(--muted);font-size:13px;line-height:1.5}
      .ask-resolved-decisions{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
      .ask-resolved-decisions>span{display:block;margin-bottom:7px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
      .ask-resolved-decisions h3{margin:0 0 8px;font-size:14px}.ask-resolved-decisions ul{margin:0;padding-left:18px}.ask-resolved-decisions li{margin:7px 0;line-height:1.45;font-size:13px}.ask-resolved-decisions small{display:block;margin-top:2px;color:var(--muted)}
      .project-head-copy-context{margin-left:auto}
      .copy-context-intro{margin-bottom:16px}.copy-context-options{display:grid;gap:9px;margin:16px 0}
      .copy-context-option{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--surface);cursor:pointer}
      .copy-context-option input{margin-top:4px}.copy-context-option strong,.copy-context-option span{display:block}.copy-context-option span{margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}
      .copy-context-task{margin-top:14px}.copy-context-task label{display:block;font-weight:800;font-size:12px;margin-bottom:6px}.copy-context-task input{width:100%;box-sizing:border-box;border:1px solid #cfc9bd;background:#fff;border-radius:9px;padding:11px 12px;color:var(--ink);outline:none}
      .copy-context-status{min-height:18px;margin:8px 0 0!important;font-size:12px}
      .review-confirm-change{margin:14px 0 2px;padding:10px 12px;border-radius:9px;background:var(--surface2);font-size:12px;line-height:1.45}.review-confirm-change span{display:block;margin-bottom:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
      .review-saving-compact{text-align:left}.review-saving-compact h2{margin-bottom:6px}.review-saving-compact p{margin:0;color:var(--muted)}
      .state-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147482000;max-width:min(520px,calc(100vw - 32px));padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--ink);color:var(--surface);font-size:13px;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,.18)}
      .state-help-steps{display:grid;gap:9px;margin:16px 0}.state-help-step{padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface2)}.state-help-step strong{display:block;margin-bottom:3px}.state-help-step span{display:block;color:var(--muted);font-size:12px;line-height:1.45}
      .settings-page .settings-how-state-first{order:-1}
      .notes-page .notes-product-purpose{margin-top:6px}
      @media(max-width:760px){
        .ask-state-launcher{right:14px;bottom:14px}.ask-state-drawer{top:0;height:100dvh;width:100vw;border-left:0}.ask-state-inline-form,.ask-state-drawer-form{grid-template-columns:1fr}.ask-state-inline-head{align-items:flex-start;flex-direction:column}.project-head-copy-context{margin-left:0}
      }
    `;
    document.head.appendChild(style);
  }

  function overlayParts() {
    return {overlay: document.getElementById('overlay'), body: document.getElementById('dialogBody')};
  }
  function openOverlay(html) {
    const {overlay, body} = overlayParts();
    if (!overlay || !body) return;
    body.innerHTML = html;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => overlay.querySelector('.dialog')?.focus({preventScroll:true}));
  }
  function closeOverlay() {
    const {overlay, body} = overlayParts();
    if (!overlay || !body) return;
    overlay.hidden = true;
    body.innerHTML = '';
    document.body.classList.remove('modal-open');
  }
  function showToast(message) {
    document.querySelector('.state-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'state-toast';
    toast.setAttribute('role','status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function stateTitle(item){return item.title || item.topic || item.name || 'Current State';}
  function stateStatement(item){return item.statement || item.current_statement || item.text || item.value || '';}
  function reviewText(item){return item.decision_question || item.title || item.summary || item.why_consequential || item.proposed || 'Review pending';}
  function questionText(item){return item.text || item.question || item.title || 'Open question';}
  function fallbackContext(){
    return {
      state:(DATA.knowledge||[]).filter(x=>x.state==='current'),
      reviews:(DATA.reviews||[]).filter(x=>x.status==='pending'),
      questions:(DATA.questions||[]).filter(x=>x.status==='open')
    };
  }
  async function loadCopyContext(){
    if(!API) return fallbackContext();
    try{
      const [stateRaw,reviewsRaw,questionsRaw] = await Promise.all([API.getState(),API.getReviews('open'),API.getQuestions('open')]);
      return {
        state:asList(stateRaw,['state','items','results']),
        reviews:asList(reviewsRaw,['reviews','items','results']),
        questions:asList(questionsRaw,['questions','items','results'])
      };
    }catch(_){return fallbackContext();}
  }
  function buildContextText(mode,task){
    const data=ui.copyContextData || fallbackContext();
    const project=DATA.project?.name || document.querySelector('.project-title-line h2')?.textContent?.trim() || 'Project';
    const lines=['PROJECT CONTEXT FROM STATE',`Project: ${project}`];
    if(task) lines.push(`Task: ${task}`);
    lines.push('', 'Use this as maintained project context. CURRENT STATE is accepted project understanding. PENDING REVIEWS and OPEN QUESTIONS are not accepted facts. If another source conflicts with this context, call out the conflict instead of smoothing it over.', '', 'CURRENT STATE');
    const current=(data.state||[]).filter(item=>item.state===undefined || item.state==='current');
    if(current.length) current.forEach(item=>{const statement=stateStatement(item);if(statement) lines.push(`- ${stateTitle(item)}: ${statement}`);});
    else lines.push('- No accepted Current State items were available.');
    if(mode==='working'){
      lines.push('', 'PENDING REVIEWS');
      if(data.reviews?.length) data.reviews.forEach(item=>lines.push(`- [Needs review] ${reviewText(item)}`)); else lines.push('- None currently open.');
      lines.push('', 'OPEN QUESTIONS');
      if(data.questions?.length) data.questions.forEach(item=>lines.push(`- [${item.blocking?'Blocking':'Open question'}] ${questionText(item)}`)); else lines.push('- None currently open.');
    }
    return lines.join('\n').trim();
  }
  async function writeClipboard(text){
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }
  function openCopyContextDialog(){
    openOverlay('<span class="eyebrow">Copy context</span><h2 id="dialogTitle">Take Current State with you.</h2><p class="copy-context-intro">Copy a clean context package to Claude, ChatGPT, another AI tool, or wherever you continue the work.</p><div class="copy-context-options"><label class="copy-context-option"><input type="radio" name="copyContextMode" value="working" checked><span><strong>Working context</strong><span>Current State plus pending Reviews and open Questions. Recommended when another tool needs both settled and unresolved context.</span></span></label><label class="copy-context-option"><input type="radio" name="copyContextMode" value="state"><span><strong>Current State only</strong><span>Only the project understanding the team currently treats as accepted.</span></span></label></div><div class="copy-context-task"><label for="copyContextTask">What are you working on? <span class="quiet-meta">Optional</span></label><input id="copyContextTask" autocomplete="off" placeholder="e.g. Prepare the pilot implementation plan"></div><p class="copy-context-status" id="copyContextStatus" role="status"></p><div class="dialog-actions"><button class="btn secondary" data-action="close-dialog">Cancel</button><button class="btn primary" data-review-batch-action="copy-context-confirm" disabled>Loading context…</button></div>');
    ui.copyContextData=null;
    loadCopyContext().then(data=>{
      ui.copyContextData=data;
      const button=document.querySelector('[data-review-batch-action="copy-context-confirm"]');
      if(button){button.disabled=false;button.textContent='Copy to clipboard';}
    });
  }
  async function confirmCopyContext(){
    const body=document.getElementById('dialogBody'); if(!body || !ui.copyContextData) return;
    const mode=body.querySelector('input[name="copyContextMode"]:checked')?.value || 'working';
    const task=body.querySelector('#copyContextTask')?.value.trim() || '';
    const button=body.querySelector('[data-review-batch-action="copy-context-confirm"]');
    const status=body.querySelector('#copyContextStatus');
    try{await writeClipboard(buildContextText(mode,task));if(button)button.textContent='Copied';if(status)status.textContent='Context copied.';}
    catch(_){if(status)status.textContent='Copy failed. Your browser may be blocking clipboard access.';}
  }

  function ensureAskShell(){
    if(!document.getElementById('askStateLauncher')){
      const launcher=document.createElement('button');launcher.id='askStateLauncher';launcher.className='ask-state-launcher';launcher.type='button';launcher.dataset.reviewBatchAction='open-ask';launcher.textContent='Ask State';document.body.appendChild(launcher);
    }
    if(!document.getElementById('askStateDrawer')){
      const drawer=document.createElement('aside');drawer.id='askStateDrawer';drawer.className='ask-state-drawer';drawer.hidden=true;drawer.setAttribute('aria-label','Ask State');drawer.innerHTML=`<div class="ask-state-drawer-head"><div><h2>Ask State</h2><p>Read-only. Asking never changes the project record.</p></div><button class="ask-state-drawer-close" type="button" aria-label="Close Ask State" data-review-batch-action="close-ask">×</button></div><div class="ask-state-drawer-controls"><form class="ask-state-drawer-form" data-review-batch-form="ask"><input id="askStateDrawerInput" autocomplete="off" aria-label="Ask State" placeholder="What do you want to know?"><button class="icon-btn ask-clear-btn" type="button" aria-label="Clear question" data-review-batch-action="clear-ask">×</button><button class="btn primary" type="submit">Ask</button></form><p class="ask-state-drawer-help">Edit the question and run it again to refine the answer. State does not carry a hidden conversation forward.</p><div class="ask-state-starters">${starters.map(([label,prompt])=>`<button type="button" data-review-batch-prompt="${esc(prompt)}">${esc(label)}</button>`).join('')}</div></div><div class="ask-state-drawer-result" id="askStateDrawerResult" aria-live="polite"></div>`;document.body.appendChild(drawer);
    }
    syncAskInputs();
  }
  function inlineAskMarkup(){
    return `<div class="ask-state-inline-card"><div class="ask-state-inline-head"><div><h3>Ask State</h3><p>Find, summarize, investigate, or prepare from the project record.</p></div><span class="ask-readonly-pill">Read only</span></div><form class="ask-state-inline-form" data-review-batch-form="ask"><input id="askStateInlineInput" autocomplete="off" aria-label="Ask State" placeholder="What do you want to know?" value="${esc(ui.query)}"><button class="icon-btn ask-clear-btn" type="button" aria-label="Clear question" data-review-batch-action="clear-ask">×</button><button class="btn primary" type="submit">Ask</button></form><div class="ask-state-starters">${starters.map(([label,prompt])=>`<button type="button" data-review-batch-prompt="${esc(prompt)}">${esc(label)}</button>`).join('')}</div></div>`;
  }
  function ensureWorkspaceAsk(){
    const panel=document.querySelector('.overview.pristine .ask-panel'); if(!panel) return;
    if(panel.dataset.reviewBatchAsk!=='true'){
      panel.dataset.reviewBatchAsk='true';panel.classList.add('review-batch-ask');panel.innerHTML=inlineAskMarkup();
    } else {
      const input=panel.querySelector('#askStateInlineInput');if(input && input.value!==ui.query && document.activeElement!==input)input.value=ui.query;
    }
    const add=document.querySelector('.overview-add[data-action="add-info"]'); if(add && add.textContent.trim()!=='+ Add Evidence')add.textContent='+ Add Evidence';
    if(ui.inlineObserved!==panel){ui.inlineObserved=panel;}
    syncLauncherVisibility();
  }
  function syncAskInputs(){
    const drawer=document.getElementById('askStateDrawerInput');if(drawer && drawer.value!==ui.query && document.activeElement!==drawer)drawer.value=ui.query;
    const inline=document.getElementById('askStateInlineInput');if(inline && inline.value!==ui.query && document.activeElement!==inline)inline.value=ui.query;
  }
  function openAskDrawer({focus=true}={}){
    ensureAskShell();ui.drawerOpen=true;const drawer=document.getElementById('askStateDrawer');if(drawer)drawer.hidden=false;document.body.classList.add('ask-state-drawer-open');syncAskInputs();syncLauncherVisibility();if(focus)requestAnimationFrame(()=>document.getElementById('askStateDrawerInput')?.focus());checkAnswerFreshness();
  }
  function closeAskDrawer(){ui.drawerOpen=false;document.getElementById('askStateDrawer')?.setAttribute('hidden','');document.body.classList.remove('ask-state-drawer-open');syncLauncherVisibility();}
  function syncLauncherVisibility(){
    const launcher=document.getElementById('askStateLauncher');if(!launcher)return;
    let hide=ui.drawerOpen;
    const card=document.querySelector('.ask-state-inline-card');
    if(!hide && card){const r=card.getBoundingClientRect();hide=r.bottom>0&&r.top<window.innerHeight;}
    launcher.classList.toggle('is-hidden',hide);
  }

  async function currentStateSignature(){
    if(!API?.getState) return null;
    try{
      const raw=await API.getState();const items=asList(raw,['state','items','results']).map(x=>({id:x.id||'',version:x.version||0,statement:x.statement||x.text||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));return JSON.stringify(items);
    }catch(_){return null;}
  }
  function queryTerms(query){
    const stop=new Set(['what','when','where','which','would','could','should','about','this','that','with','from','have','been','were','they','project','state','review','reviewed','decision','decided','evidence']);
    return [...new Set(String(query||'').toLowerCase().match(/[a-z0-9]+/g)||[])].filter(x=>x.length>3&&!stop.has(x));
  }
  async function relevantResolvedDecisions(query){
    if(!API?.getReviews) return [];
    try{
      const raw=await API.getReviews('resolved');const reviews=asList(raw,['reviews','items','results']).filter(r=>['confirmed_current','not_applied'].includes(r.resolution));
      const terms=queryTerms(query);const asksPast=/\b(reject|rejected|considered|reviewed|leave unchanged|left unchanged|decided against|why (?:did|do|is|was).*not|did we already|previous decision|past decision)\b/i.test(query);
      const scored=reviews.map((r,index)=>{const body=`${r.decision_question||''} ${r.why_consequential||''} ${(r.evidence_items||[]).map(e=>e.content||'').join(' ')}`.toLowerCase();const score=terms.reduce((n,t)=>n+(body.includes(t)?1:0),0);return {r,score,index};}).filter(x=>x.score>0||asksPast).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3);
      return scored.map(x=>x.r);
    }catch(_){return [];}
  }
  function resolvedDecisionMarkup(items){
    if(!items.length)return'';
    return `<section class="ask-resolved-decisions"><span>Human review history</span><h3>Relevant prior decisions</h3><ul>${items.map(r=>{const label=r.resolution==='not_applied'?'Evidence was not applied':'Current State was left unchanged';const source=truncate((r.evidence_items||[])[0]?.content||'',120);return `<li><strong>${esc(label)}:</strong> ${esc(r.decision_question||'A prior Review was resolved.')} ${source?`<small>Evidence: ${esc(source)}</small>`:''}</li>`;}).join('')}</ul></section>`;
  }
  function portableAskText(payload,resolved=[]){
    const answer=payload?.answer;if(!answer)return'';
    const labels={state:'Current State',review:'Needs review',blocking_question:'Blocking question',question:'Open question',history:'History',evidence:'Evidence',none:'Context'};
    const lines=[answer.headline||'State Ask','',answer.summary||''];
    for(const section of answer.sections||[]){if(!section?.items?.length)continue;lines.push('',section.title||'Project context');for(const item of section.items){const label=labels[item.record_type]||'Context';lines.push(`- [${label}] ${item.text}`);if(item.detail)lines.push(`  ${item.record_type==='blocking_question'?'Blocks: ':''}${item.detail}`);}}
    if(resolved.length){lines.push('','RELEVANT PRIOR HUMAN REVIEW DECISIONS');resolved.forEach(r=>lines.push(`- [${r.resolution==='not_applied'?'Evidence not applied':'Current State left unchanged'}] ${r.decision_question||'Prior review decision'}`));}
    return lines.join('\n').trim();
  }
  function sanitizeAskHtml(html){
    const holder=document.createElement('div');holder.innerHTML=html;
    holder.querySelectorAll('.ask-new-session,.ask-meeting-notes,.ask-refinement-chips,.ask-copy-answer').forEach(x=>x.remove());
    const actions=holder.querySelector('.ask-answer-actions');
    if(actions){actions.innerHTML='<button class="btn secondary" type="button" data-review-batch-action="copy-ask-answer">Copy</button>';}
    return holder.innerHTML;
  }
  function renderDrawerResult(html){const target=document.getElementById('askStateDrawerResult');if(target)target.innerHTML=html;}
  function renderFinalAsk(){
    if(!ui.payload){renderDrawerResult('<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>State did not receive a grounded answer.</p></div>');return;}
    let html=sanitizeAskHtml(ASK?.render?.(ui.payload) || '<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2></div>');
    if(ui.stale)html=`<div class="ask-state-stale"><span>Current State has changed since this answer was generated.</span><button class="text-button" type="button" data-review-batch-action="refresh-ask">Refresh answer →</button></div>${html}`;
    html+=resolvedDecisionMarkup(ui.resolvedContext);
    renderDrawerResult(html);
  }
  async function checkAnswerFreshness(){
    if(!ui.payload||!ui.answerStateSignature)return;
    const current=await currentStateSignature();if(current===null)return;const next=current!==ui.answerStateSignature;if(next!==ui.stale){ui.stale=next;renderFinalAsk();}
  }
  function explicitMutationIntent(query){
    const api=APP();
    if(api?.looksLikeQuestion?.(query))return false;
    if(api?.hasExplicitUpdateIntent)return api.hasExplicitUpdateIntent(query);
    return /\b(add (this|that|it)|please add|update (the )?(current )?state|record (this|that)|please record|note that|for the record|log (this|that))\b/i.test(query);
  }
  async function runAsk(query){
    const clean=String(query||'').trim();if(!clean)return;
    ui.query=clean;syncAskInputs();openAskDrawer({focus:false});
    if(explicitMutationIntent(clean)){
      ui.payload=null;ui.resolvedContext=[];ui.answerStateSignature=null;ui.stale=false;
      renderDrawerResult('<div class="ask-readonly-message"><h3>Ask State is read-only.</h3><p>Typing here never changes the project record. Use Add Evidence when you have new project information State should evaluate.</p><button class="btn primary" type="button" data-review-batch-action="open-add-evidence">Add Evidence</button></div>');return;
    }
    if(!ASK?.submit){renderDrawerResult('<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>The Ask module did not load.</p></div>');return;}
    const requestId=++ui.requestId;ui.running=true;ui.stale=false;ui.payload=null;ui.resolvedContext=[];
    const statePromise=currentStateSignature();const resolvedPromise=relevantResolvedDecisions(clean);
    renderDrawerResult('<div class="ask-live-loading"><span class="ask-loading-mark" aria-hidden="true"></span><div><strong>Checking the project record…</strong><p>Keeping accepted, pending, and unresolved information separate.</p></div></div>');
    try{
      let payload;
      if(ASK.canStream?.(clean)){
        payload=await ASK.submitStream(clean,null,{
          preview:preview=>{if(requestId!==ui.requestId)return;const html=ASK.renderStream?.('',preview);if(html)renderDrawerResult(html);},
          delta:event=>{if(requestId!==ui.requestId)return;ui.streamRaw=(ui.streamRaw||'')+(event?.text||'');const html=ASK.renderStream?.(ui.streamRaw,null);if(html)renderDrawerResult(html);}
        });
      }else payload=await ASK.submit(clean,null);
      if(requestId!==ui.requestId)return;
      ui.payload=payload;ui.answerStateSignature=await statePromise;ui.resolvedContext=await resolvedPromise;ui.running=false;ui.streamRaw='';renderFinalAsk();
    }catch(error){
      if(requestId!==ui.requestId)return;ui.running=false;ui.streamRaw='';renderDrawerResult(`<div class="ask-live-error"><h2>Ask is temporarily unavailable.</h2><p>${esc(error?.message||'Please try again.')}</p></div>`);
    }
  }

  // The "How this works" modal, the Review confirm/receipt flow, the
  // Settings section order, the Evidence dialog copy, the Notes copy, and
  // the Workspace attention intro text were all originally patched here at
  // runtime. They're now fixed natively in their owning functions/templates
  // (context-app.js's showDemoHelp()/decideReview()/showAddDialog(),
  // context-settings.js's render(), context-notes-view.js, and
  // context-app.js's workspaceAttentionHtml()) as part of the 2026-09-07 UX
  // review batch, so the DOM-patches that used to live here were removed
  // rather than layered on top of the native fix.

  function enhanceAll(){
    addStyles();ensureAskShell();ensureWorkspaceAsk();syncLauncherVisibility();
  }

  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-review-batch-form="ask"]');if(!form)return;event.preventDefault();event.stopPropagation();const input=form.querySelector('input');runAsk(input?.value||ui.query);
  },true);

  document.addEventListener('input',event=>{
    if(event.target?.id==='askStateDrawerInput'||event.target?.id==='askStateInlineInput'){ui.query=event.target.value;const other=event.target.id==='askStateDrawerInput'?document.getElementById('askStateInlineInput'):document.getElementById('askStateDrawerInput');if(other&&document.activeElement!==other)other.value=ui.query;}
  });

  document.addEventListener('click',event=>{
    const prompt=event.target.closest?.('[data-review-batch-prompt]');if(prompt){event.preventDefault();event.stopPropagation();runAsk(prompt.dataset.reviewBatchPrompt);return;}
    const copyContext=event.target.closest?.('[data-action="open-copy-context"]');if(copyContext){event.preventDefault();event.stopPropagation();openCopyContextDialog();return;}
    const confirmCopy=event.target.closest?.('[data-review-batch-action="copy-context-confirm"]');if(confirmCopy){event.preventDefault();event.stopPropagation();confirmCopyContext();return;}
    const action=event.target.closest?.('[data-review-batch-action]');if(!action)return;
    event.preventDefault();event.stopPropagation();const type=action.dataset.reviewBatchAction;
    if(type==='open-ask')openAskDrawer();
    else if(type==='close-ask')closeAskDrawer();
    else if(type==='copy-ask-answer'&&ui.payload)writeClipboard(portableAskText(ui.payload,ui.resolvedContext)).then(()=>showToast('Ask answer copied with State labels.'));
    else if(type==='refresh-ask')runAsk(ui.query);
    else if(type==='open-add-evidence'){closeAskDrawer();document.querySelector('[data-action="add-info"]')?.click();}
    else if(type==='clear-ask'){ui.query='';ui.payload=null;ui.resolvedContext=[];ui.answerStateSignature=null;ui.stale=false;syncAskInputs();renderDrawerResult('');}
  },true);

  document.addEventListener('click',event=>{
    if(event.target.closest?.('#askStateDrawer [data-view],#askStateDrawer [data-action="open-related-review"],#askStateDrawer [data-action="go-open-question"]'))setTimeout(closeAskDrawer,0);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&ui.drawerOpen&&document.getElementById('overlay')?.hidden)closeAskDrawer();});
  window.addEventListener('scroll',syncLauncherVisibility,{passive:true});window.addEventListener('resize',syncLauncherVisibility,{passive:true});

  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhanceAll();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  setInterval(()=>{if(ui.drawerOpen&&ui.payload)checkAnswerFreshness();},7000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();