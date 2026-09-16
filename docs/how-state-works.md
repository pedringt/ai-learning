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

New user-created projects begin in Baseline Setup so existing project
material can be turned into a reviewed Starting State before the project
settles into the normal ongoing Evidence -> Review -> Current State loop.
Baseline Setup changes interpretation and organization behavior, not the
authority boundary.

## 2. Core objects

| Object | Contract |
|---|---|
| **Evidence** | What happened, was said, or was observed. Immutable. Never edited to match a later interpretation. |
| **Current State** | What the project currently treats as true. Versioned. Changes only through an authorized Review decision. |
| **Review** | A consequential interpretation that needs a human decision. May propose changing Current State, creating or resolving a Question, or leaving Current State unchanged. |
| **Question** | A known unknown the team is tracking. Open by default; can additionally be marked blocking. |
| **History** | The record of accepted transitions: before, after, reason, decision, and source, written once per actual Current State transition. |
| **Ask** | A read-only, grounded query interface. Reads Current State, Reviews, Questions, History, and Evidence. Cannot modify any of them. |

Starting State / Baseline Setup is a setup workflow, not a seventh core
object. It uses the same six objects and the same authority model.

## 3. System rules and invariants

> The LLM interprets. Software enforces. The human authorizes consequential
> State transitions.

A change reaches Current State only through an accepted Review. No other
code path exists.

| Handled by AI | Handled by deterministic software |
|---|---|
| Interpreting new Evidence | Schema and type validation |
| Proposing Current State changes | Semantic validation of model output |
| Ask synthesis | Authority checks |
| | Version checks before a change applies |
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

## 4. Starting a project: Baseline Setup

New user-created projects enter Baseline Setup until a person explicitly
finishes it. Seeded demo projects do not use this lifecycle. The setup state
is tracked on the project (`projects.baseline_completed_at`).

Baseline Setup changes what State asks the model to look for, not what the
model is allowed to do:

- Existing project material is still stored as immutable Evidence.
- State interprets that Evidence and proposes normal Reviews and Questions.
- Proposed Current State facts still need an accepted Review before they
  become current.
- Explicit unresolved unknowns stay Questions rather than being smoothed
  into facts.
- Accepted facts can be organized into useful project areas/topics, but the
  organizational metadata is applied only after the human accept succeeds.

The setup guidance favors broad coverage of durable starting knowledge such
as purpose, scope, rules, architecture, priorities, constraints, evaluation,
important decisions, and unresolved questions. It also asks the model to
preserve meaningful source structure, reuse a small stable set of areas, and
split independently maintainable facts instead of summarizing an entire
source into one giant Current State statement.

Large or question-dense sources can be split into bounded interpretation
chunks so one model call does not have to carry the whole source. The stored
Evidence remains one immutable item and provenance continues to point to the
original source. Software merges only exact normalized duplicates across
chunk outputs; it does not fuzzy-guess that two differently worded claims
mean the same thing (`baseline_setup.py`).

Before Baseline Setup can finish, structural coverage checks require no open
Reviews and no failed or still-processing Evidence. Finishing setup only
marks the project as established; it does not itself create Current State or
Questions. Any facts/questions already present got there through the normal
Review path.

## 5. Evidence lifecycle

- Created from a Note, a supported uploaded document, an approved Slack
  message, or other manual Evidence entry.
- Upload currently supports `.txt`, `.md`, text-based `.pdf`, and `.docx`.
  PDF/DOCX text is extracted before interpretation. Image-only/scanned PDFs
  with no extractable text are rejected rather than stored as empty Evidence.
- Immutable once created.
- A correction creates new Evidence rather than editing the original.
- Zero or more Reviews can reference a given piece of Evidence.
- Not itself a claim about what's true, only a record of what was seen.

If a piece of processed Evidence produced no Review, a person can explicitly
ask State to reconsider it (`POST /api/evidence/{id}/promote`). That reruns
the interpretation with user-requested-maintenance context and may create a
Review. It never writes Current State directly; Current State remains
unchanged until a resulting Review is accepted. The reconsider/reanalyze
paths are project-scoped, so Evidence from one project cannot be acted on
through another project.

## 6. Review lifecycle

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

## 7. Question lifecycle

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

## 8. Current State rules

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

## 9. History rules

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

## 10. Ask contract

- **Reads**: accepted Current State, pending Reviews, open Questions, and
  relevant Evidence and History, bounded by the application rather than the
  full dataset.
- **Returns**: accepted facts, pending Reviews, and open Questions kept in
  visibly separate categories, never merged into one undifferentiated
  summary.
- **Cannot do**: create, accept, or modify a Review, Question, or Current
  State. A query that reads like an instruction is redirected to Add
  Evidence instead of acted on.
- **Interaction**: the UI can stream answers, accept follow-up questions,
  and cancel in-progress requests. Those interaction features do not weaken
  the read-only authority boundary.

(Implementation: `ask_service.py`. Selection and synthesis are separate
model calls, validated against `ask_contract.py`'s bounded Pydantic schemas
before anything reaches the client.)

## 11. Source behavior

- Manual Notes are entered by hand and become Evidence directly.
- Supported file uploads become Evidence after text extraction. Current
  support is TXT/Markdown, text-based PDF, and DOCX; unsupported, corrupt,
  empty, or non-text PDFs fail with a clear validation error.
- Slack messages become Evidence automatically only from explicitly
  approved channels.
- Channel approval is a manual, per-channel step; inviting the bot is not
  the same as approving it (`slack_intake_service.py`).
- Accepted changes can be shared back to Slack; that outbound sharing does
  not make Slack an authority for Current State.

## 12. Failure and stale-data behavior

| Situation | System response |
|---|---|
| An AI interpretation looks wrong or unsupported | Stays a pending Review. Nothing reaches Current State without an accepted decision. |
| Model output matches the schema but violates State's semantic rules | Rejected by semantic validation before it reaches the product. |
| A proposal is stale (Current State changed since it was created) | Accept is blocked on a version check. The client is told to refresh and review again. |
| Newer Evidence updates the same Review with a replacement proposal for the same State item | The older pending proposal on that Review is marked superseded. Unrelated open Reviews are never affected. |
| The AI provider fails or times out | The request fails closed with an error, not a guess or a partial, unlabeled answer. |
| Model output doesn't match the expected schema | Rejected by structural validation before it reaches the client. |
| An uploaded file is unsupported, unreadable, empty, or has no extractable text | Rejected with a clear client error; no empty Evidence is silently created. |
| A speculative query fails inside a transaction (Postgres only) | Must be explicitly rolled back before the next statement runs, or every subsequent statement on that connection fails. Bit us once in production (see `CLAUDE.md`); SQLite's more forgiving error handling won't catch this class of bug in local/staging testing. |

## 13. Testing and evals

Backend and frontend behavior is covered by several hundred deterministic
tests (authority checks, version conflicts, duplicate detection, project
isolation, validation, response shape), supplemented by hands-on QA against
realistic, messy input, and by evals that judge Ask's grounding/hedging
behavior and the review pipeline's consequentiality calls against expected
outcomes rather than just checking for a valid response. See `docs/evals/`
for the PM-facing eval registry and `state-project-complete/eval/` for the
executable eval code.

Baseline Setup, document upload, Evidence reconsideration, project
isolation, and the deployed user flows also have dedicated deterministic or
browser regression coverage.

## 14. Known limitations

- No multi-user roles or permissions.
- Not load-tested at real team scale. A known N+1 query pattern in
  `list_reviews()`/`list_history()` slows project switching under Postgres.
- `project_areas.id` is a bare global primary key, not project-scoped yet.
  Fine with today's two seeded projects; needs a composite key before a
  third project with colliding area ids is added.
- The portfolio deployment does not yet provide durable persistence for
  user-created project data across backend redeploys. Seeded data comes back;
  user-created data can be lost until the storage architecture is fixed.
- Ask's generated prose occasionally has minor grammar issues, since that's
  live model output rather than something a code fix reliably controls.

See `docs/PROJECT_STATUS.md` for the current, frequently-updated state of
these and any newer findings.

## 15. Go deeper

- Case study and product decisions: `implementation-context.html`.
- Public behavioral-contract page (this document's counterpart):
  `state-how-it-works.html`.
- Baseline Setup implementation: `state-project-complete/baseline_setup.py`.
- Source: [repository README](../README.md), `state-project-complete/`
  (backend), `implementation-context-prototype/` (frontend).
