(() => {
  const API = window.STATE_API;
  const root = document.getElementById('viewRoot');
  if (!API || !root) return;

  let provenancePromise = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function loadProvenance() {
    if (!provenancePromise) {
      provenancePromise = Promise.all([
        API.getHistory(),
        API.getReviews('resolved'),
        API.getReviews('open'),
      ]).then(([history, resolvedReviews, openReviews]) => ({
        history: Array.isArray(history) ? history : [],
        resolvedReviews: Array.isArray(resolvedReviews) ? resolvedReviews : [],
        openReviews: Array.isArray(openReviews) ? openReviews : [],
      })).catch(error => {
        provenancePromise = null;
        throw error;
      });
    }
    return provenancePromise;
  }

  function affectedStateIds(review) {
    const linked = (review?.affected_state_items || []).map(item => item?.id).filter(Boolean);
    const proposed = (review?.proposals || []).map(item => item?.state_item_id).filter(Boolean);
    return new Set([...linked, ...proposed]);
  }

  function supportingResolvedReview(review) {
    return review?.status === 'resolved' && ['updated', 'confirmed_current'].includes(review?.resolution);
  }

  function buildTrace(stateId, data) {
    const history = data.history
      .filter(item => item?.state_item_id === stateId)
      .sort((a, b) => String(b?.changed_at || '').localeCompare(String(a?.changed_at || '')));

    const resolvedReviews = data.resolvedReviews.filter(review =>
      supportingResolvedReview(review) && affectedStateIds(review).has(stateId)
    );

    const openReviews = data.openReviews.filter(review => affectedStateIds(review).has(stateId));

    const reviewById = new Map(resolvedReviews.map(review => [review.id, review]));
    for (const transition of history) {
      if (transition?.review_id && !reviewById.has(transition.review_id)) {
        reviewById.set(transition.review_id, {
          id: transition.review_id,
          status: 'resolved',
          resolution: transition.resolution,
          decision_question: transition.decision_question,
          evidence_items: transition.evidence_items || [],
        });
      }
    }

    const acceptedReviews = [...reviewById.values()];
    const evidence = [];
    const seenEvidence = new Set();
    for (const review of acceptedReviews) {
      for (const item of review?.evidence_items || []) {
        if (!item?.id || seenEvidence.has(item.id)) continue;
        seenEvidence.add(item.id);
        evidence.push(item);
      }
    }

    return {history, acceptedReviews, evidence, openReviews};
  }

  function sourceLabel(sourceType) {
    return String(sourceType || 'Evidence').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function traceMarkup(trace) {
    const accepted = trace.acceptedReviews.length;
    const transitions = trace.history.length;
    const evidence = trace.evidence.length;
    const pending = trace.openReviews.length;

    const summary = accepted || transitions || evidence
      ? `This Current State fact is backed by ${accepted || transitions} accepted ${accepted === 1 ? 'review' : 'reviews'}${evidence ? ` and ${evidence} linked Evidence ${evidence === 1 ? 'item' : 'items'}` : ''}.`
      : 'This is maintained as Current State, but no accepted Review/Evidence provenance is available for this fact in the current demo record.';

    const reviewItems = trace.acceptedReviews.map(review => {
      const decision = review?.decision_question || 'Accepted review';
      const resolution = review?.resolution === 'confirmed_current' ? 'Confirmed current' : 'Updated Current State';
      return `<li><strong>${esc(resolution)}</strong><span>${esc(decision)}</span></li>`;
    }).join('');

    const evidenceItems = trace.evidence.map(item =>
      `<li><strong>${esc(sourceLabel(item?.source_type))}</strong><span>${esc(item?.content || '')}</span></li>`
    ).join('');

    const historyItems = trace.history.slice(0, 3).map(item => {
      const changed = item?.changed_at ? ` · ${esc(String(item.changed_at).slice(0, 10))}` : '';
      const before = item?.old_statement ? `<span class="provenance-before">Previously: ${esc(item.old_statement)}</span>` : '';
      return `<li><strong>${esc(item?.transition_type || 'Accepted change')}${changed}</strong><span>${esc(item?.new_statement || '')}</span>${before}</li>`;
    }).join('');

    const pendingItems = trace.openReviews.map(review =>
      `<li><strong>Pending review</strong><span>${esc(review?.decision_question || review?.why_consequential || 'Open review')}</span></li>`
    ).join('');

    return `<div class="project-provenance-detail" role="region">
      <p class="project-provenance-summary">${esc(summary)}</p>
      ${reviewItems ? `<div class="project-provenance-group"><h5>Human decisions</h5><ul>${reviewItems}</ul></div>` : ''}
      ${evidenceItems ? `<div class="project-provenance-group"><h5>Evidence used</h5><ul>${evidenceItems}</ul></div>` : ''}
      ${historyItems ? `<div class="project-provenance-group"><h5>Accepted history</h5><ul>${historyItems}</ul></div>` : ''}
      ${pendingItems ? `<div class="project-provenance-group provenance-pending"><h5>Still pending</h5><ul>${pendingItems}</ul><p>Pending reviews can qualify this fact, but they do not replace Current State until a human accepts them.</p></div>` : ''}
    </div>`;
  }

  function ensureButtons() {
    root.querySelectorAll('.project-maintained-fact[data-state-id]').forEach(row => {
      if (row.querySelector('[data-provenance-toggle]')) return;
      const actions = row.querySelector('.project-outline-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button project-provenance-link';
      button.dataset.provenanceToggle = 'true';
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Why is this true?';
      actions.prepend(button);
    });
  }

  async function toggleTrace(button) {
    const row = button.closest('.project-maintained-fact[data-state-id]');
    if (!row) return;
    const existing = row.querySelector('.project-provenance-detail');
    if (existing) {
      existing.remove();
      button.setAttribute('aria-expanded', 'false');
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Checking…';
    try {
      const data = await loadProvenance();
      const trace = buildTrace(row.dataset.stateId, data);
      row.insertAdjacentHTML('beforeend', traceMarkup(trace));
      button.setAttribute('aria-expanded', 'true');
    } catch (error) {
      row.insertAdjacentHTML('beforeend', `<div class="project-provenance-detail provenance-error" role="status">Provenance is temporarily unavailable. Current State itself is unchanged.</div>`);
      button.setAttribute('aria-expanded', 'true');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-provenance-toggle]');
    if (!button) return;
    event.preventDefault();
    toggleTrace(button);
  });

  const style = document.createElement('style');
  style.textContent = `
    .project-provenance-link{white-space:nowrap}
    .project-provenance-detail{grid-column:1/-1;margin:10px 0 2px;padding:12px 14px;border:1px solid var(--border, #d9dde3);border-radius:10px;background:var(--surface-soft, rgba(127,127,127,.055));font-size:13px;line-height:1.45}
    .project-provenance-summary{margin:0 0 10px;font-weight:600}
    .project-provenance-group+ .project-provenance-group{margin-top:12px}
    .project-provenance-group h5{margin:0 0 5px;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
    .project-provenance-group ul{margin:0;padding-left:18px}
    .project-provenance-group li{margin:5px 0}
    .project-provenance-group li strong{display:block;font-size:12px}
    .project-provenance-group li span{display:block}
    .project-provenance-group .provenance-before{margin-top:2px;opacity:.72;font-size:12px}
    .provenance-pending{padding-top:10px;border-top:1px solid var(--border, #d9dde3)}
    .provenance-pending>p{margin:6px 0 0;opacity:.8}
    .provenance-error{font-weight:600}
    @media(max-width:760px){.project-provenance-link{white-space:normal}.project-provenance-detail{padding:11px 12px}}
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(ensureButtons);
  observer.observe(root, {childList:true, subtree:true});
  ensureButtons();

  window.STATE_PROVENANCE = Object.freeze({buildTrace, traceMarkup, affectedStateIds, supportingResolvedReview});
})();
