# AI-suggested open Questions

**Status at the September 10, 2026 Pacific pause:** implemented and verified on staging; not promoted to main. Automated checks and the live deployed walkthrough passed. The user has not yet reported their own hands-on test results. Start with `docs/PROJECT_STATUS.md` on staging for current branch checkpoints and permissions.

## Product boundary

Evidence -> AI interpretation -> existing Review -> human-authorized outcome.

A Review may propose changing Current State, require only a human check, or
suggest tracking an unresolved concern. The Question case uses the same Review
card and decision location. Its primary action says **Create Question**, or
**Link existing Question** when an exact normalized match is already open.
**Dismiss suggestion** closes the Review without creating a Question.

The internal `open_question` Review type is not another user workflow.
`decision_question` contains the exact suggested Question text (1-500 characters).
It has no State proposals, affected State IDs, or Question-resolution links.
Creating a Question never establishes its premise as a fact.

The agreed v1 is one Question consequence per Question Review. Do not hide a State
change or resolution of an existing Question behind a Create Question button.
Evidence already exists before Review; **Mark reviewed** is the accurate label for
the existing no-State-change human check, not **Accept evidence**. The user wanted
small text/action variations, not a new suggestions page or approval workflow.

## Implementation

- The provider-facing and canonical schemas support `open_question`; both
  interpretation adapters receive the same bounded instructions.
- `proposed_questions` stores the pending text, immutable source Evidence ID,
  and application-generated proposal ID. Interpretation creates no actual
  `questions` row. Reinterpretation supersedes the old proposal.
- Review reads return `question_to_create`, including any exact open match.
- The existing resolve endpoint accepts `expected_question_proposal_id` and,
  when linking, `expected_existing_question_id`. Missing/stale proposal IDs
  fail closed with 409, including old clients that might show Mark reviewed.
- Human approval creates/reuses the ordinary Question, records its resulting ID
  on the proposal, and resolves the Review in one transaction. A failure rolls
  back all three effects. Outcomes are `question_created` and `question_linked`.
- Newly created Questions are non-blocking. Reusing an existing Question does
  not change its text, origin, blocking status, or original Evidence provenance.
- Duplicate matching is case-insensitive and whitespace-normalized, not semantic
  similarity. Paraphrases are not guaranteed to match. The model also sees open
  Questions and is instructed not to propose duplicates.
- All manual/review Question creation paths share the same check+insert lock
  on PostgreSQL; SQLite uses BEGIN IMMEDIATE. Double approvals do not duplicate.
- A previously stopped/resolved Question is not automatically reopened. If an
  explicitly displayed link target closes before approval, return 409 rather
  than silently replacing that link with a new Question.
- Migration 009 extends the existing Review type/resolution constraints and
  adds the proposal table. SQLite rebuilds only the Review table transactionally,
  verifies foreign keys, and restores enforcement. PostgreSQL alters constraints.
  Existing records are retained; demo reset removes dependent proposals first.

## Downstream surfaces

Open Items shows the new Question through its normal collection and expands that
section after creation. Evidence remains reviewed, not automatically accepted
into Current State. Workspace and attention counts keep ordinary Questions
separate from blocking Questions. History still records only State transitions.

Ask sees an unaccepted suggestion as a pending Review, and an authorized Question
as a normal `known_unknown`. Its server cache includes both. The drawer freshness
check now watches open Reviews and Questions as well as Current State. A real
record change displays the existing Refresh answer control; two old CSS rules
that hid that control were removed. Late checks for an old answer cannot mark a
newly refreshed answer stale. Ask itself still cannot create Questions or facts.

No State schema rewrite, new page, separate approval modal, new agent, additional
model call, semantic matching service, or automatic blocking is introduced.
Legacy analytics cleanup remains separate; the new path records a distinct
`review_decision` outcome only after the server confirms success.

## Where the implementation lives

All backend paths below are under `state-project-complete/` unless noted.

| Area | Files / responsibility |
| --- | --- |
| AI output and normalization | `provider_output_schema.py`; `phase2_current/state_spike/schemas/structured_interpretation.schema.json`; `phase2_current/state_spike/provider_normalization.py` |
| Shared model instructions | `question_review_prompt.py`, used by `anthropic_provider.py` and `openai_provider.py` |
| Proposal persistence | `interpretation_pipeline_integrated.py` persists validated suggestions through `question_review_service.py`; no actual Question yet |
| Duplicate matching and authorization | `question_review_service.py` owns matching, proposal reads, stale-token checks, and create/reuse; `review_service.py` owns the enclosing resolution transaction and normal Question creation path |
| Database upgrade/reset | `migrations/009_question_review_proposals.sql`, `review_question_migration.py`, `database_migration_backed.py`, and `seed_demo.py` |
| API | `api.py` extends the existing resolution input/response; no separate Question approval endpoint |
| Review UI and actions | `implementation-context-prototype/context-open-items-view.js`, `context-app.js`, and `context-api.js` |
| Ask grounding/freshness | Backend `ask_service.py`; frontend `implementation-context-prototype/context-product-polish.js`; stale-control hiding rules removed from `context-feedback-pass.js` and `context-feedback-pass-4.js` |
| Feature tests | `test_question_review_creation.py`, `test_question_review_browser.py`, `test_ask_cache_authority.py`, `test_provider_prompt_contract.py`; frontend `state-question-review-handoff-tests.js` |
| Permanent regression CI | `.github/workflows/tests.yml`, including an isolated PostgreSQL service |
| Optional live walkthrough | `qa/deployed/question-review-live.js` and `.github/workflows/question-review-live.yml`, manual-only and staging-guarded |

`phase2_current/` remains runtime code despite its historical name. Do not rename
it or rewrite the controller architecture as part of this feature handoff.

## Tests and eval handoff

Deterministic tests cover authorization, decline, normalized duplicates, a
concurrently added Question, related-but-different questions, stale proposals,
closed link targets, duplicate approval, transaction rollback, malformed/mixed
outcomes, Evidence provenance, normal later resolution, demo reset, and upgrades.
The database cases run on SQLite locally and an isolated PostgreSQL CI service.
Real-browser tests use the real frontend scripts and HTTP client with a local
TestClient transport, not the public backend; they cover desktop/mobile creation,
dismissal, duplicate linking, reload persistence, Ask starters, and stale refresh.

For the separate model eval exercise, judge **State change vs important unknown
vs neither**. Include rubber-stamp review concerns, speculative noise, existing
open Questions, evidence answering existing Questions, and narrow established
facts that must not be downgraded to unknowns. Deterministic tests do not establish
that the live model always chooses the right outcome.

The user is drafting evals in another chat. This handoff records what to carry
across; it does not claim that the other exercise document/dataset was edited.
Evaluate the actual proposed consequence and persisted records, not just a Review
label or the old `review_accepted` analytics event.

### Reproduce software checks

Use the pinned `state-project-complete/requirements.txt`, Python 3.14, Node 22,
and Playwright Chromium as configured in `.github/workflows/tests.yml`. Install
pytest and pytest-subtests as the workflow does. A local run without Chromium or
an isolated PostgreSQL service is not equivalent to the full recorded CI run.

From `state-project-complete/`:

```sh
python -m pytest -q test_question_review_creation.py test_question_review_browser.py test_ask_cache_authority.py test_provider_prompt_contract.py

python -m pytest -q \
  --deselect=test_frontend_integration_contract.py::test_r861_grounded_ask_module_and_release_assets_are_self_contained \
  --deselect=test_frontend_integration_contract.py::test_r85_integrity_and_polish_contracts
```

The two deselections predate this feature and pin retired source shapes; the
workflow identifies replacement coverage in `test_release_asset_loader.py` and
`test_integrity_polish_current.py`. Do not add exclusions to hide new failures.

From `implementation-context-prototype/`:

```sh
node state-question-review-handoff-tests.js
for testfile in state-*-tests.js; do
  node "$testfile" || exit 1
done
```

Set `STATE_TEST_POSTGRES_URL` only to an isolated, disposable test database.
Never point tests that initialize/reset databases at staging or production.
The configured CI PostgreSQL service is ephemeral. See the workflow for setup.

## Manual staging walkthrough shared with the user

This is the next user review step, not a request to rerun all QA automatically.

Staging app: https://ai-learning-git-staging-cairn10.vercel.app/implementation-context-prototype/

Allow roughly ten minutes. The goal is both correct behavior and clarity before
a click: can a person distinguish updating State, marking a Review complete,
and tracking an unresolved Question?

Staging already contains retained test Evidence. Capture any different model
outcome as-is; do not repeatedly rephrase examples to force a passing outcome.
There is no need to reset the demo for this walkthrough.

### 1. Create a Question, but pause before approval

In **Add Evidence**, submit:

> During today's Northstar pilot spot-check, two support reps said they sometimes approve AI drafts after reading only the opening sentence. We have not measured how often this happens or whether the remaining text is checked. Human review is still required; no policy or scope change has been approved.

Open its Review in **Open Items**. Expected: a sensible **Question to track**,
**Create Question** and **Dismiss suggestion** actions, and clear separation from
changing Current State. It must not assert that human review has been removed.
Before approval, the suggestion is still a Review proposal, not a new open
Question. Leave it pending for the Ask check.

### 2. Ask before/after, then reload

With the Review pending, open Ask and submit:

> What do we know about whether Northstar agents carefully check AI drafts before approving them? Separate accepted facts from unresolved concerns.

Wait until the answer has finished and the **Copy** action appears. A streaming
preview is not a completed baseline answer. Close the drawer without reloading.
Click **Create Question** in the Review.

Expected confirmation: **Question created. Current State was not changed.**
The Review leaves Needs your review; a non-blocking Question appears under Open
questions, not Blocking questions. Current State and History remain unchanged.

Reopen Ask before reloading. The previous answer should offer **Refresh answer**.
Refresh it: the new Question should be treated as unresolved, not as a proven
policy change or proven agent behavior. Finally reload the page and confirm the
Question persists in Open Items.

### 3. Dismiss a different suggestion

Submit separate Evidence:

> The Northstar operations lead raised a consequential unresolved concern: if the draft provider is unavailable during a busy shift, who will tell pilot agents to switch back to the manual workflow? No notification owner or fallback communication process has been established, and no new policy was approved.

Open the resulting Question Review and choose **Dismiss suggestion**. Expected:
the Review closes, no Question is created, and Current State/History stay the
same. Original Evidence remains preserved.

### 4. Optional exact-duplicate check

Use a different pending Question suggestion. Copy its proposed Question text
exactly, create that Question manually through **+ Add question** before approving
the Review, then reload and reopen the Review. It should say **Already tracked**
and offer **Link existing Question**. Approval should reuse that Question, not
create a second one. Different capitalization/extra whitespace may be used;
paraphrases are outside the guaranteed duplicate match.

To obtain another suggestion, the live runner used:

> The Northstar accessibility lead raised an unresolved concern after observing a pilot rep using a screen reader: can screen-reader users distinguish an AI draft from the final response before approving it? The observation did not establish an answer, and the distinction matters for meaningful review. No accessibility requirement or project decision has changed.

### What to report

Keep the input, resulting Review/Question text, action clicked, expected/actual
outcome, and a screenshot where useful. Especially note hesitation about what a
button authorizes, a Question that does not match the concern, or Ask wording
that makes Evidence sound more certain than the source. Do not call a model
routing variation a persistence bug without checking both layers.

Keep all changes on staging until the user explicitly authorizes main promotion.

## Verification record (September 10, 2026)

Feature implementation commit: `5c1f2bc51e25db6f75e099123736abd5ac43c7d3` on staging.
GitHub verification run: https://github.com/pedringt/ai-learning/actions/runs/34543108027

The complete Python CI command passed with **407 passed, 44 skipped,
2 pre-existing deselections, and 7 subtests passed** using the pinned runtime
dependencies, Python 3.14, real PostgreSQL 16, and Playwright Chromium. All
**11 JavaScript behavior suites** passed, including 28 Question/Review handoff
assertions. The new browser flows cover desktop/mobile creation, dismissal,
duplicate linking, reload persistence, and Ask freshness after approval.

The six legacy file-navigation browser tests that the editing container could
not execute also passed in GitHub's normal browser environment. Database upgrade
tests preserve existing seeded records and links on both SQLite and PostgreSQL;
concurrency and rollback tests run against isolated test databases, not the
user's staging or production records.

Latest checked pre-pause CI: https://github.com/pedringt/ai-learning/actions/runs/34544899127
passed on `bfe6d83d7cbef2fa8ea9ad1bfcff303e9fd5f3d3`.

### Completed live deployed walkthrough

The deployed walkthrough is **complete**, not an outstanding implementation task:
https://github.com/pedringt/ai-learning/actions/runs/34544596269
passed all eight checks at `8ce2c7a0d6da633b7961f58c066ef8eaf21904d7`.

Read [the live QA report](../history/QUESTION_REVIEW_LIVE_QA_2026-09-10.md) for
source/deployment verification, actual model results, cleanup, and the initial
runner failure. That first Ask check mistook streaming preview content for a
finished answer; the corrected completion wait passed on rerun without an
application change.

Artifact `question-review-live` (ID `10178580693`) contains `report.json` and
desktop/mobile/Ask screenshots. It has seven-day retention, expiring September 18,
2026 UTC. The durable text summary remains in GitHub after the artifact expires.
These are QA screenshots, not approval to restore screenshots to the portfolio.

These checks cover software behavior and a small live-model smoke sample, not
reliable judgment over a full or repeated eval dataset. The user's own hands-on
review and the separate formal model evals have not been reported complete.

The temporary source-transfer files and delivery workflow were removed after
verification. The permanent tests workflow retains the PostgreSQL test service.
The reusable live workflow is now manual-only, staging-guarded, and makes paid
provider calls against real staging data; do not trigger it just to read this
handoff. Never use a demo reset without explicit authorization.

## Deferred limits and eval findings

1. **Semantic duplicates:** only case/whitespace-equivalent open Questions are
   guaranteed to reuse an object. The model is prompted to avoid duplicates,
   but differently worded equivalents remain an eval/future capability issue.
2. **Internal IDs in Ask prose:** `(k-security)` appeared in one live answer.
   Preserve IDs in structured fields and navigation while keeping prose readable.
3. **Evidence attribution:** some summary prose described what two reps *reported*
   as behavior a spot-check *found*. The Question stayed unresolved, but model
   evaluation should check that summaries preserve attribution and uncertainty.
4. **Legacy analytics:** the older Mark reviewed path still uses `review_accepted`.
   The new Question path records its distinct outcome after server success.
   Broad analytics cleanup was deferred, not silently completed by this feature.
5. **Earlier answer provenance:** the separate multi-Evidence/multi-Question
   resolution provenance gap remains. New Question proposals retain their own
   source Evidence; that does not repair every older Question-resolution link.

Twelve immutable test Evidence records remain from the two deployed runs; only
the runs' own temporary Reviews/Questions were closed. This can affect later Ask
answers. Agree on a clean/reset or isolated baseline before formal model evals.
Do not delete Evidence or treat the current shared staging database as pristine.
