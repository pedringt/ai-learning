(() => {
  let finishButton = null;

  function addStyles() {
    if (document.getElementById('state-baseline-polish-styles')) return;
    const style = document.createElement('style');
    style.id = 'state-baseline-polish-styles';
    style.textContent = `
      body.state-baseline-active .state-reviewer-guide{display:none!important}
      .baseline-setup-banner{padding:14px 16px!important;border-radius:12px!important;box-shadow:none!important}
      body:not(.v88-dark) .baseline-setup-banner{border-color:#d9e3f0!important;background:#f7faff!important}
      body.v88-dark .baseline-setup-banner{border-color:#303946!important;background:#171b22!important}
      .baseline-setup-title{font-size:13px!important;color:var(--ink)!important}
      .baseline-setup-copy{max-width:680px!important;font-size:12.5px!important}
      .baseline-setup-stats{margin-top:10px!important}
      .baseline-setup-stat{font-size:10.5px!important;padding:4px 7px!important}
      .baseline-setup-actions{min-width:155px!important}
      .baseline-setup-actions .primary-button{min-height:38px!important;padding:8px 11px!important}
      @media(max-width:760px){.baseline-setup-banner{margin-left:14px!important;margin-right:14px!important}}
    `;
    document.head.appendChild(style);
  }

  function baselineIsActive() {
    const banner = document.getElementById('baselineSetupBanner');
    return !!banner && !banner.hidden;
  }

  function syncBaselinePresentation() {
    const active = baselineIsActive();
    document.body.classList.toggle('state-baseline-active', active);
    if (!active) return;
    const patience = document.querySelector('.analysis-patience');
    if (patience) patience.textContent = 'Larger baseline sources can take up to a couple of minutes while State works through them.';
  }

  function showDialog(html) {
    const overlay = document.getElementById('overlay');
    const body = document.getElementById('dialogBody');
    if (!overlay || !body) return false;
    body.innerHTML = html;
    overlay.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => overlay.querySelector('[role="dialog"]')?.focus());
    return true;
  }

  function closeDialog() {
    const overlay = document.getElementById('overlay');
    const body = document.getElementById('dialogBody');
    if (overlay) overlay.hidden = true;
    if (body) body.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function openFinishDialog(button) {
    finishButton = button;
    showDialog(`<span class="eyebrow">Baseline Setup</span><h2 id="dialogTitle">Finish Baseline Setup?</h2><p>Future Evidence will use State's normal ongoing interpretation rules. Your Evidence, Reviews, Questions, Current State, and History stay intact.</p><div class="dialog-actions"><button class="btn secondary" type="button" data-action="close-dialog">Cancel</button><button class="btn primary" type="button" data-baseline-confirm-finish>Finish setup</button></div>`);
  }

  async function finishBaseline() {
    const button = finishButton;
    finishButton = null;
    closeDialog();
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Finishing…';

    const base = window.STATE_API?.base;
    const projectId = document.getElementById('projectSwitcher')?.dataset?.projectId || '';
    try {
      const response = await fetch(`${base}/api/baseline/finish`, {
        method: 'POST',
        headers: projectId ? {'X-State-Project-Id': projectId} : {},
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload?.detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || `API error ${response.status}`);
      }
      const banner = document.getElementById('baselineSetupBanner');
      if (banner) {
        banner.hidden = true;
        banner.innerHTML = '';
      }
      document.body.classList.remove('state-baseline-active');
      document.dispatchEvent(new Event('state-project-record-changed'));
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Finish Baseline Setup';
      showDialog(`<span class="eyebrow">Couldn’t finish setup</span><h2 id="dialogTitle">Baseline Setup is still active.</h2><p>${String(error?.message || 'Please try again.')}</p><div class="dialog-actions"><button class="btn primary" type="button" data-action="close-dialog">Close</button></div>`);
    }
  }

  document.addEventListener('click', event => {
    const confirm = event.target.closest?.('[data-baseline-confirm-finish]');
    if (confirm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishBaseline();
      return;
    }

    const finish = event.target.closest?.('[data-baseline-finish]');
    if (!finish || finish.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openFinishDialog(finish);
  }, true);

  function start() {
    addStyles();
    syncBaselinePresentation();
    new MutationObserver(() => requestAnimationFrame(syncBaselinePresentation))
      .observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
