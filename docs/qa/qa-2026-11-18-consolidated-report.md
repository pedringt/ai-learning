# Consolidated production QA: findings and local fixes (Nov 18, 2026)

**Scope:** the consolidated QA handoff of Nov 18 (portfolio, case studies, library, State, Tastemake, Project Health).
**Production at the time:** ai-learning `main` 3c5b67d (PR #715), Tastemake `main` 58869c4.
**Rules followed:**
- Production was read-only (page GETs only), because a deep QA pass was running there.
- No model calls, no staging or production changes, nothing pushed or merged.
- All fixes are local commits, verified locally. **None of this is on staging or production.**

| Repo | Branch (local only) | Commits |
|---|---|---|
| pedringt/ai-learning | `qa/nov18-fixes` (base staging b9cdbb1) | d30282d library · a6c80c4 Project Health · 6f689be State · b3faf21 #716 proposal |
| pedringt/tastemake | `qa/nov18-fixes` (base main 58869c4) | 35d31de reason wording · 56bbcab popover · e66bec8 reset + banner |

**Verification**
- **ai-learning:** `make qa-fast` with local Postgres. Python 1947 passed / 50 skipped (real-model only), JS fail 0, no model calls.
- **Tastemake:** `npm run test:unit` 72/72 suites, 4204 checks.
- **Browser checks:** headless Chromium against local servers.
- **New regression tests:** each fails without its fix, unless noted otherwise.

## Findings

| # | Finding | Priority | Status | Evidence | Root cause | Resolution | Verification | Decision for Paige |
|---|---|---|---|---|---|---|---|---|
| 1 | /ai-professional-edge content missing from the initial HTML | P1 | **Fixed locally** | Production raw HTML is 79 words plus "Loading…"; rendered is 3,193 words. No `<noscript>`. Only library page built this way. | The page fetched `content/ai-professional-edge.md` and rendered it in the browser (#263); no build step | `tools/render_professional_edge.js` writes the rendered sections, jump links and date into the page using the page's own renderer (`ai-professional-edge-render.js`). The markdown stays the source. `--check` runs in qa-js. The fetch stays as a fallback. | JS off: 3,297 words, 8 jump links, no "Loading…". JS on: unchanged; deep links land at the scroll padding. Fallback path renders. Drift test fails when the md changes without re-rendering. | — |
| 1b | Review date out of sync ("October" in HTML, Nov 11 in source) | P1 (part) | **Fixed locally** | `ai-professional-edge.html:35` fallback vs `content/…md:7` marker | Date duplicated in two places | Generator writes it from the marker | Test asserts the note comes from the marker | — |
| 1c | Glossary table never renders | side finding | Confirmed, open | `makeGlossary()` looks for `concepts-and-vocabulary`; the section is now `working-vocabulary` | Heading renamed | Not changed | — | Keep the table (change the id) or delete the dead code? |
| 2 | Tastemake "New this week" says "same genre as Arrival" | P2 | **Wording fixed locally**; rest needs a decision | Reproduced offline: one shared tag → "in the same genre as Arrival". No model is involved (template). | `newReleaseReason` overstated a single shared tag | Now "New sci-fi this week; it shares only that genre with Arrival." | Tests assert no "same genre as" | New this week ignores **dislikes** and **"Not me"** (the main shortlist uses both). Apply them here too? |
| 3 | "More about why" covers "Tried it"; Escape doesn't dismiss | P2 | **Escape and focus fixed locally**; overlap needs a decision | Escape added `is-dismissed` then focused the link, which un-dismissed it; a hover preview ignored Escape; a pinned popover stayed over the focused "Tried it" | Handler order; no close on focus-out | Focus moves before dismissal; Escape closes hover previews; a pinned popover closes when focus leaves it | Checks added to `scripts/qa/bookmark-flow.js`. **Not run:** the headless harness gave "NO RESULT" here with both Chrome builds. Needs a run where it works. | Pinned popover over the buttons is a documented choice. Make it push the buttons down instead? |
| 4 | State Ask: no visible Ask button after an answer; Enter reruns | P2 | **Duplicate request fixed locally**; Enter behavior needs a decision | Two Enters while answering sent two requests; a replaced run wasn't aborted; reopening after close showed a stuck "Finding the answer…" | `runAsk` had no in-flight guard; `closeAskDrawer` didn't clear the result | Same-question duplicates ignored; a replaced run is aborted; close clears the result | 3 browser tests; each fails without the fix | After an answer the button is hidden by design (Sept 8, 954604e) but Enter still reruns the unchanged question (free, from the cache). Keep, make Enter do nothing, or show the button? |
| 5 | State Add Evidence intermittently ignores clicks | P2 | **Fixed locally** | Locally with latency, the click just after bootstrap missed; the button moved y=99→205 when the "Exploring State?" guide was inserted. Same timing on production (~932 ms). | Guide inserted above the heading after Evidence loads | The guide's space is kept, hidden, while loading | Browser test: button position unchanged across load (fails without the fix) | — |
| 6 | Project Health historical scores read as current | P2 | **Mostly already fixed by #597**; 3 gaps fixed locally | #597 (PR #608): "Recorded …", previous-results labels, counts lead, "Not comparable" | — | G1: "high-severity changed" was dated by the fetch ("just now"), now by the run. G2: suites from different days get their own dates. G3: the headline no longer says "healthy" when freshness can't be checked. | JS tests for each | Should a severity change across different scoring versions be suppressed or marked "not comparable"? |
| 6b | /state-evals shows a superseded failure as current | P2 | Already filed: **#718** | — | — | Not duplicated | — | (see #718) |
| 7 | Tastemake case-study figures hard to compare | P2 | Confirmed; **wording proposal only** | Sources: PR #331 and `tastemake-research/archive/1b`. 62/63 = Test A, one synthetic run, prompt **not shipped**. 8/15 vs 9/13 = Test B, one rater, blind. 11 = pairs rated on both sides (3 worse, 8 same, 0 better). | Page reads as if 98% describes Tastemake today | Proposed: "With a rule requiring the deciding rating (tested Nov 4, not shipped): 62 of 63 eligible picks cited it, across 12 synthetic profiles in one run…" and "Blind review, one rater: 8 of 15 … with the rule vs 9 of 13 without; of 11 pairs rated on both sides, 3 got worse, none improved." | Arithmetic checked against the records | Approve wording before editing `tastemake.html`? |
| 8 | Connect Slack as an anonymous visitor | — | Confirmed; **belongs to open #594** | No auth on Slack routes. A visitor can start OAuth, disable channels, re-enable a channel from another project (moving it there), and disconnect. Forged OAuth state is rejected. The callback doesn't check the team ID. | No admin protection on integration routes | Not changed (architecture decision in #594) | Read locally; production endpoints never called | Add admin-key protection and a team-ID check (#594)? |
| 9 | Shared demo safety | — | Authority invariants **hold**; 2 disclosure gaps | Evidence immutable; proposals need explicit accept; History accurate; failed AI requests change nothing. **Gap:** a new visitor's first view is whatever project the last visitor switched to (shared pointer). **Gap:** seeded projects' sharing is disclosed only in docs. | Shared `active_project` row | Not changed | 71 related tests pass | Default a fresh visitor to Northstar, or disclose? |
| 10 | Tastemake Example Profile banner says "two she corrected" | P3 | **Fixed locally** | Data has two corrections (both "Partly"); one is featured, one is in Full profile. "55 rated / 6 bookmarked" verified (33+15+7, +6). | Banner didn't say where they are | "…two she corrected: one shown below, the other in the Full profile." | Test ties the count to the data | — |
| 11 | Tastemake "Start over" keeps old New-this-week matches | new | **Fixed locally** | `fresh()` has no `newReleases`; reset and restore kept it | — | Both clear it | Tests fail without it | Also hide New this week on the Example Profile? |
| 12 | Project Health case study leads with an older example | Editorial | **Draft only** | Verified: two failing runs (fef89bd, a7c6033) → #711 investigation (24/30) → DEC-033 → measured 28/30, suite 471/480 → release check 44392813858 and production run 44401447259 both 16/16 | — | Draft lead in the Project Health investigation notes. The caveat: 16/16 is one pass; the repeated measure is 28/30. | — | Replace or supplement the 9-of-10 lead? |
| 13 | State case study "worth revisiting" | P3 | **No experiment exists** | The Nov 17 handoff says "no renewed experiment has been run yet". No document or issue. | — | Options: "…I haven't rerun the comparison against the current version, so I don't claim State does this better," or delete the sentence | — | Which option, and should the revisit get an issue? |
| 14 | Library navigation "Learning Library" vs "Library" | P3 | Mostly not a defect; 1 fix | Every visible label says "Library"; "Learning Library" is only in comments. Cheat sheets' brand didn't link home. | — | Brand links home in all 17 cheat sheets | Click goes home; still hidden in print | Governance handbook eyebrow ("Library", no qualifier): add one? Rename "← All references" to "← Library"? |
| 15 | Homepage repetition | Editorial | Recommendations only | Project Health card repeated word for word; the authority line appears 3 times; cards don't say Paige's role; some link labels differ from page titles | — | Not changed | — | Which, if any, to apply |
| 16 | Content audit | — | Clean | No spelling or grammar errors; one h1 per page; all internal links resolve; metrics match sources | — | — | — | Broken LexisNexis link (#719), state-evals meta (#721), Neon link (#720) already filed. IAPP link now lands on a search page; bot-blocked links need a manual click. |
| 17 | #716 "the Northstar folks" (my #705 gap) | P2 (regression) | **Proposal built locally** | Five phrasings answered with a misleading absence | No cue for a group noun after the name | Seventh cue: folks/people/crew/team/staff/… | Cue table extended; fails without it | Approve the cue? |

## Not covered
- **Popover fix:** not exercised in a browser; the headless harness doesn't run here (item 3).
- **Project switch:** I didn't reproduce Add Evidence after a project switch, though the same mechanism applies.
- **Slack app:** whether it allows installs from other workspaces wasn't checked, because that needs Slack.
- **Production interactions:** none, deliberately.

## Follow-up (Nov 18, after scope review)
- **Tastemake popover, now browser-verified:** `bookmark-flow.js` in Playwright Chromium (served from the worktree, the same page the harness builds) gives 137/137 at 1440 and 390. With `src/app.js` from before 56bbcab, the two new checks fail.
- **B2 done:** the unsupported "worth revisiting" sentence (`state-36`) was removed from `implementation-context.html`.
- **B3 done:** the renderer turns the Working Vocabulary list into the glossary table (17 terms), so it's in the prerendered HTML. The dead `makeGlossary()` was removed. A test fails without the fix. Checked at 390px: readable, no sideways scroll.
- **#716 (b3faf21) is still a proposal:** it isn't part of the approved fixes until its false-positive behavior is reviewed.
- **Live first-visitor pass:** read-only, with writes blocked in the browser.
  - Home, the three case studies, Professional Edge, the State app and Tastemake (fresh and Example Profile) at 1440 and 390: no page errors, no failed requests, no sideways scroll.
  - State's tabs and the Ask drawer open correctly. The demo has only the two seeded projects, with Northstar active.
