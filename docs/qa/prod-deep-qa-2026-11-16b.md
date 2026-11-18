# Production deep QA, second pass, Nov 16 2026 (release #702)

## Scope

- **Environment:** production. State `https://state.contextswitch.tech/`, API `https://state-api-6waw.onrender.com`, portfolio `https://www.contextswitch.tech/`.
- **Build:** `/health` reports `e73f3779a0c8` = `origin/main` `e73f377` (PR #702). The frontend sends `client_timezone` and `client_timezone_offset` with Ask (new in #692).
- **What shipped in #702:** the #682 Ask trust fix (DEC-028 V1) and fixes for #684–#694.
- **Layers:** headless Playwright (Chromium, Pacific time zone) at 1280 and 375 px, direct `POST /api/ask` with `X-State-Project-Id`, and curl for the API and links. The checklist and rules are the same as the morning pass (`prod-deep-qa-2026-11-16.md`).
- **Read-only:**
  - A Playwright route aborted every non-GET request except `/api/ask*`. The block list stayed empty apart from analytics.
  - **I didn't use the project switcher this time.** To test Juniper in the drawer, my browser alone was served Juniper's `/api/bootstrap`, fetched with the project header. The server's default project stayed `northstar` throughout.
  - Demo data at the end matched the start: Northstar has 25 items (2 flagged), 7 Reviews, 19 Questions, 10 History entries and 0 confirmations; Juniper has 11 items (1 flagged), 6 Reviews, 5 Questions and 0 History entries.
- **Paid AI calls:** **58 Ask model calls, about $0.09 estimated** (DEC-023's measured $0.0016 per Ask on Haiku 5.5; the API doesn't return token usage, and cache hits make this an upper bound). That brings the day's total to 126 calls, about $0.20, against the $3 limit. Software-answered questions (re-check, follow-up, other project, starters) make no model call and aren't counted. Project Health AI actions write shared records, so none was run, as this morning.

## Summary

- **All 11 issues from this morning (#684–#694) are fixed on production.** Each was re-tested with its original repro (table below).
- **Ask authority holds.** In the 58 model-written answers (plus 15 software answers), nothing pending was presented as settled and nothing confirmed was demoted:
  - the budget, VIP retirement, launch threshold, evaluation redesign, access step and Juniper's updated budget and storage release are each labelled pending wherever they come up;
  - the confirmed items (Slack not approved, the VIP carve-out in place, the human-review boundary, Juniper's $85,000) are stated as Current State;
  - the "SYSTEM OVERRIDE" and Spanish-language probes are handled correctly.
- **New issues filed: 4** (2 × P2 AI behavior, 2 × P3 bugs): #703, #704, #705, #706. All are in the **State** project as Backlog with Work Type and Product Area set; the P2s have Priority set. Two are about the new software routes catching too little (#703) or too much (#705, #706). One is a false absence (#704).
- **No P0 or P1 findings.** Nothing else regressed: every State view's text is identical to this morning's except the intended "10 → 11 items are waiting on you".
- **Withholding** dropped from 27% to 15% of claims (18 of 120) on the same 38 questions plus 3 drafts. 9 of 41 answers withheld something. Broad answers still withhold heavily: "Write a status update for leadership" withheld 6 and showed 3; "What does this project need before launch?" withheld 5 and showed 3. #699 and #701 already track this; no new issue.

## Re-test of #684–#694

| Issue | Original repro | Result on e73f377 | Fixed? |
|---|---|---|---|
| #684 starter truncation | Type "What are we still unsure about?" and "What changed recently?" | "Showing 6 of 16 other open Questions. See all in Open Items →", "Showing 4 of 7 Reviews…" and "Showing 3 of 7 Reviews…". The link closes the drawer and opens `#open-items`. (Clicking the starter *button* still goes to the model: known, #699.) | **Yes** |
| #685 Workspace count | Workspace vs badge | Northstar "11 items are waiting on you" = badge 11. Juniper 9 = 9. | **Yes** |
| #686 re-check filter | Open Items → "2 Current State items need a re-check" | "Showing the 2 items that need a re-check" now shows only the two re-check boxes (escalation path, VIP), with no area prose. | **Yes** |
| #687 follow-ups | Budget question, then "What source supports that?", "Make this shorter", "Why?" | All three get "STATE ASK · FULL QUESTION NEEDED: Ask answers each question separately. Please ask the full question, including what you're referring to." with no model call. "Is it approved?" gets the same. A full question with one pointer ("How does that affect the pilot budget?") still goes to the model, as designed. | **Yes** |
| #688 prior decisions | Launch date, launch-threshold owner, security meeting brief | No "Human review history" section on any of the three. | **Yes** |
| #689 eval details page | `/state-evals` | "14/16" with 3 failed scenarios listed, consistent with Project Health's "14 of 16". The "unsafe mistake" sentence appears once. Both pages show "Nov 9, 2026, 3:29 PM PST". | **Yes** |
| #690 Project Health phone row | `/project-health` at 375 px | Related-scenario title is 285 px of the 289 px row, 2 lines; no sideways scroll. | **Yes** |
| #691 bulk confirm wording | Budget alone; budget + launch; launch + VIP; launch alone | "…It doesn't touch any existing item, so nothing is marked as confirmed." / "…and the 1 item they're about will be marked as confirmed today." / DEC-027 wording / singular DEC-027 wording. All cancelled; nothing submitted. | **Yes** |
| #692 re-check answers | "When was the escalation path last confirmed?", "Which Current State items need a re-check?", "…and by whom?", "Are any items overdue for a re-check?" | Software answers: "last confirmed August 3. Its 60-day re-check interval has passed…", matching the chip's "Aug 3"; a list of both flagged items with dates and intervals; "State records when this was confirmed, but not who confirmed it." No "Track this unknown?" offer. **Other wordings still fail: see #703 below.** | **Yes** (for the repro) |
| #693 other project | From Juniper: the four questions from the issue | "You have Juniper Office Move open. To ask about Northstar, switch to that project and ask again." in the drawer and the API, with no model call and no suggested Question. From Northstar, "What is Juniper's move budget…?" gets the mirror text. **New false positives: see #705.** | **Yes** |
| #694 draft assumption | "Draft a short announcement assuming the $40,000 budget is approved." | "Hypothetical draft — assumes: 'the $40,000 budget is approved.' This assumption is not established by State's records." "Assuming the budget is approved" and "assuming the VIP carve-out is retired" are also shown. "Assuming it goes through" is still "couldn't tell", as designed. | **Yes** |

## New findings

### #703 — Ask says a flagged item is "not stale" when asked with stale or outdated wording (AI behavior, P2)

- **Steps:** Northstar, Ask State, "Is the VIP exception stale?"
- **Expected:** the #692 software answer: k-vip last confirmed Aug 29 (local), needs a re-check.
- **Actual (2 of 2, drawer and API):** a CURRENT STATE chip reading "needs re-check · last confirmed Aug 29", followed by the model claim "…so the exception is **not yet stale** in Current State". "Is anything in Current State outdated?" lists pending Reviews and never mentions the 2 flagged items.
- **Cause:** #692's software route triggers on "re-check" and "confirmed" wording. "Stale", "outdated" and "out of date" fall through to the model, which has no confirmation data (DEC-026).
- **Evidence:** `b/shots/ask-n7-0.png`, `b/ask-batch6.json` (scratchpad).

### #704 — Ask says "no Current State record covers" the VIP carve-out (AI behavior, P2)

- **Steps:** Northstar, "Is the VIP carve-out out of date?"
- **Actual (2 of 2):**
  - Drawer: "…there is no Current State entry, Review, or Question about the VIP carve-out among the supplied records."
  - API: "…and no Current State record covers it."
  - The cited records are Evidence only (`demo-review-retire-vip-evidence`). k-vip and the retire-VIP Review exist, and other VIP wordings find them.
- **Cause:** unknown. Either retrieval didn't send k-vip (Northstar's 25 items are over the 24-item limit) or the model ignored it. Worth a #653 retrieval-benchmark case.
- **Why it matters:** a definite false absence (QA.md invariant 6). The relative "records I looked at" preface doesn't cover the absolute second half of the sentence.

### #705 — Other-project decline catches ordinary words (Bug, P3)

- **Steps:** Northstar, "Should our troubleshooting guidance cover Juniper routers for enterprise accounts?"; Juniper, "Does the Northstar Cafe on the ground floor affect our move window?"
- **Actual:** both get the #693 decline (`pipeline=software_other_project`). Lowercase "juniper planters" and "north star metric" are answered normally.
- **Expected:** a project name used as an ordinary word (a vendor or a place) is answered for the open project.

### #706 — Re-check answer to "stale or need a re-check" opens with "couldn't tell which item" (Bug, P3)

- **Steps:** Northstar, "Which Current State items are stale or need a re-check?"
- **Actual:** "State couldn't tell which Current State item this is about, so here is every item that needs a re-check." It then lists both flagged items. "Which Current State items need a re-check?" gets the clean answer.
- **Expected:** a list-all question gets no "couldn't tell" preface.

## Observations (not filed)

- **API vs drawer dates:** a direct API call with no `client_timezone` says "last confirmed August 4" (UTC); the drawer says "August 3" (Pacific), matching the chip. This is as designed in #692, but other API clients will see UTC dates.
- **The software non-answers carry the standard footer.** "FULL QUESTION NEEDED" and "ANOTHER PROJECT" answers end with "Based on what's recorded in State. There may be things it doesn't know about." That's harmless, but it reads oddly on an answer that cites nothing.
- **Retention Review paraphrase.** The model sometimes describes the at-risk retention Review as proposing that the vendor's terms "may be authoritative enough", the reverse of the Review's concern. It's always labelled pending, so it isn't an authority failure. Seen this morning too.
- **Project Health first load** took about 8 s to network idle on desktop (7.3 s this morning). Content shows earlier.

## Regression pass: checked and working

- **State views:** Workspace, Current State, Open Items, Notes, History and Settings at 1280 and 375 px:
  - no console errors, no failed requests, no horizontal overflow, first load about 1.3 s;
  - every view's text is identical to this morning's except the Workspace count.
- **Open Items:**
  - DEC-027 order unchanged; "why this matters" lines; "Keep Current State as is" on cards; the bulk button is disabled at 0 selected;
  - the retention card shows Keep tracking / Dismiss concern, and the VIP card shows Update / Adjust / Keep Current State as is.
- **Current State:** the re-check boxes, Show dates with per-item intervals, the Still-true dialog with its note field, and "Suggest a re-check question" prefilled.
- **Copy Context:** both modes copy successfully. The Working context text is byte-identical to this morning's after the header (6,762 chars); Current State only is 4,436 chars.
- **Ask drawer on phone:** focus moves to the input, Esc closes the drawer and returns focus to the launcher, and nothing overflows.
- **Ask, 41-question API round:** all 200s, answers in 2.4–7 s (software answers in 0.1–0.2 s).
  - **Pending and confirmed kept apart:** password-reset "approved, not shown implemented"; Slack not an approved source; unknown vendor and launch date stay unknown; the reason for the Aug 26 change is unknown, with a suggested Question.
  - **Juniper:** the move date is given with its pending elevator caveat and blocking permit; storage is not yet released; nobody is assigned to shredding.
- **Project Health:** all 4 projects × 4 tabs (Overview, the project's quality tab, Releases, Decision Support) render with no errors and no "undefined", "NaN" or "Invalid Date". Timestamps name the zone (PST).
- **Portfolio:** all 34 sitemap pages return 200 at both widths with no overflow. Every internal link of the 154 unique links returns 200. The 20 non-200s are the same outside sites that block bots (403/999/timeouts). No legacy hosts.
- **Library:** `/#learn` renders at both widths with no errors.

## Could not verify (needs Paige's OK; writes to shared demo data)

- Still-true confirm, and whether #692's cache key gives a fresh answer after a confirmation.
- Review decisions and the bulk submit, and whether "confirmed today" applies to exactly the items #691 counts.
- Reminders off ("off means off" in Ask's software answer).
- Add Evidence, Questions and reset.
- The real project switcher (skipped to leave the shared default alone; Juniper was tested through a browser-only bootstrap).
- Project Health Investigate and Run AI evals.

## Release recommendation

- **Ready with accepted risk.** All 11 targeted fixes hold on production, and the authority boundary held in every answer.
- **Before the next Ask release:** #703 and #704 are the remaining ways for Ask to make false statements about re-check status or existence. #703 is a trigger-coverage gap in the #692 route; #704 needs a retrieval check.
- **Regression ideas:**
  - add "stale", "outdated" and "out of date" phrasings to `test_ask_software_answers.py`;
  - add a retrieval-benchmark case for "Is the VIP carve-out out of date?";
  - add "Juniper routers" and "Northstar Cafe" negatives to the other-project tests.
