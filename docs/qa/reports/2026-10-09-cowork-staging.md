# State QA report

> **Triage note (added Oct 9 after the pass):** every finding checked was already present on production (`main`), not introduced by staging. The backend code behind Ask, Review and dates is identical on both; the switcher, the Sources banner, the Baseline reload and the homepage ticker were checked on production directly. The release recommendation below is about State as a whole, not the staging-to-main delta. Issues: see the links added to each finding's GitHub issue.

## Scope

- **Environment / branch:** State staging (`state-git-staging-cairn10.vercel.app`, API `state-api-staging.onrender.com`); portfolio preview (`ai-learning-git-staging-cairn10.vercel.app`)
- **Build or commit:** State assets tagged `v=r118-current-state-feedback`. Portfolio CSS tagged `r16-release-hardening` / `451-fold-shape`. Commit SHA not confirmed from the deployment.
- **QA layer used:** Cowork exploratory pass in the in-app browser. Desktop at 1280×800 and phone at 375×812 (Android UA emulation). Signed in to Vercel by Paige. Read-only toward code; normal user writes on staging only.
- **Areas exercised:** Add Evidence (contradictory, noisy, tentative); Reviews (Update, Adjust, Leave unchanged, Keep tracking, Dismiss concern, Create Question, Link existing Question, Dismiss suggestion); Current State, Questions and History afterwards; Ask State (4 typed questions + 1 suggested chip, each run once); project switching and stale tab; two new projects (Enter Current State manually, Add starting material); phone width; portfolio home + 4 case studies.

## Summary

- **P0:** 0
- **P1:** 3 (QA-01, QA-02, QA-03)
- **P2:** 8 (QA-04 to QA-10, PF-01)
- **P3:** 9 (QA-12 to QA-16, PF-02, PF-03, PF-05, PF-06)
- **Product ambiguities:** 3 (QA-10, QA-11, PF-04), plus 4 observations listed under QA-11 and PF-04
- **Regression risks:** date/timezone handling (QA-07); Ask post-processing (QA-01, QA-05)

## Findings

### QA-01 — Ask rewrites "approved" Current State as "not yet approved"

- **Severity:** P1
- **Type:** Confirmed bug
- **Area:** Ask
- **Reproduction:** In Juniper Office Move, Ask "What changed in the project today, and what budget is approved?"
- **Expected:** The answer reflects Current State: "The move budget is approved at $85,000…"
- **Actual:** The answer headline says "Move budget is approved at $85,000". The summary then says "Current State records the proposed for approval (not yet approved) move budget at $85,000." While the answer was still drafting, the same sentence said "records the approved move budget". So the change happens when the final answer replaces the draft. The same garbled phrase appears in Northstar answers: "the proposed for approval (not yet approved) decision belongs to the Security function" and "conflict with earlier proposed for approval (not yet approved) terms and governance decisions".
- **Why it matters:** Ask contradicts accepted Current State. It downgrades a fact a human approved and produces broken sentences.
- **Evidence:** Drawer text captured verbatim at the drafting and final stages (Juniper); two separate Northstar answers.

### QA-02 — No project switcher at phone width

- **Severity:** P1
- **Type:** Confirmed bug
- **Area:** Project switching
- **Reproduction:** Open State at 375×812 and look for the project name or switcher on Workspace, Open Items, Current State and Settings.
- **Expected:** A way to see the current project, switch projects or create a new one.
- **Actual:** `.project-switcher` renders at 0×0 (in the hidden sidebar). No visible element names the project except body copy ("Configure Northstar…" on Settings). There is no "+ New project" entry.
- **Why it matters:** On a phone you cannot switch projects, create one, or easily confirm which project you are writing into.
- **Evidence:** DOM bounding rects; text scan for project names at 375px.

### QA-03 — Ask presents an unconfirmed retention term as "on record" / "approved"

- **Severity:** P1
- **Type:** Confirmed bug
- **Area:** Ask
- **Reproduction:** In Northstar, add the Legal-sync note (90 vs 30 days, older MSA draft). Then Ask "What changed in the project today?" and use the "What are we still unsure about?" chip.
- **Expected:** The 30-day term is described as vendor-stated and unconfirmed. Its own seeded Review says "Security and Legal have not confirmed the agreement", and it is not in Current State.
- **Actual:**
  - Answer 1: "retained for 90 days rather than the 30-day term on record … Conflicts with current assumption (vendor_email from Sept 1 says 30 days)".
  - Answer 2: "This conflicts with Current State (: Support Slack not approved; …) and approved vendor data (: 30 days)".
- **Why it matters:** Ask is treating an uncertain vendor claim as settled fact, which COWORK.md lists as a key failure.
- **Evidence:** Drawer text from both answers.

### QA-04 — Retention evidence offered "Create Question" despite an existing blocking retention Question

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Review / Question
- **Reproduction:** Northstar has the blocking Question "What retention and deletion terms apply to pilot prompts and outputs?" Add the Legal-sync note and open the resulting retention Review.
- **Expected:** "Link existing Question", as the launch-threshold Review offered for its duplicate.
- **Actual:** The Review offered only "Create Question" or "Dismiss suggestion", even though its "Establishes" text references `q-retention`. Creating it added a second, **non-blocking** Question: "Does the vendor MSA establish 30-day or 90-day retention…". Open questions went from 16 to 17; blocking stayed at 3.
- **Why it matters:** The same unknown is now split across two Questions with different blocking status.
- **Evidence:** Open Items counts before and after; both Question titles listed.

### QA-05 — Internal IDs and raw fields leak into user-facing text

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Review / Ask
- **Reproduction:** Expand "Why / source" on the Legal-sync Reviews, and read Ask answers while they draft and after they finish.
- **Expected:** Plain-language references.
- **Actual:**
  - Review text: "effective scope of q-retention", "Current State (k-slack) excludes it".
  - Ask answers: "vendor_email"; empty reference slots such as "Current State (: Support Slack not approved; Slack source restricted by )".
  - While drafting (gone from the final answer): "Review decision_question:", "blocking=true; blocks:", "Review type: open_question", "blocking=false".
- **Why it matters:** It looks broken, and the empty slots hide which item is being cited.
- **Evidence:** Review `innerText`; drawer text at the drafting and final stages.

### QA-06 — A specific Ask question returns a generic blockers card

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Ask
- **Reproduction:** In Northstar, Ask "What is still unresolved about vendor data retention, and is anything blocked by it?"
- **Expected:** An answer about retention: the blocking Question, what it blocks, and the conflicting notes.
- **Actual:** Only "OPEN ITEMS · BLOCKERS 3 — 3 questions are blocking progress. Resolve these to keep the project moving. Open Items →" with "Answer ready".
- **Why it matters:** The user's question is not answered.
- **Evidence:** Drawer text. Note: this question was submitted by setting the input and clicking Ask via script; the others were typed.

### QA-07 — Dates show the UTC day (tomorrow for a Pacific user)

- **Severity:** P2
- **Type:** Confirmed bug / Regression risk
- **Area:** History / Questions / Ask
- **Reproduction:** Act at about 5:40 pm PDT on Oct 9 (00:40 UTC Oct 10).
- **Expected:** Oct 9.
- **Actual:**
  - History entries and "What Changed" items: "OCT 10".
  - Notes: "Project update · Oct 10".
  - Ask: "Project changes made today (2026-10-10)".
  - Every seeded Question in Northstar and Juniper also reads "Oct 10", while their source notes are dated Aug and Sep.
- **Why it matters:** Wrong dates weaken provenance and recency. It probably also feeds QA-08.
- **Evidence:** Browser clock "Fri Oct 09 2026 17:38 PDT"; History and Question rows.

### QA-08 — Ask invents "today" activity

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Ask
- **Reproduction:** Switch to Juniper (no actions taken there yet) and Ask "What changed in the project today…".
- **Expected:** Nothing changed today; the pending Reviews come from Sep 5–8 notes.
- **Actual:** "five significant changes have surfaced today and are under review".
- **Why it matters:** False recency invites the wrong conclusions.
- **Evidence:** Drawer text; Juniper Notes dated Sep 4–8.

### QA-09 — Proposal treats a future revision as already done

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Review
- **Reproduction:** In Northstar, open the Review "Should the evaluation sample and monitoring split be revised together?"
- **Expected:** The proposal reflects the evidence: "the team agreed the evaluation criteria and sample definition **need to be revised** together before the next test round."
- **Actual:**
  - Proposed change: "reported against the **revised** Q3 sample split", "redrawn from the **revised** Q3 sample definition".
  - Establishes: "The sample definition **was revised** in the Q3 planning session."
  - Workspace summary: "were redesigned as one package".
- **Why it matters:** A planned action becomes an established fact one click away from Current State.
- **Evidence:** Review text with Why / source expanded.

### QA-10 — Linking to a Question leaves no visible trace on the Question

- **Severity:** P2
- **Type:** Product ambiguity
- **Area:** Question / Review
- **Reproduction:** Choose "Link existing Question" on "Who owns the final launch-threshold decision?" and then expand that open Question. Separately, choose "Keep tracking" on the vendor-retention Review and expand the blocking retention Question.
- **Expected:** The Question shows the newly linked evidence, or some count or history.
- **Actual:** The toast said "Linked to the existing Question. Current State was not changed." The Question card only shows "This stays unresolved until reviewed evidence establishes an answer" plus actions, with no linked evidence. History lists only Current State changes, so neither decision appears anywhere I could find.
- **Why it matters:** The user cannot tell what their decision attached to, or find it later.
- **Evidence:** Question card text after each action.

### QA-11 — Review copy that does not match its evidence

- **Severity:** P3
- **Type:** Product ambiguity
- **Area:** Review
- **Actual:**
  - On the budget Review, "Establishes: Implementation planning depends on a known budget ceiling" does not say what the evidence establishes ($40k approved).
  - "STILL UNRESOLVED" repeats the Review title ("Is the approved pilot budget ready to be recorded?").
  - "Does not establish" is the same boilerplate on every Review.
- **Related observations (also Product ambiguity):**
  - The accepted budget fact was filed under Current State › "Evaluation & rollout".
  - After "Dismiss concern" on the Support Slack Review, a later Ask still listed Slack eligibility as unresolved.
  - The tentative go-live evidence produced a second, low-value Review ("Should the Go-live date state item continue to be tracked, or should it be retired…") that uses internal "state item" wording.
  - The seeded Slack note "Tier 2 should be fine to include too" is marked "No review needed", although it contradicts Tier 1 scope.

### QA-12 — Confirming Starting State reloads the page with no confirmation; URL and view disagree

- **Severity:** P3
- **Type:** Confirmed bug
- **Area:** Baseline / Navigation
- **Actual:**
  - "Confirm Starting State" triggers a full page reload (navigation type `reload`). It lands on Workspace with the "Exploring State?" tour and no success message.
  - The URL stayed `#open-items` while Workspace was shown.
  - Reloading another tab on `#open-items` also showed Workspace.

### QA-13 — New project dialog: silent failures and missing labels

- **Severity:** P3
- **Type:** Confirmed bug
- **Area:** Project setup
- **Actual:**
  - "Create project" with an empty name does nothing and shows no message (the field is not `required`).
  - Enter in the name field does not submit.
  - Baseline inputs are named by their value or placeholder ("General", "e.g. Purpose") rather than their labels.
  - Desktop sidebar nav buttons have no accessible name.

### QA-14 — Misleading status copy and empty states

- **Severity:** P3
- **Type:** Confirmed bug
- **Area:** Workspace / Baseline / Open Items / History
- **Actual:**
  - **Slack "Just added" banner:** Workspace shows "SOURCES · Slack · Just added" on every project, including a brand-new blank one. Settings for the same project says Slack is "Not connected yet".
  - **Manual Starting State:** the review dialog says "This is the project picture State assembled from your starting material".
  - **History:** describes manual baseline facts as "extracted from Notes".
  - **Unconfirmed baseline:** Open Items says "Nothing needs review. Current State is up to date with accepted evidence" before any Current State exists.
  - **Dismiss toast:** says "No longer tracked as an open question" for a Review that was never a Question.
  - **New-tab onboarding:** a new tab on Northstar showed "Add your first evidence", although the project has 15+ notes.

### QA-15 — Analysis time exceeds its own estimate

- **Severity:** P3
- **Type:** Optional improvement
- **Area:** Evidence
- **Actual:** The progress copy says "A thorough comparison can take around 10–20s". The contradictory Legal note took 31.2s (`/api/evidence`). The low-value note finished in about 4s.

### QA-16 — Phone-width overlaps in State

- **Severity:** P3
- **Type:** Confirmed bug
- **Area:** Mobile UI
- **Actual:**
  - The Ask State floating button covers the "Review" badge on the second Workspace item.
  - In the Ask drawer, the "Copy" button is oversized next to the "STATE ASK" label, which wraps.

### PF-01 — Portfolio home (phone): "What I'm watching for" ticker overlaps another label

- **Severity:** P2
- **Type:** Confirmed bug
- **Area:** Portfolio home
- **Reproduction:** Open the homepage at 375px and scroll to the ticker below the hero.
- **Actual:** The typing text ("Evidence → Review → Curren…", "Authority boundaries") draws on top of the "APPLIED AI PRODUCT WORK" label and is clipped at the right edge. This was seen in two separate captures.
- **Evidence:** Zoomed screenshots.

### PF-02 — Portfolio home (phone): number badge covers a button; card buttons inconsistent

- **Severity:** P3
- **Type:** Confirmed bug
- **Actual:**
  - The "02" badge sits on top of Tastemake's "Case study →" button, hiding "y →".
  - Project Health's buttons stack onto two rows while the other cards' buttons stay in one row.

### PF-03 — Portfolio (phone): nav select label truncated

- **Severity:** P3
- **Type:** Confirmed bug
- **Actual:** The header select reads "Applied Worl ⌄" on the case study pages.

### PF-04 — Portfolio home (desktop): hero sticky notes cover card text

- **Severity:** P3
- **Type:** Product ambiguity (could be an intentional collage)
- **Actual:**
  - The yellow note covers the start of "Your workspace" (reads "ur workspace") and the row icons.
  - The "Current State" note covers the end of the subtitle line.
- **Related observation:** The State case study says "Only approved Slack channels are automatically ingested as Evidence", while staging Settings shows Slack not connected.

### PF-05 — Project Health case study uses a different template

- **Severity:** P3
- **Type:** Optional improvement
- **Actual:** Compared with the State, Tastemake and Meridian pages, Project Health uses:
  - an extra eyebrow line;
  - "My role:" labels with colons and bold grey values in a single line;
  - section headings without the small uppercase labels.

### PF-06 — State case study (phone): core-loop chips leave dangling arrows

- **Severity:** P3
- **Type:** Optional improvement
- **Actual:** "Something happens → Evidence →" wraps with an arrow at the end of each line, so the sequence reads awkwardly.

## Passed checks worth noting

- **Adjust:** prefilled the proposal. The confirmation offered "View Current State" and "View History". History showed "State proposed" vs "Human approved" with "Human adjusted and accepted this change".
- **Update Current State:** asked for confirmation first and replaced the old sentence in place (the old text is gone from Current State).
- **Noisy evidence** (standup / coffee machine): "Current State did not need a Review" in about 4s.
- **Contradictory and tentative evidence** (90-day retention, "early March maybe") did not change Current State. Both produced Question or tracking Reviews instead.
- **Stale tab:** acting on a Juniper Review in a stale tab after switching the other tab to Northstar changed only Juniper. Northstar's count stayed at 5. I saw no cross-project content in Juniper's Open Items, Notes, History or Ask.
- **Ask on project switch:** switching projects cleared the previous Ask answer.
- **Starting State:**
  - Empty manual entry is blocked ("Add at least one fact first").
  - Drafts survive Cancel and reopen.
  - From pasted material, a hedged budget stayed hedged ("finance approval is not yet confirmed").
  - "Confirm Starting State" stays disabled until flagged Reviews are resolved.
- **Leave unchanged on a Question-backed Review** (Juniper internet date) asked "Keep tracking this question?". That follow-up is clear.
- **Phone width:** Review cards, the Adjust dialog and the Ask drawer fit at 375px with no horizontal page overflow.
- **Portfolio:**
  - No horizontal overflow and no broken images on the homepage, State, Tastemake, Project Health or Meridian, at 375px and at 1280px.
  - No web fonts load, so there is no font swap on load.

## Could not verify

- **Flash on load (portfolio):** screenshots arrive too late after a reload to catch a single-frame flash. None was visible in the captures, but this is not proven.
- **Keep tracking / Leave unchanged toasts:** for the first two actions I had not attached a toast listener, so I can't say whether those toasts appeared. Later actions did show toasts.
- **Upload a file** (Add Evidence and Starting State) was not tested.
- **Claude in Chrome:** the extension would not connect (its connect screen hung). Testing used the in-app browser; desktop width was emulated in a smaller panel.
- **Deployed commit SHA:** not confirmed. The local `origin/staging` (c6c6f4e, Oct 7) may be stale.
- **Test data left on shared staging** (no reset used):
  - Northstar: budget fact via Adjust; feature-access Update; VIP Leave unchanged; owner Link; new retention Question; Slack Dismiss; two new notes.
  - Juniper: internet Leave unchanged + keep tracking.
  - New projects: "QA Cowork Oct 9 - Clinic Scheduler" and "QA Cowork Oct 9 - Material baseline".

## Release recommendation

- **Not ready**
- **Blocking findings:** QA-01 (Ask contradicts approved Current State); QA-03 (unconfirmed claim presented as approved); QA-02 (no project switching on phone).
- **Follow-up that should become automated regression coverage:**
  - Ask final-answer post-processing never changes approval status, and leaves no empty reference slots or raw IDs (QA-01, QA-05).
  - Dates are rendered in the user's local day (QA-07).
  - Evidence that overlaps an existing Question proposes Link, not Create (QA-04).
  - The project switcher is reachable at ≤ 480px (QA-02).
  - The Sources banner reflects the actual connection state (QA-14).
