"""#653: run the Ask retrieval benchmark on a throwaway SQLite database and print/save the results. No model calls.

    python -m eval.run_retrieval_benchmark [--out results.json]
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile

from database_migration_backed import initialize_db
from db import connect_sqlite
from eval import retrieval_benchmark as rb


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", help="write the full JSON result here")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        connection = connect_sqlite(os.path.join(tmp, "retrieval_benchmark.db"))
        initialize_db(connection)
        rb.build_fixture(connection)
        result = rb.run(connection)
        connection.close()
    print(rb.format_table(result))
    print("\nRecall vs context size, no windows, today's scoring with limits scaled:")
    for row in result["budget_sweep_no_windows"]:
        print(f"  x{row['limit_scale']:<4} recall {row['recall']}  mean chars {row['mean_context_chars']}")
    if args.out:
        with open(args.out, "w") as handle:
            json.dump(result, handle, indent=1, default=str)
        print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
