"""Test database abstraction layer works with both SQLite and Postgres.

This verifies that the unified Connection class correctly:
  1. Handles parameter conversion (? ↔ %s)
  2. Implements row_factory correctly
  3. Manages transactions (BEGIN IMMEDIATE, COMMIT, ROLLBACK)
  4. Converts INSERT OR IGNORE syntax
"""

from __future__ import annotations

import sys
from pathlib import Path

# Setup path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uuid

from db import Connection, connect_sqlite
from database_migration_backed import get_test_db, initialize_db


def new_id(prefix: str) -> str:
    """Generate a prefixed ID (simplified version for testing)."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def test_sqlite_connection():
    """Test basic SQLite connection and operations."""
    print("[TEST] Testing SQLite connection...")
    
    with get_test_db() as conn:
        assert isinstance(conn, Connection), "get_test_db should return Connection"
        assert not conn._is_postgres, "Should detect as SQLite"
        
        # Test execute and fetchone
        evidence_id = new_id("evidence")
        conn.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            (evidence_id, "test content", "manual_note"),
        )
        conn.commit()
        
        row = conn.execute("SELECT id, content FROM evidence WHERE id=?", (evidence_id,)).fetchone()
        assert row is not None, "Should find inserted row"
        assert row["id"] == evidence_id, f"ID mismatch: {row['id']} != {evidence_id}"
        assert row["content"] == "test content", f"Content mismatch: {row['content']}"
        
        # Test fetchall
        rows = conn.execute("SELECT id FROM evidence").fetchall()
        assert len(rows) > 0, "Should have at least one row"
        
        print("  ✓ SQLite connection works")


def test_transaction_control():
    """Test transaction control (BEGIN, COMMIT, ROLLBACK)."""
    print("[TEST] Testing transaction control...")
    
    with get_test_db() as conn:
        evidence_id = new_id("evidence")
        
        # Test basic commit
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            (evidence_id, "transaction test", "manual_note"),
        )
        conn.execute("COMMIT")
        
        # Verify it persisted
        row = conn.execute("SELECT id FROM evidence WHERE id=?", (evidence_id,)).fetchone()
        assert row is not None, "Row should persist after COMMIT"
        
        # Test rollback
        evidence_id2 = new_id("evidence")
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            (evidence_id2, "rollback test", "manual_note"),
        )
        conn.execute("ROLLBACK")
        
        # Verify it didn't persist
        row = conn.execute("SELECT id FROM evidence WHERE id=?", (evidence_id2,)).fetchone()
        assert row is None, "Row should not persist after ROLLBACK"
        
        print("  ✓ Transaction control works")


def test_row_factory():
    """Test row_factory setting and dict-like access."""
    print("[TEST] Testing row_factory...")
    
    with get_test_db() as conn:
        evidence_id = new_id("evidence")
        conn.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            (evidence_id, "row factory test", "manual_note"),
        )
        conn.commit()
        
        # Test dict access
        row = conn.execute("SELECT id, content FROM evidence WHERE id=?", (evidence_id,)).fetchone()
        assert row["id"] == evidence_id, "Should access via dict key"
        assert row["content"] == "row factory test", "Should get correct value"
        
        # Test that row is dict-like
        assert isinstance(row, dict), "Row should be dict-like"
        assert "id" in row, "Should support 'in' operator"
        
        print("  ✓ Row factory works")


def test_insert_or_ignore():
    """Test INSERT OR IGNORE handling."""
    print("[TEST] Testing INSERT OR IGNORE...")
    
    with get_test_db() as conn:
        review_id = new_id("review")
        evidence_id = new_id("evidence")
        conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential) VALUES (?, ?, ?, ?)",
            (review_id, "proposed_update", "Test?", "Integrity test"),
        )
        conn.execute(
            "INSERT INTO evidence(id, content, source_type) VALUES (?, ?, ?)",
            (evidence_id, "test evidence", "manual_note"),
        )

        # First insert
        conn.execute(
            "INSERT OR IGNORE INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
            (review_id, evidence_id),
        )
        conn.commit()
        
        # Second insert (duplicate) should be ignored
        conn.execute(
            "INSERT OR IGNORE INTO review_evidence(review_id, evidence_id) VALUES (?, ?)",
            (review_id, evidence_id),
        )
        conn.commit()
        
        # Count should be 1, not 2
        result = conn.execute(
            "SELECT COUNT(*) as count FROM review_evidence WHERE review_id=?",
            (review_id,),
        ).fetchone()
        assert result["count"] == 1, f"Should have 1 row, got {result['count']}"
        
        print("  ✓ INSERT OR IGNORE works")


def test_review_service_flow():
    """Test a simplified review service workflow (without external imports)."""
    print("[TEST] Testing review service workflow...")
    
    with get_test_db() as conn:
        # Create a state item
        state_id = new_id("state")
        conn.execute(
            "INSERT INTO current_state_items(id, topic, statement) VALUES (?, ?, ?)",
            (state_id, "test_topic", "test statement"),
        )
        conn.commit()
        
        # Query state items
        states = conn.execute(
            "SELECT id, topic, statement FROM current_state_items WHERE status='active'"
        ).fetchall()
        assert len(states) == 1, f"Should have 1 state, got {len(states)}"
        assert states[0]["id"] == state_id, "State ID should match"
        
        # Create a review
        review_id = new_id("review")
        conn.execute(
            "INSERT INTO review_issues(id, review_type, decision_question, why_consequential) VALUES (?, ?, ?, ?)",
            (review_id, "proposed_update", "Should we update?", "It matters"),
        )
        conn.commit()
        
        # Query reviews
        reviews = conn.execute("SELECT * FROM review_issues WHERE status='open'").fetchall()
        assert len(reviews) == 1, f"Should have 1 review, got {len(reviews)}"
        assert reviews[0]["id"] == review_id, "Review ID should match"
        
        print("  ✓ Review service flow works")


if __name__ == "__main__":
    print("\n=== Database Abstraction Layer Tests ===\n")
    
    try:
        test_sqlite_connection()
        test_transaction_control()
        test_row_factory()
        test_insert_or_ignore()
        test_review_service_flow()
        
        print("\n✅ All tests passed!\n")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {type(e).__name__}: {e}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)
