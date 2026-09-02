# State backend spike — semantic validation increment

This increment adds deterministic semantic validation on top of the application-owned `StructuredInterpretation` JSON Schema.

## Added

- `state_spike/semantic_validation.py`
- `tests/test_semantic_validation.py`
- `semantic_test_output.txt`

The previous schema increment remains unchanged except that semantic validation imports and reuses `validate_schema()` defensively.

## Authority snapshot

`InterpretationContextSnapshot` is captured once before provider invocation. It represents the exact State IDs, State versions, and open Review records supplied to that model attempt. Semantic validation uses that same snapshot after the provider returns; it does not silently replace it with newly fetched interpretation context.

`ApplicationStateSnapshot` supplies the minimal persisted facts needed to verify that referenced objects still exist and that an existing Review is still open.

## Deterministic checks

The validator rejects the whole interpretation when any recommendation violates one of these rules:

- affected State IDs exist;
- affected State IDs were present in the captured interpretation context;
- update/retire proposal targets exist;
- proposal targets were present in the captured context;
- update/retire targets are also listed in `affected_state_item_ids`;
- proposal `expected_version` equals the version supplied to the model;
- one recommendation cannot target the same existing State item twice;
- `update_existing` Review IDs exist;
- referenced Reviews are still open;
- referenced Reviews were supplied to the model;
- Review type matches the referenced Review;
- Missing Understanding proposals remain create-only;
- model output cannot claim human Review resolution fields.

`affected_state_item_ids` is intentionally broader than proposal targets. It may include State that is changed, confirmed as still accurate, or placed at risk.

## Version nuance

A proposal is validated against the State version in the captured interpretation context, because that is what the model actually saw. If persisted State advances after interpretation, that does not retroactively make the interpretation malformed. The existing acceptance transaction's stale-proposal/version guard remains responsible for blocking a later stale State mutation.

## Atomicity

Semantic validation returns successfully only after the entire payload has been checked. Callers must persist zero downstream Review/proposal records when any semantic error is raised.

## Not proved by this validator

Passing semantic validation does not mean the model interpreted Evidence correctly. Consequentiality, supported conclusions, grouping quality, and effective-date grounding remain interpretation/evaluation questions.

## Tests

Run:

```bash
python -m unittest tests.test_interpretation_schema tests.test_semantic_validation -v
```

Current result: **48 tests passing** (29 structural + 19 semantic).

The original eight persistence/transaction tests are documented by the handoff as previously passing, but they are not included in this reconstructed increment and are not claimed as freshly executed here.

## Next increment

Add Interpretation Record persistence behavior and the fake provider, then prove the deterministic path:

```text
Evidence
→ captured context snapshot
→ fake provider
→ schema validation
→ semantic validation
→ Interpretation Record
→ Review/proposal persistence
```

No live model provider should be connected yet.
