import sqlite3
from pathlib import Path

from database_migration_backed import initialize_db
from interpretation_pipeline_integrated import process_evidence
from review_service import list_reviews, resolve_review


class ExistingReviewProvider:
    name = "existing-review-test"
    model_identifier = "deterministic"

    def interpret(self, *, context, evidence, connection=None):
        return {
            "summary": "New evidence refines the same pending change.",
            "topics": ["timing"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "update_existing",
                "existing_review_id": "r1",
                "review_type": "proposed_update",
                "decision_question": "Which launch date should State use?",
                "why_consequential": "The pending date changed again.",
                "affected_state_item_ids": [],  # normalizer adds target
                "proposed_changes": [{
                    "operation": "update",
                    "state_item_id": "s1",
                    # intentionally wrong/missing version behavior is normalized
                    "proposed_statement": "Launch is September 20.",
                    "rationale": "Newest evidence gives September 20.",
                }],
            }],
        }


def _db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_db(conn)
    conn.execute("INSERT INTO current_state_items(id,topic,statement,version) VALUES('s1','timing','Launch is September 15.',1)")
    conn.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES('r1','proposed_update','Which launch date?','Timing matters','open')")
    conn.execute("INSERT INTO review_state_items(review_id,state_item_id) VALUES('r1','s1')")
    conn.execute("INSERT INTO evidence(id,content,source_type) VALUES('e0','Earlier date','manual_note')")
    conn.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES('r1','e0')")
    conn.execute("INSERT INTO proposed_state_changes(id,review_id,operation,state_item_id,expected_state_version,proposed_statement,rationale,status) VALUES('p0','r1','update','s1',1,'Launch is September 18.','Earlier evidence','pending')")
    conn.execute("INSERT INTO evidence(id,content,source_type) VALUES('e1','Actually September 20','manual_note')")
    conn.commit()
    return conn


def test_update_existing_supersedes_older_pending_same_target_and_accepts():
    conn = _db()
    result = process_evidence(conn, evidence_id='e1', provider=ExistingReviewProvider())
    assert result.processing_status == 'succeeded'
    rows = conn.execute("SELECT id,status,supersedes_proposal_id,expected_state_version FROM proposed_state_changes WHERE review_id='r1' ORDER BY created_at,id").fetchall()
    assert len(rows) == 2
    old = next(r for r in rows if r['id'] == 'p0')
    new = next(r for r in rows if r['id'] != 'p0')
    assert old['status'] == 'superseded'
    assert new['status'] == 'pending'
    assert new['supersedes_proposal_id'] == 'p0'
    assert new['expected_state_version'] == 1
    resolve_review(conn, 'r1', 'accept')
    state = conn.execute("SELECT statement,version FROM current_state_items WHERE id='s1'").fetchone()
    assert state['statement'] == 'Launch is September 20.'
    assert state['version'] == 2
    conn.close()


def test_list_reviews_does_not_duplicate_review_with_multiple_evidence():
    conn = _db()
    conn.execute("INSERT INTO evidence(id,content,source_type) VALUES('e2','Another note','manual_note')")
    conn.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES('r1','e2')")
    conn.commit()
    reviews = list_reviews(conn, 'open')
    assert len(reviews) == 1
    assert reviews[0]['id'] == 'r1'
    assert {e['id'] for e in reviews[0]['evidence_items']} == {'e0','e2'}
    conn.close()
