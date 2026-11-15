"""#664: Ask's retrieval keeps the same records on every process, and keeps the newest answered Questions. No model calls."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

from ask_service import _compact_candidates, _trim_candidates_for_query, ask_cache_key
from eval import retrieval_benchmark as rb
from test_project_isolation import db  # noqa: F401  (SQLite + Postgres connection fixture)


def _candidates() -> dict:
    """14 unrelated State items fill the 12 slots; 6 matching Reviews each affect a different State item outside them."""
    state = [{"id": f"s-{n:02d}", "topic": f"Topic {n:02d}", "statement": "Unrelated.", "authority": "governing_current_fact"}
             for n in range(14)]
    state += [{"id": f"s-linked-{n}", "topic": f"Zz linked {n}", "statement": "Linked fact.", "authority": "governing_current_fact"}
              for n in range(6)]
    reviews = [{"id": f"r-{n}", "review_type": "proposed_update", "decision_question": "Should the conformance level change?",
                "why_consequential": "x", "authority": "qualifies_current_state", "affected_state_ids": [f"s-linked-{n}"],
                "evidence_ids": [], "question_ids": []} for n in range(6)]
    empty = {"questions": [], "answered_questions": [], "history": [], "evidence": [], "rules": []}
    return {"state": state, "reviews": reviews, **empty}


def test_review_linked_state_items_are_kept_in_review_rank_order():
    trimmed = _trim_candidates_for_query("Is the conformance level changing?", _candidates())
    # 12 best-matching State items, then the 2 linked to the highest-ranked Reviews (all tie, so list order).
    assert [s["id"] for s in trimmed["state"][12:]] == ["s-linked-0", "s-linked-1"]


def test_review_linked_state_items_do_not_depend_on_the_hash_seed():
    script = ("import json, test_ask_retrieval_664 as t; from ask_service import _trim_candidates_for_query as f; "
              "print(json.dumps([s['id'] for s in f('Is the conformance level changing?', t._candidates())['state']]))")
    here = Path(__file__).parent
    outputs = set()
    for seed in ("0", "4", "5"):
        env = {**os.environ, "PYTHONHASHSEED": seed, "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""}
        result = subprocess.run([sys.executable, "-c", script], cwd=here, env=env, capture_output=True, text=True, check=True)
        outputs.add(result.stdout.strip().splitlines()[-1])
    assert len(outputs) == 1, outputs


def test_ask_keeps_the_newest_answered_questions_and_a_new_answer_changes_the_cache_key(db):
    rb.build_fixture(db)
    db.project_id = rb.PROJECT
    answered = [q["id"] for q in _compact_candidates(db)["answered_questions"]]
    assert len(answered) == 30
    assert {"qa-trainer", "qa-mobile", "qa-control", "qa-escalation-owner"} <= set(answered)   # answered most recently
    assert not {"qa-sandbox", "qa-holiday-cover", "qa-refund-limit"} & set(answered)          # answered first of 40

    query, today = "Are sandboxes ready?", date(2026, 11, 14)
    before = ask_cache_key(db, query, today=today)
    db.execute("INSERT INTO evidence(id, content, source_type, processing_status, submitted_at, project_id) "
               "VALUES ('e-664', 'Sandboxes are ready.', 'manual_note', 'processed', '2025-01-01 00:00:00', ?)", (rb.PROJECT,))
    db.execute("INSERT INTO questions(id, text, status, blocking, created_at, resolved_at, source_evidence_id, project_id) "
               "VALUES ('qa-664', 'Are sandboxes ready?', 'resolved', 0, '2026-11-14 09:00:00', '2026-11-14 10:00:00', 'e-664', ?)",
               (rb.PROJECT,))
    db.commit()
    assert "qa-664" in [q["id"] for q in _compact_candidates(db)["answered_questions"]]
    assert ask_cache_key(db, query, today=today) != before
