# State backend spike — StructuredInterpretation schema increment

This increment adds the application-owned `StructuredInterpretation` JSON Schema and a pure structural validator.

## Added files

- `state_spike/schemas/structured_interpretation.schema.json`
- `state_spike/interpretation_validation.py`
- `tests/test_interpretation_schema.py`
- `requirements-contract.txt`

## Boundary

`validate_schema(payload)` performs structural validation only. It intentionally has no database or interpretation-context access. Passing schema validation does **not** establish that referenced State/Review IDs exist, that references were supplied to the model, that versions match, or that the model interpreted Evidence correctly.

The next increment is the deterministic semantic validator.

## Run this increment

```bash
python -m unittest tests.test_interpretation_schema -v
```

Current result: 29 tests passing.
