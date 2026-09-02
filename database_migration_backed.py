"""Database initialization and management for Phase 1 migration-backed schema.

This module loads and applies the Phase 1 migration files, providing a clean
interface for creating test databases with the full schema including Phase 2 extensions
(operation field, effective_date).

Migrations are applied in order:
  1. 001_initial.sql — Phase 1 base schema
  2. 002_add_operation_and_effective_date.sql — Phase 2 extensions
"""

from __future__ import annotations

from pathlib import Path

from db import Connection, connect_sqlite

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _get_migration_files() -> list[Path]:
    """Return migration files in order."""
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    expected = [MIGRATIONS_DIR / "001_initial.sql", MIGRATIONS_DIR / "002_add_operation_and_effective_date.sql"]
    if migrations != expected:
        raise RuntimeError(f"Migration files missing or out of order: {migrations} vs {expected}")
    return migrations


def _remove_sql_comments(sql: str) -> str:
    """Remove SQL comments (-- and /* */) from a SQL string."""
    lines = []
    in_block_comment = False
    
    for line in sql.split('\n'):
        # Handle block comments
        if '/*' in line:
            in_block_comment = True
        if '*/' in line:
            in_block_comment = False
            # Remove everything up to and including */
            line = line.split('*/', 1)[1] if '*/' in line else ''
        
        if in_block_comment:
            continue
        
        # Remove line comments
        if '--' in line:
            line = line.split('--', 1)[0]
        
        line = line.rstrip()
        if line:
            lines.append(line)
    
    return '\n'.join(lines)


def initialize_db(connection: Connection) -> None:
    """Apply all migrations in order, creating the full Phase 1+Phase 2 schema.

    Args:
        connection: Unified database connection (supports both SQLite and Postgres)

    Raises:
        RuntimeError: If migration files are missing or out of order
    """
    # Detect database type
    is_postgres = connection._is_postgres
    
    # Create schema_migrations table
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    connection.commit()
    
    # Get list of already-applied migrations
    rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    applied = {row["version"] if isinstance(row, dict) else row[0] for row in rows}
    
    # Apply each migration in order
    for migration_file in _get_migration_files():
        if migration_file.stem in applied:
            continue
        sql = migration_file.read_text(encoding="utf-8")
        # Remove comments before splitting
        sql = _remove_sql_comments(sql)
        # Split by semicolon and execute each statement
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement:
                # Convert SQL if using Postgres
                if is_postgres:
                    from db import Connection as DBConnection
                    statement = DBConnection._convert_sql(statement, is_postgres=True)
                connection.execute(statement)
        connection.commit()
        # Record migration as applied
        connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", (migration_file.stem,))
        connection.commit()


class TestDatabase:
    """Context manager for test database with full schema."""

    def __enter__(self) -> Connection:
        self.connection = connect_sqlite(":memory:")
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
