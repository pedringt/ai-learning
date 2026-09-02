# R9.3 — Visual System + QA Pass

Build: `r9.3-visual-system-polish-2026-09-02`

## Scope completed

- Ask active-session output now sits on one clean white briefing surface with stronger section hierarchy and semantic status treatments.
- Open Items Reviews were simplified: the card-level chevron was removed, the Review question remains the visual anchor, Current understanding and evidence/proposed change are supporting context, and redundant generic Review-question machinery is removed for evidence-only Reviews.
- Notes lifecycle pills now share one geometry whether static or clickable. Submitted backend Evidence explicitly explains that it is preserved and not editable; Draft Notes remain editable.
- Project gets a calmer established-State document surface, semantic section accents, and responsive metadata tiles. The Current State metric can no longer collapse into a word-by-word column.
- History now distinguishes previous understanding from accepted new understanding with restrained semantic color.
- `How this demo works` is repaired. Root cause: the click handler called `showDemoHelp()` but no function existed. The modal now teaches Notes → Review → Project/Current State → History, Questions, Ask, and Project Rules.
- Mobile is a regression target, not a redesign: 760px/430px rules stack metrics/actions/content rather than squeezing them. Sticky Ask remains available.

## QA

Automated regression floor after the visual pass:

- Backend/integration: **193 passed, 3 skipped, 7 subtests passed**
- Existing Ask behavior suite: **81 passed, 0 failed**
- Note interpretation matrix: **18/18 passed**
- `node --check` clean for `context-app.js` and `context-ask.js`

Additional static QA confirmed:

- `show-demo-help` now has a concrete `showDemoHelp()` implementation.
- Review cards no longer render a second card-level disclosure chevron.
- Notes status links no longer inherit button typography in a way that changes pill sizing.
- Project metadata has explicit minimum/stacking behavior at desktop, tablet, and phone widths.
- No authority, Review-resolution, Evidence immutability, Question/blocker, History, or Ask backend semantics were changed by this pass.

## Remaining manual/deployed checks

This environment does not provide a full interactive browser run against the deployed app, so the following remain visual smoke checks after deploy:

1. Ask sticky composer does not cover the final answer/footer at common laptop heights.
2. Project metadata looks balanced with real deployed font metrics.
3. Open Item card row remains obviously clickable without the card chevron.
4. Notes pills are consistent across Reviewed / In Review records.
5. `How this demo works` opens, traps focus, and closes correctly in the deployed browser.
6. 390px quick capture, Ask reading, and Open Items reading have no horizontal overflow.

No new P0/P1 behavioral issue was found in the automated/static pass. The highest remaining risk is visual/browser-specific regression, so the next useful QA input is a short deployed screenshot sweep rather than more backend changes.
