"""DEC-023 (Paige, Nov 14): Ask retrieves from the whole project with doubled limits and adds linked records. No model
calls. Fixture: the #653 retrieval benchmark (eval/retrieval_benchmark.py)."""
from __future__ import annotations

from datetime import date

import pytest

from ask_service import _LINK_EXPANSION_CAP, _compact_candidates, _expand_links, _trim_candidates_for_query, ask_cache_key
from eval import retrieval_benchmark as rb
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def _ids(candidates):
    return {r["id"] for records in candidates.values() for r in records}


@pytest.fixture
def bench(db):
    rb.build_fixture(db)
    db.project_id = rb.PROJECT
    return db


def test_old_records_reach_ask_and_an_old_dated_record_changes_the_cache_key(bench):
    full = _compact_candidates(bench)
    assert {"e-retention-terms", "e-saml-cert", "h-launch", "h-pricing"} <= _ids(full)   # older than the old windows
    assert not any(i.startswith("twin-") for i in _ids(full))
    query, today = "What are Corvo's deletion terms for transcripts?", date(2026, 11, 14)
    before = ask_cache_key(bench, query, today=today)
    # Evidence is immutable, but a note can arrive with an old date (an imported document). Under the old windows it
    # landed outside them and the cached answer stayed.
    bench.execute("INSERT INTO evidence(id, content, source_type, processing_status, submitted_at, project_id) "
                  "VALUES ('e-dec023', 'Corvo deletes transcripts after 45 days.', 'manual_note', 'processed', "
                  "'2025-06-01 00:00:00', ?)", (rb.PROJECT,))
    bench.commit()
    assert ask_cache_key(bench, query, today=today) != before


@pytest.mark.parametrize("query,needed", [
    ("What was approved?", {"e-approved", "r-contract-sign"}),                # Evidence -> the Review citing it
    ("Why did hosting move to another region?", {"h-hosting", "s-residency"}),  # History -> its State item
    ("What uptime commitment did we agree?", {"e-sla-new", "e-sla-old"}),    # superseding <-> superseded Evidence
    ("Who runs the onboarding sessions for agents?", {"qa-trainer", "e-trainer-old", "e-trainer-new"}),  # answer + its successor
])
def test_linked_records_come_with_the_selected_ones(bench, query, needed):
    assert needed <= _ids(_trim_candidates_for_query(query, _compact_candidates(bench)))


def test_link_expansion_is_capped_and_adds_only_project_records(bench):
    full = _compact_candidates(bench)
    selected = {bucket: [] for bucket in full}
    selected["reviews"] = list(full["reviews"])          # every Review: far more links than the cap
    selected["evidence"] = list(full["evidence"])[:30]
    expanded = _expand_links(selected, full)
    added = _ids(expanded) - _ids(selected)
    assert 0 < len(added) <= _LINK_EXPANSION_CAP
    assert added <= _ids(full)
    for bucket, records in expanded.items():             # each added record lands in its own type, unchanged
        assert all(r in full[bucket] for r in records)


# #704 (Nov 16, prod QA): "Is the VIP carve-out out of date?" got "no Current State record covers it". On the seeded
# Northstar (the same 25 Current State items as production), retrieval sends k-vip and the retire-VIP Review for every
# wording: the false absence was the model's. Keep it that way for these paraphrases.
@pytest.mark.parametrize("query", ["Is the VIP carve-out out of date?", "Is the VIP exception stale?",
                                   "Is the VIP carve-out still in place?", "Has the VIP exception carve-out been retired?",
                                   "Is the VIP exception outdated?"])
def test_northstar_vip_questions_reach_the_vip_records(tmp_path, query):
    from database_migration_backed import initialize_db
    from db import connect
    from seed_demo import bootstrap_demo_data

    conn = connect(f"sqlite://{tmp_path / 'northstar.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    conn.project_id = "northstar"
    sent = _ids(_trim_candidates_for_query(query, _compact_candidates(conn)))
    assert {"k-vip", "demo-review-retire-vip"} <= sent, query
