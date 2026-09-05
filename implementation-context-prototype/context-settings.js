(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root = () => document.getElementById('viewRoot');
  const api = () => window.STATE_API;

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
      .settings-subhead{margin:18px 0 4px;font-size:14px;font-weight:700}
      .settings-project-name{margin-top:14px;display:grid;gap:6px;max-width:420px}
      .settings-project-name label{font-size:12px;font-weight:700}
      .settings-project-name input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--soft,#f6f5f8);color:inherit}
      .settings-status{font-size:12px;font-weight:700;padding:5px 9px;border:1px solid var(--line,#d8d8df);border-radius:999px;white-space:nowrap}
      .settings-rule-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:9px}
      .settings-rule-list li{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line,#e5e5ea)}
      .settings-rule-copy strong{display:block;margin-bottom:3px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#666)}
      .settings-rule-form{display:flex;gap:8px;margin-top:16px;align-items:flex-end}
      .settings-rule-form label{flex:1;display:grid;gap:6px;font-size:12px;font-weight:700}
      .settings-rule-form input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line,#ccc);border-radius:10px;background:var(--surface,#fff);color:inherit}
      .settings-behavior-list{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:9px}
      .settings-behavior-list li{padding-left:22px;position:relative;line-height:1.45}
      .settings-behavior-list li::before{content:'✓';position:absolute;left:0;font-weight:700}
      .slack-preview,.source-list{margin-top:16px;display:grid;gap:10px}
      .slack-preview-row,.source-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line,#e5e5ea)}
      .slack-preview-row span,.source-row span{color:var(--muted,#666);font-size:13px}
      .source-row strong{display:block;margin-bottom:2px}
      .settings-callout{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--soft,#f6f5f8);font-size:13px;line-height:1.45}
      .settings-actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}
      .settings-danger{border-color:#c8a7a7}
      @media(max-width:680px){.settings-section{padding:16px}.settings-section-head,.slack-preview-row,.source-row{align-items:flex-start;flex-direction:column}.settings-rule-form{display:grid}.settings-rule-list li{align-items:flex-start}.settings-status{align-self:flex-start}}
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
      <div class="page-head"><h2>Settings</h2><p>Configure this State project and the sources allowed to feed it.</p></div>

      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Project</h3><p>Basic information and interpretation rules for this State project.</p></div></div>
        <div class="settings-project-name"><label for="settings-project-name">Project name</label><input id="settings-project-name" value="Northstar" readonly aria-readonly="true"><p>Project renaming is not available in the demo.</p></div>
        <div class="settings-subhead">Project rules</div>
        <p>Rules tell State how to interpret information for this project.</p>
        <ul class="settings-rule-list">${projectRules.length?projectRules.map(rule=>`<li data-rule-id="${esc(rule.id)}"><div class="settings-rule-copy"><strong>${esc(rule.category||'Interpretation')}</strong><span>${esc(rule.text||rule.rule||'')}</span></div><button class="text-button" type="button" data-settings-action="delete-rule" data-rule-id="${esc(rule.id)}">Remove</button></li>`).join(''):'<li><span>No project-specific rules yet.</span></li>'}</ul>
        <form class="settings-rule-form" data-settings-action="add-rule"><label>Add a project rule<input name="rule" autocomplete="off" placeholder="Example: Security approvals must be explicit."></label><button class="btn secondary" type="submit">Add rule</button></form>
      </section>

      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Evidence &amp; review</h3><p>Project-wide safeguards State uses when information may affect what the team treats as true.</p></div></div>
        <ul class="settings-behavior-list">
          <li>Evidence never changes Current State automatically.</li>
          <li>Questions stay unresolved until supporting information goes through Review.</li>
          <li>Ignored evidence is excluded from active reasoning.</li>
          <li>Evidence history is preserved so accepted changes remain explainable.</li>
        </ul>
        <div class="settings-callout">These safeguards describe how State works. They are not configurable because they protect the human authorization model.</div>
      </section>

      <section class="settings-section">
        <div class="settings-section-head"><div><h3>Connected sources</h3><p>Choose where State can gather project information from planning, discovery, and collaboration.</p></div></div>
        <div class="settings-callout"><strong>Sources provide Evidence. They never change Current State directly.</strong></div>
        <div class="source-list" aria-label="Connected and planned sources">
          <div class="source-row"><div><strong>Slack</strong><span>Conversations, decisions, questions, and corrections.</span></div><span class="settings-status">Not connected</span></div>
          <div class="source-row"><div><strong>Google Drive</strong><span>Docs, Sheets, Slides, research, and planning artifacts.</span></div><span class="settings-status">Coming soon</span></div>
          <div class="source-row"><div><strong>Notion</strong><span>Project documentation, discovery notes, research, and specs.</span></div><span class="settings-status">Coming soon</span></div>
          <div class="source-row"><div><strong>Confluence</strong><span>Project documentation and shared team knowledge.</span></div><span class="settings-status">Coming soon</span></div>
        </div>
        <div class="settings-subhead">Slack</div>
        <p>Choose which project channels can automatically feed conversations into Evidence.</p>
        <div class="slack-preview" aria-label="Planned Slack behavior">
          <div class="slack-preview-row"><div><strong>Approved channels</strong><br><span>Only channels explicitly enabled for this project will be eligible.</span></div><span>Planned</span></div>
          <div class="slack-preview-row"><div><strong>Threads</strong><br><span>Long-running conversations will be grouped and checkpointed when meaningfully updated.</span></div><span>Planned</span></div>
          <div class="slack-preview-row"><div><strong>Noise control</strong><br><span>Bot/system chatter is filtered first; low-value Evidence can be ignored later.</span></div><span>Planned</span></div>
        </div>
        <div class="settings-actions"><button class="btn secondary" type="button" disabled aria-disabled="true">Connect Slack</button></div>
      </section>

      <section class="settings-section settings-danger">
        <div class="settings-section-head"><div><h3>Demo</h3><p>Restore Northstar to the seeded demo baseline.</p></div></div>
        <div class="settings-actions"><button class="btn secondary" type="button" data-settings-action="reset-demo">Reset demo</button></div>
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

  function enhance(){styles(); if(document.querySelector('.sidebar-nav [data-view="settings"]')?.classList.contains('active')) render();}
  let queued=false; const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();