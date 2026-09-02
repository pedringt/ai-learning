# State R8 — Scale QA / realistic Northstar seed

## Why this build exists
R7 correctly stopped mixing fixture Current State into a live backend, but that exposed a sparse demo database: Project could render only one authoritative State item. R8 keeps the authority boundary and gives the demo enough real backend data to stress the product UI.

## Changes
- Added opt-in `STATE_DEMO_BOOTSTRAP=1` startup seeding for the hosted behavioral prototype.
- Seed is idempotent and insert-only: it never overwrites an existing State item or user-reviewed version.
- Northstar stress baseline: 23 Current State items, 18 open Questions (3 true blockers), and 4 open Reviews.
- Project now groups long sections into lightweight content headings while keeping only the three major outline destinations in navigation.
- Project sidebar stays visible on desktop during long-document scrolling; major section headings stay contextual while scrolling.
- Project header/current direction now reads from live Current State where possible instead of presenting a separate fixture-only direction.
- Open Questions shows the first 5 by default, surfaces questions related to active Reviews first, and exposes the long tail behind Show more / Show fewer.
- Blocking Questions remain fully visible and require a named dependency.

## Safety of the demo bootstrap
`render.yaml` enables the seed only for this demo service. `bootstrap_demo_data()` inserts only missing stable demo IDs. Existing records with those IDs are never overwritten. Disable `STATE_DEMO_BOOTSTRAP` before adapting this backend to a non-demo product.

## Verification
- Python: 160 passed, 3 skipped, 7 subtests passed.
- Frontend behavior: 81 passed, 0 failed.
- Note matrix: 18/18 passed, including approval != implementation.
- Demo seed verified idempotent: first run inserts 23 State / 18 Questions / 4 Reviews; second run inserts zero.
- JS syntax and Python compile checks passed.

## Visual QA target after deploy
The point of the larger dataset is to make design weaknesses visible. Check Project section density, sticky outline behavior, long Open Items behavior, Review-card density, History usefulness, and whether the extra State makes Ask answers more coherent. Do not treat every seeded wording choice as final product content.
