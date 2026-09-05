(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root = () => document.getElementById('viewRoot');
  const api = () => window.STATE_API;

  function sourceIcon(type){
    const common='class="source-icon" aria-hidden="true" viewBox="0 0 24 24"';
    if(type==='slack') return `<svg ${common}><rect x="9.2" y="2" width="3.2" height="8" rx="1.6" fill="#36C5F0"/><rect x="13.8" y="9.2" width="8" height="3.2" rx="1.6" fill="#2EB67D"/><rect x="11.6" y="13.8" width="3.2" height="8" rx="1.6" fill="#ECB22E"/><rect x="2" y="11.6" width="8" height="3.2" rx="1.6" fill="#E01E5A"/><circle cx="7" cy="7" r="1.6" fill="#E01E5A"/><circle cx="17" cy="7" r="1.6" fill="#36C5F0"/><circle cx="17" cy="17" r="1.6" fill="#2EB67D"/><circle cx="7" cy="17" r="1.6" fill="#ECB22E"/></svg>`;
    if(type==='docs') return `<svg ${common}><path d="M6 2.5h8.5L19 7v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" fill="#fff" stroke="#4285F4" stroke-width="1.4"/><path d="M14.5 2.5V7H19z" fill="#A9C4FA"/><rect x="7.3" y="10" width="8" height="1.4" rx="0.7" fill="#4285F4"/><rect x="7.3" y="13" width="8" height="1.4" rx="0.7" fill="#4285F4"/><rect x="7.3" y="16" width="5.5" height="1.4" rx="0.7" fill="#4285F4"/></svg>`;
    if(type==='notion') return `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.2 17V8.1l7.4 8.9V8.4h-1.8V7h4.1v1.4h-1.1V17h-1.7L8.9 10.8V17z" fill="currentColor"/></svg>`;
    return '';
  }
  function sourceTitle(type,label){return `<span class="source-title">${sourceIcon(type)}<span>${esc(label)}</span></span>`;}

  function styles(){
    if(document.getElementById('state-settings-view-styles')) return;
    const style=document.createElement('style');
    style.id='state-settings-view-styles';
    style.textContent=`
      .settings-page{max-width:920px;margin:0 auto;padding:8px 0 48px}
      .settings-page .page-head{margin-bottom:22px}
      .settings-section{border:1px solid var(--line,#d8d8df);border-radius:16px;padding:20px;margin:0 0 18px;background:var(--surface,#fff)}
      .settings-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
      .settings-section h3{margin:0 0 5px;font-size:18px}.settings-section p{margin:0;color:var(--muted,#666);line-height:1.5}
      .settings-project-name{display:grid;gap:6px;max-width:420px}.settings-project-name label{font-size:12px;font-weight:700}
      .settings-project-name input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--soft,#f6f5f8);color:inherit}
      .settings-status{font-size:12px;font-weight:700;padding:5px 9px;border:1px solid var(--line,#d8d8df);border-radius:999px;white-space:nowrap}
      .settings-status.dev{background:var(--soft,#f6f5f8)}
      .settings-rules{margin-top:18px;border:1px solid var(--line,#e1e1e7);border-radius:12px;background:var(--soft,#f8f8fa);overflow:hidden}
      .settings-rules summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;font-weight:700}
      .settings-rules summary:hover{background:rgba(127,127,127,.05)}.settings-rules summary::-webkit-details-marker{display:none}
      .settings-rules summary::after{content:'+';font-size:20px;font-weight:400;color:var(--muted,#666)}.settings-rules[open] summary::after{content:'−'}
      .settings-rules[open] summary{border-bottom:1px solid var(--line,#e1e1e7);background:var(--surface,#fff)}
      .settings-rules-count{font-size:12px;font-weight:600;color:var(--muted,#666);margin-left:6px}
      .settings-rules-body{padding:16px;background:var(--surface,#fff)}
      .settings-rule-form{display:flex;gap:8px;margin-top:14px;align-items:flex-end;flex-wrap:wrap}
      .settings-rule-form label{flex:1;display:grid;gap:6px;font-size:12px;font-weight:700;min-width:180px}.settings-rule-form label:has(select){flex:0 0 auto;min-width:0}
      .settings-rule-form input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--surface,#fff);color:inherit}
      .settings-rule-form select{box-sizing:border-box;padding:10px 30px 10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--surface,#fff);color:inherit;font:inherit;font-size:13px;font-weight:600;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path fill='%23666' d='M5.5 7.5l4.5 4.5 4.5-4.5z'/></svg>");background-repeat:no-repeat;background-position:right 9px center;background-size:13px}
      @media(max-width:520px){.settings-rule-form label:has(select){flex:1 1 100%}}
      .settings-rule-list{list-style:none;margin:16px 0 0;padding:16px 0 0;border-top:1px solid var(--line,#e5e5ea);display:grid;gap:8px}
      .settings-rule-list li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid var(--line,#e5e5ea);border-radius:10px;background:var(--soft,#fafafd)}
      .settings-rule-copy{min-width:0}.settings-rule-copy strong{display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#666)}
      .settings-rule-list .text-button{align-self:center;flex:0 0 auto}
      .settings-behavior-list{margin:12px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:9px 18px}.settings-behavior-list li{padding-left:22px;position:relative;line-height:1.45;font-size:13px}.settings-behavior-list li::before{content:'✓';position:absolute;left:0;font-weight:700}
      .settings-quiet{background:var(--soft,#f6f5f8);border-color:transparent}.settings-quiet .settings-section-head{margin-bottom:8px}
      .slack-preview,.source-list{margin-top:16px;display:grid;gap:10px}.slack-preview-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line,#e5e5ea)}.slack-preview-row:first-child{border-top:0}.slack-preview-row span{color:var(--muted,#666);font-size:13px}
      .source-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;padding:14px 0;border-top:1px solid var(--line,#e5e5ea)}.source-row:nth-child(-n+2){border-top:0}.source-row>div{min-width:0}.source-description{display:block;margin:5px 0 0 26px;color:var(--muted,#666);font-size:13px;line-height:1.4}
      .source-title{display:flex;align-items:center;gap:8px;font-weight:700;color:inherit}.source-icon{width:18px;height:18px;flex:0 0 18px;display:block}
      .settings-slack-heading{display:flex;align-items:center;gap:9px}.settings-slack-heading .source-icon{width:20px;height:20px;flex-basis:20px}.settings-callout{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--soft,#f6f5f8);font-size:13px;line-height:1.45}.settings-actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}.settings-slack .settings-section-head{align-items:center}.settings-slack-intro{max-width:620px}.settings-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}
      .settings-danger{border-color:#c8a7a7;padding:16px 20px}.settings-danger .settings-section-head{align-items:center;margin:0}.settings-danger .settings-actions{margin:0}
      @media(max-width:680px){.settings-section{padding:16px}.settings-section-head,.slack-preview-row{align-items:flex-start;flex-direction:column}.settings-rule-form{display:grid}.settings-rule-list li{align-items:center}.settings-status{align-self:flex-start}.settings-behavior-list,.settings-source-grid{grid-template-columns:1fr}.source-row,.source-row:nth-child(-n+2){border-top:1px solid var(--line,#e5e5ea)}.source-row:first-child{border-top:0}.settings-danger .settings-actions{margin-top:12px}}
    `;
    document.head.appendChild(style);
  }

  // Distinguishes "the fetch failed" from "there are genuinely zero rules"
  // -- State's whole thesis is not collapsing unknown into a false zero, so
  // this list can't do that to its own settings.
  async function rules(){try{const payload=await api()?.getRules?.();return {items:payload?.items||payload||[],failed:false};}catch(error){console.warn('Settings could not load project rules.',error);return {items:[],failed:true};}}

  function rulesCountMarkup(rulesState){
    if(rulesState.loading) return '…';
    if(rulesState.failed) return 'unavailable';
    return `${rulesState.items.length} ${rulesState.items.length===1?'rule':'rules'}`;
  }
  function rulesListMarkup(rulesState){
    if(rulesState.loading) return '<li><span>Loading project rules…</span></li>';
    if(rulesState.failed) return '<li><span>Project rules could not be loaded. This may not be the full list.</span><button class="text-button" type="button" data-settings-action="retry-rules">Try again</button></li>';
    if(!rulesState.items.length) return '<li><span>No project-specific rules yet.</span></li>';
    return rulesState.items.map(rule=>`<li data-rule-id="${esc(rule.id)}"><div class="settings-rule-copy"><strong>${esc(rule.category||'Interpretation')}</strong><span>${esc(rule.text||rule.rule||'')}</span></div><button class="text-button" type="button" data-settings-action="delete-rule" data-rule-id="${esc(rule.id)}">Remove</button></li>`).join('');
  }

  // Settings owns its own data fetch instead of going through the shared,
  // already-loaded state.data that every other view reads synchronously.
  // The page shell (and the sections below that don't depend on rules) must
  // still paint the instant the nav is clicked -- so this renders immediately
  // with a loading placeholder and patches in the real rules once the fetch
  // resolves, rather than leaving #viewRoot showing the previous view for as
  // long as the request takes (seconds, or tens of seconds against a cold
  // staging backend).
  function render(rulesState){
    const settingsNav=document.querySelector('.sidebar-nav [data-view="settings"]');if(!settingsNav?.classList.contains('active')) return;
    const target=root();if(!target) return;
    const state=rulesState||{loading:true,failed:false,items:[]};
    target.innerHTML=`<article class="page settings-page">
      <div class="page-head"><h2>Settings</h2><p>Configure Northstar and the sources allowed to feed it.</p></div>
      <section class="settings-section"><div class="settings-section-head"><div><h3>Project</h3><p>Basic information State uses for this project.</p></div></div><div class="settings-project-name"><label for="settings-project-name">Project name</label><input id="settings-project-name" value="Northstar" readonly aria-readonly="true"><p>Project renaming isn't available for this example project.</p></div>
        <details class="settings-rules"><summary><span>Project rules <span class="settings-rules-count">${rulesCountMarkup(state)}</span></span></summary><div class="settings-rules-body"><p>Rules tell State how to interpret information for this project.</p><form class="settings-rule-form" data-settings-action="add-rule"><label>Add a project rule<input name="rule" autocomplete="off" placeholder="Example: Security approvals must be explicit."></label><label>Category<select name="category"><option>Authority</option><option>Review</option><option>Sources</option><option selected>Interpretation</option></select></label><button class="btn secondary" type="submit">Add rule</button></form><ul class="settings-rule-list">${rulesListMarkup(state)}</ul></div></details>
      </section>
      <section class="settings-section settings-slack" id="settings-slack"><div class="settings-section-head"><div class="settings-slack-intro"><h3 class="settings-slack-heading">${sourceIcon('slack')}<span>Slack</span></h3><p>Bring useful project conversations into State as Evidence. Slack never changes Current State directly.</p></div><span class="settings-status dev">In development</span></div><div class="settings-actions"><button class="btn secondary" type="button" disabled aria-disabled="true">Connect Slack</button></div><div class="slack-preview" aria-label="Planned Slack behavior"><div class="slack-preview-row"><div><strong>Approved channels</strong><br><span>Only channels explicitly enabled for Northstar can feed State.</span></div><span>Planned</span></div><div class="slack-preview-row"><div><strong>Threads</strong><br><span>State follows conversations over time and creates new Evidence when something meaningful changes.</span></div><span>Planned</span></div><div class="slack-preview-row"><div><strong>Noise control</strong><br><span>Bot, system, and low-value conversation is filtered before it reaches Notes.</span></div><span>Planned</span></div></div></section>
      <section class="settings-section settings-quiet"><div class="settings-section-head"><div><h3>How State works</h3><p>Safeguards that protect the human authorization model.</p></div></div><ul class="settings-behavior-list"><li>Evidence cannot change Current State automatically.</li><li>Questions require Review before resolution.</li><li>Ignored Evidence is excluded from active reasoning.</li><li>Evidence history stays available so accepted changes remain explainable.</li></ul></section>
      <section class="settings-section"><div class="settings-section-head"><div><h3>Sources</h3><p>Places State can gather project information from planning, discovery, documentation, and collaboration.</p></div></div><div class="settings-callout"><strong>Sources provide Evidence. They never change Current State directly.</strong></div><div class="source-list settings-source-grid" aria-label="Connected and planned sources">
        <div class="source-row"><div>${sourceTitle('slack','Slack')}<span class="source-description">Project conversations and decisions.</span></div><span class="settings-status dev">In development</span></div>
        <div class="source-row"><div>${sourceTitle('docs','Google Docs')}<span class="source-description">Specs, plans, research, and meeting notes.</span></div><span class="settings-status">Coming soon</span></div>
        <div class="source-row"><div>${sourceTitle('notion','Notion')}<span class="source-description">Maintained team and project knowledge.</span></div><span class="settings-status">Coming soon</span></div></div></section>
      <section class="settings-section settings-danger"><div class="settings-section-head"><div><h3>Example data</h3><p>Restore Northstar to its seeded starting scenario.</p></div><div class="settings-actions"><button class="btn secondary" type="button" data-settings-action="reset-demo">Reset example data</button></div></div></section>
    </article>`;
    // A caller (the Workspace Sources banner's "Connect your apps" button)
    // can request landing directly on this section instead of the top of
    // Settings via window.__stateScrollAnchor, cleared once consumed so it
    // only fires for the navigation that requested it.
    if(window.__stateScrollAnchor==='settings-slack'){
      delete window.__stateScrollAnchor;
      // navigateTo() queues its own requestAnimationFrame(() => scrollTo top
      // 0) on every navigation; a plain rAF here can lose that race
      // depending on how fast rules() above resolved. A short timeout
      // reliably runs after it instead.
      setTimeout(()=>document.getElementById('settings-slack')?.scrollIntoView({block:'start'}),60);
    }
  }

  // Paints the shell immediately (loading placeholder for rules), then
  // patches in the real rules once the fetch resolves. See the comment on
  // render() above for why this can't just be one await-then-paint step.
  async function load(){
    render();
    const rulesResult=await rules();
    render(rulesResult);
  }

  document.addEventListener('submit',async event=>{const form=event.target.closest('form[data-settings-action="add-rule"]');if(!form)return;event.preventDefault();const input=form.elements.rule;const text=String(input?.value||'').trim();if(!text)return;const category=form.elements.category?.value||'Interpretation';const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;try{await api()?.createRule?.(text,category);if(input)input.value='';await load();}catch(error){console.error('Could not add project rule.',error);if(button)button.disabled=false;window.alert(`Could not save the rule: ${error.message}`);}});
  document.addEventListener('click',async event=>{const control=event.target.closest('[data-settings-action]');if(!control)return;const action=control.dataset.settingsAction;if(action==='retry-rules'){await load();}if(action==='delete-rule'){control.disabled=true;try{await api()?.deleteRule?.(control.dataset.ruleId);await load();}catch(error){console.error('Could not remove project rule.',error);control.disabled=false;window.alert(`Could not remove the rule: ${error.message}`);}}if(action==='reset-demo'){if(!window.confirm('Reset Northstar to its original seeded scenario?'))return;control.disabled=true;try{await api()?.resetDemo?.();window.location.reload();}catch(error){console.error('Could not reset demo.',error);control.disabled=false;window.alert(error?.isTimeout?error.message:`Northstar was not reset: ${error.message}`);}}});

  styles();const settingsNav=document.querySelector('.sidebar-nav [data-view="settings"]');let settingsWasActive=!!settingsNav?.classList.contains('active');if(settingsWasActive)load();if(settingsNav){new MutationObserver(()=>{const active=settingsNav.classList.contains('active');if(active&&!settingsWasActive)load();settingsWasActive=active;}).observe(settingsNav,{attributes:true,attributeFilter:['class']});}
})();