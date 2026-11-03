"""A Review with no recorded source Evidence cannot change Current State (Nov 2, Paige).

Accept and Adjust are refused when they would create, change or retire a fact; the
Review stays readable and "Leave unchanged" still works. Question Reviews and
"Keep tracking" on an at-risk Review keep their existing behavior.
"""
import sqlite3

import pytest

from database_migration_backed import initialize_db
from review_service import MISSING_SOURCE_MESSAGE, ReviewConflictError, list_reviews, resolve_review


def _db(*, link_evidence=True, operation="update"):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_db(conn)
    conn.execute("INSERT INTO current_state_items(id,topic,statement,version) VALUES('s1','launch','Launch needs thresholds.',1)")
    conn.execute("INSERT INTO review_issues(id,review_type,decision_question,why_consequential,status) VALUES('r1','proposed_update','Require a threshold?','Launch gate','open')")
    conn.execute("INSERT INTO review_state_items(review_id,state_item_id) VALUES('r1','s1')")
    conn.execute("INSERT INTO evidence(id,content,source_type) VALUES('e1','Security asked for a launch threshold.','manual_note')")
    if link_evidence:
        conn.execute("INSERT INTO review_evidence(review_id,evidence_id) VALUES('r1','e1')")
    statement = "Launch needs a severe-failure threshold."
    conn.execute(
        "INSERT INTO proposed_state_changes(id,review_id,operation,state_item_id,expected_state_version,proposed_statement,rationale,status) "
        "VALUES('p1','r1',?,'s1',1,?,'From the note','pending')",
        (operation, statement),
    )
    conn.commit()
    return conn


def _state(conn):
    return dict(conn.execute("SELECT statement,version FROM current_state_items WHERE id='s1'").fetchone())


def test_accept_with_linked_evidence_still_updates_current_state():
    conn = _db()
    resolve_review(conn, "r1", "accept")
    assert _state(conn) == {"statement": "Launch needs a severe-failure threshold.", "version": 2}


@pytest.mark.parametrize("operation", ["update", "retire"])
def test_accept_without_linked_evidence_is_refused_and_changes_nothing(operation):
    conn = _db(link_evidence=False, operation=operation)
    before = _state(conn)
    with pytest.raises(ReviewConflictError) as exc:
        resolve_review(conn, "r1", "accept")
    assert str(exc.value) == MISSING_SOURCE_MESSAGE
    assert _state(conn) == before
    assert conn.execute("SELECT status FROM review_issues WHERE id='r1'").fetchone()["status"] == "open"
    assert conn.execute("SELECT status FROM proposed_state_changes WHERE id='p1'").fetchone()["status"] == "pending"


def test_adjust_without_linked_evidence_is_refused():
    conn = _db(link_evidence=False)
    with pytest.raises(ReviewConflictError):
        resolve_review(conn, "r1", "accept", adjustments={"p1": "Launch needs a threshold the team agrees."})
    assert _state(conn)["version"] == 1


def test_leave_unchanged_still_works_without_evidence():
    conn = _db(link_evidence=False)
    resolve_review(conn, "r1", "reject")
    assert _state(conn)["version"] == 1
    assert conn.execute("SELECT status FROM review_issues WHERE id='r1'").fetchone()["status"] == "resolved"


def test_review_without_evidence_stays_readable():
    conn = _db(link_evidence=False)
    reviews = list_reviews(conn, "open")
    assert [r["id"] for r in reviews] == ["r1"]
    assert reviews[0]["evidence_items"] == []


def test_api_refuses_accept_and_adjust_without_evidence_but_allows_leave_unchanged(tmp_path):
    """Direct API calls are enforced too, not only the disabled buttons."""
    from fastapi.testclient import TestClient

    from api import Settings, create_app
    from test_api import LaunchDateProvider

    db_path = str(tmp_path / "state.db")
    app = create_app(Settings(database_path=db_path, provider="anthropic", cors_origins=["http://localhost:8000"]), provider=LaunchDateProvider())
    with TestClient(app) as client:
        with sqlite3.connect(db_path) as conn:
            conn.execute("INSERT INTO current_state_items(id, topic, statement, version) VALUES ('state_launch','launch','Launch is October 1.',1)")
            conn.commit()
        created = client.post("/api/evidence", json={"content": "Launch moved to October 15."})
        assert created.status_code == 201
        review = created.json()["reviews"][0]
        with sqlite3.connect(db_path) as conn:  # damage the record: drop its Evidence link
            conn.execute("DELETE FROM review_evidence WHERE review_id=?", (review["id"],))
            conn.commit()

        accept = client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "accept"})
        assert accept.status_code == 409 and accept.json()["detail"] == MISSING_SOURCE_MESSAGE
        proposal_id = client.get("/api/reviews?status=open").json()["items"][0]["proposals"][0]["id"]
        adjust = client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "accept", "adjustments": [{"proposal_id": proposal_id, "adjusted_statement": "Launch is October 16."}]})
        assert adjust.status_code == 409
        assert client.get("/api/state").json()["items"][0]["statement"] == "Launch is October 1."

        leave = client.post(f"/api/reviews/{review['id']}/resolve", json={"decision": "keep"})
        assert leave.status_code == 200
        assert client.get("/api/state").json()["items"][0]["version"] == 1
