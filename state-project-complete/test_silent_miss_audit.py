import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


class Conn:
    def __init__(self):
        self.raw = sqlite3.connect(":memory:")
        self.raw.row_factory = sqlite3.Row
        self.project_id = "p1"

    def execute(self, query, params=()):
        return Cursor(self.raw.execute(query, params))

    def close(self):
        self.raw.close()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row else None


from eval.silent_miss_audit import (  # noqa: E402
    create_audit_bundle,
    list_no_review_candidates,
    mark_audit_item,
    regression_candidates,
    select_sample,
    summarize_audit,
)


def seed(connection):
    connection.raw.executescript(
        """
        CREATE TABLE evidence(id TEXT PRIMARY KEY,content TEXT,source_type TEXT,processing_status TEXT,submitted_at TEXT,project_id TEXT);
        CREATE TABLE interpretation_records(id TEXT PRIMARY KEY,evidence_id TEXT,provider TEXT,model_identifier TEXT,processing_status TEXT,structured_result TEXT,created_at TEXT);
        CREATE TABLE review_evidence(review_id TEXT,evidence_id TEXT);
        CREATE TABLE current_state_items(id TEXT,topic TEXT,statement TEXT,version INTEGER,effective_date TEXT,status TEXT,project_id TEXT);
        CREATE TABLE questions(id TEXT,text TEXT,status TEXT,created_at TEXT,project_id TEXT);
        CREATE TABLE review_issues(id TEXT,review_type TEXT,decision_question TEXT,why_consequential TEXT,status TEXT,created_at TEXT,project_id TEXT);
        """
    )
    connection.raw.executemany(
        "INSERT INTO evidence VALUES (?,?,?,?,?,?)",
        [
            ("e1", "Launch is Oct 12", "manual_note", "processed", "2026-09-01", "p1"),
            ("e2", "Support owner may be Priya", "slack", "processed", "2026-09-02", "p1"),
            ("e3", "Unrelated other project", "manual_note", "processed", "2026-09-03", "p2"),
            ("e4", "Creates a review", "upload", "processed", "2026-09-04", "p1"),
        ],
    )
    connection.raw.executemany(
        "INSERT INTO interpretation_records VALUES (?,?,?,?,?,?,?)",
        [
            ("i1", "e1", "anthropic", "m", "succeeded", json.dumps({"outcome": "no_review", "summary": "already known"}), "2026-09-01"),
            ("i2", "e2", "anthropic", "m", "succeeded", json.dumps({"outcome": "no_review", "no_review_explanation": "not consequential"}), "2026-09-02"),
            ("i3", "e3", "anthropic", "m", "succeeded", json.dumps({"outcome": "no_review"}), "2026-09-03"),
            ("i4", "e4", "anthropic", "m", "succeeded", json.dumps({"outcome": "review_recommended"}), "2026-09-04"),
        ],
    )
    connection.raw.execute("INSERT INTO review_evidence VALUES ('r4','e4')")
    connection.raw.execute("INSERT INTO current_state_items VALUES ('s1','Launch','Launch is Oct 12',1,NULL,'active','p1')")
    connection.raw.execute("INSERT INTO questions VALUES ('q1','Who owns support?','open','2026-09-01','p1')")
    connection.raw.execute("INSERT INTO review_issues VALUES ('r1','proposed_update','Approve launch date?','Date changed','open','2026-09-01','p1')")
    connection.raw.commit()


def test_candidates_are_project_scoped_and_no_review_only():
    connection = Conn()
    seed(connection)
    rows = list_no_review_candidates(connection)
    assert [row["evidence_id"] for row in rows] == ["e2", "e1"]
    assert rows[0]["no_review_explanation"] == "not consequential"


def test_sample_is_bounded_and_reproducible():
    items = [{"evidence_id": f"e{i}", "source_type": "slack" if i % 2 else "manual"} for i in range(10)]
    first = select_sample(items, sample_size=4, seed="same")
    second = select_sample(items, sample_size=4, seed="same")
    assert first == second and len(first) == 4
    assert {item["source_type"] for item in first} == {"slack", "manual"}


def test_bundle_snapshots_context_without_mutation():
    connection = Conn()
    seed(connection)
    bundle = create_audit_bundle(connection, sample_size=2, seed=1)
    assert len(bundle["items"]) == 2
    for item in bundle["items"]:
        assert item["context_snapshot"]["current_state"][0]["id"] == "s1"
        assert item["context_snapshot"]["open_questions"][0]["id"] == "q1"
        assert item["audit"]["outcome"] is None
    assert connection.raw.execute("SELECT COUNT(*) FROM current_state_items").fetchone()[0] == 1
    assert connection.raw.execute("SELECT COUNT(*) FROM review_issues").fetchone()[0] == 1


def test_human_marks_drive_summary_and_regression_export():
    connection = Conn()
    seed(connection)
    bundle = create_audit_bundle(connection, sample_size=2, seed=1)
    first = bundle["items"][0]["evidence_id"]
    second = bundle["items"][1]["evidence_id"]
    bundle = mark_audit_item(bundle, first, outcome="missed", severity="high", failure_type="consequentiality", note="Should have surfaced.")
    bundle = mark_audit_item(bundle, second, outcome="correct")
    summary = summarize_audit(bundle)
    assert summary["sample_size"] == 2
    assert summary["confirmed_silent_misses"] == 1
    assert summary["miss_rate_among_decided"] == 0.5
    assert summary["severity_distribution"] == {"high": 1}
    assert summary["recurring_failure_patterns"] == {"consequentiality": 1}
    exported = regression_candidates(bundle)
    assert len(exported) == 1
    assert exported[0]["severity"] == "high"
    assert "without directly mutating Current State" in exported[0]["expected_behavior"]


def test_missed_requires_severity():
    connection = Conn()
    seed(connection)
    bundle = create_audit_bundle(connection, sample_size=1)
    try:
        mark_audit_item(bundle, bundle["items"][0]["evidence_id"], outcome="missed")
    except ValueError as exc:
        assert "severity is required" in str(exc)
    else:
        raise AssertionError("expected ValueError")
