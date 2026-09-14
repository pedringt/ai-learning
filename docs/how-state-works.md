# How State works

This is an onboarding-style guide to State's product model and system rules,
written for someone joining the project who needs to understand how it
behaves before reading code. It stays focused on product behavior and system
contracts, not source-code documentation.

For the product story, decisions, and lessons behind State, see the public
case study (`implementation-context.html`) and its deeper companion page,
`state-how-it-works.html`. For the authoritative implementation reference
(file responsibilities, running locally, tests, deployment), see the
[repository README](../README.md).

## State at a glance

State solves a narrower problem than most AI-and-context tooling. Search,
retrieval, context engineering, and agent memory are already reasonably good
at finding and summarizing information. State exists for the question next
to that one: when information changes, conflicts, or goes stale, what should
the team and its AI currently treat as true?

State's answer is to maintain one current understanding rather than
reconstruct one from raw history on every request.

## The product model

State has six object types. Each has one job.

| Object | Job |
|---|---|
| **Evidence** | What happened, was said, or was observed. Immutable. Never edited to match a later interpretation. |
| **Current State** | What the project currently treats as true. Versioned. Only changes through an authorized Review decision. |
| **Review** | AI's proposed read on what new Evidence means (create, update, or retire a fact), held open until a person decides. |
| **Question** | A known unknown the team is tracking. Some Questions block related work; most don't. |
| **History** | The record of accepted transitions: before, after, reason, decision, and source. |
| **Ask** | A grounded, read-only synthesis across everything above. |

## How information moves

```
Source or note -> Evidence -> AI interpretation -> Proposed change (Review)
   -> Human decision -> Current State -> History
```

Only the human decision step is mandatory to advance past. Evidence can sit
without a Review if nothing about it looks consequential. A Review can be
left unchanged, which preserves the Evidence without moving Current State.
Only an accepted decision reaches Current State, and only then does it get a
History entry.

## Authority model

> The LLM interprets. Software enforces. The human authorizes consequential
> State transitions.

- **AI's job**: read Evidence, propose what it might mean. It never has a
  path that applies a change by itself.
- **Software's job**: enforce the rules a model shouldn't have to get right
  every time: structural validation, version checks, duplicate detection.
  A proposal that doesn't meet the contract never reaches a person.
- **People's job**: authorize what actually becomes true. A person can also
  adjust the wording before accepting; the original AI proposal stays on
  record either way.

New evidence doesn't become Current State because AI found it convincing. It
becomes Current State because a person said so.

(Implementation: `review_service.py`'s `resolve_review()` is where this is
enforced. `Decision = Literal["accept", "keep", "reject"]`.)

## Reviews

A Review is a checkpoint, not an approval. Requiring a decision exists
because a technically valid AI interpretation can still be wrong for the
project, confidently filling in something nobody actually decided.

Outcomes:

- **Accept**: the proposed change becomes Current State exactly as
  proposed. History records the before, after, and the Evidence behind it.
- **Adjust, then accept**: a person corrects the wording first. Both the
  original AI proposal and the accepted wording stay on record.
- **Leave unchanged**: Current State doesn't move. The Evidence is still
  preserved and available.
- **Superseded**: if newer Evidence produces a better proposal for the same
  fact before anyone reviews the first one, the older proposal is marked
  superseded rather than leaving two conflicting proposals open.
- **Stale**: if Current State already changed by the time someone tries to
  accept an older proposal, the accept is blocked (optimistic concurrency on
  the state item's `version` column) and the person is asked to refresh and
  review again, rather than silently overwriting a newer decision.

When more than one proposed fact comes from the same Evidence, they're
bundled into one Review and decided together. There is no per-proposal
partial acceptance.

## Questions

- **Open vs. blocking**: an open Question tracks something unresolved. A
  blocking Question additionally flags that related work shouldn't proceed
  until it's answered. Set explicitly, not inferred from wording.
- **Resolving**: new Evidence can resolve an open Question as part of the
  same Review that handles the Evidence, instead of a separate step.
- **Answered is not the same as changed**: a Question can be fully answered
  (including with "no") without Current State needing to move at all.
- **Dedup**: a newly proposed Question that matches one already tracked
  links to the existing one instead of creating a duplicate.

## Current State and History

Regenerating a summary depends on whatever happens to get pulled into
context that specific time. Two summaries of the same project can disagree,
and neither is exactly wrong, they just surfaced different things. There's a
record of what got said, but not a durable one of what the project decided.

Current State is different: one version exists at a time, and it only moves
when a person authorizes the change. History keeps the actual transitions,
so the project can explain not just what's true now but when it became true
and why.

## Ask

- **What it reads**: accepted Current State, pending Reviews, open
  Questions, and relevant Evidence and History, gathered and bounded by the
  application rather than handed everything that exists.
- **Typical uses**: meeting preparation, catching up on what changed,
  checking whether something has actually been decided.
- **What it can't do**: Ask is read-only. It cannot create, accept, or
  change a Review, Question, or Current State. A query that reads like an
  instruction is redirected to Add Evidence instead of acted on.

(Implementation: `ask_service.py`. Selection and synthesis are separate
model calls, validated against `ask_contract.py`'s bounded Pydantic schemas
before anything reaches the client.)

## Where AI is used, and where deterministic software is used

| AI | Deterministic software |
|---|---|
| Interpreting new Evidence | Schema and type validation |
| Proposing Current State changes | Authority checks |
| Ask synthesis | Version checks before a change applies |
| | Atomic, all-or-nothing writes |
| | Question deduplication (exact normalized-text match, no fuzzy matching) |
| | Stripping internal ids from AI-facing text |

Question matching (`question_review_service.py`'s `matching_open_question()`)
case-folds and collapses whitespace on both sides, then requires an exact
match against open Questions in the same project. There is no embedding or
LLM-based similarity check.

Anything that has to be correct every single time, not just usually, lives
in software.

## Failure handling

| Situation | What happens |
|---|---|
| An AI interpretation looks wrong or unsupported | It stays a pending Review. Nothing reaches Current State without a person accepting it. |
| A proposal goes stale (Current State changed since it was created) | The accept is blocked with a version-conflict error. The person is asked to refresh and review again. |
| New evidence conflicts with an existing pending proposal | The older proposal is marked superseded. |
| The AI provider fails or times out | The request fails closed with a clear error rather than guessing or returning a partial, unlabeled answer. |
| The model returns output that doesn't match the expected structure | Rejected by schema validation before it reaches the product. |
| A speculative query fails inside a transaction (Postgres only) | The transaction must be explicitly rolled back before the next statement runs, or every subsequent statement in that connection fails. This bit us once in production (see `CLAUDE.md`); SQLite's more forgiving error handling won't catch this class of bug in local/staging testing. |

## Testing and evals

State is tested as both ordinary software and an AI product:

- **Deterministic coverage**: several hundred backend and frontend tests
  covering authority checks, version conflicts, duplicate detection, and API
  response shapes.
- **Realistic QA**: hands-on testing with long, messy, real-shaped input.
  Clean fixtures miss problems that only show up in ambiguous notes.
- **AI evals**: Ask's grounding and hedging behavior, and the review
  pipeline's judgment about what's consequential, are checked against
  expected outcomes, not just checked for a valid response.

## Current boundaries

State is a working prototype, not a system a real team has run over time.
Known, deliberately-not-addressed limitations:

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
