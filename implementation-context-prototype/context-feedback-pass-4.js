(() => {
  const STYLE_ID='state-final-feedback-r61';

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Product chrome */
      html body:not(.v88-dark) .prototype-productbar{border-bottom-color:#9fb9d8!important}
      html body .workspace-attention .workspace-attention-head p{display:none!important}
      html body .workspace-attention .attention-list{background:transparent!important;border:0!important;border-radius:0!important;overflow:visible!important}
      html body .workspace-attention .attention-item{background:transparent!important;border:0!important;border-top:1px solid #e6e8ee!important;border-radius:0!important;box-shadow:none!important;transition:none!important}
      html body .workspace-attention .attention-item:first-child{border-top:0!important}
      html body .workspace-attention .attention-item:hover{background:#fafbfc!important;transform:none!important;box-shadow:none!important}
      html body .workspace-attention .attention-row-icon{background:#eaf2ff!important;color:#1769e8!important;border-color:#d8e6fb!important}
      html body .workspace-attention .attention-row-icon svg{stroke:currentColor!important}

      /* Current State: readable document with a clear secondary utility. */
      html body .project-page .project-head-copy-context{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:39px!important;padding:0 15px!important;border:1px solid #b9cbe4!important;border-radius:9px!important;background:#fff!important;color:#24568f!important;box-shadow:0 1px 2px rgba(16,26,49,.05)!important;font-size:12.5px!important;font-weight:750!important}

      /* Open Items: prioritized work queue, not alert cards. */
      html body .open-items-page .open-items-sections{display:grid!important;gap:30px!important}
      html body .open-items-page .open-items-section{background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important}
      html body .open-items-page .open-items-section-head{padding:0 0 11px!important;background:transparent!important;border:0!important;border-bottom:1px solid #dde3ea!important;border-radius:0!important;min-height:0!important}
      html body .open-items-page .open-items-section-head:hover{background:transparent!important}
      html body .open-items-page .open-items-kicker{font-size:9.5px!important;letter-spacing:.09em!important;color:#818a99!important}
      html body .open-items-page .open-items-section-title{font-size:17px!important;line-height:1.25!important;color:#15213a!important}
      html body .open-items-page .open-items-section-count{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:21px!important;height:21px!important;padding:0 6px!important;border-radius:999px!important;background:#f0f2f5!important;color:#596579!important;font-size:10.5px!important}
      html body .open-items-page .open-items-section-description{font-size:12px!important;line-height:1.42!important;color:#6f7888!important;max-width:650px!important}
      html body .open-items-page .open-items-section-body{padding:0!important;background:transparent!important}
      html body .open-items-page .review-card,html body .open-items-page .compact-review{max-width:820px!important;margin:0!important;background:#fff!important;border:0!important;border-bottom:1px solid #e4e8ee!important;border-radius:0!important;box-shadow:none!important}
      html body .open-items-page .review-card-toggle{background:transparent!important;border:0!important}
      html body .open-items-page .review-card-toggle:hover{background:#fafbfc!important}
      html body .open-items-page .review-kicker{font-size:10px!important;letter-spacing:.06em!important;color:#66569a!important}
      html body .open-items-page .review-card-title{font-size:14.5px!important;line-height:1.4!important;color:#17223a!important}
      html body .open-items-page .review-source-meta{font-size:10.5px!important;color:#7d8696!important}
      html body .open-items-page .review-card-body{padding:0 4px 17px!important;background:transparent!important}
      html body .open-items-page .review-decision-context{display:grid!important;gap:9px!important;max-width:760px!important}
      html body .open-items-page .review-context-block{position:relative!important;background:#f8f9fb!important;border:1px solid #e4e8ee!important;border-radius:9px!important;padding:11px 13px!important}
      html body .open-items-page .review-context-block+ .review-context-block{margin-top:17px!important}
      html body .open-items-page .review-context-block+ .review-context-block::before{content:'↓  New evidence to consider';position:absolute;left:10px;top:-18px;font-size:9.5px;line-height:1;font-weight:750;letter-spacing:.02em;color:#6f7888;background:#fff;padding:0 5px}
      html body .open-items-page .review-context-block span{font-size:9.5px!important;letter-spacing:.08em!important;color:#727b8c!important}
      html body .open-items-page .review-context-block p{font-size:12.5px!important;line-height:1.45!important}
      html body .open-items-page .review-actions{margin-top:11px!important;gap:7px!important}
      html body .open-items-page .review-actions .btn{min-height:37px!important;padding:0 12px!important;font-size:11.5px!important}
      html body .open-items-page details.reasoning{margin-top:7px!important;padding-top:7px!important}
      html body .open-items-page details.reasoning summary{font-size:10.5px!important;line-height:1.25!important;font-weight:700!important;color:#6d7686!important}
      html body .open-items-page details.reasoning p{margin:5px 0!important;font-size:11.5px!important;line-height:1.4!important;color:#586273!important}
      html body .open-items-page .open-question-list{max-width:760px!important;border:0!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
      html body .open-items-page .open-question-row{width:100%!important;padding:13px 4px!important;background:#fff!important;border:0!important;border-bottom:1px solid #e4e8ee!important;border-radius:0!important;box-shadow:none!important}
      html body .open-items-page .open-question-row:hover{background:#fafbfc!important;transform:none!important}
      html body .open-items-page .open-item-label{display:inline-flex!important;width:auto!important;padding:2px 6px!important;border-radius:999px!important;font-size:9px!important;letter-spacing:.05em!important}
      html body .open-items-page .open-item-label.blocking{background:#fff7ec!important;color:#95601d!important}
      html body .open-items-page .open-item-label.question{background:#edf4ff!important;color:#315f9a!important}
      html body .open-items-page .open-question-title{display:block!important;max-width:650px!important;font-size:13.5px!important;line-height:1.4!important;color:#17223a!important}
      html body .open-items-page .open-question-meta{display:block!important;max-width:650px!important;font-size:10.5px!important;line-height:1.38!important;color:#818a99!important}

      /* Notes: scannable feed first, details second. */
      html body .notes-page article.simple-note.note-index-row{max-width:900px!important;padding-top:14px!important;padding-bottom:14px!important}
      html body .notes-page .note-index-main h3{font-size:13.5px!important;line-height:1.35!important}
      html body .notes-page .note-index-main p{display:-webkit-box!important;-webkit-line-clamp:4!important;-webkit-box-orient:vertical!important;overflow:hidden!important;max-width:720px!important;font-size:12.5px!important;line-height:1.48!important}
      html body .notes-page .note-expand-label{font-size:10.5px!important;margin-top:5px!important}
      html body .notes-page .note-index-row .text-button,html body .notes-page [data-action*='copy']{font-size:10.5px!important;min-height:0!important;padding:3px 5px!important;font-weight:700!important}

      /* History: audit/change log. The transition is the visual centerpiece. */
      html body .history-page .history-sources,html body .history-page .history-entry-link,html body .history-page .history-reason{display:none!important}
      html body .history-page .history-list{position:static!important;background:none!important;border:0!important}
      html body .history-page .history-list::before,html body .history-page .history-list::after,html body .history-page .history-entry::before,html body .history-page .history-entry::after,html body .history-page .history-entry-body::before,html body .history-page .history-entry-body::after{content:none!important;display:none!important;border:0!important;background:none!important}
      html body .history-page .history-entry,html body .history-page .history-entry-body{border-left:0!important;border-inline-start:0!important;background-image:none!important;box-shadow:none!important;transform:none!important;transition:none!important}
      html body .history-page .history-entry{border-bottom:1px solid #dfe4eb!important;padding:0 0 28px!important;margin:0 0 28px!important}
      html body .history-page .history-entry:last-child{border-bottom:0!important}
      html body .history-page .history-entry:hover,html body .history-page .history-entry.is-linked:hover{background:transparent!important;border-left:0!important;box-shadow:none!important;transform:none!important;outline:0!important}
      html body .history-page .history-entry-date{width:auto!important;border:0!important;border-radius:0!important;background:transparent!important;color:#798394!important;font-size:10.5px!important;font-weight:750!important;letter-spacing:.04em!important;text-transform:uppercase!important}
      html body .history-page .history-entry h3{font-size:18px!important;line-height:1.25!important;margin:5px 0 11px!important;color:#17223a!important}
      html body .history-page .history-change{gap:9px!important}
      html body .history-page .history-change>p{padding:11px 13px!important;border-radius:9px!important;font-size:12.5px!important;line-height:1.45!important}
      html body:not(.v88-dark) .history-page .history-change>p:first-child{background:#f7f8fa!important;border-color:#e2e6eb!important}
      html body:not(.v88-dark) .history-page .history-change>p:last-child{background:#edf8f2!important;border-color:#cae6d6!important}
      html body .history-page .decision-line{margin-top:9px!important;font-size:10.5px!important;color:#687386!important}
      html body .settings-page .settings-section{margin:0!important;border-bottom:1px solid #e1e5eb!important}
      html body .settings-page .settings-section:first-of-type{padding-top:6px!important}
      html body .settings-page .settings-section:last-child{border-bottom:0!important}
      html body .settings-page .settings-quiet{background:transparent!important}
      html body .settings-page .settings-section-head{margin-bottom:10px!important;gap:12px!important}
      html body .settings-page .settings-section h3{font-size:15px!important;color:#1d2a42!important}
      html body .settings-page .settings-section p{font-size:12px!important;line-height:1.45!important;color:#6f7888!important}
      html body .settings-page .settings-behavior-list{grid-template-columns:1fr!important;margin-top:8px!important;gap:4px!important}
      html body .settings-page .settings-behavior-list li{font-size:12px!important;line-height:1.4!important;color:#3f4b5f!important;padding-left:19px!important}
      html body .settings-page .settings-project-name{max-width:340px!important}
      html body .settings-page .settings-project-name label{font-size:10.5px!important}
      html body .settings-page .settings-project-name input{padding:8px 9px!important;background:#f8f9fb!important;font-size:12.5px!important}
      html body .settings-page .settings-rules{margin-top:12px!important;border:1px solid #e1e5eb!important;border-radius:8px!important;background:#fff!important}
      html body .settings-page .settings-rules summary{padding:9px 11px!important;font-size:12px!important}
      html body .settings-page .settings-rules-body{padding:11px!important}
      html body .settings-page .settings-rule-list{margin-top:10px!important;padding-top:8px!important}
      html body .settings-page .settings-rule-list li{padding:8px 4px!important;background:#fff!important;border:0!important;border-top:1px solid #e6e9ee!important;border-radius:0!important}
      html body .settings-page .settings-rule-copy strong{font-size:9px!important}
      html body .settings-page .settings-rule-copy span{font-size:11.5px!important;line-height:1.4!important;color:#4f5b70!important}
      html body .settings-page .slack-preview,html body .settings-page .source-list{margin-top:8px!important;gap:0!important}
      html body .settings-page .slack-preview-row,html body .settings-page .source-row{padding:9px 0!important;border-top:1px solid #e5e8ed!important}
      html body .settings-page .source-description,html body .settings-page .slack-preview-row span{font-size:11.5px!important;line-height:1.4!important}
      html body .settings-page .settings-actions{gap:7px!important;margin-top:11px!important}
      html body .settings-page .settings-actions .btn,html body .settings-page .slack-preview-row button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:104px!important;height:38px!important;min-height:38px!important;padding:0 12px!important;font-size:11.5px!important;line-height:1.2!important;font-weight:700!important;border-radius:8px!important}

      /* Dialogs: focused work surfaces, not oversized prototype cards. */
      html body .overlay{padding:18px!important}
      html body .dialog{width:min(560px,100%)!important;max-height:calc(100dvh - 36px)!important;padding:20px!important;border-radius:13px!important}
      html body .dialog:has(.review-decision-context),html body .dialog:has(.reasoning){width:min(620px,100%)!important}
      html body .dialog-close{width:28px!important;height:28px!important;font-size:21px!important}
      html body .dialog h2{font-size:22px!important;line-height:1.2!important;margin:5px 26px 7px 0!important}
      html body .dialog p{font-size:12.5px!important;line-height:1.48!important}
      html body .dialog textarea{min-height:105px!important;font-size:12.5px!important}
      html body .dialog .dialog-actions{gap:7px!important;margin-top:15px!important}
      html body .dialog .btn{min-height:37px!important;padding:0 12px!important;font-size:11.5px!important}
      html body .state-help-steps{gap:7px!important;margin:12px 0!important}
      html body .state-help-step{padding:8px 10px!important}
      html body .state-help-step strong{font-size:12px!important}
      html body .state-help-step span{font-size:11px!important}

      /* Ask: one explicit control state. The old generic button::after rule is neutralized here. */
      html body #askStateDrawer .ask-quick-actions-polish{display:none!important}
      html body #askStateDrawer .ask-state-drawer-form{position:relative!important}
      html body #askStateDrawer .ask-state-drawer-form input{height:43px!important;min-height:43px!important;max-height:43px!important;padding-right:49px!important}
      html body #askStateDrawer .ask-state-drawer-form button::after{content:none!important;display:none!important}
      html body #askStateDrawer .ask-state-drawer-form button[type='submit']::after{content:'→'!important;display:block!important;font-size:18px!important}
      html body #askStateDrawer .state-ask-clear{display:none!important}
      html body #askStateDrawer .state-ask-reset{position:absolute!important;right:6px!important;top:50%!important;transform:translateY(-50%)!important;width:31px!important;height:31px!important;padding:0!important;border:0!important;background:transparent!important;color:#677389!important;font-size:21px!important;line-height:31px!important;z-index:20!important;cursor:pointer!important}
      html body #askStateDrawer .state-ask-reset::before,html body #askStateDrawer .state-ask-reset::after{content:none!important;display:none!important}
      html body #askStateDrawer.has-answer .ask-state-starters,html body #askStateDrawer.is-generating .ask-state-starters{display:none!important}
      html body #askStateDrawer .ask-state-starters{grid-template-columns:minmax(0,1fr)!important;width:100%!important}
      html body #askStateDrawer .ask-state-starters button{width:100%!important;min-width:0!important;max-width:100%!important;white-space:normal!important;text-align:left!important}
      html body #askStateDrawer .ask-copy-answer{min-height:27px!important;height:27px!important;padding:0 7px!important;font-size:10px!important}
      html body #askStateDrawer .ask-live-answer>h2,html body #askStateDrawer .ask-live-answer .ask-answer-head h2{font-size:19px!important;line-height:1.22!important}
      html body #askStateDrawer .ask-live-answer .result-lede,html body #askStateDrawer .ask-live-answer .ask-answer-summary,html body #askStateDrawer .ask-item-text{font-size:12.5px!important;line-height:1.5!important}
      html body #askStateDrawer .ask-item-action,html body #askStateDrawer .ask-item-link,html body #askStateDrawer .ask-state-actions .text-button{font-size:10px!important;font-weight:700!important}

      @media(max-width:760px){
        html body .open-items-page .open-question-list,html body .open-items-page .review-card,html body .open-items-page .compact-review{max-width:100%!important}
        html body #askStateDrawer .ask-state-drawer-form input{height:41px!important;min-height:41px!important;max-height:41px!important;padding-right:47px!important;font-size:14px!important}
        html body #askStateDrawer .ask-state-drawer-form button[type='submit']{position:absolute!important;right:5px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;width:31px!important;height:31px!important;min-width:31px!important;padding:0!important}
        html body #askStateDrawer .state-ask-reset{right:5px!important;width:31px!important;height:31px!important;line-height:31px!important}
        html body .dialog{padding:17px!important}
        html body .dialog h2{font-size:20px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureResetButton(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form) return;
    let reset=form.querySelector('.state-ask-reset');
    if(!reset){
      reset=document.createElement('button');
      reset.type='button';
      reset.className='state-ask-reset';
      reset.setAttribute('aria-label','Clear answer and start a new Ask');
      reset.textContent='×';
      form.appendChild(reset);
    }
  }

  function syncAskControls(){
    const drawer=document.getElementById('askStateDrawer'),form=drawer?.querySelector('.ask-state-drawer-form');
    if(!drawer||!form)return;
    ensureResetButton();
    const reset=form.querySelector('.state-ask-reset'),submit=form.querySelector('button[type="submit"]'),result=drawer.querySelector('#askStateDrawerResult');
    const hasAnswer=!!result?.querySelector('.ask-live-answer,.ask-answer-item') || (!!result?.textContent?.trim()&&!result?.querySelector('.ask-live-loading,.ask-live-error'));
    const generating=drawer.classList.contains('is-generating')||drawer.dataset.askPending==='1'||!!result?.querySelector('.ask-live-loading');
    drawer.classList.toggle('has-answer',hasAnswer&&!generating);
    if(reset){
      reset.style.setProperty('display',hasAnswer&&!generating?'block':'none','important');
      reset.style.setProperty('visibility',hasAnswer&&!generating?'visible':'hidden','important');
    }
    if(submit){
      submit.style.setProperty('display',hasAnswer&&!generating?'none':'grid','important');
      submit.style.setProperty('visibility',hasAnswer&&!generating?'hidden':'visible','important');
      submit.style.setProperty('pointer-events',hasAnswer&&!generating?'none':'auto','important');
    }
  }

  function restoreAskDiscovery(){
    const drawer=document.getElementById('askStateDrawer');if(!drawer)return;
    const input=drawer.querySelector('#askStateDrawerInput'),result=drawer.querySelector('#askStateDrawerResult');
    drawer.dataset.stateAskResetting='1';
    if(result)result.innerHTML='';
    if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    delete drawer.dataset.askPending;
    drawer.classList.remove('has-answer','is-generating','is-editing-answer');
    drawer.querySelectorAll('.state-ask-status').forEach(el=>{el.className='state-ask-status';el.textContent='';});
    requestAnimationFrame(()=>{delete drawer.dataset.stateAskResetting;syncAskControls();});
  }

  function installAskControls(){
    if(document.documentElement.dataset.stateAskControlsR61==='1')return;
    document.documentElement.dataset.stateAskControlsR61='1';
    document.addEventListener('click',e=>{
      const reset=e.target.closest?.('#askStateDrawer .state-ask-reset');
      if(!reset)return;
      e.preventDefault();e.stopImmediatePropagation();restoreAskDiscovery();
    },true);
    document.addEventListener('submit',e=>{
      if(!e.target.closest?.('#askStateDrawer .ask-state-drawer-form'))return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer){drawer.classList.remove('has-answer','is-editing-answer');drawer.dataset.askPending='1';}
      requestAnimationFrame(syncAskControls);
    },true);
    document.addEventListener('input',e=>{
      if(e.target?.id!=='askStateDrawerInput')return;
      const drawer=document.getElementById('askStateDrawer');
      if(drawer?.dataset.stateAskResetting!=='1'&&drawer?.classList.contains('has-answer')) drawer.classList.add('is-editing-answer');
      requestAnimationFrame(syncAskControls);
    },true);
  }

  function cleanHistory(){
    document.querySelectorAll('.history-page .history-reason').forEach(el=>el.remove());
  }

  function seedStressNotes(){
    const app=window.STATE_ASK_TEST_API;
    const notes=app?.state?.data?.notes;
    if(!Array.isArray(notes)||notes.some(n=>n.id==='n-stress-long-meeting'))return;
    const structured=`Long implementation planning workshop. Purpose: test how State behaves with a genuinely long working note rather than a polished summary.\n\nDecisions discussed:\n- Keep the first pilot bounded to basic troubleshooting with human review.\n- Use approved help content and view-only account context as the primary grounding sources.\n- Treat exceptions, sensitive account actions, and anything the rep cannot verify as escalation cases.\n- Evaluate response-time improvement, edit severity, unsupported claims, escalation behavior, and serious failure categories separately.\n\nOpen questions:\n- What exact threshold should block launch if serious unsupported claims appear in evaluation?\n- Which account-level entitlement source should override the published plan matrix when they disagree?\n- Where should rep feedback live so Product can separate harmless edits from substantive corrections?\n- What evidence would Security require before reconsidering the human-review boundary?\n\nWorking discussion: Support emphasized that the hardest part of many tickets is not finding text but determining which source should be trusted when sources conflict. Experienced reps often know which account detail or recent product change matters; newer reps may search several places and still be unsure which answer is authoritative. Product noted that this is exactly where a retrieval-only solution can look more capable than it really is. Faster access to conflicting information does not resolve the conflict. The pilot therefore needs a clear authority model and visible escalation behavior rather than a confidence score that quietly substitutes for judgment.\n\nSecurity discussion: The team reviewed examples involving wrong-account data exposure, fabricated policy exceptions, incorrect feature-entitlement claims, and instructions that could weaken account security. Security does not want average answer quality to hide a severe but rare failure class. Evaluation should therefore report serious-problem categories separately from aggregate quality metrics. Human review stays in place for the first pilot.\n\nImplementation notes: The assistant should sit inside the existing rep workflow rather than create a parallel queue. It may summarize ticket context, retrieve approved material, and draft a response. The rep remains responsible for checking the grounding and sending the final customer-facing answer. Cases with insufficient support remain with the rep and follow the current escalation path. No customer-account write actions are exposed in phase one.\n\nRollout discussion: Start with a small internal cohort, establish baseline handling time and edit severity, run a known edge-case set repeatedly, and only broaden availability when the team understands the failure pattern. Leadership's earlier 50 percent autonomy idea remains an aspirational question, not an implementation requirement.\n\nFollow-ups:\n1. Product to draft launch thresholds.\n2. Security to turn high-risk categories into explicit test cases.\n3. Support Ops to confirm the authoritative source for account exceptions.\n4. Analytics to confirm which existing signals can measure re-contact without new instrumentation.\n5. Vendor team to confirm retention and no-training terms for the sandbox.\n\nAdditional workshop detail intentionally continues so the Notes feed has to handle realistic length. Participants revisited the distinction between retrieval confidence and authority several times. A result can be highly similar to the ticket and still be the wrong source to trust. The group also discussed stale documentation after releases, temporary customer entitlements, grandfathered packages, and cases where Slack contains the newest answer but has no clear owner. The working conclusion remained conservative: State should preserve uncertainty when authority is unclear rather than flatten multiple sources into one confident answer. This note intentionally contains repetition, headings, bullets, and long paragraphs to stress preview clamping, expansion, modal reading, copy controls, and mobile wrapping.`;
    const messy=`Pasted field notes / deliberately messy stress case. Customer says feature is missing even though plan page says it should exist. rep checked account, saw temporary migration entitlement, then checked old ticket, then internal thread, then docs. Nobody was completely sure which one wins. Need to NOT just answer from plan matrix. URL pasted from working notes: https://example.internal.local/support/feature-access/migration-exceptions?customer=sample-account&source=very-long-test-string-for-layout-behavior-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.\n\nmore notes: billing came up but only because the customer mentioned invoice language; this is NOT a billing-change request and should not suddenly make billing contacts or refund policy relevant. another rep said grandfathered packages are still around. someone else said temporary access can be granted for migration windows. docs may lag. slack may be newer but not authoritative. ask product ops which account field should be treated as final.\n\nTODO TODO TODO confirm authoritative entitlement source / decide whether temporary migration access can be safely explained / keep account changes out / do not expose write tools / check if vendor logs prompts / credentials should be redacted / test a reallyreallyreallyreallyreallyreallyreallyreallyreallyreallyreallyreallyreallylongunbrokenstringbecausepeoplepasteawfulthingsintosystemsandthelayoutstillneedstosurviveit.\n\nThis paragraph is intentionally long and poorly structured. In real discovery work, notes often arrive as a dump of observations, partial quotes, links, TODOs, caveats, and contradictory statements rather than a neat summary. The UI should make this readable enough to scan in the feed, but it should not pretend that the whole thing is already a concise established fact. It should also avoid expanding the entire page height by default just because one note is huge. The full content belongs in the focused note view, where line length and copy behavior can be tested without turning the Notes index into a wall of text.`;
    notes.push(
      {id:'n-stress-long-meeting',title:'Stress test: long implementation workshop notes',text:structured,source:'Implementation workshop',date:'Sep 8',dateISO:'2026-09-08',topics:['workflow','security','evaluation','operations'],status:'accepted'},
      {id:'n-stress-messy-paste',title:'Stress test: messy pasted field notes',text:messy,source:'Field notes paste',date:'Sep 8',dateISO:'2026-09-08',topics:['feature-access','security','operations'],status:'accepted'}
    );
  }

  function syncAttention(){
    const API=window.STATE_API,app=window.STATE_ASK_TEST_API;if(!API?.getAttention||!app?.state)return;
    API.getAttention().then(payload=>{
      const incoming=Array.isArray(payload?.questions)?payload.questions:[];
      app.state.data.questions=incoming.map(q=>({id:q.id,text:q.text,status:q.status,blocking:!!q.blocking,blocks:q.blocks||null,origin:q.origin||'Added from Workspace',created:q.created_at||'',createdISO:q.created_at||'',topics:[],backendManaged:true}));
      const reviews=Array.isArray(payload?.open_reviews)?payload.open_reviews.length:0,blockers=incoming.filter(q=>q.status==='open'&&q.blocking).length,count=reviews+blockers;
      document.querySelectorAll('#openItemsActionCount,#mobileOpenItemsCount').forEach(el=>{el.textContent=count;el.hidden=!count;el.setAttribute('aria-label',`${count} items need attention`);});
      const title=document.querySelector('.workspace-attention .workspace-attention-head h3');if(title&&count)title.textContent=`${count} ${count===1?'item is':'items are'} waiting on you`;
    }).catch(()=>{});
  }

  function installEvidenceSync(){
    if(document.documentElement.dataset.stateEvidenceSyncR61==='1')return;
    document.documentElement.dataset.stateEvidenceSyncR61='1';
    const body=document.getElementById('dialogBody');if(!body)return;
    new MutationObserver(()=>{
      const text=(body.textContent||'').replace(/\s+/g,' ').trim();
      if(/Evidence added|Saved, but not analyzed/i.test(text))setTimeout(syncAttention,250);
    }).observe(body,{childList:true,subtree:true,characterData:true});
  }

  function run(){installStyles();installAskControls();ensureResetButton();syncAskControls();cleanHistory();seedStressNotes();installEvidenceSync();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;installStyles();ensureResetButton();syncAskControls();cleanHistory();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();