(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root = () => document.getElementById('viewRoot');
  const api = () => window.STATE_API;

  function sourceIcon(type){
    const common='class="source-icon" aria-hidden="true" viewBox="0 0 24 24"';
    if(type==='slack') return `<svg ${common}><rect x="9.2" y="2" width="3.2" height="8" rx="1.6" fill="#36C5F0"/><rect x="13.8" y="9.2" width="8" height="3.2" rx="1.6" fill="#2EB67D"/><rect x="11.6" y="13.8" width="3.2" height="8" rx="1.6" fill="#ECB22E"/><rect x="2" y="11.6" width="8" height="3.2" rx="1.6" fill="#E01E5A"/><circle cx="7" cy="7" r="1.6" fill="#E01E5A"/><circle cx="17" cy="7" r="1.6" fill="#36C5F0"/><circle cx="17" cy="17" r="1.6" fill="#2EB67D"/><circle cx="7" cy="17" r="1.6" fill="#ECB22E"/></svg>`;
    if(type==='drive') return `<svg ${common}><path d="M8.2 3.2h5.1l6.8 11.8H15z" fill="#0F9D58"/><path d="M8.2 3.2 2 14l2.6 4.5L10.8 7.7z" fill="#F4B400"/><path d="M4.6 18.5h12.7l2.8-4.8H7.4z" fill="#4285F4"/></svg>`;
    if(type==='notion') return `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.2 17V8.1l7.4 8.9V8.4h-1.8V7h4.1v1.4h-1.1V17h-1.7L8.9 10.8V17z" fill="currentColor"/></svg>`;
    if(type==='confluence') return `<svg ${common}><path d="M5.4 14.7c2.3-1.5 4.4-2.2 6.8-2.2 2.4 0 4.5.7 6.4 1.8l-2.5 3.4c-1.3-.7-2.5-1.1-3.9-1.1-1.7 0-3.1.5-4.6 1.5z" fill="#1868DB"/><path d="M18.6 9.3C16.3 10.8 14.2 11.5 11.8 11.5c-2.4 0-4.5-.7-6.4-1.8l2.5-3.4c1.3.7 2.5 1.1 3.9 1.1 1.7 0 3.1-.5 4.6-1.5z" fill="#1868DB"/></svg>`;
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
      .settings-section h3{margin:0 0 5px;font-size:18px}
      .settings-section p{margin:0;color:var(--muted,#666);line-height:1.5}
      .settings-project-name{display:grid;gap:6px;max-width:420px}
      .settings-project-name label{font-size:12px;font-weight:700}
      .settings-project-name input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--soft,#f6f5f8);color:inherit}
      .settings-status{font-size:12px;font-weight:700;padding:5px 9px;border:1px solid var(--line,#d8d8df);border-radius:999px;white-space:nowrap}
      .settings-rules{margin-top:18px;border-top:1px solid var(--line,#e5e5ea);padding-top:4px}
      .settings-rules summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;font-weight:700}
      .settings-rules summary::-webkit-details-marker{display:none}
      .settings-rules summary::after{content:'+';font-size:20px;font-weight:400;color:var(--muted,#666)}
      .settings-rules[open] summary::after{content:'−'}
      .settings-rules-count{font-size:12px;font-weight:600;color:var(--muted,#666);margin-left:6px}
      .settings-rules-body{padding:0 0 4px}
      .settings-rule-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:9px}
      .settings-rule-list li{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line,#e5e5ea)}
      .settings-rule-copy strong{display:block;margin-bottom:3px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#666)}
      .settings-rule-form{display:flex;gap:8px;margin-top:16px;align-items:flex-end}
      .settings-rule-form label{flex:1;display:grid;gap:6px;font-size:12px;font-weight:700}
      .settings-rule-form input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--surface,#fff);color:inherit}
      .settings-behavior-list{margin:12px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:9px 18px}
      .settings-behavior-list li{padding-left:22px;position:relative;line-height:1.45;font-size:13px}
      .settings-behavior-list li::before{content:'✓';position:absolute;left:0;font-weight:700}
      .settings-quiet{background:var(--soft,#f6f5f8);border-color:transparent}
      .settings-quiet .settings-section-head{margin-bottom:8px}
      .slack-preview,.source-list{margin-top:16px;display:grid;gap:10px}
      .slack-preview-row,.source-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line,#e5e5ea)}
      .slack-preview-row:first-child,.source-row:first-child{border-top:0}
      .slack-preview-row span,.source-row span{color:var(--muted,#666);font-size:13px}
      .source-row>div{min-width:0}
      .source-title{display:inline-flex;align-items:center;gap:8px;margin-bottom:2px;font-weight:700;color:inherit}
      .source-icon{width:18px;height:18px;flex:0 0 18px;display:block}
      .settings-slack-heading{display:flex;align-items:center;gap:9px}
      .settings-slack-heading .source-icon{width:20px;height:20px;flex-basis:20px}
      .settings-callout{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--soft,#f6f5f8);font-size:13px;line-height:1.45}
      .settings-actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}
      .settings-slack .settings-section-head{align-items:center}
      .settings-slack-intro{max-width:620px}
      .settings-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}
      .settings-danger{border-color:#c8a7a7;padding:16px 20px}
      .settings-danger .settings-section-head{align-items:center;margin:0}
      .settings-danger .settings-actions{margin:0}
      @media(max-width:680px){.settings-section{padding:16px}.settings-section-head,.slack-preview-row,.source-row{align-items:flex-start;flex-direction:column}.settings-rule-form{display:grid}.settings-rule-list li{align-items:flex-start}.settings-status{align-self:flex-start}.settings-behavior-list,.settings-source-grid{grid-template-columns:1fr}.settings-danger .settings-actions{margin-top:12px}}
    `;
    document.head.appendChild(style);
  }

  async function rules(){
    try{
      const payload=await api()?.getRules?.();
      return payload?.items || payload || [];
    }catch(error){
      console.warn('Settings could not load project rules.',error);
      return [];
    }
  }

  async function render(){
    const settingsNav=document.querySelector('.sidebar-nav [data-view="settings"]');
    if(!settingsNav?.classList.contains('active')) return;
    const target=root(); if(!target) return;
    const projectRules=await rules();
    if(!settingsNav.classList.contains('active')) return;
    target.innerHTML=`<article class="page settings-page">
      <div class="page-head"><h2>Settings</h2><p>Configure Northstar and the sources allowed to feed it.</p></div>

      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Project</h3><p>Basic information State uses for this project.</p></div></div>
        <div class="settings-project-name"><label for="settings-project-name">Project name</label><input id="settings-project-name" value="Northstar" readonly aria-readonly="true"><p>Project renaming is not available in the demo.</p></div>
        <details class="settings-rules">
          <summary><span>Project rules <span class="settings-rules-count">${projectRules.length} ${projectRules.length===1?'rule':'rules'}</span></span></summary>
          <div class="settings-rules-body">
            <p>Rules tell State how to interpret information for this project.</p>
            <ul class="settings-rule-list">${projectRules.length?projectRules.map(rule=>`<li data-rule-id="${esc(rule.id)}"><div class="settings-rule-copy"><strong>${esc(rule.category||'Interpretation')}</strong><span>${esc(rule.text||rule.rule||'')}</span></div><button class="text-button" type="button" data-settings-action="delete-rule" data-rule-id="${esc(rule.id)}">Remove</button></li>`).join(''):'<li><span>No project-specific rules yet.</span></li>'}</ul>
            <form class="settings-rule-form" data-settings-action="add-rule"><label>Add a project rule<input name="rule" autocomplete="off" placeholder="Example: Security approvals must be explicit."></label><button class="btn secondary" type="submit">Add rule</button></form>
          </div>
        </details>
      </section>

      <section class="settings-section settings-slack">
        <div class="settings-section-head"><div class="settings-slack-intro"><h3 class="settings-slack-heading">${sourceIcon('slack')}<span>Slack</span></h3><p>Bring useful project conversations into State as Evidence. Slack never changes Current State directly.</p></div><span class="settings-status">Not connected</span></div>
        <div class="settings-actions"><button class="btn secondary" type="button" disabled aria-disabled="true">Connect Slack</button></div>
        <div class="slack-preview" aria-label="Planned Slack behavior">
          <div class="slack-preview-row"><div><strong>Approved channels</strong><br><span>Only channels explicitly enabled for Northstar can feed State.</span></div><span>Planned</span></div>
          <div class="slack-preview-row"><div><strong>Threads</strong><br><span>State follows conversations over time and creates new Evidence when something meaningful changes.</span></div><span>Planned</span></div>
          <div class="slack-preview-row"><div><strong>Noise control</strong><br><span>Bot, system, and low-value conversation is filtered before it reaches Notes.</span></div><span>Planned</span></div>
        </div>
      </section>

      <section class="settings-section settings-quiet">
        <div class="settings-section-head"><div><h3>How State works</h3><p>Safeguards that protect the human authorization model.</p></div></div>
        <ul class="settings-behavior-list">
          <li>Evidence cannot change Current State automatically.</li>
          <li>Questions require Review before resolution.</li>
          <li>Ignored Evidence is excluded from active reasoning.</li>
          <li>Evidence history stays available so accepted changes remain explainable.</li>
        </ul>
      </section>

      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Connected sources</h3><p>Places State can gather project information from planning, discovery, documentation, and collaboration.</p></div></div>
        <div class="settings-callout"><strong>Sources provide Evidence. They never change Current State directly.</strong></div>
        <div class="source-list settings-source-grid" aria-label="Connected and planned sources">
          <div class="source-row"><div>${sourceTitle('slack','Slack')}<span>Project conversations and decisions.</span></div><span class="settings-status">Not connected</span></div>
          <div class="source-row"><div>${sourceTitle('drive','Google Drive')}<span>Docs, research, and planning artifacts.</span></div><span class="settings-status">Coming soon</span></div>
          <div class="source-row"><div>${sourceTitle('notion','Notion')}<span>Discovery notes, research, and specs.</span></div><span class="settings-status">Coming soon</span></div>
          <div class="source-row"><div>${sourceTitle('confluence','Confluence')}<span>Project documentation and team knowledge.</span></div><span class="settings-status">Coming soon</span></div>
        </div>
      </section>

      <section class="settings-section settings-danger">
        <div class="settings-section-head"><div><h3>Demo</h3><p>Restore Northstar to the seeded demo baseline.</p></div><div class="settings-actions"><button class="btn secondary" type="button" data-settings-action="reset-demo">Reset demo</button></div></div>
      </section>
    </article>`;
  }

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('form[data-settings-action="add-rule"]');
    if(!form) return;
    event.preventDefault();
    const input=form.elements.rule; const text=String(input?.value||'').trim();
    if(!text) return;
    const button=form.querySelector('button[type="submit"]'); if(button) button.disabled=true;
    try{await api()?.createRule?.(text,'Interpretation'); if(input) input.value=''; await render();}
    catch(error){console.error('Could not add project rule.',error); if(button) button.disabled=false;}
  });

  document.addEventListener('click',async event=>{
    const control=event.target.closest('[data-settings-action]'); if(!control) return;
    const action=control.dataset.settingsAction;
    if(action==='delete-rule'){
      control.disabled=true;
      try{await api()?.deleteRule?.(control.dataset.ruleId); await render();}catch(error){console.error('Could not remove project rule.',error);control.disabled=false;}
    }
    if(action==='reset-demo'){
      if(!window.confirm('Reset Northstar to the original demo data?')) return;
      control.disabled=true;
      try{await api()?.resetDemo?.(); window.location.reload();}catch(error){console.error('Could not reset demo.',error);control.disabled=false;}
    }
  });

  styles();
  const settingsNav=document.querySelector('.sidebar-nav [data-view="settings"]');
  let settingsWasActive=!!settingsNav?.classList.contains('active');
  if(settingsWasActive) render();
  if(settingsNav){
    new MutationObserver(()=>{
      const active=settingsNav.classList.contains('active');
      if(active&&!settingsWasActive) render();
      settingsWasActive=active;
    }).observe(settingsNav,{attributes:true,attributeFilter:['class']});
  }
})();