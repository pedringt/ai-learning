"""#662 (Paige, Nov 14): statements Ask's checks leave out are kept 90 days for review, with their reason and kind.
The database tests run on SQLite everywhere and on Postgres when STATE_TEST_POSTGRES_URL is set (CI runs postgres:16)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ask_service import UNIT_DECISIONS, run_ask
from ask_withheld_log import RETENTION_DAYS, TEXT_LIMIT, record_withheld, withheld_kind
from test_ask_claims import _FakeAsk, _answer, _claim, _seeded
from test_project_isolation import db  # noqa: F401  (pytest fixture: sqlite and postgres)

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def _rows(connection):
    return connection.execute(
        "SELECT unit, kind, reason, basis, record_id, statement_text, question_text, project_id, build "
        "FROM ask_withheld_units ORDER BY statement_text").fetchall()


def test_each_check_reason_maps_to_a_kind():
    assert withheld_kind("reference check failed") == "reference"
    assert withheld_kind("card's record isn't among the answer's records") == "reference"
    assert withheld_kind("anchor check failed") == "figure"
    assert withheld_kind("figure '$9' is not in the records or the request, and not derived") == "figure"
    assert withheld_kind("status ('approved') not carried by a pending review basis") == "settled"
    assert withheld_kind("detail line: permission ('can proceed') with no Current State record that grants one") == "permission"
    assert withheld_kind("restates the draft's assumption as fact") == "draft"
    assert withheld_kind("freshness verdict ('stale') without confirmation data") == "freshness"
    assert withheld_kind("says no record covers what k-vip covers") == "absence"
    assert withheld_kind("empty") == withheld_kind(None) == "other"


def test_run_ask_keeps_each_withheld_statement_with_its_reason_and_the_question(tmp_path):
    conn = _seeded(tmp_path)
    try:
        answer = run_ask(conn, _FakeAsk(_answer([
            _claim("The pilot stays read-only.", "current_state", "k-data"),
            _claim("The pilot is approved at $95,000.", "current_state", "k-data"),
            _claim("Retention is resolved.", "none"),
        ])), "Is the pilot read-only?")["answer"]
        assert answer["withheld_kinds"] == {"figure": 1, "settled": 1}
        rows = _rows(conn)
        assert [(r[0], r[1], r[5], r[6]) for r in rows] == [
            ("claim", "settled", "Retention is resolved.", "Is the pilot read-only?"),
            ("claim", "figure", "The pilot is approved at $95,000.", "Is the pilot read-only?"),
        ]
        assert rows[1][2] == "anchor check failed" and rows[1][3] == "current_state" and rows[1][4] == "k-data"
        assert all(r[7] and r[8] for r in rows)        # project and build are recorded
    finally:
        conn.close()


def test_nothing_is_recorded_when_nothing_was_withheld(tmp_path):
    conn = _seeded(tmp_path)
    try:
        run_ask(conn, _FakeAsk(_answer([_claim("The pilot stays read-only.", "current_state", "k-data")])),
                "Is the pilot read-only?")
        assert _rows(conn) == []
    finally:
        conn.close()


def test_an_eval_collecting_decisions_keeps_its_list_and_the_kinds_still_count(tmp_path):
    conn = _seeded(tmp_path)
    log: list = []
    token = UNIT_DECISIONS.set(log)
    try:
        answer = run_ask(conn, _FakeAsk(_answer([_claim("Retention is resolved.", "none")])), "Is retention resolved?")
    finally:
        UNIT_DECISIONS.reset(token)
        conn.close()
    assert [d["decision"] for d in log] == ["withheld"]
    assert answer["answer"]["withheld_kinds"] == {"settled": 1}


def test_text_is_cut_to_the_limit_and_rows_past_retention_are_pruned(db):  # noqa: F811
    old = NOW - timedelta(days=RETENTION_DAYS + 1)
    record_withheld(db, "old question", [{"unit": "claim", "raw_text": "old", "reason": "anchor check failed"}], now=old)
    record_withheld(db, "q" * 500, [{"unit": "card", "raw_text": "x" * 500, "reason": "status ('approved') not carried",
                                      "basis": "none"}], now=NOW)
    rows = _rows(db)
    assert len(rows) == 1
    assert rows[0][0] == "card" and rows[0][1] == "settled"
    assert len(rows[0][5]) == TEXT_LIMIT and len(rows[0][6]) == TEXT_LIMIT


def test_a_failed_write_never_fails_ask_and_leaves_the_connection_usable(db):  # noqa: F811
    db.execute("DROP TABLE ask_withheld_units")
    db.commit()
    record_withheld(db, "q", [{"unit": "claim", "raw_text": "x", "reason": "anchor check failed"}], now=NOW)
    assert db.execute("SELECT COUNT(*) FROM projects").fetchone()[0] >= 0    # Postgres would raise if left aborted
