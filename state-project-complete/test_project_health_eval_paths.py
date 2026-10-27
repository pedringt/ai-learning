"""Project Health's stale-eval check must watch every module the controlled evals run (Oct 27).

Project Health calls State's eval scores current when no watched file changed after the latest run. Its list
(`evalBehaviorPaths` and `evalContractPaths` in project-health-model.js) once held three files, so #566's change to
ask_authority_text.py went unnoticed. This test traces the eval harness's imports, stopping at infrastructure, and fails
when a module the evals run is not watched.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL_JS = HERE.parent / "project-health-model.js"
PREFIX = "state-project-complete/"

# Where the harness enters State's behavior (eval/quality_harness.py and eval/run_quality_evals.py import these).
ENTRY_POINTS = (
    "eval/quality_harness.py", "eval/ask_grader.py", "interpretation_trace.py", "question_review_service.py",
    "ask_provider.py", "ask_service.py", "anthropic_provider.py",
)
# Infrastructure the trace does not follow: storage, routing and local env loading do not shape model behavior.
STOP = {"db.py", "database_migration_backed.py", "api.py", "api_core.py", "eval/env.py"}
# Imported by behavior modules but deliberately unwatched: the spend cap decides whether a call happens, not what it says.
NOT_BEHAVIOR = {"spend_guard.py"}


def _module_path(name: str) -> str | None:
    path = HERE.joinpath(*name.split("."))
    if path.with_suffix(".py").exists():
        return str(path.with_suffix(".py").relative_to(HERE))
    if (path / "__init__.py").exists():
        return str((path / "__init__.py").relative_to(HERE))
    return None


def _traced_modules() -> set[str]:
    seen: set[str] = set()
    stack = list(ENTRY_POINTS)
    while stack:
        current = stack.pop()
        if current in seen or current in STOP:
            continue
        seen.add(current)
        for node in ast.walk(ast.parse((HERE / current).read_text())):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
            for name in names:
                found = _module_path(name)
                if found and found not in seen:
                    stack.append(found)
    return seen - NOT_BEHAVIOR


def _watched(key: str) -> list[str]:
    match = re.search(key + r":\[([^\]]*)\]", MODEL_JS.read_text())
    assert match, f"{key} not found in project-health-model.js"
    return [item[len(PREFIX):] for item in re.findall(r"'([^']+)'", match.group(1))]


def _covered(module: str, watched: list[str]) -> bool:
    return any(module == path or module.startswith(path.rstrip("/") + "/") for path in watched)


def test_every_module_the_evals_run_is_watched():
    watched = _watched("evalBehaviorPaths") + _watched("evalContractPaths")
    missing = sorted(module for module in _traced_modules() if not _covered(module, watched))
    assert not missing, f"Add to evalBehaviorPaths or evalContractPaths in project-health-model.js: {missing}"


def test_watched_paths_exist_and_stay_off_infrastructure():
    for path in _watched("evalBehaviorPaths") + _watched("evalContractPaths"):
        assert (HERE / path).exists(), f"watched path does not exist: {path}"
        assert path not in STOP | NOT_BEHAVIOR, f"infrastructure would make every unrelated commit mark evals stale: {path}"


def test_the_566_file_is_watched():
    assert "ask_authority_text.py" in _watched("evalBehaviorPaths")
