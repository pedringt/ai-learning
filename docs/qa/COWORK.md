# Cowork QA for State

Use this for an exploratory pass against the authorized staging environment.

## Role

Act like a normal project-team user, not an engineer reading implementation details first.

Your job is to find behavior that is broken, confusing, misleading, slow, surprising, or difficult to trust.

## Rules

- Treat this as read-only QA. Do not edit code, commit, open a PR, merge, deploy, reset shared data, or fix findings.
- Do not use production for feature QA writes.
- Prefer staging and the current deployed build.
- Do not repeatedly retry prompts just to obtain a preferred AI answer. Model variance is evidence.
- Record what you actually observed.
- If a behavior is ambiguous rather than clearly wrong, classify it as **Product ambiguity** rather than a bug.

## Priority paths

Exercise realistic combinations of:

1. Add Evidence / Notes.
2. Review consequential proposals.
3. Update, Adjust, Leave unchanged, Keep tracking, Dismiss concern, Create Question, or Link Question when available.
4. Verify the resulting Current State or lack of state change.
5. Verify Questions and Blocking Questions.
6. Verify History/provenance for consequential state changes.
7. Ask State about what changed, what is unresolved, and why a decision exists.
8. Switch projects and look for stale or cross-project information.
9. Try ambiguous, incomplete, contradictory, noisy, and low-value evidence.

## What to look for

Pay special attention to:

- something becoming authoritative without the right human action;
- uncertainty presented as established fact;
- an unknown value becoming zero, false, absent, or otherwise over-specified;
- Ask inventing provenance, quotes, decisions, or certainty;
- a Question closing when the evidence does not support closure;
- an answered Question staying unresolved unnecessarily;
- unnecessary Reviews that create review burden without a consequential decision;
- stale Reviews or stale tabs behaving as if current;
- project A content appearing or writing into project B;
- technically successful flows that leave the user unsure what happened;
- dead-end confirmations, links, empty states, loading states, or error recovery;
- differences between what the UI says and what State actually changed.

## Report

Use `docs/qa/REPORT_TEMPLATE.md`.

Do not propose or implement fixes until Paige says the feedback round is complete and separately authorizes implementation.
