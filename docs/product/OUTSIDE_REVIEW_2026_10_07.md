# Outside design/product review, October 7, 2026: dispositions

The 27 findings from the outside review of the portfolio, State, Project Health and Tastemake. On October 7 Paige decided to keep **only bug fixes** on `staging` and roll the rest back. This file records what was kept, what was reverted, and where the reverted work lives in case any of it is wanted later.

Nothing here has been promoted to `main`.

## Kept on staging (bug fixes)

| # | Finding | What is kept |
| --- | --- | --- |
| 1 | Ask State demotes an accepted fact to a proposal | **Already resolved.** No code change. 8 live Ask questions against production (build `4a64764`, equal to `main` for State code) kept accepted facts established and pending items pending. The residual paraphrase edge is logged as R-021 in `RISKS.md`. |
| 3 | How State Works claims follow-up questions | Copy in `state-how-it-works.html` now matches the live Ask drawer: each question is answered fresh, with no hidden conversation. |
| 4 | Governance PDF has overlapping text | PDF rebuilt by `scripts/build_governance_cheat_sheet.py` with boxes sized from content; one page, no overlaps. The other 11 PDFs have no text collisions. |
| 5 | Unloaded quality cards show zero failures | Project Health cards show "Loading…" or "Not measured" in a neutral style until a suite loads. Test added. |
| 24 | Professional Edge title and intro render twice | The header-stripping regex no longer matched after the review-date comment was added; it is fixed at the source. The efficiency-habits pointer moved into the page intro so no content is lost. |

## Reverted (not bug fixes)

Findings #2, #6-#14, #16, #18-#23 and #25-#27, plus the section 05 Learning Library tag change, the hero byline, the About block, and the case-study and Learning Library copy. They were reverted to their `main` versions on `staging`.

The work is still in git history: commits `c6c6f4e`, `8c2b345`, `926fb0c`, `9a4e7a0` and `9904213` on `staging`. Any file can be restored with `git checkout <commit> -- <file>`.

## Tastemake repo

Findings #15 (year in search results) and #17 (optional display name) are in [pedringt/tastemake#217](https://github.com/pedringt/tastemake/pull/217), open and not merged.

## Not changed intentionally

- The residual paraphrase edge in Ask's prose backstop (#1, R-021): no reproduced product failure, so the boundary was not touched.
- No email, LinkedIn or full name on the site (Paige's decision).
