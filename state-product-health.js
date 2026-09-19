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

  // A run recorded from a developer machine reports build "local"; say so plainly.
  function buildLabel(build) {
    const value = String(build ?? '').trim();
    if (!value || value === 'unknown') return 'unknown build';
    return value === 'local' ? 'local run' : value;
  }

  // Runs are stored as UTC ("YYYY-MM-DD HH:MM:SS"). Fixed-format output keeps the
  // label identical for every viewer and every locale.
  function runTimeLabel(createdAt) {
    if (!createdAt) return '';
    const text = String(createdAt).trim();
    const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }

  // One recorded run is a single noisy sample; show the spread across the recent
  // runs of the same suite so a lone number does not read as a stable rate.
  function metricRange(runs, suite, key) {
    const values = (runs || [])
      .filter(run => run && run.suite === suite && run[key] != null && !Number.isNaN(Number(run[key])))
      .map(run => Number(run[key]));
    if (values.length < 2) return null;
    return { min: Math.min(...values), max: Math.max(...values), count: values.length };
  }

  // Split so the page can put the time on its own line instead of letting a long
  // label wrap in the middle of the date.
  function recentRunParts(run) {
    const parts = [String(run?.suite || 'unknown suite').replaceAll('_', ' ')];
    if (run?.model_identifier) parts.push(run.model_identifier);
    parts.push(buildLabel(run?.build));
    return { title: parts.join(' · '), when: runTimeLabel(run?.created_at) };
  }

  function recentRunLabel(run) {
    const { title, when } = recentRunParts(run);
    return when ? `${title} · ${when}` : title;
  }

  // The original consequentiality eval panel. Its empty state must describe only
  // that suite: the Review and Ask quality evals have their own sections (#225).
  function consequentialityEvalMarkup(latest, h) {
    const heading = '<div class="section-title">Controlled consequentiality eval</div>';
    if (!latest) {
      return heading + h.empty('No consequentiality eval has been recorded yet. Existing evals can be ingested without storing test-case content.');
    }
    return heading + `<div class="eval-callout"><div class="eval-label">Latest ${h.esc(latest.run_kind || 'controlled eval')}</div><div class="metrics" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px">${h.metric(h.pct(latest.recall), 'Consequential-change recall')}${h.metric(h.pct(latest.precision), 'Review precision')}${h.metric(latest.false_negatives || 0, 'Important misses')}${h.metric(latest.high_severity_failures || 0, 'High-severity failures')}</div><p class="footnote">Suite: ${h.esc(latest.suite)} · Build: ${h.esc(buildLabel(latest.build))} · ${h.esc(latest.provider || 'provider unknown')} ${latest.model_identifier ? '· ' + h.esc(latest.model_identifier) : ''}</p></div>`;
  }

  function initQualityEnhancement(root) {
    if (!root || !root.document || root.__STATE_QUALITY_ENHANCEMENT__) return;
    root.__STATE_QUALITY_ENHANCEMENT__ = true;
    const doc = root.document;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const percent = value => value == null ? 'Not measured' : `${Math.round(Number(value) * 1000) / 10}%`;
    const metric = (value, label) => `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
    const base = apiBase(root);

    function rangeNote(recent, suite, key, label) {
      const range = metricRange(recent, suite, key);
      if (!range) return '';
      return `<p class="footnote">${esc(label)} across the last ${range.count} runs: ${esc(percent(range.min))} to ${esc(percent(range.max))}. A single run is one sample, not a stable rate.</p>`;
    }

    function evalCard(title, run, kind, recent) {
      if (!run) return `<div class="empty">No ${esc(title.toLowerCase())} run has been recorded yet.</div>`;
      if (kind === 'review') {
        return `<div class="eval-callout"><div class="eval-label">${esc(title)}</div><div class="metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px">${metric(percent(run.recall),'Review recall')}${metric(percent(run.precision),'Review precision')}${metric(percent(run.interpretation_accuracy),'Interpretation accuracy')}</div><p class="footnote">High-severity failures: ${esc(run.high_severity_failures || 0)} · Errors: ${esc(run.errors || 0)} · Build: ${esc(buildLabel(run.build))} · ${esc(run.provider || 'provider unknown')} ${run.model_identifier ? '· ' + esc(run.model_identifier) : ''}</p>${rangeNote(recent, 'review_interpretation', 'interpretation_accuracy', 'Interpretation accuracy')}</div>`;
      }
      return `<div class="eval-callout"><div class="eval-label">${esc(title)}</div><div class="metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px">${metric(percent(run.ask_grounding),'Grounding')}${metric(percent(run.authority_accuracy),'Authority handling')}${metric(percent(run.uncertainty_accuracy),'Uncertainty handling')}</div><p class="footnote">Open-item accuracy: ${esc(percent(run.open_item_accuracy))} · Overall pass rate: ${esc(percent(run.overall_pass_rate))} · High-severity failures: ${esc(run.high_severity_failures || 0)} · Errors: ${esc(run.errors || 0)}</p>${rangeNote(recent, 'ask_quality', 'overall_pass_rate', 'Overall pass rate')}</div>`;
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
        const parts = recentRunParts(run);
        return `<div class="row"><span>${esc(parts.title)}${parts.when ? `<br><small style="color:var(--muted);font-weight:400">${esc(parts.when)}</small>` : ''}</span><span>${esc(primary)}</span></div>`;
      }).join('');
      const section = doc.createElement('div');
      section.id = 'qualityAnalyticsExtra';
      section.innerHTML = `<div class="section-title">Live Review outcomes · 30d</div><div class="metrics" style="grid-template-columns:repeat(2,minmax(0,1fr))">${metric(summary.resolvedReviews,'Resolved Reviews')}${metric(percent(summary.acceptedAsProposedRate),'Accepted as proposed')}${metric(percent(summary.materialEditRate),'Accepted with material edits')}${metric(percent(summary.rejectionRate),'Rejected / not applied')}</div><p class="footnote">Material edits measure human correction effort. They do not automatically mean the AI was wrong.</p><div class="section-title">Controlled Review interpretation eval</div>${evalCard('Latest Review interpretation eval', summary.latestReview, 'review', summary.recent)}<div class="section-title">Controlled Ask eval</div>${evalCard('Latest Ask quality eval', summary.latestAsk, 'ask', summary.recent)}<div class="section-title">Recent controlled eval runs</div><div class="rows">${recent || '<div class="empty">No Review/Ask quality eval history recorded yet.</div>'}</div>`;
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

  return { shouldRetry, withStartupRetry, pct, hoursLabel, latencyLabel, scopeProject, mergeProjectRegistry, apiBase, contentFree, qualitySummary, buildLabel, runTimeLabel, metricRange, recentRunLabel, recentRunParts, consequentialityEvalMarkup, initQualityEnhancement };
});