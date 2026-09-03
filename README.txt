State R9.3.2 Project polish patch

Upload these files preserving their paths.

Changes:
- Removes repeated Current direction/Stage prose from the Project header; the header now gives a quiet orientation sentence while the authoritative Current direction remains in its dedicated summary band.
- Rebalances Stage / Outcome / Current State metadata columns so Outcome has more room.
- Quiets per-fact Pending review / History actions until hover/focus, reducing document noise without hiding workflow state.
- Carries forward the Ask fixed-composer clearance regression test from R9.3.1D.
- Adds Project polish regression coverage.

Verification:
- Backend/integration: 196 passed, 3 skipped, 7 subtests passed
- Ask behavior: 81 passed, 0 failed
- Frontend integration contract: 35 passed
