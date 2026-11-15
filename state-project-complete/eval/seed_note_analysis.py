"""#673: run Northstar's seeded Ask notes through real intake once, so the seed can record what the model decided.

The five ASK_EVIDENCE notes in seed_demo.py are inserted as already 'processed', so Notes shows "No review needed"
for a judgment nobody made. Paige (Nov 15): analyze them once and seed the recorded outcomes, so a reset restores
them without a model call. This runs each note, oldest first, against a freshly seeded Northstar (its Current
State, open Questions, open Reviews and project rules), the way it would arrive in production.
"""
from __future__ import annotations

from typing import Any

from eval.quality_harness import _close, _new_test_connection, _observed_review_outcome
from interpretation_trace import TracePolicy, run_traced_interpretation
from seed_demo import ASK_EVIDENCE, bootstrap_demo_data


def _rows(connection, sql: str, params: tuple) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(sql, params).fetchall()]


def analyze_seed_notes(provider) -> list[dict[str, Any]]:
    connection = _new_test_connection()
    try:
        bootstrap_demo_data(connection)
        results = []
        for evidence_id, content, source_type, submitted_at in sorted(ASK_EVIDENCE, key=lambda row: row[3]):
            connection.execute("UPDATE evidence SET processing_status='pending' WHERE id=?", (evidence_id,))
            connection.commit()
            traced = run_traced_interpretation(connection, evidence_id=evidence_id, provider=provider,
                                               policy=TracePolicy.eval_debug())
            review_ids = list(traced.process_result.review_ids)
            action, _ = _observed_review_outcome(connection, review_ids)
            marks = ",".join("?" for _ in review_ids) or "''"
            results.append({
                "evidence_id": evidence_id, "source_type": source_type, "submitted_at": submitted_at, "content": content,
                "processing_status": traced.process_result.processing_status, "action": action,
                "reviews": _rows(connection, f"SELECT id, review_type, decision_question, why_consequential "
                                             f"FROM review_issues WHERE id IN ({marks})", tuple(review_ids)),
                "proposed_changes": _rows(connection, f"SELECT review_id, operation, state_item_id, proposed_statement, rationale "
                                                      f"FROM proposed_state_changes WHERE review_id IN ({marks})", tuple(review_ids)),
                "proposed_questions": _rows(connection, f"SELECT review_id, text FROM proposed_questions "
                                                        f"WHERE review_id IN ({marks})", tuple(review_ids)),
                "linked_questions": _rows(connection, f"SELECT review_id, question_id FROM review_questions "
                                                      f"WHERE review_id IN ({marks})", tuple(review_ids)),
            })
        return results
    finally:
        _close(connection)
