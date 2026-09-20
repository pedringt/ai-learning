# Backend runtime map (`state-project-complete/`)

One page for a new contributor: which files are the live runtime path, which are test-only, and the one canonical import path. Written for #138 (Sept 2026) from a reference/import audit; re-check with `grep` before trusting it after big refactors.

## The live runtime path

```
uvicorn api:app
  api.py                       composes the app (Baseline, analytics, Slack extensions)
    api_core.py                routes and the core Evidence/Review/Ask flows
      db.py / database_migration_backed.py   the one database abstraction (SQLite + Postgres) and migrations/
      interpretation_pipeline_integrated.py  process_evidence(): the interpretation pipeline
        interpretation_runtime.validation.interpretation_validation   schema validation
        interpretation_runtime.validation.provider_normalization      provider payload normalization
        interpretation_runtime.validation.semantic_validation         semantic checks + InterpretationContextSnapshot
      anthropic_provider.py / openai_provider.py                      real model providers
      ask_service.py, ask_provider.py, review_service.py, baseline_*.py, slack_*.py ...
```

**Canonical import path for the validation package:** `interpretation_runtime.validation.<module>` (a namespace package; no `sys.path` changes needed). Do not import it as bare `validation.*` and do not add `sys.path.insert(...)` for it. `test_backend_import_paths.py` enforces this.

## Test-only or fixture code (not on the runtime path)

| File | What it is | Used by |
|---|---|---|
| `fake_provider_integrated.py` | Fake provider for the migration-backed pipeline | `test_question_response_interpretation.py` |
| `interpretation_runtime/validation/fake_provider.py` | Golden-output fake provider for the validation package | `test_acceptance_workflow.py`, `interpretation_runtime/tests/` |
| `interpretation_runtime/validation/interpretation_pipeline.py` | The older standalone ("Phase 2") pipeline with its own SQLite schema. **Not used by the runtime**; kept because it is the fixture the package's own tests run against | `interpretation_runtime/tests/test_interpretation_pipeline.py` only |
| `interpretation_runtime/tests/` | The validation package's own unit tests. They import `validation.*` (bare) because pytest puts `interpretation_runtime/` on the path for them; that is intentional and separate from the runtime path | pytest |

"Phase 1" / "Phase 2" in older docstrings means: Phase 1 = the migration-backed schema the runtime uses (`interpretation_pipeline_integrated.py`), Phase 2 = the earlier standalone prototype (`interpretation_runtime/validation/interpretation_pipeline.py`). The names are historical and were left in place on purpose; renaming them broadly is risk without benefit.

## Removed in #138 (they were dead, verified before deleting)

- `fake_provider.py` (root): a byte-identical copy of `interpretation_runtime/validation/fake_provider.py`, and not importable (it used a relative import with no package). No importer, no doc or config reference.
- `db_wrapper.py`: defined a second `DatabaseConnection` wrapper referenced nowhere; the runtime uses `db.Connection`.
- The `sys.path.insert(... "interpretation_runtime")` compatibility shim in `interpretation_pipeline_integrated.py`, `anthropic_provider.py`, `openai_provider.py` and the tests that copied it. The runtime modules previously imported the package as `validation.*` while other code imported it as `interpretation_runtime.validation.*`, which made two distinct module objects for the same code.
