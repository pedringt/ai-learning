# Question Review: deployed staging walkthrough

Completed September 10, 2026 Pacific time (September 11 UTC). Staging only.

## Verified environment and result

**PASS: all eight checks in the completed walkthrough.**

- Verified source: `8ce2c7a0d6da633b7961f58c066ef8eaf21904d7`.
- Successful run: https://github.com/pedringt/ai-learning/actions/runs/34544596269
- Artifact: `question-review-live`, ID `10178580693`, with `report.json` and desktop/mobile/Ask screenshots. Artifact retention is seven days.
- Render reported build `5c1f2bc51e25`. Git diff confirmed no backend source skew from the tested checkout.
- The four deployed frontend files involved in the feature matched the checked-out source byte for byte.
- Real deployed frontend, real staging API/database, and live interpretation/Ask provider calls. No mock model or local TestClient transport was used for this walkthrough.
- `main` stayed at `3f87909afd6391544d0c267c0bd50d2f2544bc8d`.

## Results

| Check | Result |
| --- | --- |
| Frontend/backend revision verification | Passed |
| Reported rubber-stamp review concern -> Review -> human-approved Question, then Ask refresh and reload | Passed |
| Routine acknowledgement produces no Review or Question | Passed |
| Definite training approval proposes a State change instead of being downgraded to an unknown | Passed |
| Dismiss suggestion leaves Questions, Current State and History unchanged | Passed |
| Exact duplicate with different case/spacing is disclosed and linked through the 390px mobile Review | Passed |
| Live model avoids suggesting another Question for an explicitly already-open unknown | Passed |
| No unhandled browser JavaScript errors | Passed |

The creation case was submitted through Add Evidence in the actual browser. Before human approval, no Question existed. Create Question returned `question_created`, produced a normal non-blocking Question, removed the pending Review, and left Current State and History unchanged. The Question survived a page reload.

The duplicate case deliberately created an exact normalized matching Question between suggestion and approval. The Review changed to Already tracked / Link existing Question. Approval reused the existing object without changing its content or adding a second Question. This verifies exact matching, not semantic deduplication.

The definite-approval case was not applied to Current State. Its test Review was closed without applying its proposal during cleanup.

## Ask verification

A completed live Ask answer was generated before approval. After Question-only approval, the existing answer displayed its Refresh answer control. Refresh completed, removed the stale warning, and included the new record as an `OPEN QUESTION`, not Current State. The API payload confirmed `record_type=question`, the actual resulting Question ID, and that ID in `uncertainty_ids`.

The repeated `/api/ask` request returned the refreshed cached answer (`cache_hit=true`) with the new Question, not the pre-approval answer.

### Two model-quality notes for the eval exercise

These are observations from generated prose, not failures in Question persistence or authorization. No product/prompt changes were made for them during this pass.

1. **Internal identifier leakage:** the pre-approval answer included `(k-security)` in a Review explanation. Human-readable topic names should be used instead. Add an eval/check for internal IDs in prose while retaining actual IDs in structured fields and navigation.
2. **Attribution strength:** the source said two reps *reported* sometimes reading only the opening sentence. Some summary prose said the spot-check *found* the behavior or described a gap in what is happening. The evidence section retained the reported/uncertain framing, and the new Question remained unresolved, but summaries should preserve the distinction between reported behavior and directly established observation.

The post-approval answer correctly kept human review as current policy and full-draft review depth as unresolved. These six evidence scenarios are a smoke sample, not proof of reliable judgment across a full eval dataset or repeated runs.

## Initial runner failure and correction

Initial run: https://github.com/pedringt/ai-learning/actions/runs/34544301055

That run passed creation, dismissal, duplicate handling and the model-routing checks, but its combined Ask check failed. The test used `.ask-live-answer` as its completion signal; the streaming preview already uses that class. Its captured 'before' text was only `STATE ASK / DRAFTING / Northstar`, so it changed the record before a completed baseline answer existed.

The runner was corrected to wait for the final-answer Copy action, which is added only after the validated final payload arrives. The whole walkthrough was rerun and passed. No application code was changed to make this pass.

## Data hygiene and reruns

Neither run called demo reset or modified Current State/History. Both closed only their own pending Reviews and stopped only their own temporary Questions. All pre-existing open Reviews were excluded from mutation by ID.

Twelve submitted test Evidence records across the two runs remain in staging, as required by Evidence immutability. Most carry a `qa_question_review_<run id>` source; the two browser-submitted examples use the normal Project update source. Resolved test Reviews remain in the audit record. These can influence later Ask answers as Evidence, so formal model evals should use an explicitly chosen clean/reset baseline or isolated dataset rather than silently treating this staging database as pristine. Do not reset it without authorization.

The reusable runner is `qa/deployed/question-review-live.js`. Its workflow is now manual-only and guarded to `refs/heads/staging`; it does not run on ordinary pushes. Running it makes live model calls and retains new immutable test Evidence.

## Promotion boundary

The feature is ready for user review on staging. No main promotion has been authorized for this feature. Keep the known semantic-deduplication limit and the two Ask prose notes in the separate eval exercise.
