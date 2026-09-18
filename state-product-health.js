(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.STATE_PRODUCT_HEALTH = api;
    if (root.document) api.initQualityEnhancement(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function shouldRetry(error, attempt) {
    return attempt === 0 && !!error && (error.isTimeout === true || /taking longer than expected/i.test(String(error.message || '')));
  }

  async function withStartupRetry(task, onRetry) {
    let attempt = 0;
    while (true) {
      try { return await task(attempt); }
      catch (error) {
        if (!shouldRetry(error, attempt)) throw error;
        attempt += 1;
        if (typeof onRetry === 'function') onRetry(error);
      }
    }
  }

  function pct(numerator, denominator) {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  function hoursLabel(hours) {
    if (hours == null) return 'Not enough data';
    if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
    return `${Math.round((hours / 24) * 10) / 10}d`;
  }

  function latencyLabel(ms) {
    if (ms == null) return 'Not enough data';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${Math.round(ms / 100) / 10}s`;
  }

  function scopeProject(projects, projectId) {
    if (!projectId) return null;
    return (projects || []).find(project => project.id === projectId) || null;
  }

  function mergeProjectRegistry(current, incoming) {
    const byId = new Map();
    for (const project of (current || [])) if (project && project.id) byId.set(project.id, project);
    for (const project of (incoming || [])) if (project && project.id) byId.set(project.id, project);
    return Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  function apiBase(root) {
    const configured = root?.STATE_API_BASE || root?.document?.documentElement?.dataset?.apiBase;
    if (configured) return String(configured).replace(/\/$/, '');
    const hostname = String(root?.location?.hostname || '');
    return /(^|[-.])staging([-.]|$)|-git-/i.test(hostname)
      ? 'https://state-api-staging.onrender.com'
      : 'https://state-api-6waw.onrender.com';
  }

  function contentFree(payload) {
    const text = JSON.stringify(payload || {}).toLowerCase();
    const forbidden = ['decision_question','new_statement','old_statement','evidence_content','ask_query','answer_body','prompt_text'];
    return forbidden.every(key => !text.includes(key));
  }

  function qualitySummary(data) {
    const live = data?.live_review_quality || {};
    const evals = data?.controlled_evals || {};
    return {
      resolvedReviews: live.resolved_reviews || 0,
      acceptedAsProposedRate: live.accepted_as_proposed_rate,
      materialEditRate: live.material_edit_rate,
      rejectionRate: live.rejection_or_not_applied_rate,
      latestReview: evals.latest_review_interpretation || null,
      latestAsk: evals.latest_ask_quality || null,
      recent: evals.recent || [],
    };
  }

  function initQualityEnhancement(root) {
    if (!root || !root.document || root.__STATE_QUALITY_ENHANCEMENT__) return;
    root.__STATE_QUALITY_ENHANCEMENT__ = true;
    const doc = root.document;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const percent = value => value == null ? 'Not measured' : `${Math.round(Number(value) * 1000) / 10}%`;
    const metric = (value, label) => `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
    const base = apiBase(root);

    function evalCard(title, run, kind) {
      if (!run) return `<div class="empty">No ${esc(title.toLowerCase())} run has been recorded yet.</div>`;
      if (kind === 'review') {
        return `<div class="eval-callout"><div class="eval-label">${esc(title)}</div><div class="metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px">${metric(percent(run.recall),'Review recall')}${metric(percent(run.precision),'Review precision')}${metric(percent(run.interpretation_accuracy),'Interpretation accuracy')}</div><p class="footnote">High-severity failures: ${esc(run.high_severity_failures || 0)} · Build: ${esc(run.build || 'unknown')} · ${esc(run.provider || 'provider unknown')} ${run.model_identifier ? '· ' + esc(run.model_identifier) : ''}</p></div>`;
      }
      return `<div class="eval-callout"><div class="eval-label">${esc(title)}</div><div class="metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px">${metric(percent(run.ask_grounding),'Grounding')}${metric(percent(run.authority_accuracy),'Authority handling')}${metric(percent(run.uncertainty_accuracy),'Uncertainty handling')}</div><p class="footnote">Open-item accuracy: ${esc(percent(run.open_item_accuracy))} · Overall pass rate: ${esc(percent(run.overall_pass_rate))} · High-severity failures: ${esc(run.high_severity_failures || 0)}</p></div>`;
    }

    function render(data) {
      if (!contentFree(data)) return;
      const panel = doc.getElementById('evalPanel');
      if (!panel) return;
      const prior = doc.getElementById('qualityAnalyticsExtra');
      if (prior) prior.remove();
      const summary = qualitySummary(data);
      const recent = summary.recent.slice(0, 6).map(run => {
        const primary = run.suite === 'review_interpretation' ? percent(run.interpretation_accuracy) : percent(run.ask_grounding);
        return `<div class="row"><span>${esc(run.suite.replaceAll('_',' '))} · ${esc(run.build || 'unknown build')}</span><span>${esc(primary)}</span></div>`;
      }).join('');
      const section = doc.createElement('div');
      section.id = 'qualityAnalyticsExtra';
      section.innerHTML = `<div class="section-title">Live Review outcomes · 30d</div><div class="metrics" style="grid-template-columns:repeat(2,minmax(0,1fr))">${metric(summary.resolvedReviews,'Resolved Reviews')}${metric(percent(summary.acceptedAsProposedRate),'Accepted as proposed')}${metric(percent(summary.materialEditRate),'Accepted with material edits')}${metric(percent(summary.rejectionRate),'Rejected / not applied')}</div><p class="footnote">Material edits measure human correction effort. They do not automatically mean the AI was wrong.</p><div class="section-title">Controlled Review interpretation eval</div>${evalCard('Latest Review interpretation eval', summary.latestReview, 'review')}<div class="section-title">Controlled Ask eval</div>${evalCard('Latest Ask quality eval', summary.latestAsk, 'ask')}<div class="section-title">Recent controlled eval runs</div><div class="rows">${recent || '<div class="empty">No Review/Ask quality eval history recorded yet.</div>'}</div>`;
      panel.appendChild(section);
    }

    async function refresh() {
      try {
        const projectId = new URLSearchParams(root.location.search).get('project') || '';
        const path = '/api/admin/quality-analytics' + (projectId ? `?project_id=${encodeURIComponent(projectId)}` : '');
        const response = await root.fetch(base + path);
        if (!response.ok) return;
        render(await response.json());
      } catch (_) {
        // Quality analytics are supplemental. A failure must not break the main dashboard.
      }
    }

    const originalReplaceState = root.history.replaceState.bind(root.history);
    root.history.replaceState = function (...args) {
      const result = originalReplaceState(...args);
      Promise.resolve().then(refresh);
      return result;
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => setTimeout(refresh, 0), {once:true});
    else setTimeout(refresh, 0);
  }

  return { shouldRetry, withStartupRetry, pct, hoursLabel, latencyLabel, scopeProject, mergeProjectRegistry, apiBase, contentFree, qualitySummary, initQualityEnhancement };
});