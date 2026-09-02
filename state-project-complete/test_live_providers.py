"""Live provider integration tests.

This module shows how to use Anthropic and OpenAI adapters.

Mock tests run without API keys (simulating provider responses).
Template for real tests is included at the bottom.
"""

import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, "phase2_current")

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence
from anthropic_provider import AnthropicProvider
from openai_provider import OpenAIProvider
import sqlite3


class DBContext:
    """Wrapper to hold connection and cleanup context."""
    def __init__(self, db_context, connection):
        self.db_context = db_context
        self._connection = connection
    
    def __getattr__(self, name):
        return getattr(self._connection, name)
    
    def __setattr__(self, name, value):
        if name in ("db_context", "_connection"):
            super().__setattr__(name, value)
        else:
            setattr(self._connection, name, value)


def setup_test_db():
    """Create migration-backed database with test data."""
    db_context = get_test_db()
    connection = db_context.__enter__()
    connection.row_factory = sqlite3.Row
    
    # Seed State items
    states = {
        "state_01": "The AI Support Pilot is limited to the billing-support team.",
        "state_02": "The AI Support Pilot will launch to the billing-support team on October 1.",
    }
    for sid, statement in states.items():
        connection.execute(
            "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
            (sid, "pilot", statement, 1),
        )
    
    # Seed Evidence
    evidence = {
        "evidence_02": "We have moved the pilot launch to October 15 because security review will not finish in time.",
    }
    for eid, content in evidence.items():
        connection.execute(
            "INSERT INTO evidence(id, content) VALUES (?, ?)",
            (eid, content),
        )
    
    connection.commit()
    wrapped = DBContext(db_context, connection)
    return wrapped


def cleanup_test_db(db_wrapper):
    """Clean up test database."""
    if hasattr(db_wrapper, "db_context"):
        db_wrapper.db_context.__exit__(None, None, None)


class MockLiveProviderTests(unittest.TestCase):
    """Test live providers without calling actual APIs (mock responses)."""

    def setUp(self):
        self.connection = setup_test_db()
        self.addCleanup(cleanup_test_db, self.connection)

    @patch('anthropic_provider.AnthropicProvider.client')
    def test_anthropic_mock_interpret(self, mock_client):
        """Test Anthropic provider with mocked response."""
        from state_spike.semantic_validation import InterpretationContextSnapshot, StateContextItem
        
        # Mock Claude's response
        mock_response = Mock()
        mock_content_item = Mock()
        mock_content_item.text = '''{
            "summary": "Launch date has changed from October 1 to October 15.",
            "topics": ["pilot", "launch"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create",
                    "review_type": "proposed_update",
                    "decision_question": "Should the recorded pilot launch date change to October 15?",
                    "why_consequential": "The maintained launch date is now stale.",
                    "affected_state_item_ids": ["state_02"],
                    "proposed_changes": [
                        {
                            "operation": "update",
                            "state_item_id": "state_02",
                            "expected_version": 1,
                            "proposed_statement": "The AI Support Pilot will launch to the billing-support team on October 15.",
                            "rationale": "The Evidence explicitly says the launch moved to October 15."
                        }
                    ]
                }
            ]
        }'''
        mock_response.content = [mock_content_item]
        mock_client.messages.create.return_value = mock_response
        
        # Create provider and interpret
        provider = AnthropicProvider(model_identifier="claude-opus-4-6")
        
        # Build proper context snapshot
        context = InterpretationContextSnapshot(
            state_items={"state_02": StateContextItem("state_02", 1)},
            open_reviews={},
        )
        
        # Normally would be called by process_evidence, but we're testing the adapter directly
        result = provider.interpret(
            context=context,
            evidence={"id": "evidence_02", "content": "We have moved the pilot launch to October 15."},
            connection=self.connection,
        )
        
        # Verify response structure
        self.assertEqual(result["outcome"], "review_recommended")
        self.assertEqual(len(result["review_recommendations"]), 1)
        self.assertEqual(result["review_recommendations"][0]["review_type"], "proposed_update")

    def test_provider_prompt_construction(self):
        """Test that provider constructs correct prompt with full context."""
        provider = AnthropicProvider()
        
        # Import InterpretationContextSnapshot
        from state_spike.semantic_validation import InterpretationContextSnapshot, StateContextItem
        
        # Build mock context
        context = InterpretationContextSnapshot(
            state_items={"state_02": StateContextItem("state_02", 1)},
            open_reviews={},
        )
        
        evidence = {"id": "evidence_02", "content": "Launch date moved to October 15."}
        
        # Build prompt
        prompt = provider._build_prompt(context, evidence, self.connection)
        
        # Verify prompt contains expected elements
        self.assertIn("state_02", prompt)
        self.assertIn("October 15", prompt)
        self.assertIn("review_recommended", prompt)
        self.assertIn("JSON", prompt)
        self.assertIn("Your Task", prompt)

    @patch('openai_provider.OpenAIProvider.client')
    def test_openai_mock_interpret(self, mock_client):
        """Test OpenAI provider with mocked response."""
        from state_spike.semantic_validation import InterpretationContextSnapshot, StateContextItem
        
        # Mock OpenAI's response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message = Mock(content='''{
            "summary": "Launch date has changed from October 1 to October 15.",
            "topics": ["pilot", "launch"],
            "outcome": "review_recommended",
            "review_recommendations": [
                {
                    "review_action": "create",
                    "review_type": "proposed_update",
                    "decision_question": "Should the recorded pilot launch date change to October 15?",
                    "why_consequential": "The maintained launch date is now stale.",
                    "affected_state_item_ids": ["state_02"],
                    "proposed_changes": [
                        {
                            "operation": "update",
                            "state_item_id": "state_02",
                            "expected_version": 1,
                            "proposed_statement": "The AI Support Pilot will launch to the billing-support team on October 15.",
                            "rationale": "The Evidence explicitly says the launch moved to October 15."
                        }
                    ]
                }
            ]
        }''')
        mock_client.chat.completions.create.return_value = mock_response
        
        # Create provider and interpret
        provider = OpenAIProvider(model_identifier="gpt-4o")
        
        # Build proper context snapshot
        context = InterpretationContextSnapshot(
            state_items={"state_02": StateContextItem("state_02", 1)},
            open_reviews={},
        )
        
        result = provider.interpret(
            context=context,
            evidence={"id": "evidence_02", "content": "We have moved the pilot launch to October 15."},
            connection=self.connection,
        )
        
        # Verify response structure
        self.assertEqual(result["outcome"], "review_recommended")
        self.assertEqual(len(result["review_recommendations"]), 1)


class LiveProviderIntegrationTests(unittest.TestCase):
    """Live tests using real Anthropic and OpenAI APIs.

    These tests require valid API keys set as environment variables.
    They process evidence through the full integration pipeline using real models.
    """

    def setUp(self):
        self.connection = setup_test_db()
        self.addCleanup(cleanup_test_db, self.connection)

    def test_live_anthropic_full_pipeline(self):
        """Test full pipeline with live Anthropic Claude API.
        
        Requirements:
        - ANTHROPIC_API_KEY environment variable set
        - Internet connection
        
        Expected:
        - Evidence processed
        - Interpretation created
        - Review + Proposal created
        """
        import os
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            self.skipTest("ANTHROPIC_API_KEY not set")
        
        # Initialize real provider
        provider = AnthropicProvider(model_identifier="claude-opus-4-6")
        
        # Process evidence using real Claude
        result = process_evidence(
            connection=self.connection,
            evidence_id="evidence_02",
            provider=provider,
        )
        
        # Verify we got a result
        print(f"\n✓ Anthropic pipeline succeeded")
        print(f"  Status: {result.processing_status}")
        print(f"  Reviews: {result.review_ids}")
        print(f"  Proposals: {result.proposal_ids}")
        
        assert result.processing_status == "succeeded"
        assert len(result.review_ids) > 0

    def test_live_openai_full_pipeline(self):
        """Test full pipeline with live OpenAI API.
        
        Requirements:
        - OPENAI_API_KEY environment variable set
        - Internet connection
        
        Expected:
        - Evidence processed
        - Interpretation created
        - Review + Proposal created
        """
        import os
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            self.skipTest("OPENAI_API_KEY not set")
        
        # Initialize real provider
        provider = OpenAIProvider(model_identifier="gpt-4o")
        
        # Process evidence using real OpenAI
        result = process_evidence(
            connection=self.connection,
            evidence_id="evidence_02",
            provider=provider,
        )
        
        # Verify we got a result
        print(f"\n✓ OpenAI pipeline succeeded")
        print(f"  Status: {result.processing_status}")
        print(f"  Reviews: {result.review_ids}")
        print(f"  Proposals: {result.proposal_ids}")
        
        assert result.processing_status == "succeeded"
        assert len(result.review_ids) > 0

    def test_anthropic_vs_openai_comparison(self):
        """Compare Anthropic and OpenAI on the same evidence.
        
        Requires both API keys set. Shows latency + response differences.
        """
        import os
        import time
        
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        openai_key = os.getenv("OPENAI_API_KEY")
        
        if not anthropic_key or not openai_key:
            self.skipTest("Both ANTHROPIC_API_KEY and OPENAI_API_KEY required")
        
        print("\n=== Provider Comparison ===")
        
        # Test Anthropic
        start = time.time()
        anthropic_provider = AnthropicProvider(model_identifier="claude-opus-4-6")
        anthropic_result = process_evidence(
            connection=self.connection,
            evidence_id="evidence_02",
            provider=anthropic_provider,
        )
        anthropic_time = time.time() - start
        
        # Reset connection
        self.tearDown()
        self.setUp()
        
        # Test OpenAI
        start = time.time()
        openai_provider = OpenAIProvider(model_identifier="gpt-4o")
        openai_result = process_evidence(
            connection=self.connection,
            evidence_id="evidence_02",
            provider=openai_provider,
        )
        openai_time = time.time() - start
        
        print(f"\nAnthropic:")
        print(f"  Time: {anthropic_time:.2f}s")
        print(f"  Status: {anthropic_result.processing_status}")
        print(f"  Reviews: {len(anthropic_result.review_ids)}")
        
        print(f"\nOpenAI:")
        print(f"  Time: {openai_time:.2f}s")
        print(f"  Status: {openai_result.processing_status}")
        print(f"  Reviews: {len(openai_result.review_ids)}")
        
        faster = "Anthropic" if anthropic_time < openai_time else "OpenAI"
        diff = abs(anthropic_time - openai_time)
        print(f"\nFaster: {faster} by {diff:.2f}s")


if __name__ == "__main__":
    unittest.main(verbosity=2)
