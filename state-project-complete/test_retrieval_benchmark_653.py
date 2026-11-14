"""#653: the Ask retrieval benchmark runs deterministically, with no model calls, on SQLite and Postgres.

The benchmark measures; these tests only hold its invariants (fixture larger than every window, case coverage,
isolation, authority, controls). Recall numbers are reported, not asserted. Library: eval/retrieval_benchmark.py.
"""
from __future__ import annotations

import json

from ask_service import _compact_candidates
from eval import retrieval_benchmark as rb
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def test_retrieval_benchmark_invariants(db, tmp_path):
    rb.build_fixture(db)
    result = rb.run(db)

    counts = result["record_counts"]
    assert counts["history"] > 18 and counts["evidence"] > 24 and counts["answered_questions"] > 30, counts
    for family in ("windows", "paraphrase", "links", "answered"):
        assert result["cases_per_family"][family] >= 5, family
    assert all(result["cases_per_family"][f] >= 1 for f in ("no_answer", "same_word", "superseded", "authority", "flood"))

    for variant, summary in result["summary"].items():
        assert summary["isolation_violations"] == 0, variant         # R-003: the twin project never leaks in
        assert summary["authority_preserved_share"] == 1.0, variant  # nothing pending/answered becomes Current State

    a0 = {r["case"]: r for r in result["rows"] if r["variant"] == "A0"}
    for case in rb.CASES:
        if case.expected_hit_today:
            assert a0[case.id]["recall"]["trim"] == 1.0, case.id     # the benchmark can see a retrieval that works

    # A0 is today's code: its first stage is exactly _compact_candidates.
    db.project_id = rb.PROJECT
    assert rb.pool(db) == _compact_candidates(db)

    (tmp_path / "retrieval_benchmark.json").write_text(json.dumps(result, default=str))
    print("\n" + rb.format_table(result))
