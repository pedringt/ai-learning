"""Migration 020 (#136): a project area's identity is (project_id, id), not a global id.

`project_areas.id` was a global primary key (migration 012) and `current_state_items.area_id` referenced
it, so two projects could not both have an area called `budget`. After this step the primary key is
`(project_id, id)` and a fact's area reference is `(project_id, area_id)`, so an area id only has to be
unique inside its project and a fact can only be filed under an area of its own project.

Called inside migration 020's transaction, after its SQL (which clears any area reference that does not
point at an area of the fact's own project). On SQLite the caller turns foreign-key checks off around the
transaction and runs `PRAGMA foreign_key_check` before committing, as for migration 009.

Re-running it on a migrated schema is a no-op: each half checks the live schema first. The step never
catches a database error, so on Postgres a failure aborts the whole migration transaction cleanly.
"""
from __future__ import annotations

import re

SCOPED_AREA_KEY = ["project_id", "id"]
SCOPED_AREA_REFERENCE = ["project_id", "area_id"]
AREA_FOREIGN_KEY = "current_state_items_area_fkey"

_GLOBAL_AREA_KEY = re.compile(r"\bid\s+TEXT\s+PRIMARY\s+KEY\b", re.IGNORECASE)
_GLOBAL_AREA_REFERENCE = re.compile(
    r"\barea_id\s+TEXT\s+REFERENCES\s+\"?project_areas\"?\s*\(\s*id\s*\)", re.IGNORECASE
)


def scope_project_area_keys(connection) -> None:
    if connection.is_postgres:
        _scope_postgres(connection)
    else:
        _scope_sqlite(connection)


# --- SQLite: rebuild both tables (SQLite cannot alter a primary or foreign key in place) -------------


def sqlite_area_key(connection) -> list[str]:
    rows = connection.execute("PRAGMA table_info(project_areas)").fetchall()
    return [r["name"] for r in sorted((r for r in rows if r["pk"]), key=lambda r: r["pk"])]


def sqlite_area_references(connection) -> list[list[str]]:
    """Column lists of every foreign key from current_state_items to project_areas."""
    groups: dict[int, list] = {}
    for row in connection.execute("PRAGMA foreign_key_list(current_state_items)").fetchall():
        if row["table"] == "project_areas":
            groups.setdefault(row["id"], []).append(row)
    return [[r["from"] for r in sorted(rows, key=lambda r: r["seq"])] for rows in groups.values()]


def _scope_sqlite(connection) -> None:
    if sqlite_area_key(connection) != SCOPED_AREA_KEY:
        _rebuild_sqlite_table(connection, "project_areas", _GLOBAL_AREA_KEY, "id TEXT NOT NULL",
                              "PRIMARY KEY (project_id, id)")
    if sqlite_area_references(connection) != [SCOPED_AREA_REFERENCE]:
        _rebuild_sqlite_table(connection, "current_state_items", _GLOBAL_AREA_REFERENCE, "area_id TEXT",
                              "FOREIGN KEY (project_id, area_id) REFERENCES project_areas(project_id, id)")


def _rebuild_sqlite_table(connection, table: str, old_column: re.Pattern, new_column: str, table_constraint: str) -> None:
    """Rebuild one table with a changed key, keeping its name, columns, rows, indexes and triggers.

    The same shape as migration 009: create the new table, copy, drop the old one, rename the new one.
    Never rename the old table, or SQLite would retarget the tables that reference it.
    """
    row = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    if row is None:
        raise RuntimeError(f"Migration 020: table {table} is missing")
    original = row["sql"].rstrip()
    changed, count = old_column.subn(new_column, original)
    if count != 1 or not changed.endswith(")"):
        raise RuntimeError(f"Migration 020: {table} does not match the expected pre-#136 definition")
    columns = [r["name"] for r in connection.execute(f"PRAGMA table_info({table})").fetchall()]
    if "project_id" not in columns:
        raise RuntimeError(f"Migration 020: {table} has no project_id column (migration 013 missing?)")
    _prefix, body = changed.split("(", 1)
    body = body[:-1].rstrip() + ",\n    " + table_constraint + "\n)"
    objects = connection.execute(
        "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
        (table,),
    ).fetchall()
    names = ", ".join('"' + name.replace('"', '""') + '"' for name in columns)
    connection.execute(f"CREATE TABLE {table}_next (" + body)
    connection.execute(f"INSERT INTO {table}_next ({names}) SELECT {names} FROM {table}")
    connection.execute(f"DROP TABLE {table}")
    connection.execute(f"ALTER TABLE {table}_next RENAME TO {table}")
    for obj in objects:
        connection.execute(obj["sql"])


# --- Postgres: swap the constraints in place ---------------------------------------------------------

_CONSTRAINT_COLUMNS = (
    "SELECT c.conname AS name, "
    "(SELECT string_agg(a.attname, ',' ORDER BY k.ord) "
    " FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) "
    " JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns "
    "FROM pg_constraint c "
)


def postgres_area_key(connection) -> list[dict]:
    return connection.execute(
        _CONSTRAINT_COLUMNS + "WHERE c.conrelid = 'project_areas'::regclass AND c.contype = 'p'"
    ).fetchall()


def postgres_area_references(connection) -> list[dict]:
    return connection.execute(
        _CONSTRAINT_COLUMNS + "WHERE c.conrelid = 'current_state_items'::regclass "
        "AND c.confrelid = 'project_areas'::regclass AND c.contype = 'f' ORDER BY c.conname"
    ).fetchall()


def _scope_postgres(connection) -> None:
    references = postgres_area_references(connection)
    key = postgres_area_key(connection)
    key_is_scoped = [k["columns"] for k in key] == [",".join(SCOPED_AREA_KEY)]
    references_are_scoped = [r["columns"] for r in references] == [",".join(SCOPED_AREA_REFERENCE)]
    if key_is_scoped and references_are_scoped:
        return
    # A foreign key depends on the primary key it references, so drop the references first.
    for reference in references:
        connection.execute(f'ALTER TABLE current_state_items DROP CONSTRAINT "{reference["name"]}"')
    if not key_is_scoped:
        for constraint in key:
            connection.execute(f'ALTER TABLE project_areas DROP CONSTRAINT "{constraint["name"]}"')
        connection.execute("ALTER TABLE project_areas ADD CONSTRAINT project_areas_pkey PRIMARY KEY (project_id, id)")
    connection.execute(
        f"ALTER TABLE current_state_items ADD CONSTRAINT {AREA_FOREIGN_KEY} "
        "FOREIGN KEY (project_id, area_id) REFERENCES project_areas(project_id, id)"
    )
