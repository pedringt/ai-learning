// context-app-dialogs.js: moved verbatim out of context-app.js (Oct 2026, pure-move split; no
// behavior change). Loaded before context-app.js, which calls install() once, passing the
// closure values these functions used to read directly, and gets the functions back.
// The shared dialog overlay, toast, and the dialogs that need nothing but `state`:
// showDialog/closeDialog/autoCloseDialog, Need Help, project Rules, Add Evidence, and the
// analyzing dialog with its elapsed-time clock.
window.STATE_APP_DIALOGS=Object.freeze({install(ctx){
  const {baselineSetupActive,dialogBody,esc,overlay,state}=ctx;
  // QA follow-up (2026-09-14): resolving an open_question Review used to
  // confirm which Question the evidence landed on ("Linked to the existing
  // Question", "Question created") in a toast with no way to actually see
  // that Question -- a dead end for the one message whose entire point is
  // telling you where something went. `action` opens it directly; the
  // toast stays up longer while an action is offered so there's time to
  // click it.
  function showToast(message,action=null){
    document.querySelector('.state-toast')?.remove();
    const toast=document.createElement('div');
    toast.className='state-toast';toast.setAttribute('role','status');
    const text=document.createElement('span');text.textContent=message;toast.appendChild(text);
    if(action){
      const btn=document.createElement('button');btn.type='button';btn.className='state-toast-action';btn.textContent=action.label;
      btn.addEventListener('click',()=>{toast.remove();action.onClick();});
      toast.appendChild(btn);
    }
    document.body.appendChild(toast);
    // QA follow-up (2026-09-14): a toast with a "View" action still vanished
    // fast enough that a real person reading it could miss the link before
    // clicking it. Longer base duration, and pausing the countdown on
    // hover/focus -- so reading it (or moving toward the button) doesn't
    // race the timer -- rather than picking an even longer fixed delay that
    // just as easily proves too short for someone slower to react.
    let remaining=action?9000:2600, timer=null, startedAt=0;
    const arm=()=>{startedAt=Date.now();timer=setTimeout(()=>toast.remove(),remaining);};
    const pause=()=>{if(!timer)return;clearTimeout(timer);timer=null;remaining-=Date.now()-startedAt;};
    if(action){toast.addEventListener('mouseenter',pause);toast.addEventListener('mouseleave',arm);toast.addEventListener('focusin',pause);toast.addEventListener('focusout',arm);}
    arm();
  }
  function showDemoHelp(){
    window.StateAnalytics?.track('orientation_opened');
    const steps=[
      ['1. Add','Add Evidence. Capture a finding, decision, or meeting update. Approved Slack conversations can also become Evidence automatically.'],
      ['2. State interprets','AI compares new Evidence with Current State and identifies possible changes or unresolved Questions.'],
      ['3. Review & decide','Review proposed changes. Accept, reject/leave unchanged, or keep uncertainty open before Current State changes.'],
      ['4. Know','Accepted changes update Current State. Previous decisions remain in History.'],
      ['5. Ask','Use Ask State to understand the project without changing it.']
    ];
    const projectName=state.data.project?.name||'this project';
    // Blank-project bug report (2026-09-15): don't offer "Reset example
    // data" here for a user-created project -- it has no baseline (the
    // backend would 403 it). Its lifecycle action (Delete) lives in
    // Settings only, not mixed into this orientation modal.
    const resetHelp=state.data.project?.seeded!==false
      ?`<div class="demo-reset-help"><div><strong>Want to start over?</strong><span>Restore the curated ${esc(projectName)} starting scenario. You can also reset ${esc(projectName)} from Settings.</span></div><button class="text-button demo-reset-link" data-action="confirm-demo-reset">Reset example data →</button></div>`:'';
    showDialog(`<span class="eyebrow">How this works</span><h2 id="dialogTitle">State keeps accepted understanding separate from new information.</h2><div class="state-help-steps">${steps.map(([title,body])=>`<div class="state-help-step"><strong>${esc(title)}</strong><span>${esc(body)}</span></div>`).join('')}</div><p class="demo-flow-principle">AI interprets → software enforces → people decide</p><div class="demo-start"><span class="meta-label">Good places to start</span><button class="demo-start-action" data-action="demo-start-ask"><strong>Ask about ${esc(projectName)}</strong><span>Put a useful project question in Ask →</span></button><button class="demo-start-action" data-action="demo-start-note"><strong>Add a sample note</strong><span>Try new project information and see how Review handles it →</span></button><button class="demo-start-action" data-action="demo-start-project"><strong>Explore Current State</strong><span>Read the maintained view of what the project currently treats as true →</span></button><button class="demo-start-action" data-action="show-reviewer-guide"><strong>Take the quick tour</strong><span>Bring back the Workspace walkthrough banner →</span></button></div>${resetHelp}<div class="dialog-actions demo-help-actions"><button class="btn primary" data-action="close-dialog">Got it</button></div>`);
  }

  function showDialog(html){
    if(overlay.hidden) state.dialogReturnFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Showing any new dialog invalidates a previous auto-close timer (if any)
    // so it can never fire against a different, later dialog. Callers that
    // want this one to auto-close call autoCloseDialog() right after.
    state.autoCloseToken=null;
    dialogBody.innerHTML=html; overlay.hidden=false; overlay.scrollTop=0; document.body.classList.add('modal-open');
    const dialog=document.querySelector('.dialog');
    if(dialog) dialog.scrollTop=0;
    const closeButton=dialog?.querySelector('.dialog-close');
    if(closeButton){ closeButton.disabled=!!state.isAnalyzing; closeButton.hidden=!!state.isAnalyzing; }
    requestAnimationFrame(()=>{
      overlay.scrollTop=0; if(dialog) dialog.scrollTop=0;
      const first=dialog?.querySelector('[autofocus], input:not([type="hidden"]), textarea, select');
      (first||dialog)?.focus({preventScroll:true});
      overlay.scrollTop=0; if(dialog) dialog.scrollTop=0;
    });
  }
  function closeDialog(){
    overlay.hidden=true; dialogBody.innerHTML=''; document.body.classList.remove('modal-open');
    state.autoCloseToken=null;
    const target=state.dialogReturnFocus; state.dialogReturnFocus=null;
    if(target && document.contains(target)) requestAnimationFrame(()=>target.focus());
  }
  // Info-only confirmations (no action buttons) otherwise sit on top of the
  // page indefinitely: their full-screen backdrop silently absorbs the
  // user's next click as a dismiss instead of letting it reach whatever was
  // actually clicked underneath (e.g. a sidebar nav tab), so it looks like
  // that first click did nothing. Auto-close after a readable delay instead
  // of requiring an explicit dismissal for dialogs with nothing to act on.
  function autoCloseDialog(delay=2200){
    const token=Symbol();
    state.autoCloseToken=token;
    setTimeout(()=>{ if(state.autoCloseToken===token && !overlay.hidden) closeDialog(); },delay);
  }
  function showProjectSettings(){
    const rulesStatus=state.backendStatus.rules;
    const rows=rulesStatus==='error'?'<div class="open-items-empty unavailable-inline">Project Rules could not be loaded. Try again before making changes.</div>':state.projectRules.length?state.projectRules.map(rule=>`<div class="project-rule-row"><div><span class="open-item-label question">${esc(rule.category)}</span><p>${esc(rule.text)}</p></div><button class="text-button" data-action="delete-project-rule" data-rule-id="${rule.id}">Remove</button></div>`).join(''):'<div class="open-items-empty">No project-specific rules yet.</div>';
    const form=rulesStatus==='error'?'':`<div class="project-rule-form"><label for="projectRuleCategory">Category</label><select id="projectRuleCategory"><option>Authority</option><option>Review</option><option>Sources</option><option selected>Interpretation</option></select><label for="projectRuleText">New rule</label><textarea id="projectRuleText" rows="3" placeholder="Example: Slack is supporting evidence, not authoritative approval."></textarea><button class="btn primary" data-action="save-project-rule">Add rule</button></div>`;
    const projectName=state.data.project?.name||'this project';
    // Blank-project bug report (2026-09-15), item 3: a seeded demo project
    // (Northstar/Juniper) can be Reset to its curated baseline but never
    // Deleted (there'd be nothing to restore it from); a user-created
    // project can be Deleted but never Reset (it has no baseline). Default
    // to treating an unknown/missing `seeded` flag as seeded -- the backend
    // still enforces this either way, but the UI should never offer a
    // Delete button that surprises someone on Northstar/Juniper.
    const isSeeded=state.data.project?.seeded!==false;
    const lifecycleZone=isSeeded
      ?`<div class="demo-reset-zone"><span class="eyebrow">Example data</span><p>Restore ${esc(projectName)} to the curated starting scenario with open Reviews, blockers, Questions, Notes, Rules, and History.</p><button class="btn secondary danger-light" data-action="confirm-demo-reset">Reset example data</button></div>`
      :`<div class="demo-reset-zone"><span class="eyebrow">Delete project</span><p>Permanently remove ${esc(projectName)} and everything in it: Notes, Evidence, Reviews, Questions, Current State, and History. This cannot be undone.</p><button class="btn secondary danger-light" data-action="confirm-delete-project">Delete project</button></div>`;
    showDialog(`<span class="eyebrow">Project settings</span><h2 id="dialogTitle">Rules</h2><p>Rules tell State how to interpret evidence and when to interrupt you. They are not Current State and State cannot change them on its own.</p><p class="settings-note">Rules apply to future analysis. Existing Reviews are not reinterpreted automatically.</p><div class="project-rule-list">${rows}</div>${form}${lifecycleZone}`);
  }

  // state.md #108: entering Add Evidence from Current State's "Something
  // changed?" CTA uses the exact same dialog/flow/endpoint as every other
  // entry point -- only the guiding description line changes, and only as
  // UI copy. No prefill, no special correction object, no direct edit.
  // addDialogHtml is a pure function (same pattern as context-open-items-
  // view.js's questionDialogHtml) so it's directly testable without a DOM.
  function addDialogHtml(prefill='',{description}={}){
    const desc=description||'Add project information State should evaluate. It is preserved as Evidence first and cannot change Current State without Review.';
    return `<span class="eyebrow">Evidence</span><h2 id="dialogTitle">Add Evidence</h2><p class="evidence-project-context">Adding to <strong>${esc(state.data.project?.name||'this project')}</strong></p><p>${esc(desc)}</p><textarea id="addInfoText" rows="7" aria-label="Evidence" placeholder="Paste a finding, decision, meeting update, or other project information...">${esc(prefill)}</textarea><div class="upload-evidence-row"><span>or</span><label class="text-button upload-evidence-label" for="uploadInfoFile">Upload a file (.txt, .md, .pdf, .docx)</label><input id="uploadInfoFile" type="file" accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden /></div><div class="note-example-picker"><span class="meta-label">Try an example</span><div class="note-example-chips"><button type="button" data-action="sample-info" data-sample="plan">New plan</button><button type="button" data-action="sample-info" data-sample="research">Research finding</button><button type="button" data-action="sample-info" data-sample="constraint">Decision / constraint</button></div></div><div class="dialog-actions"><button class="btn primary" data-action="save-info">Add Evidence</button><button class="btn secondary" data-action="close-dialog">Cancel</button></div>`;
  }
  function showAddDialog(prefill='',options={}){ showDialog(addDialogHtml(prefill,options)); }
  let analysisClock=null;
  function analyzingDialog(){
    return `<div class="analysis-state"><div class="analysis-orbit" aria-hidden="true"><span></span><span></span><span></span></div><span class="eyebrow">Analyzing evidence</span><h2 id="dialogTitle">Working out what this changes…</h2><p>Comparing the note with Current State and deciding whether anything needs your review.</p><div class="analysis-progress"><span class="analysis-pulse" aria-hidden="true"></span><span id="analysisElapsed">Starting analysis…</span></div><p class="analysis-patience">${baselineSetupActive()?'Larger starting sources can take a little while to analyze. You can review the Starting State when they finish.':'A thorough comparison can take up to about 30 seconds.'}</p></div>`;
  }
  function startAnalysisClock(){
    clearInterval(analysisClock);
    const started=Date.now();
    const update=()=>{
      const el=document.getElementById('analysisElapsed');
      if(!el)return;
      const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
      el.textContent=seconds<2?'Starting analysis…':`Analyzing… ${seconds}s`;
    };
    update(); analysisClock=setInterval(update,1000);
  }
  function stopAnalysisClock(){ clearInterval(analysisClock); analysisClock=null; }
  return {showToast,showDemoHelp,showDialog,closeDialog,showProjectSettings,addDialogHtml,showAddDialog,analyzingDialog,startAnalysisClock,stopAnalysisClock};
}});
