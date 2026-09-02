# State R8.3 — Project scrolling + Notes date-filter fixes

## Why this patch exists
R8.2 was visibly deployed (the new Open Items section treatment appeared), but two bugs remained in the live UI: Project navigation still produced an awkward jump and Notes day filters still appeared to ignore the selected date range.

## Project navigation
- Removed `scrollIntoView()` from every Project navigation path.
- Project jumps now calculate one absolute page Y target and call `window.scrollTo()` once.
- Overview now scrolls to the Project document header, not browser Y=0. Returning to page origin was reintroducing portfolio/workspace chrome and changing visible geometry during the movement.
- Product / Safety / Evaluation use the same absolute-target helper with a small reading offset.
- Removed sticky Project section headings. The sticky left outline + scroll-spy already provide section context; sticky body headings were moving during the same scroll animation and could create an apparent second jump.
- Removed obsolete Project `scroll-margin-top` compensation.

## Notes date filters
- Date filtering now compares **calendar-day numbers**, not Date objects at local/UTC midnights.
- Date-only values (`YYYY-MM-DD`) remain literal calendar dates.
- Timestamp values are converted to the user's local calendar date first.
- `Today` requires age = 0 days.
- `7 days` means today plus the previous 6 calendar days.
- `30 days` means today plus the previous 29 calendar days.
- Future-dated notes are excluded from historical day windows.
- Live search now updates the visible result count too, so the count cannot disagree with the rendered list.

A fixture sanity check on Sep 2 gives distinct buckets: All=25, Today=0, 7 days=5, 30 days=25 before live backend notes are added.

## Verification
- Backend/integration: **169 passed, 3 skipped, 7 subtests passed**.
- Frontend integration contracts: **24 passed**.
- Frontend Ask behavior: **81 passed, 0 failed**.
- Note interpretation matrix: **18/18 passed**.
- `node --check` passed for `context-app.js`.
- Python compile checks passed.
- `/health` build revision: `r8.3-scroll-notes-fixes-2026-09-02`.

## Live QA after deploy
1. Project: click Product, Safety, Evaluation, Overview in both directions. Each click should produce one continuous movement with no second snap/correction.
2. Notes with Status = All: compare All time / Today / 7 days / 30 days. The visible result count and list should both change.
3. Repeat Notes date ranges with Reviewed and In review selected.
4. Type in Notes search while a date range is active; the result count and rendered rows should stay inside that same date range.
