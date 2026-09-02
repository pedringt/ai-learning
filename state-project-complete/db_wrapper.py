"""Database abstraction wrapper for both SQLite and Postgres.

Provides a unified interface so code can work with both sqlite3.Connection
and psycopg2 connections without change.
"""

from __future__ import annotations

import sqlite3


class DatabaseConnection:
    """Wrapper providing unified interface for sqlite3 and psycopg2 connections."""
    
    def __init__(self, connection):
        self._conn = connection
        self._is_postgres = hasattr(connection, 'cursor')  # psycopg2 connections have .cursor(); sqlite3 does too, but we check for get_dsn_parameters
        self._is_postgres = hasattr(connection, 'get_dsn_parameters')
        self._cursor = None
        if self._is_postgres:
            import psycopg2.extras
            self._cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            connection.row_factory = sqlite3.Row
    
    def execute(self, query: str, params=None):
        """Execute query, returning cursor with results."""
        # Convert placeholders
        if self._is_postgres and params:
            # Convert ? to %s for Postgres
            query = query.replace("?", "%s")
            # Convert INSERT OR IGNORE to Postgres syntax
            query = query.replace("INSERT OR IGNORE", "INSERT")
            query = query.replace("ON CONFLICT DO NOTHING", "")
            if "INSERT" in query and "ON CONFLICT" not in query:
                query += " ON CONFLICT DO NOTHING"
        
        if self._is_postgres:
            self._cursor.execute(query, params or ())
        else:
            self._conn.execute(query, params or ())
        
        return self._cursor if self._is_postgres else self._conn
    
    def commit(self):
        """Commit transaction."""
        self._conn.commit()
    
    def close(self):
        """Close connection."""
        if self._cursor:
            self._cursor.close()
        self._conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()
