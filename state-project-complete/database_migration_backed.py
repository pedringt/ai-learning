"""Database initialization and management for Phase 1 migration-backed schema.

This module loads and applies the Phase 1 migration files, providing a clean
interface for creating test databases with the full schema including Phase 2 extensions
(operation field, effective_date).

Migrations are applied in order:
  1. 001_initial.sql — Phase 1 base schema
  2. 002_add_operation_and_effective_date.sql — Phase 2 extensions
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _get_migration_files() -> list[Path]:
    """Return migration files in order."""
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    expected = [MIGRATIONS_DIR / "001_initial.sql", MIGRATIONS_DIR / "002_add_operation_and_effective_date.sql"]
    if migrations != expected:
        raise RuntimeError(f"Migration files missing or out of order: {migrations} vs {expected}")
    return migrations


def initialize_db(connection) -> None:
    """Apply all migrations in order, creating the full Phase 1+Phase 2 schema.

    Args:
        connection: Database connection (sqlite3 or psycopg2)

    Raises:
        RuntimeError: If migration files are missing or out of order
    """
    # Get cursor for executing statements
    cursor = connection.cursor()
    is_postgres = hasattr(connection, 'get_dsn_parameters')  # psycopg2 has this; sqlite3 doesn't
    param_placeholder = "%s" if is_postgres else "?"
    
    # Create schema_migrations table
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    connection.commit()
    
    # Get list of already-applied migrations
    cursor.execute("SELECT version FROM schema_migrations")
    applied = {row[0] for row in cursor.fetchall()}
    
    # Apply each migration in order
    for migration_file in _get_migration_files():
        if migration_file.stem in applied:
            continue
        sql = migration_file.read_text(encoding="utf-8")
        # Split by semicolon and execute each statement
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement:
                cursor.execute(statement)
        connection.commit()
        # Record migration as applied
        cursor.execute(f"INSERT INTO schema_migrations (version) VALUES ({param_placeholder})", (migration_file.stem,))
        connection.commit()
    
    cursor.close()


class TestDatabase:
    """Context manager for test database with full schema."""

    def __enter__(self) -> sqlite3.Connection:
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
        initialize_db(self.connection)
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.connection.close()


def get_test_db() -> TestDatabase:
    """Context manager: create a temporary in-memory SQLite database with full schema.

    Usage:
        with get_test_db() as conn:
            # use conn
    """
    return TestDatabase()
