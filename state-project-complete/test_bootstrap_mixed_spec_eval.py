"""Targeted real-model eval for the bootstrap planning/spec failure found
2026-09-15.

A realistic planning document can contain settled product decisions,
tentative ideas, and explicit open questions at the same time. State must not
classify the whole source as unresolved merely because it uses design language
such as "should". In bootstrap mode we expect at least one proposed maintained
fact AND at least one proposed Question from the same Evidence.

This is intentionally a real-model test. Deterministic prompt-contract tests
prove the guidance is present; this test checks whether the model actually
makes the semantic distinction. It skips when ANTHROPIC_API_KEY is unavailable,
matching the rest of State's model-sensitive eval layer.
"""
from __future__ import annotations

import os
import sqlite3

import pytest


from anthropic_provider import AnthropicProvider
from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence

requires_anthropic_key = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set -- this eval tests real model judgment.",
)


@requires_anthropic_key
def test_bootstrap_mixed_spec_preserves_settled_decisions_and_open_questions():
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    try:
        evidence = """
        We decided State should support a bootstrap/backfill workflow when a
        project is first adopted. During bootstrap, coverage should matter
        more than it does during normal ongoing interpretation. Once a
        baseline exists, normal interpretation should become more selective.

        Users should also be able to explicitly propose missed Evidence for
        Current State. That action must still go through Review and human
        authorization; it must never write Current State directly.

        One idea we have not decided is whether large bootstrap proposals
        should be grouped by product area or by source document.

        Open question: what exact grouping UX should we use for a large
        backfill import?
        """
        connection.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            ("e-mixed-bootstrap-spec", evidence),
        )
        connection.commit()

        result = process_evidence(
            connection,
            evidence_id="e-mixed-bootstrap-spec",
            provider=AnthropicProvider(),
        )
        assert result.processing_status == "succeeded", result.error
        assert result.review_ids, (
            "Bootstrap mixed-spec Evidence was silently dropped instead of "
            "producing Reviews for settled decisions and unresolved questions."
        )

        placeholders = ",".join("?" for _ in result.review_ids)
        state_proposals = connection.execute(
            f"SELECT COUNT(*) AS n FROM proposed_state_changes WHERE review_id IN ({placeholders}) "
            "AND status='pending'",
            tuple(result.review_ids),
        ).fetchone()["n"]
        question_proposals = connection.execute(
            f"SELECT COUNT(*) AS n FROM proposed_questions WHERE review_id IN ({placeholders}) "
            "AND status='pending'",
            tuple(result.review_ids),
        ).fetchone()["n"]

        assert state_proposals > 0, (
            "The model treated a mixed planning/spec document as entirely "
            "unresolved and failed to propose any settled baseline fact."
        )
        assert question_proposals > 0, (
            "The model flattened a genuine unresolved implementation question "
            "into maintained State instead of preserving uncertainty."
        )
    finally:
        db_context.__exit__(None, None, None)
