(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.STATE_PRODUCT_HEALTH = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const asItems = value => Array.isArray(value) ? value : (value?.items || []);
  const toDate = value => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const hoursBetween = (start, end) => {
    const a = toDate(start), b = toDate(end);
    if (!a || !b) return null;
    return Math.max(0, (b - a) / 36e5);
  };
  const ageHours = (value, now) => hoursBetween(value, now);
  const withinDays = (value, now, days) => {
    const date = toDate(value);
    if (!date) return false;
    const age = now - date;
    return age >= 0 && age <= days * 864e5;
  };
  const round1 = value => value == null ? null : Math.round(value * 10) / 10;
  const median = values => {
    if (!values.length) return null;
    const ordered = [...values].sort((a,b)=>a-b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  };
  const durationSummary = (items, startKey, endKey) => {
    const values = items.map(item => hoursBetween(item[startKey], item[endKey])).filter(value => value != null);
    return {
      sample_size: values.length,
      median_hours: round1(median(values)),
      average_hours: values.length ? round1(values.reduce((sum,value)=>sum+value,0) / values.length) : null,
    };
  };

  function recordRef(kind, item, now) {
    if (kind === 'review') {
      return {
        kind,
        id: item.id,
        label: item.decision_question || 'Review needs attention',
        created_at: item.created_at || null,
        age_hours: round1(ageHours(item.created_at, now)),
        review_type: item.review_type || null,
      };
    }
    return {
      kind,
      id: item.id,
      label: item.text || 'Open Question',
      created_at: item.created_at || null,
      age_hours: round1(ageHours(item.created_at, now)),
      blocking: !!item.blocking,
      blocks: item.blocks || null,
    };
  }

  function oldestUnresolved(openReviews, openQuestions, now) {
    const items = [
      ...openReviews.map(item => recordRef('review', item, now)),
      ...openQuestions.map(item => recordRef('question', item, now)),
    ].filter(item => toDate(item.created_at));
    if (!items.length) return null;
    return items.sort((a,b)=>toDate(a.created_at)-toDate(b.created_at))[0];
  }

  function derive(payload, nowValue = new Date()) {
    const now = toDate(nowValue) || new Date();
    const evidence = asItems(payload.evidence);
    const openReviews = asItems(payload.open_reviews);
    const resolvedReviews = asItems(payload.resolved_reviews);
    const history = asItems(payload.history);
    const openQuestions = asItems(payload.open_questions || payload.questions);
    const resolvedQuestions = asItems(payload.resolved_questions);
    const stoppedQuestions = asItems(payload.stopped_questions);
    const allReviews = [...openReviews, ...resolvedReviews];
    const allQuestions = [...openQuestions, ...resolvedQuestions, ...stoppedQuestions];

    const reviewsByEvidence = new Map();
    for (const review of allReviews) {
      for (const item of review.evidence_items || []) {
        if (!item?.id) continue;
        if (!reviewsByEvidence.has(item.id)) reviewsByEvidence.set(item.id, []);
        reviewsByEvidence.get(item.id).push(review);
      }
    }

    const stateChangeReviewIds = new Set(history.map(item => item.review_id).filter(Boolean));
    const stateChangeEvidenceIds = new Set();
    for (const transition of history) {
      for (const item of transition.evidence_items || []) if (item?.id) stateChangeEvidenceIds.add(item.id);
    }

    const questionEvidenceIds = new Set(allQuestions.map(item => item.source_evidence_id).filter(Boolean));
    for (const review of allReviews) {
      if ((review.resolves_question_ids || []).length || review.review_type === 'open_question' || ['question_created','question_linked'].includes(review.resolution)) {
        for (const item of review.evidence_items || []) if (item?.id) questionEvidenceIds.add(item.id);
      }
    }

    const pendingEvidenceIds = new Set();
    for (const review of openReviews) for (const item of review.evidence_items || []) if (item?.id) pendingEvidenceIds.add(item.id);

    const noStateChangeReviews = resolvedReviews.filter(review => !stateChangeReviewIds.has(review.id));
    const evidenceWithoutReview = evidence.filter(item => item?.id && !reviewsByEvidence.has(item.id));
    const processingStatuses = {};
    for (const item of evidence) {
      const key = item.processing_status || 'unknown';
      processingStatuses[key] = (processingStatuses[key] || 0) + 1;
    }

    return {
      generated_at: now.toISOString(),
      project: payload.project || null,
      attention: {
        pending_reviews: openReviews.length,
        blocking_questions: openQuestions.filter(item => item.blocking).length,
        other_open_questions: openQuestions.filter(item => !item.blocking).length,
        oldest_unresolved: oldestUnresolved(openReviews, openQuestions, now),
        reviews: openReviews.slice(0, 8).map(item => recordRef('review', item, now)),
        questions: openQuestions.slice(0, 8).map(item => recordRef('question', item, now)),
      },
      changes: {
        state_changes_7d: history.filter(item => withinDays(item.changed_at, now, 7)).length,
        state_changes_30d: history.filter(item => withinDays(item.changed_at, now, 30)).length,
        resolved_reviews_7d: resolvedReviews.filter(item => withinDays(item.resolved_at, now, 7)).length,
        resolved_reviews_30d: resolvedReviews.filter(item => withinDays(item.resolved_at, now, 30)).length,
        resolved_questions_7d: resolvedQuestions.filter(item => withinDays(item.resolved_at, now, 7)).length,
        resolved_questions_30d: resolvedQuestions.filter(item => withinDays(item.resolved_at, now, 30)).length,
        recent_transitions: history.slice(0, 8).map(item => ({
          id: item.id,
          state_item_id: item.state_item_id,
          review_id: item.review_id,
          transition_type: item.transition_type,
          changed_at: item.changed_at,
          old_statement: item.old_statement || null,
          new_statement: item.new_statement || null,
          accepted_as_adjusted: !!item.accepted_as_adjusted,
        })),
      },
      evidence_outcomes: {
        total_evidence: evidence.length,
        evidence_with_state_change: stateChangeEvidenceIds.size,
        evidence_with_question_outcome: [...questionEvidenceIds].filter(id => evidence.some(item => item.id === id)).length,
        no_state_change_reviews: noStateChangeReviews.length,
        evidence_with_pending_review: pendingEvidenceIds.size,
        evidence_without_review: evidenceWithoutReview.length,
        processing_statuses: processingStatuses,
        non_exclusive: true,
      },
      lifecycle: {
        review_resolution: durationSummary(resolvedReviews, 'created_at', 'resolved_at'),
        question_resolution: durationSummary([...resolvedQuestions, ...stoppedQuestions], 'created_at', 'resolved_at'),
        oldest_pending_review_hours: openReviews.length ? round1(Math.max(...openReviews.map(item => ageHours(item.created_at, now) || 0))) : null,
        oldest_open_question_hours: openQuestions.length ? round1(Math.max(...openQuestions.map(item => ageHours(item.created_at, now) || 0))) : null,
      },
      notes: {
        actual_state_changes_come_from_history: true,
        accepted_evidence_is_not_a_state_change: true,
        evidence_outcomes_are_non_exclusive: true,
      },
    };
  }

  return { derive, durationSummary, hoursBetween };
});
