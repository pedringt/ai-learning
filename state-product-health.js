(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.STATE_PRODUCT_HEALTH = api;
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

  function contentFree(payload) {
    const text = JSON.stringify(payload || {}).toLowerCase();
    const forbidden = ['decision_question','new_statement','old_statement','evidence_content','ask_query','answer_body','prompt_text'];
    return forbidden.every(key => !text.includes(key));
  }

  return { shouldRetry, withStartupRetry, pct, hoursLabel, latencyLabel, scopeProject, mergeProjectRegistry, contentFree };
});
