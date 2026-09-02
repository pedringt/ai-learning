# State R8.2 — Open Items + hydration + Project navigation polish

## Changes

- Open Items now presents three visually distinct collapsible sections: Needs your review, Blocking questions, and Open questions.
- Section counts remain visible while collapsed. Reviews and blockers default expanded; Open questions defaults collapsed when there are more than five items. Collapse state is retained in frontend session state while navigating around the app.
- Empty sections remain visible as compact rows so the three attention concepts stay discoverable.
- The existing per-Review accordion remains intact inside the Reviews section, and long Open Questions still uses Show more after the section is expanded.
- Authoritative Review UI counts are suppressed until the backend open-Reviews request has successfully hydrated. This removes the fixture-count flash in the yellow Overview banner and sidebar Open Items badge. The underlying Ask authority behavior is unchanged.
- Project Overview navigation now uses one explicit smooth scroll to page top instead of treating Overview as a normal section anchor, removing the small end-position correction seen in visual QA.

## Regression coverage

- Added contracts for no pre-hydration Review-count flash.
- Added contracts for collapsible Open Items sections and default long-question collapse.
- Added contract for the Project Overview exact-top scroll path.
- Updated the older Project navigation/scaling contracts to reflect the new helper and section copy without weakening their behavioral assertions.

## Verification

- Backend/integration: 169 passed, 3 skipped, 7 subtests passed.
- Frontend integration contracts: 24 passed.
- Frontend Ask behavior: 81 passed, 0 failed.
- Note interpretation matrix: 18/18 passed.
- JavaScript syntax check passed.

## Visual QA after deploy

Verify that the Overview yellow banner does not briefly show a fixture Review count on reload; Open Items sections have clearly different hierarchy and collapse independently; long Open Questions begins collapsed; and Project > Overview makes one smooth movement to the exact top without a second correction.
