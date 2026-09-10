"""Migration 009: extend Review enums without losing existing linked records."""
from __future__ import annotations


def extend_review_constraints(connection) -> None:
    """Called inside migration 009's transaction; SQLite FK checks are off.

    SQLite cannot ALTER a CHECK constraint. Rebuild only review_issues, keeping
    the final table name and all columns/indexes/triggers. Never rename the old
    table: SQLite would retarget the referencing tables to that temporary name.
    """
    if connection.is_postgres:
        connection.execute("ALTER TABLE review_issues DROP CONSTRAINT review_issues_review_type_check")
        connection.execute("ALTER TABLE review_issues ADD CONSTRAINT review_issues_review_type_check "
                           "CHECK (review_type IN ('proposed_update','state_at_risk','missing_understanding','open_question'))")
        connection.execute("ALTER TABLE review_issues DROP CONSTRAINT review_issues_resolution_check")
        connection.execute("ALTER TABLE review_issues ADD CONSTRAINT review_issues_resolution_check CHECK "
                           "(resolution IS NULL OR resolution IN ('updated','partially_applied','not_applied',"
                           "'confirmed_current','not_needed','question_created','question_linked'))")
        return
    row = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='review_issues'").fetchone()
    original = row['sql']
    if "'open_question'" in original:
        raise RuntimeError('Unexpected partially applied Review constraint migration')
    widened = original.replace("'missing_understanding'", "'missing_understanding', 'open_question'")
    widened = widened.replace("'not_needed'", "'not_needed', 'question_created', 'question_linked'")
    if widened == original or "'question_created'" not in widened:
        raise RuntimeError('Review schema does not match migration 009 preconditions')
    # sqlite_master stores CREATE TABLE with no IF NOT EXISTS in this schema.
    prefix, rest = widened.split('(', 1)
    if 'review_issues' not in prefix:
        raise RuntimeError('Unexpected Review table definition')
    objects = connection.execute(
        "SELECT sql FROM sqlite_master WHERE tbl_name='review_issues' "
        "AND type IN ('index','trigger') AND sql IS NOT NULL"
    ).fetchall()
    columns = [r['name'] for r in connection.execute('PRAGMA table_info(review_issues)').fetchall()]
    names = ', '.join('"' + name.replace('"', '""') + '"' for name in columns)
    connection.execute('CREATE TABLE review_issues_next (' + rest)
    connection.execute(f'INSERT INTO review_issues_next ({names}) SELECT {names} FROM review_issues')
    connection.execute('DROP TABLE review_issues')
    connection.execute('ALTER TABLE review_issues_next RENAME TO review_issues')
    for obj in objects:
        connection.execute(obj['sql'])
