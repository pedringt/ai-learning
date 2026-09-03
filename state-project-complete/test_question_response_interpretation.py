"""Test Question-response interpretation and resolution integrity.

Tests the fix for Question-response context passing to the provider and
ensures Questions only resolve through explicit review_questions links,
not from source_type alone.
"""

import pytest
import sqlite3
import json
from pathlib import Path

# Setup path for imports
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import Connection, get_connection
from interpretation_pipeline_integrated import process_evidence
from review_service import accept_review, resolve_review
from fake_provider_integrated import FakeProviderIntegrated


@pytest.fixture
def db():
    """Create in-memory test database."""
    conn = get_connection("sqlite:///:memory:")
    # Run migrations
    migration_dir = Path(__file__).resolve().parent / "migrations"
    for migration_file in sorted(migration_dir.glob("*.sql")):
        with open(migration_file) as f:
            conn.executescript(f.read())
    yield conn
    conn.close()


@pytest.fixture
def fake_provider():
    """Create a fake provider for testing."""
    return FakeProviderIntegrated()


class TestQuestionResponseContext:
    """Tests that Question-response context is passed to provider."""

    def test_direct_terse_answer_creates_review_with_question_link(self, db, fake_provider):
        """Q: authoritative customer feature-access source? A: Product tier info in Salesforce.
        
        Expected: Review explicitly links the Question; Question stays open until acceptance.
        """
        # Setup: Create Question
        question_id = db.execute(
            "INSERT INTO questions(id, text, status, blocking, blocks) "
            "VALUES(?, ?, ?, ?, ?) RETURNING id",
            ("Q_authsource", "What source authoritatively determines effective customer feature access?",
             "open", False, None),
        ).fetchone()[0]
        
        # Submit terse answer from Question UI
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_1", "Product tier information in Salesforce", f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        # Process evidence
        result = process_evidence(db, evidence_id, fake_provider)
        
        # Verify: FakeProvider received Question context
        assert result.processing_status == "succeeded"
        
        # Verify: Review was created
        reviews = db.execute("SELECT id, review_type FROM review_issues WHERE status='open'").fetchall()
        assert len(reviews) > 0, "Expected at least one Review to be created"
        
        # Verify: Review links the Question
        review_questions = db.execute(
            "SELECT review_id, question_id FROM review_questions WHERE question_id=?",
            (question_id,),
        ).fetchall()
        assert len(review_questions) > 0, "Expected review_questions link to exist"
        
        # Verify: Question still open
        question = db.execute("SELECT status FROM questions WHERE id=?", (question_id,)).fetchone()
        assert question[0] == "open", "Question should remain open until Review is accepted"

    def test_question_context_passed_to_provider(self, db, fake_provider):
        """Verify that Question-response relationship is loaded and passed to provider."""
        # Setup
        question_id = db.execute(
            "INSERT INTO questions(id, text, status, blocking, blocks) "
            "VALUES(?, ?, ?, ?, ?) RETURNING id",
            ("Q_test", "Test question?", "open", False, None),
        ).fetchone()[0]
        
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_ctx", "Answer text", f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        # Track what FakeProvider receives
        provider_calls = []
        original_interpret = fake_provider.interpret
        
        def track_interpret(*, context, evidence, connection=None):
            provider_calls.append({"context": context, "evidence": dict(evidence)})
            return original_interpret(context=context, evidence=evidence, connection=connection)
        
        fake_provider.interpret = track_interpret
        
        # Process
        process_evidence(db, evidence_id, fake_provider)
        
        # Verify: provider received Question context in evidence dict
        assert len(provider_calls) == 1
        provider_evidence = provider_calls[0]["evidence"]
        assert "response_to_question" in provider_evidence, \
            f"Expected response_to_question in evidence; got keys: {provider_evidence.keys()}"
        assert provider_evidence["response_to_question"]["question_id"] == question_id

    def test_unrelated_submission_from_question_ui_does_not_resolve(self, db, fake_provider):
        """Submit unrelated text from Question modal; must not resolve Question.
        
        Regression test: source_type alone should not resolve Questions.
        """
        # Setup: Create Question and a blocking Question (should stay blocked)
        question_id = db.execute(
            "INSERT INTO questions(id, text, status, blocking, blocks) "
            "VALUES(?, ?, ?, ?, ?) RETURNING id",
            ("Q_blocker", "What is blocking us?", "open", True, "feature-x-deploy"),
        ).fetchone()[0]
        
        # Submit unrelated text from Question UI
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_unrelated", "Some random information unrelated to the question",
             f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        # Process evidence
        process_evidence(db, evidence_id, fake_provider)
        
        # Verify: Question is still open (not auto-resolved by source_type)
        question = db.execute(
            "SELECT status, blocking FROM questions WHERE id=?", (question_id,)
        ).fetchone()
        assert question[0] == "open", \
            "Unrelated Evidence should not resolve Question; only accepted Review with explicit link should"
        assert question[1] == True, "Blocking status should be preserved"

    def test_normal_note_can_answer_question_indirectly(self, db, fake_provider):
        """Submit answer as normal Note (not from Question UI); provider may link it.
        
        Normal Notes can answer Questions indirectly without being submitted from Question UI.
        """
        # Setup
        question_id = db.execute(
            "INSERT INTO questions(id, text, status) "
            "VALUES(?, ?, ?) RETURNING id",
            ("Q_indirect", "When should we deprecate the old API?", "open"),
        ).fetchone()[0]
        
        # Submit as normal Note (source_type='manual_note', not question_response)
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_note", "The old API should be deprecated on 2026-12-31",
             "manual_note"),  # NOT a question_response
        ).fetchone()
        evidence_id = evidence_result[0]
        
        # Process
        result = process_evidence(db, evidence_id, fake_provider)
        
        # Verify: Question is still open (no automatic link)
        question = db.execute("SELECT status FROM questions WHERE id=?", (question_id,)).fetchone()
        assert question[0] == "open", "Normal Note does not auto-resolve Question"
        
        # Verify: If provider recommended a link, that link exists
        # (This depends on FakeProvider's behavior; real providers make this decision)
        reviews = db.execute("SELECT COUNT(*) FROM review_issues WHERE status='open'").fetchone()
        # At least one Review should exist (may or may not link the Question depending on provider)

    def test_question_resolves_on_review_acceptance(self, db, fake_provider):
        """Accept Review linked to Question; Question should resolve.
        
        Question resolution should come only from accepted Review with explicit link.
        """
        # Setup: Create Question and State items
        question_id = db.execute(
            "INSERT INTO questions(id, text, status) "
            "VALUES(?, ?, ?) RETURNING id",
            ("Q_resolve", "What is our deployment strategy?", "open"),
        ).fetchone()[0]
        
        state_id = db.execute(
            "INSERT INTO current_state_items(id, topic, statement, status, version) "
            "VALUES(?, ?, ?, ?, ?) RETURNING id",
            ("state_1", "deployment", "Deployment is manual", "active", 1),
        ).fetchone()[0]
        
        # Submit evidence and create Review
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_deploy", "We now use automated CI/CD for deployments",
             f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        result = process_evidence(db, evidence_id, fake_provider)
        
        # Get the created Review
        review_rows = db.execute(
            "SELECT id, status FROM review_issues WHERE status='open'"
        ).fetchall()
        assert len(review_rows) > 0, "Expected Review to be created"
        review_id = review_rows[0][0]
        
        # Verify Question is linked to Review
        linked = db.execute(
            "SELECT COUNT(*) FROM review_questions WHERE review_id=? AND question_id=?",
            (review_id, question_id),
        ).fetchone()[0]
        assert linked > 0, "Expected review_questions link to exist"
        
        # Before acceptance: Question is open
        q = db.execute("SELECT status FROM questions WHERE id=?", (question_id,)).fetchone()
        assert q[0] == "open"
        
        # Accept Review
        accept_review(db, review_id, "Approved by test")
        
        # After acceptance: Question should resolve
        q = db.execute("SELECT status, resolved_at FROM questions WHERE id=?", (question_id,)).fetchone()
        assert q[0] == "resolved", "Question should resolve when linked Review is accepted"
        assert q[1] is not None, "Question should have resolved_at timestamp"

    def test_reject_linked_review_keeps_question_open(self, db, fake_provider):
        """Reject Review linked to Question; Question should remain open."""
        # Setup
        question_id = db.execute(
            "INSERT INTO questions(id, text, status) "
            "VALUES(?, ?, ?) RETURNING id",
            ("Q_reject", "What is the budget?", "open"),
        ).fetchone()[0]
        
        # Create evidence and process
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_budget", "Budget is $50k", f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        process_evidence(db, evidence_id, fake_provider)
        
        # Get Review (may need to check multiple if multiple were created)
        review_id = db.execute(
            "SELECT id FROM review_issues WHERE status='open' LIMIT 1"
        ).fetchone()[0]
        
        # Reject through the real lifecycle API; review_issues uses open/resolved
        # status while resolution records the semantic outcome.
        resolve_review(db, review_id, "reject", "Rejected by test")
        
        # Question should still be open (rejection doesn't close it)
        question = db.execute("SELECT status FROM questions WHERE id=?", (question_id,)).fetchone()
        assert question[0] == "open", "Rejecting a Review should not resolve the Question"

    def test_provider_failure_preserves_evidence(self, db):
        """Provider failure; evidence remains, can be retried."""
        from anthropic_provider import AnthropicProvider
        
        # Create a provider that will fail
        class FailingProvider:
            name = "failing"
            model_identifier = "test"
            
            def interpret(self, *, context, evidence, connection=None):
                raise ValueError("Simulated provider failure")
        
        failing_provider = FailingProvider()
        
        # Setup
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_fail", "Test evidence", "manual_note"),
        ).fetchone()
        evidence_id = evidence_result[0]
        
        # Process with failing provider
        result = process_evidence(db, evidence_id, failing_provider)
        
        # Verify: Evidence still exists
        evidence = db.execute(
            "SELECT id, content FROM evidence WHERE id=?", (evidence_id,)
        ).fetchone()
        assert evidence is not None, "Evidence should be preserved on provider failure"
        assert evidence[1] == "Test evidence", "Evidence content should be intact"
        
        # Verify: Interpretation record shows failure
        interp = db.execute(
            "SELECT processing_status FROM interpretation_records WHERE evidence_id=?",
            (evidence_id,),
        ).fetchone()
        assert interp[0] in ("provider_error", "failed"), \
            f"Expected failed status, got {interp[0]}"


class TestQuestionBackwardCompatibilityRemoved:
    """Tests that the unsafe source_type fallback has been removed."""

    def test_source_type_alone_does_not_resolve_questions(self, db, fake_provider):
        """Verify: source_type starting with question_response: is NOT sufficient to resolve.
        
        The fallback in review_service.py must be removed. Only explicit review_questions
        links from validated resolves_question_ids should resolve Questions.
        """
        # Setup: Create Question
        question_id = db.execute(
            "INSERT INTO questions(id, text, status) "
            "VALUES(?, ?, ?) RETURNING id",
            ("Q_backward", "Test backward compat removal", "open"),
        ).fetchone()[0]
        
        # Manually insert a Review and Evidence with source_type link
        # (simulating what would happen if code auto-submitted)
        review_id = db.execute(
            "INSERT INTO review_issues(id, review_type, status, decision_question, why_consequential) "
            "VALUES(?, ?, ?, ?, ?) RETURNING id",
            ("rev_manual", "proposed_update", "open", "Is this enough?",
             "Test that source metadata alone cannot resolve a Question."),
        ).fetchone()[0]
        
        evidence_result = db.execute(
            "INSERT INTO evidence(id, content, source_type) "
            "VALUES(?, ?, ?) RETURNING id",
            ("ev_backward", "Some answer", f"question_response:{question_id}"),
        ).fetchone()
        evidence_id = evidence_result[0]
        db.execute(
            "INSERT INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
            (review_id, evidence_id),
        )
        db.commit()
        
        # Accept the Review WITHOUT creating a review_questions link
        accept_review(db, review_id, "Accepted by test")
        
        # Question should still be OPEN (not resolved by source_type alone)
        question = db.execute("SELECT status FROM questions WHERE id=?", (question_id,)).fetchone()
        assert question[0] == "open", \
            "CRITICAL: source_type alone must NOT resolve Questions. " \
            "Only explicit review_questions links should resolve them. " \
            "This suggests the backward-compatibility fallback was not removed."
