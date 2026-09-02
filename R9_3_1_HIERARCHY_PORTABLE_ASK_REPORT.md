# State R9.3.1 — hierarchy + portable Ask

**Build:** `r9.3.1-hierarchy-portable-ask-2026-09-02`  
**Base:** R9.3 visual-system QA

## What changed

### Meeting prep is now a working artifact
- Meeting prep is shaped for use before and during a meeting, not as a State dashboard dump.
- Normalized meeting-prep headings now favor `Decisions needed`, `Get these answered`, and `Useful context`.
- A blank `Meeting notes` scaffold is appended with Decisions, Answers / new information, Actions, and Follow-ups.
- Relevant Review / Question navigation is moved into a quiet `In State` area after the portable meeting content rather than interrupting each briefing item.
- The existing Open Items safety footer remains after the work product.

### Copy has an explicit portable-content contract
- Live Ask no longer copies `.answer-content.innerText` wholesale.
- `context-ask.js` now owns `portableText(payload)` and job-aware copy labels.
- Meeting prep uses `Copy meeting brief`; other known jobs use labels such as `Copy update`, `Copy summary`, `Copy answer`, and `Copy explanation`.
- Portable copy includes the generated artifact, material uncertainty/dependency text, and the meeting-notes scaffold.
- It intentionally excludes State-only navigation, Review/Question CTAs, Open Items safety UI, refinement chips, and other product chrome.
- This creates the boundary needed for future Ask output types without DOM-copy hacks.

### Ask controls and loading
- `Copy meeting brief` is now a real medium-weight outlined action.
- `New ask` remains quiet but is larger, has a plus cue, and a healthier click target.
- Loading uses a compact process surface instead of a giant empty answer card.
- The sticky follow-up composer is not rendered until a real live answer exists.

### Open Items hierarchy
- Urgency-section headers now have restrained semantic bands so `Act now / Needs your review`, blockers, and ordinary questions read as containers rather than more item cards.
- Review items remain separate decision objects beneath the header.

### Notes
- Lifecycle status is moved into a stable top-right column on desktop.
- Responsive rules keep the status visible without squeezing the note body.
- Submitted Evidence immutability and Draft editability are unchanged.

### Project
- Current direction is promoted into a compact summary band.
- Sections and topic groups have stronger editorial chunking.
- Topic groups contain the atomic State facts without changing the underlying Current State model.
- History/pending actions remain visually secondary.

### Shared dialogs
- The shared overlay is now viewport-scrollable and top-safe.
- Tall dialogs use viewport-based max height and safe margins rather than relying on vertical centering.
- The close control remains reachable while dialog content scrolls.
- This fixes the common cause behind both the `How this demo works` and Project Rules clipping seen after R9.3 deploy.

### Capture wording
- Workspace capture is shortened from `+ Add project update` to `+ Add note`, matching the actual Notes/Evidence model and lowering the implied formality of capture.

## Authority / behavior preserved
- Current State still governs current truth.
- Reviews qualify rather than replace Current State.
- Questions do not become blockers without a concrete backend blocking dependency.
- Evidence remains immutable after submission.
- Approval still does not imply implementation.
- No RAG, new integration, mobile redesign, or new authority mechanism was added.

## Verification
- Backend/integration: **193 passed, 3 skipped, 7 subtests passed**.
- Existing frontend Ask behavior: **81 passed, 0 failed**.
- Note interpretation matrix: **18/18 passed**.
- `node --check` clean for `context-app.js` and `context-ask.js`.
- Python compile clean for changed Ask/backend modules.

## Deploy smoke checks
1. Open both `How this demo works` and Project Settings → Rules on a laptop-height viewport; neither should clip at the top and both should scroll internally/safely.
2. Ask `Prep me for the security meeting`; loading should be compact and should not show the sticky follow-up composer.
3. Confirm the finished meeting prep reads as a working brief and ends with blank Meeting notes fields.
4. Click `Copy meeting brief` and paste into a plain editor: State links, `In State`, Open Items footer, and refinement controls should be absent; blocker meaning and the blank notes scaffold should remain.
5. Confirm `New ask` and `Copy meeting brief` are easy to discover without creating a toolbar feel.
6. Confirm Notes pills sit top-right and Open Items urgency bands are visually distinct from Review items.
7. Check Project at normal laptop width and ~390px for chunking/no horizontal overflow.
