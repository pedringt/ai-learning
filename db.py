"""Unified database abstraction for SQLite and PostgreSQL.

This module provides a single Connection interface that wraps both sqlite3
and psycopg2, handling differences in:
  - Parameter syntax (? vs %s)
  - Row factory / result format (Row vs dict)
  - Transaction control (BEGIN IMMEDIATE vs connection methods)
  - SQLite-specific SQL (INSERT OR IGNORE vs ON CONFLICT)
"""

from __future__ import annotations

import sqlite3
from typing import Any, Protocol, Sequence, Iterator


class Row(dict):
    """Mapping row with sqlite3.Row-compatible numeric indexing."""
    
    def __getitem__(self, key):
        if isinstance(key, int):
            values = tuple(self.values())
            try:
                return values[key]
            except IndexError:
                raise IndexError(key) from None
        return super().__getitem__(key)
    
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


class Cursor(Protocol):
    """Protocol for cursor-like objects."""
    
    def execute(self, query: str, params: Sequence = None) -> Cursor: ...
    def fetchone(self) -> dict | None: ...
    def fetchall(self) -> list[dict]: ...
    def close(self) -> None: ...


class Connection:
    """Unified database connection wrapping sqlite3 or psycopg2."""
    
    def __init__(self, raw_connection: Any):
        self._conn = raw_connection
        self._is_postgres = self._detect_postgres(raw_connection)
        self._in_transaction = False
        self._row_factory = None
    
    @staticmethod
    def _detect_postgres(conn: Any) -> bool:
        """Detect if this is a psycopg2 connection."""
        return hasattr(conn, 'get_dsn_parameters')
    
    @property
    def row_factory(self):
        """Get current row factory."""
        return self._row_factory
    
    @row_factory.setter
    def row_factory(self, factory):
        """Accept legacy row-factory assignments without breaking unified rows.

        Callers historically set sqlite3.Row, None, or the compatibility Row
        type.  The abstraction always exposes mapping rows, so SQLite must keep
        sqlite3.Row underneath regardless of those legacy assignments.
        """
        self._row_factory = factory
        if not self._is_postgres:
            self._conn.row_factory = sqlite3.Row
    
    def cursor(self) -> Cursor:
        """Get a new cursor."""
        if not self._is_postgres:
            # sqlite3 copies connection.row_factory when the cursor is created.
            # Set it first so every cursor yields sqlite3.Row objects.
            self._conn.row_factory = sqlite3.Row
        if self._is_postgres:
            import psycopg2.extras
            return self._wrap_psycopg2_cursor(
                self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            )
        else:
            return self._wrap_sqlite3_cursor(self._conn.cursor())
    
    def execute(self, query: str, params: Sequence | None = None) -> Cursor:
        """Execute query directly on connection (mimics sqlite3.Connection.execute)."""
        cursor = self.cursor()
        cursor.execute(query, params or ())
        return cursor
    
    def commit(self) -> None:
        """Commit the current transaction."""
        self._conn.commit()
        self._in_transaction = False
    
    def rollback(self) -> None:
        """Rollback the current transaction."""
        self._conn.rollback()
        self._in_transaction = False
    
    def close(self) -> None:
        """Close the connection."""
        self._conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    
    def __getattr__(self, name):
        """Delegate unknown attributes to the underlying connection."""
        return getattr(self._conn, name)
    
    @staticmethod
    def _convert_sql(query: str, is_postgres: bool) -> str:
        """Convert SQL syntax between SQLite and Postgres."""
        # Transaction control statements: pass through unchanged
        query_upper = query.strip().upper()
        if query_upper in ("BEGIN", "BEGIN IMMEDIATE", "COMMIT", "ROLLBACK", "COMMIT TRANSACTION", "ROLLBACK TRANSACTION"):
            # Postgres doesn't support IMMEDIATE, but it's harmless to ignore
            if is_postgres:
                return query.replace("BEGIN IMMEDIATE", "BEGIN").strip()
            return query
        
        if is_postgres:
            # Convert SQLite ? to Postgres %s
            # Be careful not to replace ? inside strings
            converted = ""
            in_string = False
            quote_char = None
            i = 0
            while i < len(query):
                char = query[i]
                
                # Track string boundaries
                if char in ('"', "'") and (i == 0 or query[i-1] != '\\'):
                    if not in_string:
                        in_string = True
                        quote_char = char
                    elif char == quote_char:
                        in_string = False
                        quote_char = None
                
                # Replace ? only outside strings
                if char == '?' and not in_string:
                    converted += '%s'
                else:
                    converted += char
                
                i += 1
            
            query = converted
            
            # Convert INSERT OR IGNORE to INSERT ... ON CONFLICT DO NOTHING
            # Postgres uses ON CONFLICT instead of OR IGNORE
            if "INSERT OR IGNORE" in query.upper():
                # Find the end of the VALUES clause
                query_upper = query.upper()
                insert_or_idx = query_upper.find("INSERT OR IGNORE")
                values_idx = query_upper.find("VALUES", insert_or_idx)
                
                if values_idx > 0:
                    # Find the closing ) after VALUES
                    paren_count = 0
                    closing_idx = values_idx + len("VALUES")
                    in_str = False
                    str_char = None
                    
                    for i in range(closing_idx, len(query)):
                        if query[i] in ('"', "'") and (i == 0 or query[i-1] != '\\'):
                            if not in_str:
                                in_str = True
                                str_char = query[i]
                            elif query[i] == str_char:
                                in_str = False
                        elif not in_str:
                            if query[i] == '(':
                                paren_count += 1
                            elif query[i] == ')':
                                paren_count -= 1
                                if paren_count == 0:
                                    closing_idx = i + 1
                                    break
                    
                    # Replace INSERT OR IGNORE with INSERT and add ON CONFLICT
                    before = query[:insert_or_idx]
                    after = query[closing_idx:].lstrip()
                    query = before + "INSERT" + query[insert_or_idx + len("INSERT OR IGNORE"):closing_idx]
                    
                    if not after.upper().startswith("ON CONFLICT"):
                        query = query.rstrip() + " ON CONFLICT DO NOTHING"
                    else:
                        query = query.rstrip() + " " + after
            
            return query
        else:
            # SQLite-specific conversions
            query = query.replace("%s", "?")
            return query
    
    def _wrap_sqlite3_cursor(self, cursor: sqlite3.Cursor) -> Cursor:
        """Wrap sqlite3 cursor to return dicts."""
        class SQLite3CursorWrapper:
            def __init__(self, inner_cursor):
                self.inner = inner_cursor
            
            def execute(self, query: str, params: Sequence = None):
                # Execute as-is (sqlite3 uses ? natively)
                self.inner.execute(query, params or ())
                return self
            
            def fetchone(self):
                row = self.inner.fetchone()
                if row is None:
                    return None
                return Row(dict(row)) if row else None
            
            def fetchall(self):
                rows = self.inner.fetchall()
                return [Row(dict(row)) if row else None for row in rows]
            
            def close(self):
                self.inner.close()
            
            def __iter__(self):
                return iter(self.inner)
        
        return SQLite3CursorWrapper(cursor)
    
    def _wrap_psycopg2_cursor(self, cursor: Any) -> Cursor:
        """Wrap psycopg2 cursor (already returns dicts with RealDictCursor)."""
        class Psycopg2CursorWrapper:
            def __init__(self, inner_cursor):
                self.inner = inner_cursor
            
            def execute(self, query: str, params: Sequence = None):
                # Convert SQLite syntax to Postgres
                converted_query = Connection._convert_sql(query, is_postgres=True)
                self.inner.execute(converted_query, params or ())
                return self
            
            def fetchone(self):
                row = self.inner.fetchone()
                if row is None:
                    return None
                return Row(dict(row)) if row else None
            
            def fetchall(self):
                rows = self.inner.fetchall()
                return [Row(dict(row)) if row else None for row in rows]
            
            def close(self):
                self.inner.close()
            
            def __iter__(self):
                return iter(self.inner)
        
        return Psycopg2CursorWrapper(cursor)


def connect_sqlite(path: str = ":memory:") -> Connection:
    """Connect to SQLite database."""
    raw_conn = sqlite3.connect(path)
    raw_conn.row_factory = sqlite3.Row
    return Connection(raw_conn)


def connect_postgres(database_url: str) -> Connection:
    """Connect to PostgreSQL database."""
    import psycopg2
    raw_conn = psycopg2.connect(database_url)
    return Connection(raw_conn)


def connect(database_url: str | None = None) -> Connection:
    """Connect to database (auto-detect SQLite vs Postgres from URL)."""
    if database_url is None or database_url.startswith("sqlite://") or database_url == ":memory:":
        # SQLite
        path = database_url.replace("sqlite://", "") if database_url else ":memory:"
        return connect_sqlite(path)
    else:
        # Assume Postgres
        return connect_postgres(database_url)
