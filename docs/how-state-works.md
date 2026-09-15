# How State works

The behavioral contract for State: what each object is, what rules the
system enforces, what happens when something goes wrong or goes stale, and
where the deeper implementation lives. Assumes you already know why State
exists. It stays focused on product behavior and system contracts, plus
enough file/function pointers to start exploring the implementation, not a
source-code walkthrough.

For the product story, decisions, and lessons behind State, see the public
case study (`implementation-context.html`). For the authoritative
implementation reference (file responsibilities, running locally, tests,
deployment), see the [repository README](../README.md).

## 1. Overview

State maintains one current, versioned understanding of a project. It
updates only through an authorized decision, and every accepted change is
recorded.

## 2. Core objects

| Object | Contract |
|---|---|
| **Evidence** | What happened, was said, or was observed. Immutable. Never edited to match a later interpretation. |
| **Current State** | What the project currently treats as true. Versioned. Changes only through an authorized Review decision. |
| **Review** | A consequential interpretation that needs a human decision. May propose changing Current State, creating or resolving a Question, or leaving Current State unchanged. |
| **Question** | A known unknown the team is tracking. Open by default; can additionally be marked blocking. |
| **History** | The record of accepted transitions: before, after, reason, decision, and source, written once per actual Current State transition. |
| **Ask** | A read-only, grounded query interface. Reads Current State, Reviews, Questions, History, and Evidence. Cannot modify any of them. |

## 3. System rules and invariants

> The LLM interprets. Software enforces. The human authorizes consequential
> State transitions.

A change reaches Current State only through an accepted Review. No other
code path exists.

| Handled by AI | Handled by deterministic software |
|---|---|
| Interpreting new Evidence | Schema and type validation |
| Proposing Current State changes | Authority checks |
| Ask synthesis | Version checks before a change applies |
| | Atomic, all-or-nothing writes |
| | Question deduplication (exact normalized-text match, no fuzzy matching) |
| | Stripping internal ids from AI-facing text |

Question matching (`question_review_service.py`'s `matching_open_question()`)
case-folds and collapses whitespace on both sides (`normalized_question_text()`),
then requires an exact match against open Questions in the same project.
The function's own comment is explicit: "No fuzzy matching or urgency
inference." There is no embedding or LLM-based similarity check.

(Implementation: `review_service.py`'s `resolve_review()` enforces the
authorization boundary. `Decision = Literal["accept", "keep", "reject"]`.)

## 4. Evidence lifecycle

- Created from a Note, an approved Slack message, or manual entry.
- Immutable once created.
- A correction creates new Evidence rather than editing the original.
- Zero or more Reviews can reference a given piece of Evidence.
- Not itself a claim about what's true, only a record of what was seen.

## 5. Review lifecycle

Not every Review is a Current State proposal. `review_issues.review_type`
has four values (`provider_output_schema.py`'s enum:
`proposed_update`, `state_at_risk`, `missing_understanding`, `open_question`),
but `resolve_review()` only branches specially on two of them; the other
two share one code path:

- **A Current State proposal** (`proposed_update` or `missing_understanding`):
  create, update, or retire a fact. Both are backed by one or more rows in
  `proposed_state_changes` and resolve through the same default path in
  `resolve_review()`. They differ only in whether the fact already exists
  in Current State (`proposed_update`) or is being introduced for the first
  time (`missing_understanding`, always a `create` operation).
- **A Question suggestion** (`open_question`): resolved via
  `resolve_question_proposal()`.
- **A flagged uncertainty about an existing fact** (`state_at_risk`): a
  `decision == "keep"` on this type doesn't resolve a Question, it *creates
  or links one* (see the dedicated branch in `resolve_review()`), reusing
  any Question the interpretation pipeline already linked at Review-creation
  time before creating a new one.

Outcomes, by type:

- **Update Current State** (`accept` on a proposal Review): the proposed
  change becomes Current State exactly as proposed. History records the
  before, after, and the Evidence behind it.
- **Adjust, then update** (`accept` with `adjustments`): a person corrects
  the wording before accepting. Both the original proposal and the accepted
  wording stay on record; the original is never overwritten.
- **Leave Current State unchanged** (`keep` on a proposal Review): the
  Evidence is reviewed without a Current State mutation.
- **Keep tracking uncertainty** (`keep` on a `state_at_risk` Review):
  creates or links a Question instead of changing Current State.
- **Create Question** (`accept` on an `open_question` Review): the
  suggested Question is created or linked to an equivalent existing one.
- **Dismiss** (`reject`): resolves a Question-suggestion or uncertainty
  Review without creating or linking a Question.

Proposal-level states, distinct from the Review decision itself:

- **Superseded**: this is narrower than "conflicting evidence." It fires
  only when newer Evidence updates *the same, still-open Review* with a
  replacement proposal for *the same* `state_item_id` (`reused_existing` in
  `interpretation_pipeline_integrated.py`), or the narrower duplicate-create
  case (an identical `create` proposal re-offered on the same Review). The
  older pending `proposed_state_changes` row is marked `superseded`; the
  Review itself can remain open. State does not scan for semantic conflicts
  across unrelated Reviews. Two different, related-looking Reviews on the
  same topic stay open independently.
- **Stale**: accepting is blocked if the target `current_state_items` row's
  `version` no longer matches what the proposal expected (optimistic
  concurrency). The caller is told to refresh and review again rather than
  silently overwriting a newer decision.

Multiple proposals from the same Evidence are bundled into one Review and
decided together. There is no per-proposal partial acceptance.

## 6. Question lifecycle

- Created open by default.
- Blocking is set explicitly, never inferred from wording.
- A `state_at_risk` Review's "keep tracking" decision creates or links a
  Question, rather than resolving one (see Review lifecycle above).
- Resolved as part of the same Review that handles the answering Evidence,
  not a separate step. If the accepted State wording is materially adjusted
  (`any_material_adjustment` in `resolve_review()`), linked Questions are
  left open instead of auto-resolved: an adjusted statement no longer
  proves the *original* interpretation actually answered the Question.
- Answering a Question does not require a Current State change.
- Can be stopped manually (`review_service.py`'s `stop_question()`, status
  `stopped`) when no longer worth tracking, without being resolved.
- A new Question is deduplicated by exact normalized-text match against
  open Questions in the same project (`matching_open_question()`) before
  it's created.

## 7. Current State rules

Each Current State item has one active, versioned value:

- Versioned; every accepted change increments the version.
- Only changes through an accepted Review.
- Supports three operations: create, update, retire.
- Scoped to a project and an area.
- A stale write (based on an outdated version) is rejected, not merged or
  overwritten.

This does not enforce semantic uniqueness at the "fact" level. It prevents
an exact normalized duplicate create and version-checks each item
individually; two differently worded items could in principle describe the
same underlying fact.

## 8. History rules

- Written when an accepted Review produces a Current State transition, not
  on every accepted Review. `_apply_proposal()` inserts the
  `history_transitions` row only after it actually mutates
  `current_state_items`; it returns early (no History row) for an exact
  duplicate create or an adjustment that restates the current statement,
  and Question-only outcomes (`open_question`, `state_at_risk`'s "keep")
  never call `_apply_proposal()` at all.
- Never edited or removed after being written.
- Records before, after, reason, decision, and source together.
- Not a duplicate or cache of Current State's present values.

## 9. Ask contract

- **Reads**: accepted Current State, pending Reviews, open Questions, and
  relevant Evidence and History, bounded by the application rather than the
  full dataset.
- **Returns**: accepted facts, pending Reviews, and open Questions kept in
  visibly separate categories, never merged into one undifferentiated
  summary.
- **Cannot do**: create, accept, or modify a Review, Question, or Current
  State. A query that reads like an instruction is redirected to Add
  Evidence instead of acted on.

(Implementation: `ask_service.py`. Selection and synthesis are separate
model calls, validated against `ask_contract.py`'s bounded Pydantic schemas
before anything reaches the client.)

## 10. Source behavior

- Manual Notes are entered by hand and become Evidence directly.
- Slack messages become Evidence automatically only from explicitly
  approved channels.
- Channel approval is a manual, per-channel step; inviting the bot is not
  the same as approving it (`slack_intake_service.py`).
- Every other source is out of scope today.

## 11. Failure and stale-data behavior

| Situation | System response |
|---|---|
| An AI interpretation looks wrong or unsupported | Stays a pending Review. Nothing reaches Current State without an accepted decision. |
| A proposal is stale (Current State changed since it was created) | Accept is blocked on a version check. The client is told to refresh and review again. |
| Newer Evidence updates the same Review with a replacement proposal for the same State item | The older pending proposal on that Review is marked superseded. Unrelated open Reviews are never affected. |
| The AI provider fails or times out | The request fails closed with an error, not a guess or a partial, unlabeled answer. |
| Model output doesn't match the expected schema | Rejected by validation before it reaches the client. |
| A speculative query fails inside a transaction (Postgres only) | Must be explicitly rolled back before the next statement runs, or every subsequent statement on that connection fails. Bit us once in production (see `CLAUDE.md`); SQLite's more forgiving error handling won't catch this class of bug in local/staging testing. |

## 12. Testing and evals

Backend and frontend behavior is covered by several hundred deterministic
tests (authority checks, version conflicts, duplicate detection, response
shape), supplemented by hands-on QA against realistic, messy input, and by
evals that judge Ask's grounding/hedging behavior and the review pipeline's
consequentiality calls against expected outcomes rather than just checking
for a valid response. See `docs/evals/` for the PM-facing eval registry and
`state-project-complete/eval/` for the executable eval code.

## 13. Known limitations

- No multi-user roles or permissions.
- Not load-tested at real team scale. A known N+1 query pattern in
  `list_reviews()`/`list_history()` slows project switching under Postgres.
- `project_areas.id` is a bare global primary key, not project-scoped yet.
  Fine with today's two seeded projects; needs a composite key before a
  third project with colliding area ids is added.
- Ask's generated prose occasionally has minor grammar issues, since that's
  live model output rather than something a code fix reliably controls.

See `docs/PROJECT_STATUS.md` for the current, frequently-updated state of
these and any newer findings.

## 14. Go deeper

- Case study and product decisions: `implementation-context.html`.
- Public behavioral-contract page (this document's counterpart):
  `state-how-it-works.html`.
- Source: [repository README](../README.md), `state-project-complete/`
  (backend), `implementation-context-prototype/` (frontend).
