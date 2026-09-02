# State Ask — behavioral evaluation map

Development/QA artifact only. This is not portfolio content.

State Ask is evaluated as forgiving deterministic structured search/synthesis. A passing answer either (1) answers from maintained project knowledge, (2) surfaces relevant known material while preserving what remains unresolved, or (3) says State does not know. It should never fail only because a PM used a normal phrasing variant.

| PM question / phrasing | Intent / behavior | Expected sources | Baseline expectation |
|---|---|---|---|
| What’s the current status? / Where are we? / Catch me up | status | Current State + Open + Pending | Discovery nearly complete; bounded human-reviewed pilot; unresolved readiness items visible |
| What changed recently? / What should I know? | status/change | Current State + History + Pending | Recent narrowing and unresolved evidence; pending is not promoted |
| What is blocking us? / What’s holding us up? | blockers | Open + Pending + constraints | Surface items that may block/constrain; do not claim every unresolved item is a confirmed blocker |
| What are we waiting on? / What needs attention? | blockers | Open + Pending | Feature-access authority, retention terms, launch thresholds/reviews |
| What haven’t we figured out? / What don’t we know? | open | Open + Pending | Preserve unknowns explicitly |
| What needs review? / What should I review first? | pending | Pending Review | List unreviewed evidence separately from Current State |
| What have we decided? | decisions | Current State | Human review, bounded scope, read-only, evaluation direction, etc. |
| What did we decide about feature access? | decisions/topic | Current State + relevant Pending | Current reviewed position plus pending evidence if relevant |
| How did we get here? / What was the original plan? | history | History | Chronological change path; historical ideas not presented as current |
| What changed our minds about feature access? | history/topic | History + Evidence | Plan-rule assumption → exceptions challenge → current/pending state |
| What’s in scope? / What can wait? | scope | Current State | Tier 1 troubleshooting; human-reviewed; account changes/autosend/Slack excluded |
| Can it make account changes? / Can it send directly? | scope/safety | Current State | No; sensitive actions and autonomous customer send are out of first implementation |
| Who is this for? / How will reps use it? | workflow | Current State | Tier 1 reps; context + draft; rep verifies/sends |
| What happens if the AI is wrong? | workflow/safety | Current State | Rep remains in loop; unsupported/uncertain cases follow escalation path |
| What training is needed? | workflow | Current State | Task-based training around use, verification, evidence, flagging bad suggestions |
| Who owns this? / Who needs to approve? | stakeholders | Current State + Notes | Support/Security/leadership/vendor roles without inventing unrecorded ownership |
| What does Security care about? | security | Current State + Evidence + Pending | High-risk categories, human review, data boundaries, explicit launch thresholds |
| What’s the automation target? / Are we trying for 50%? | automation | Current State + Pending | No accepted percentage; 50% is an aspirational request, not truth |
| Is 0% the target? | automation | Current State | No. Not established ≠ 0% |
| What data do we need? / What is authoritative? | data | Current State + Open + Pending | Minimum/read-only; approved knowledge/account context; access authority unresolved |
| Why isn’t Slack a source? | data/history | Current State + History | Excluded until ownership/freshness/governance resolved |
| What does good look like? / How will we evaluate? | evaluation | Current State + Open + Pending | Response time, edits, escalation, unsupported claims, severity; thresholds still open |
| Are we ready to build? / launch? | readiness | Current State + Open + Pending | Implementation planning can proceed; launch still has unresolved gates |
| What should we resolve first? | readiness/blockers | Open + Pending | Surface readiness dependencies without fabricating prioritization certainty |
| Prepare me for the Security meeting | meeting prep | Current State + Pending + Evidence | Current direction, Security-established constraints, unresolved asks |
| Prepare me for Support / leadership | meeting prep | Current State + Open + stakeholder-relevant evidence | Audience-relevant briefing |
| Write a support-team update | generated artifact | Current State + relevant Open/Pending | Support-specific polished update |
| Turn this into a Slack update | generated artifact | Current State + relevant Open/Pending | Short, scannable channel-style update; not identical to Support artifact |
| Draft a leadership update | generated artifact | Current State + relevant Open/Pending | Leadership-level status, risks, unresolved decisions; no pending evidence as fact |
| Where are the contradictions? / What is outdated? | reconcile | Current State + History + Pending | Explain known tensions/superseded assumptions |
| How do we know that? / Was this reviewed? | provenance | Current State + Evidence + Pending + History | Explain layer/status and show supporting evidence |
| Who is the vendor contact? | contacts | Notes/Evidence | Maya Chen; do not generalize to ownership not recorded |
| Find the note about feature access | retrieve | Notes/Evidence | Relevant notes, newest first; status visible |
| When is launch? / What will ROI be? / Will Security approve? | unknown + useful context | Related Current State + Open/Pending | Do not invent; state what is known, what it implies, and what would resolve the unknown |

## Controlled state-mutation suite

Primary mutation: add evidence, “Leadership confirmed the first pilot should target 25% autonomous resolution.”

**Pending review:** automation answers remain “not established,” the 25% evidence is surfaced as pending when relevant, “what changed?” / “what needs review?” can surface it, and generated stakeholder updates must not state 25% as accepted truth.

**Accepted:** Current State changes to 25%; direct automation questions answer 25%; the review item leaves Pending Review; History preserves the prior unresolved state and the human-reviewed transition; generated updates may now state 25%.

Additional mutation classes to keep in regression coverage:

- **Confirms Current State:** new evidence agrees with a maintained fact. While pending, Current State does not need to change. After review, provenance/support can strengthen without manufacturing a new substantive decision.
- **Contradicts Current State:** pending evidence is surfaced as a challenge, not silently merged. Current State remains unchanged until review.
- **Resolves an unknown:** while pending, the question remains open. After acceptance, the maintained answer changes and the open question closes; History records the transition.
- **Changes an established fact:** pending evidence cannot overwrite the established fact. Acceptance changes Current State and preserves the prior fact in History.
- **Rejected evidence:** evidence remains available as reviewed/rejected context where useful, but does not alter Current State or future direct answers.
- **Remains pending:** repeated Ask calls continue to distinguish accepted Current State from the pending claim.
- **Unrelated evidence regression:** a note/review about one topic must not alter unrelated answers.

## Automated smoke test

Run from this folder:

`node state-ask-behavior-tests.js`

The smoke suite covers the routing matrix’s major behaviors plus blocker phrasing, audience-vs-channel artifacts, baseline automation unknown, pending 25% evidence, accepted 25% transition/history, and unrelated-note regression.

## Smarter deterministic reasoning layer

The prototype now separates several reusable behaviors from ordinary topic lookup. These are intentionally deterministic and are meant to model product behavior, not simulate a production language model.

- **Unknown + useful context:** future outcomes, launch dates, ROI, risk acceptance, final sign-off, budgets, thresholds, authority selection, and prioritization do not become invented facts. The response instead shows what State knows, what that implies, and what evidence/decision would resolve the unknown.
- **Premise correction:** a question such as “Why did we decide on 50% automation?” is corrected before topic retrieval can accidentally reinforce the false premise. Historical requests stay distinct from accepted Current State.
- **Implication without overclaiming:** schedule-health questions such as “Are we on track?” can synthesize meaningful progress while refusing to judge ahead/behind without an accepted baseline.
- **Scoped compound answers:** “What’s blocking launch and who owns each item?” combines unresolved dependencies with only the ownership the record actually supports; ambiguous/shared ownership stays explicit.
- **Negative phrasing:** questions such as “What aren’t we doing?” and “What isn’t decided?” route to scope and unresolved-state behaviors rather than failing on negation.

New unknown-with-context families include: launch timing, ROI, future Security approval, future pilot success, risk acceptance, launch decision, autonomy decision, authoritative feature-access source selection, launch-blocking thresholds, final sign-off, cost/budget, and priority ranking.

The automated regression suite now contains **78 passing checks** spanning existing question coverage, new phrasing/behavior coverage, audience-specific generated artifacts, premise correction, unknown preservation, implication reasoning, compound ownership, pending-review isolation, accepted-state mutation, history preservation, and unrelated-evidence regression.
