# Morning fixes v4

- Strengthened provider prompt invariant: every update/retire `state_item_id` must also appear in the same recommendation's `affected_state_item_ids`.
- Switched the Render/default Anthropic interpreter from Claude Sonnet 4.6 to Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) to address production provider latency; remains configurable with `CLAUDE_MODEL`.
- Made Claude output cap configurable through `CLAUDE_MAX_TOKENS` (default 1600).
- Added provider timing logs with model, prompt size, output cap, and elapsed milliseconds.
- Fixed retire Review rendering so missing `proposed_statement` cannot display as `undefined`.
- Reconciled backend-managed Project State against `/api/state` so retired items stop appearing as current.
- Added regression tests for prompt targeting invariant, low-latency provider defaults, retire rendering, and State reconciliation.

Verification:
- pytest: 91 passed, 3 skipped, 7 subtests passed
- note matrix: 17/17 passed
- frontend behavior suite: 78/78 passed
