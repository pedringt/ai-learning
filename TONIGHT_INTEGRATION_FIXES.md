# Tonight's integration checkpoint

## Fixed

- Live Evidence-created Reviews now render the real backend Review fields instead of `Pending` / `Review` / `?` placeholders.
- Accepting or keeping a live Review now resolves it through `/api/reviews/{review_id}/resolve`.
- Accepted backend Current State is synchronized into the Project view, including newly created State items.
- Retired backend State is removed from the active Project view when its Review is accepted.
- Working Notes sent to Review now use the backend Evidence -> Review path instead of creating local fake Reviews.
- Open Question answers now go through the backend Evidence -> Review path. A question only resolves after an accepted Review actually contains a State proposal.
- Evidence source type is included in the Review read model so question-to-review linkage survives a refresh.
- On startup, the frontend rehydrates backend Current State and open Reviews; resolved question-answer Reviews restore the question's resolved status.
- The analysis modal cannot be dismissed by backdrop click, Escape, or the X while a provider request is active.
- Added a lightweight analysis animation and clearer progress copy.
- Removed the redundant Close button from the Open Question modal; the X remains the normal dismissal control.
- Project and Notes now have more distinct visual treatment: Project reads as maintained Current State; Notes reads as an evidence/work stream.
- Preserved the previous provider/schema fixes, including strict `effective_date` guidance and conditional `grouping_reason` behavior.

## Verification

- `pytest -q`: 86 passed, 3 skipped, 7 subtests passed.
- `node state-ask-behavior-tests.js`: 78 passed, 0 failed.
- `python note_matrix_harness.py`: 17/17 passed.
- `node --check context-app.js`: passed.

## Still requires production smoke test after deploy

The local tests use deterministic providers. After deploying this checkpoint, submit one real Claude note, inspect its Review, accept it, confirm Project changes, refresh the page, and confirm the State/Review/question status survives refresh.
