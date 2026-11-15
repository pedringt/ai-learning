"""Paige, Nov 15 (DEC-023 item 7): Ask words absence relative to what it looked at only when retrieval left records
out. No model calls."""
from __future__ import annotations

from ask_service import _ABSENCE_RULE, _ABSENCE_RULE_CUT, _DENIAL_EXAMPLES, _DENIAL_EXAMPLES_CUT, _PARTIAL_CONTEXT_RULE, _compact_candidates, _context_was_cut, _one_call_prompt, _trim_candidates_for_query
from eval import context_size_experiment as cse
from test_ask_r9 import seeded_connection


def test_a_project_larger_than_the_limits_gets_the_relative_absence_rule():
    with cse._connection() as connection:                       # the #653 benchmark fixture: 113 Evidence, limit 24
        full = _compact_candidates(connection)
        trimmed = _trim_candidates_for_query("What is the cafeteria policy for pets?", full)
        assert _context_was_cut(full, trimmed)
        prompt = _one_call_prompt("What is the cafeteria policy for pets?", trimmed, None, context_cut=True)
        assert _PARTIAL_CONTEXT_RULE.strip() in prompt
        assert _ABSENCE_RULE_CUT in prompt and _ABSENCE_RULE not in prompt     # the base sentence is replaced, not contradicted
        assert _DENIAL_EXAMPLES_CUT in prompt and _DENIAL_EXAMPLES not in prompt


def test_a_project_sent_whole_keeps_the_plain_wording(tmp_path):
    connection = seeded_connection(tmp_path)
    try:
        full = _compact_candidates(connection)
        small = {bucket: records[:3] for bucket, records in full.items()}   # a project within every limit
        assert not _context_was_cut(small, _trim_candidates_for_query("What is the launch date?", small))
        plain = _one_call_prompt("What is the launch date?", small, None)
        assert _PARTIAL_CONTEXT_RULE.strip() not in plain and _ABSENCE_RULE in plain and _ABSENCE_RULE_CUT not in plain
        assert _DENIAL_EXAMPLES in plain
    finally:
        connection.close()
