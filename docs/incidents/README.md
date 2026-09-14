# State incident reviews

Use incident reviews for material failures, especially P0/P1 integrity, authority, isolation, grounding, or release failures. The goal is to strengthen the product and QA system, not assign blame or document every minor bug.

## Trigger

Write an incident review when a failure:

- corrupts or risks Current State integrity;
- crosses project/data boundaries;
- bypasses human authorization;
- fabricates consequential provenance/decisions/certainty;
- reaches staging/production despite existing checks and teaches us something important about the QA system;
- causes a meaningful deployment/release failure worth preventing.

## Process

1. Stabilize/fix the immediate failure after authorization.
2. Capture the user-visible impact and exact reproduction.
3. Identify the root cause.
4. Identify why existing QA did not catch it sooner.
5. Add the cheapest durable regression/eval protection that would catch recurrence.
6. Update risks/decisions/QA docs if the incident changes product understanding.
7. Link the incident to the Issue/PR that fixed it.

Use `TEMPLATE.md` for the write-up.

Issue #122 tracks writing the first short incident review from a recent real State QA failure.
