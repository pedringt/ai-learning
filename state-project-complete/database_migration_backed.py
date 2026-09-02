"""Database initialization for the migration-backed State schema."""

from __future__ import annotations

from pathlib import Path

from db import Connection, connect_sqlite

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_EXPECTED_MIGRATIONS = ("001_initial.sql", "002_add_operation_and_effective_date.sql")


def _get_migration_files() -> list[Path]:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if tuple(path.name for path in migrations) != _EXPECTED_MIGRATIONS:
        raise RuntimeError(
            f"Migration files missing or out of order: {[p.name for p in migrations]} "
            f"vs {list(_EXPECTED_MIGRATIONS)}"
        )
    return migrations


def _remove_sql_comments(sql: str) -> str:
    """Remove comments from these simple migration files before splitting."""
    lines: list[str] = []
    in_block_comment = False
    for line in sql.splitlines():
        if in_block_comment:
            if "*/" in line:
                in_block_comment = False
                line = line.split("*/", 1)[1]
            else:
                continue
        while "/*" in line:
            before, after = line.split("/*", 1)
            if "*/" in after:
                after = after.split("*/", 1)[1]
                line = before + after
            else:
                line = before
                in_block_comment = True
                break
        if "--" in line:
            line = line.split("--", 1)[0]
        if line.strip():
            lines.append(line.rstrip())
    return "\n".join(lines)


def _migration_statements(path: Path) -> list[str]:
    sql = _remove_sql_comments(path.read_text(encoding="utf-8"))
    return [statement.strip() for statement in sql.split(";") if statement.strip()]


def _install_evidence_immutability(connection: Connection) -> None:
    """Protect immutable Evidence fields while allowing processing_status updates."""
    if connection.is_postgres:
        connection.execute(
            """
            CREATE OR REPLACE FUNCTION state_protect_evidence_core() RETURNS trigger AS $$
            BEGIN
                IF NEW.id IS DISTINCT FROM OLD.id
                   OR NEW.content IS DISTINCT FROM OLD.content
                   OR NEW.source_type IS DISTINCT FROM OLD.source_type
                   OR NEW.supersedes_evidence_id IS DISTINCT FROM OLD.supersedes_evidence_id
                   OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
                    RAISE EXCEPTION 'Evidence core fields are immutable';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """
        )
        connection.execute("DROP TRIGGER IF EXISTS evidence_core_immutable ON evidence")
        connection.execute(
            "CREATE TRIGGER evidence_core_immutable BEFORE UPDATE ON evidence "
            "FOR EACH ROW EXECUTE FUNCTION state_protect_evidence_core()"
        )
    else:
        connection.execute("DROP TRIGGER IF EXISTS evidence_core_immutable")
        connection.execute(
            """
            CREATE TRIGGER evidence_core_immutable
            BEFORE UPDATE ON evidence
            FOR EACH ROW
            WHEN NEW.id IS NOT OLD.id
              OR NEW.content IS NOT OLD.content
              OR NEW.source_type IS NOT OLD.source_type
              OR NEW.supersedes_evidence_id IS NOT OLD.supersedes_evidence_id
              OR NEW.submitted_at IS NOT OLD.submitted_at
            BEGIN
              SELECT RAISE(ABORT, 'Evidence core fields are immutable');
            END
            """
        )


def initialize_db(connection: Connection) -> None:
    """Apply every migration atomically and install database invariants."""
    if not isinstance(connection, Connection):
        connection = Connection(connection)
        if not connection.is_postgres:
            connection.execute("PRAGMA foreign_keys = ON")

    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    connection.commit()

    rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    applied = {row["version"] for row in rows}
    # A SELECT opens a transaction in psycopg2; close it before our explicit
    # migration transaction so BEGIN has identical semantics on both backends.
    connection.commit()

    for migration_file in _get_migration_files():
        version = migration_file.stem
        if version in applied:
            continue
        connection.execute("BEGIN IMMEDIATE")
        try:
            for statement in _migration_statements(migration_file):
                connection.execute(statement)
            connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise

    # Install/refresh invariants outside numbered migrations so existing
    # databases receive the protection on their next startup too.
    connection.execute("BEGIN IMMEDIATE")
    try:
        _install_evidence_immutability(connection)
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise


class TestDatabase:
    def __enter__(self) -> Connection:
        self.connection = connect_sqlite(":memory:")
        initialize_db(self.connection)
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.connection.close()


def get_test_db() -> TestDatabase:
    return TestDatabase()
