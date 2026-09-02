# State R9.2 — Ask briefing polish + bounded context

**Build:** `r9.2-ask-briefing-polish-2026-09-02`  
**Base:** R9.1 one-call Ask

## Why this pass
The deployed R9.1 security-meeting answer proved the one-call authority architecture, but the user-facing result was too long, repeated Current State as many cards, duplicated the same retention issue across sections, rendered `Blocks: Blocks:`, and took ~37.8s end-to-end with ~35.8s inside the Anthropic call.

## Changes

### Briefing-shaped meeting prep
- Meeting prep is explicitly constrained to a briefing rather than a record dump.
- Maximum 4 visible sections after deterministic normalization.
- Repeated section kinds are merged.
- Current-State-heavy sections become one `Where things stand` section, capped at 3 items.
- `Needs your review` is capped at 2 items.
- `Get these answered` is capped at 4 items.
- Duplicate record IDs are shown once.
- The same blocker cannot appear in multiple question sections.
- `Blocks:` is normalized in software so the renderer cannot display `Blocks: Blocks:`.
- Prompt forbids unsupported blocker counts and repeated machinery-style headings such as `Current State` / `Open Reviews Qualifying Current State`.
- Suggested refinements are capped at 3.

### Smaller model workload
- One-call Ask output budget reduced from 2600 to 1500 tokens.
- Candidate context is bounded before the provider call with transparent lexical ranking.
- For the seeded security-meeting query, the candidate pool drops from:
  - State 25 -> 13
  - Questions 20 -> 12
  - Evidence 19 -> 12
  - History remains 10
  - Reviews remain 4
  - Rules remain 1
- Security meeting context deliberately retains the meeting note and retention Review while omitting recent demo-copy noise.
- Review-linked State is force-preserved after lexical ranking so relevance trimming cannot sever the authority relationship.

This does **not** weaken the authority model: Current State still governs current truth; Reviews qualify; blockers require backend `blocking=true`; Evidence remains supporting/event evidence; deterministic validation still runs after the model.

### Cleaner Ask working surface
Empty Ask still shows the title, full composer, starter guidance, and examples.

After the first Ask:
- the introductory Ask title/subtitle disappears;
- `See what you can ask` disappears;
- the large top composer disappears;
- a quiet `Current ask` row shows the working query and a text-only `New ask` action;
- `Copy` belongs to the generated answer itself;
- the follow-up composer moves below the answer with `Refine, ask a follow-up, or turn this into something...`.

This restores the intended mental model: Ask is a temporary working surface around the current output, not a permanent chat control panel.

## Latency note
The deployed R9.1 measurement was `context_ms=2048 provider_ms=35767 validation_ms=0 total_ms=37815`, so provider inference was the dominant bottleneck. R9.2 reduces both prompt context and maximum output substantially. The configured Anthropic default is already Claude Haiku 4.5, so this pass does not blindly swap models. Production latency must be measured after deploy using the existing `Ask timing` log line.

## Regression coverage
Added deterministic R9.2 tests for:
- bounded security-meeting candidate context;
- negative relevance (demo-copy noise omitted);
- retention Review retained;
- repeated established sections merged;
- Current State capped at 3 visible items;
- duplicate blocker removed;
- `Blocks:` prefix normalized.

## Verification
- Backend/integration: **193 passed, 3 skipped, 7 subtests passed**
- Existing frontend Ask behavior: **81 passed, 0 failed**
- Note interpretation matrix: **18/18 passed**
- Python compile checks pass.
- JavaScript syntax checks pass for `context-app.js` and `context-ask.js`.

## Deploy smoke test
1. Confirm `/health` reports `r9.2-ask-briefing-polish-2026-09-02`.
2. Ask `Prep me for the security meeting`.
3. Check that the response is visibly shorter and has no repeated Current State machinery.
4. Confirm retention Review and the concrete retention blocker remain visible.
5. Confirm there is no `Blocks: Blocks:` rendering.
6. Confirm the initial Ask controls collapse after the answer and the follow-up composer appears below it.
7. Capture the new `Ask timing ...` line and compare `provider_ms` / `total_ms` with R9.1's ~35.8s / ~37.8s.
