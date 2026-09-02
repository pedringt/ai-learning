# State backend spike — Interpretation persistence + fake provider increment

This increment proves the deterministic LLM boundary without a live model.

## Added

- `state_spike/interpretation_pipeline.py`
- `state_spike/fake_provider.py`
- `tests/test_interpretation_pipeline.py`
- `increment04_test_output.txt`

## Proven path

```text
Evidence already preserved
→ capture exact State/open-Review context snapshot
→ fake provider
→ application-owned JSON Schema validation
→ semantic validation
→ successful or failed Interpretation Record
→ Review / affected-State links / proposals (success only)
```

A successful interpretation never mutates Current State or History. Human acceptance remains a separate downstream authority boundary.

## Failure behavior

Structural, semantic, and provider failures preserve Evidence and create a failed Interpretation Record with a safe error code. They create zero Reviews and zero proposals. A retry creates a new Interpretation Record rather than overwriting the failed attempt.

The whole successful downstream persistence step uses one explicit SQLite transaction. A multi-Review interpretation is therefore all-or-nothing at persistence as well as validation.

## Fake provider

The fake provider returns hand-authored outputs for all four golden scenarios. It deliberately emits no proposal for `state_at_risk`. It does not emit `effective_date` for the launch scenario because the Evidence says “October 15” but does not itself establish a complete ISO calendar date/year; the fake must not invent one.

## Tests

Run:

```bash
python -m unittest tests.test_interpretation_schema tests.test_semantic_validation tests.test_interpretation_pipeline -v
```

Current result: **57 tests passing**:

- 29 structural contract tests
- 19 semantic validation tests
- 9 Interpretation persistence / fake-provider pipeline tests

The original eight SQLite persistence/acceptance tests remain documented as previously passing, but are not present in this reconstructed workspace and are not claimed as freshly executed here.

## Architectural limitation of this increment

`create_pipeline_schema()` is a deliberately isolated executable schema for the reconstructed Phase 2 workspace. It is not a replacement migration for the original backend spike. Before integration, these persistence functions should be adapted to the original migration-backed tables rather than introducing a second schema path.

## Next increment

Reconnect this deterministic interpretation pipeline to the original migration-backed spike (when those exact source bytes are available), then prove the full path through human proposal acceptance and atomic History/Current State transition. Only after that integration passes should live Anthropic/OpenAI adapters be added.
