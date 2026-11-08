"""#623: every broad catch in runtime code must be deliberate.

A bare ``except:`` or ``except Exception`` / ``except BaseException`` line in runtime code fails this test unless
it carries a trailing ``# broad on purpose: <reason>`` comment. Prefer narrowing the catch to the exceptions the
code expects. Keep it broad only for a real safety net (request handler, background task, best-effort telemetry,
rollback-then-re-raise), log with context, and on Postgres roll back before reusing the connection (CLAUDE.md).

Tests, eval/, qa_* scripts and the two local test harnesses are out of scope.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MARKER = "# broad on purpose:"
BROAD = re.compile(r"^\s*except\s*(?::|\(?\s*(?:Base)?Exception\b)")
EXCLUDED_FILES = {"conftest.py", "api_test_harness.py", "note_matrix_harness.py"}
EXCLUDED_DIRS = {"eval", "tests", "__pycache__", "node_modules", "venv", "site-packages"}


def _runtime_files() -> list[Path]:
    files = []
    for path in ROOT.rglob("*.py"):
        parts = path.relative_to(ROOT).parts
        if any(part in EXCLUDED_DIRS or part.startswith(".") for part in parts[:-1]):
            continue
        name = path.name
        if name.startswith(("test_", "qa_")) or name in EXCLUDED_FILES:
            continue
        files.append(path)
    return files


def unmarked_broad_excepts() -> list[str]:
    found = []
    for path in _runtime_files():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if BROAD.match(line) and MARKER not in line:
                found.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    return found


def test_runtime_code_has_no_unmarked_broad_except():
    found = unmarked_broad_excepts()
    assert not found, (
        "Broad except without a '# broad on purpose: <reason>' comment (narrow it, or mark it and log):\n"
        + "\n".join(found)
    )


def test_pattern_catches_the_forms_it_guards():
    for line in ("except:", "    except Exception:", "except Exception as exc:", "except (Exception, ValueError):",
                 "except BaseException:"):
        assert BROAD.match(line), line
    for line in ("except ValueError:", "except ExceptionGroup:", "except json.JSONDecodeError as exc:"):
        assert not BROAD.match(line), line
