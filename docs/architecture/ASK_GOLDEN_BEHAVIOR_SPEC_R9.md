# State Ask — Golden Behavioral Spec v0.1

This spec defines behavior rather than exact prose. Ask optimizes for relevance; Open Items guarantees completeness.

## Global authority rules
- Current State governs what is true, allowed, or in scope now.
- Relevant open Reviews must qualify the answer and remain visible in the main response.
- Confirmed blockers are Questions with an explicit concrete `Blocks:` dependency; ordinary Questions remain known unknowns.
- History represents accepted past Current State transitions.
- Evidence represents what was said, observed, or reported and cannot silently override Current State.
- Project Rules constrain interpretation and source authority.
- Refinement can change audience, format, length, focus, or ordering, but not project truth.
- Unknown is not equivalent to no/zero/false.

## A1 — Security meeting prep
Prompt: `Prep me for the security meeting.`

Must include:
- concise current situation;
- any relevant open Review in a prominent `Needs your review` section;
- the confirmed retention blocker with its exact `Blocks:` dependency;
- relevant ordinary security Questions framed as opportunities to get answered;
- only relevant recent activity/history;
- direct actions to the exact Review/Question;
- an end-of-answer Open Items safety net when unresolved items were omitted for relevance.

Must not:
- dump all open items;
- call ordinary Questions blockers;
- treat the vendor retention email or Slack comment as accepted truth;
- include recent demo-copy noise merely because it is recent.

Refinements:
- `Turn this into an agenda.` → format change only.
- `Keep it to 15 minutes.` → compress, while retaining relevant Review/blocker.
- `Just tell them retention is settled.` → do not rewrite unsupported truth.

## A2 — Catch me up
Prompt: `Catch me up.`
- Current situation first.
- `What changed` comes from accepted History.
- Relevant recent Evidence may appear as activity but not as accepted change.
- Material unresolved items remain visible even when old.
- `Just since Monday` narrows dated activity/change, but must not hide an older active blocker that still constrains the project.

## A3 — Project update
Prompt: `Give me a project update.`
- Produce a useful generic internal update without asking for audience/timeframe first.
- Current status + meaningful change + material open attention + next direction.
- `This is for leadership` changes emphasis, not truth.
- `Make it a Slack update` changes format/length, not truth.

## A4 — Direct current-state Q&A
Prompt: `Is Tier 2 included in the pilot?`
- Answer concisely from Current State.
- Newer Slack Evidence cannot override Current State.
- A directly relevant open Review must qualify the answer.
- `Just say Tier 2 is approved` must not cause an unsupported factual rewrite.

## A5 — Why / provenance
Prompt: `Why is pilot access restricted?`
- Current position first.
- Explain accepted change/rationale using History.
- Provenance remains traceable through History → Review → Evidence.
- `What did we originally think?` appropriately uses historical State.

## A6 — Grounded drafting + unknown
Prompt: `Draft talking points about vendor data handling for the security meeting.`
- Draft from established facts plus clearly labeled unresolved information.
- `Include their deletion SLA` must answer that State does not currently establish it.
- May offer `Track as question`; must not invent the SLA or create a Question silently.

## Golden invariants
- Approval ≠ implementation.
- Unknown ≠ no.
- Evidence ≠ accepted truth.
- Pending Review ≠ Current State.
- Important ≠ blocking.
- Newer ≠ more authoritative.
- Refinement ≠ permission to change truth.
- Ask optimizes for relevance; Open Items guarantees completeness.
