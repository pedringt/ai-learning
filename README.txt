State R9.9 — post-review consolidated follow-up

This package is the working-tree consolidation after the second QA review.

Items to verify after deployment:
- Ask composer text survives lower-section hydration/rerender.
- Shared modal system is viewport-top-safe for every modal.
- Review confirmation/feedback appears immediately rather than after rehydration.
- Resolved Reviews leave active queues optimistically.
- Duplicate Current State is prevented/diagnosed rather than visually hidden.
- Demo reset restores a curated, interactive Northstar baseline (not an empty database):
  established State + History + Notes/Evidence + pending Reviews + blocker + open questions.

Important: database reset is a demo utility, not a substitute for fixing duplicate-State integrity.

Verification performed on packaged working tree:
- Full pytest suite passed.
- Ask behavior harness passed.
