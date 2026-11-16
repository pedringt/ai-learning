"""DEC-023 item 6: run the Copy Context task-filter measurement on a throwaway SQLite database. No model calls.

    python -m eval.run_copy_context_benchmark
"""
from __future__ import annotations

import os
import tempfile

from database_migration_backed import initialize_db
from db import connect_sqlite
from eval import copy_context_benchmark as ccb
from eval import retrieval_benchmark as rb


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        connection = connect_sqlite(os.path.join(tmp, "copy_context.db"))
        initialize_db(connection)
        rb.build_fixture(connection)
        result = ccb.run(connection)
        connection.close()
    print(ccb.format_table(result))
    for name, v in result["variants"].items():
        missed = {r["case"]: r["missed"] for r in v["rows"] if r["missed"]}
        if missed:
            print(f"  {name} missed: {missed}")


if __name__ == "__main__":
    main()
