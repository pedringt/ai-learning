"""DEC-023 item 6: the Copy Context task-filter measurement runs with no model calls. It reports; it asserts only
that the baseline copies everything and each filter keeps a subset."""
from __future__ import annotations

from eval import copy_context_benchmark as ccb
from eval import retrieval_benchmark as rb
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def test_copy_context_filter_measurement(db):
    rb.build_fixture(db)
    result = ccb.run(db)
    assert len(ccb.CASES) == 12
    assert result["variants"]["everything (today)"]["recall"] == 1.0
    for name, v in result["variants"].items():
        assert v["share_of_full"] <= 1.0, name
        assert all(r["items"] <= result["full_items"] for r in v["rows"]), name
