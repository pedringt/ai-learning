# AI-suggested open Questions

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

## Staging review script

Submit credible evidence of a consequential unresolved concern, then verify the
Review clearly offers to create a Question. Before clicking, verify that no
Question was created. Approve it, confirm the non-blocking Question appears, and
check that Current State/History did not change. Repeat with dismissal and with
an already-open Question. Ask about unresolved issues before and after approval.

Keep all changes on staging until the user explicitly authorizes main promotion.
