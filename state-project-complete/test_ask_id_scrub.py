"""#247: Ask's identifier scrubber must not leave a mangled fragment where the model wrote a slug-style record id.

Real strings from the #246 meeting-prep measurement (Haiku 4.5, seeded Juniper demo). No model calls.
"""
import re
from copy import deepcopy

import pytest

from ask_service import _DEMO_SLUG_ID, _candidate_pool_ids, _clean_visible_ask_text, _compact_candidates, run_ask
from db import connect
from database_migration_backed import initialize_db
from seed_demo import bootstrap_demo_data, bootstrap_juniper_demo_data

SHAPES = [re.compile(r"\b(?:state|question|evidence|review|proposal)_[a-z0-9]+\b", re.I),
          re.compile(r"\b(?:ask-evidence|state|question|evidence|review|proposal|k|q)-[a-z0-9-]+\b", re.I)]


@pytest.mark.parametrize("raw, forbidden", [
    ("Demo-juniper-review-elevator qualifies this risk.", ("demo", "juniper-")),
    ("Proposed via demo-juniper-review-budget-evidence; awaiting authorization to track formally", ("demo", "juniper-")),
    ("Blocked by demo-review-retention until security signs off.", ("demo", "review-")),
    ("See demo-juniper-state-parking and demo-history-data-boundary for the change.", ("demo", "parking", "boundary")),
])
def test_a_slug_style_id_is_removed_whole_even_when_it_is_not_in_the_exact_id_list(raw, forbidden):
    cleaned = _clean_visible_ask_text(raw, set())
    assert cleaned, raw
    for fragment in forbidden:
        assert fragment not in cleaned.lower(), (raw, cleaned)
    assert not re.search(r"[A-Za-z0-9]-(?=\s|[.,;:)]|$)", cleaned), cleaned                   # no word left ending in a hyphen


def test_the_two_strings_from_the_issue_read_cleanly():
    assert _clean_visible_ask_text("Demo-juniper-review-elevator qualifies this risk.", set()) == "qualifies this risk"
    assert _clean_visible_ask_text("Proposed via demo-juniper-review-budget-evidence; awaiting authorization to track formally", set()) \
        == "Proposed via; awaiting authorization to track formally"


@pytest.mark.parametrize("text", [
    "Schedule a demo-day rehearsal for the Juniper demo project.",
    "The demo went well and the vendor liked it.",
    "Pre- and post-launch checks are agreed.",                                                   # a legitimate suspended hyphen
])
def test_ordinary_text_that_mentions_demo_or_hyphens_is_left_alone(text):
    assert _clean_visible_ask_text(text, set()).rstrip(".") == text.rstrip(".")


def test_the_slug_pattern_matches_every_seeded_demo_id_in_full(tmp_path):
    conn = connect(f"sqlite://{tmp_path / 'state.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    bootstrap_juniper_demo_data(conn)
    try:
        ids = [r["id"] for r in conn.execute("SELECT id FROM review_issues WHERE id LIKE 'demo-%'").fetchall()]
        ids += [r["id"] for r in conn.execute("SELECT id FROM history_transitions WHERE id LIKE 'demo-%'").fetchall()]
        assert len(ids) >= 10
        for record_id in ids:
            assert _DEMO_SLUG_ID.fullmatch(record_id), record_id                                   # the whole id, not just its tail
    finally:
        conn.close()


class _FakeAsk:
    """Selects nothing, then answers with text that mentions a record id the model was shown but did not select."""

    def __init__(self, leaked_id):
        self.leaked_id = leaked_id
        self.prompts = []

    def select(self, prompt):
        self.prompts.append(prompt)
        return {"job": "catch_up", "state_ids": [], "review_ids": [], "blocking_question_ids": [], "question_ids": [], "history_ids": [], "evidence_ids": []}

    def synthesize(self, prompt):
        return deepcopy({
            "job": "catch_up", "headline": f"Where things stand ({self.leaked_id})", "summary": f"The move is on track, but {self.leaked_id} is open.",
            "sections": [{"kind": "other", "title": "Context", "items": [
                {"text": f"Waiting on {self.leaked_id} before we confirm.", "record_type": "none", "record_id": None, "detail": f"See {self.leaked_id}."}]}],
            "source_ids": [], "uncertainty_ids": [], "suggested_refinements": [],
        })


def test_an_id_the_model_was_shown_but_did_not_select_is_scrubbed_even_when_it_matches_no_shape_pattern(tmp_path):
    conn = connect(f"sqlite://{tmp_path / 'state.db'}")
    initialize_db(conn)
    bootstrap_demo_data(conn)
    bootstrap_juniper_demo_data(conn)
    conn.project_id = "juniper"
    try:
        pool = _candidate_pool_ids(_compact_candidates(conn))
        # a Juniper id with no recognisable shape (e.g. "jq-elevator"): only the exact-id list can remove it
        leaked = next(i for i in sorted(pool) if not any(p.search(i) for p in SHAPES) and not _DEMO_SLUG_ID.search(i))
        result = run_ask(conn, _FakeAsk(leaked), "Where do things stand?")
        visible = " ".join([result["answer"]["headline"], result["answer"]["summary"]]
                           + [x for s in result["answer"]["sections"] for i in s["items"] for x in (i["text"], i.get("detail") or "")])
        assert leaked.lower() not in visible.lower(), (leaked, visible)
        assert "The move is on track" in visible                                                    # the rest of the answer survives
    finally:
        conn.close()


def test_the_pool_helper_collects_ids_from_every_bucket_and_ignores_junk():
    pool = _candidate_pool_ids({"state": [{"id": "s1"}], "reviews": [{"id": "r1"}, {"nope": 1}], "rules": [{"id": "rule-1"}], "junk": "x", "questions": ["not a dict"]})
    assert pool == {"s1", "r1", "rule-1"}
    assert _candidate_pool_ids(None) == set()
