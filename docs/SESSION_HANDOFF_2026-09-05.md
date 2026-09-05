# Session handoff — 2026-09-05

## Where things stand right now

- **`origin/staging`** is at commit `bce93d4` ("Style the project-rule category select in Settings") and is deployed to Vercel, `READY`. Staging URL: `ai-learning-git-staging-cairn10.vercel.app` (Vercel deployment protection is on — use the Vercel MCP's `get_access_to_vercel_url` tool to mint a shareable link for programmatic/browser access; tokens are tab/cookie-scoped and expire, so mint a fresh one each session rather than reusing an old link).
- **Local `main`** has been fast-forwarded to match `staging` (same commit `bce93d4`) but **has NOT been pushed to `origin/main` yet** — it's 12 commits ahead of `origin/main`. Do not push to `main` without the user's explicit go-ahead in that session (this has been the standing rule all session: feature branch → `staging` → push → smoke test → only push `main` with explicit authorization).
- **Vercel is on the Hobby plan** (build-rate limited). The user does not want to pay for a higher tier. After the eventual `main` push, hold off on further `staging` deploys for a while to conserve the build-rate budget — don't push speculative/exploratory changes to staging back-to-back.
- **Render** (backend, `state-project-complete/`) is on a free tier that sleeps after idle — first request after idle can be slow/fail; that's expected, not a bug.

## What shipped this session (all currently on staging, not yet on main)

1. **Slack Phase 1** — deterministic Slack intake plumbing (signature verification, dedup, channel approval, noise filtering, conversation/thread aggregation, 15-min quiet window, immutable checkpoints). No LLM calls, no Evidence/Review/Question creation yet (that's Phase 2, explicitly deferred — not started).
   - Live-tested end-to-end against a real Slack workspace (`#state-test` channel). Root cause of an early total-delivery failure was **Slack's Socket Mode being enabled**, which silently routes events away from the configured Request URL — had to be disabled in the Slack app config. Not a code bug.
   - Two real bugs found via my own code review (when asked "any tech debt?") and fixed: a missing checkpoint scheduler (`create_due_checkpoints` had no caller — added `run_checkpoint_poll_loop`, opt-in via `SLACK_CHECKPOINT_POLL_SECONDS`), and cumulative-vs-delta edit/deletion counts being mislabeled (fixed via `slack_conversations.last_checkpointed_at`).
   - 270+ backend tests passing, including `test_slack_phase1.py` (31 tests).
2. **4 UI bug fixes**: stale Ask-answer Review links now check live status before rendering; clicking a Question from an Ask answer opens the modal in place instead of navigating away; Needs-attention list Review/Open links now align beside the item instead of stacking; Settings "Add a project rule" now has a category selector.
3. **Workspace "Sources" banner** reworked into a persistent (non-dismissible) "Connect your apps →" entry point, iterated multiple rounds on visual polish (button sizing, alignment, background tint, height) until it matched the app's existing pill/button conventions exactly (26px height, centered, `--accent-soft` tint).
4. **"Demo" language pass** — reworded all user-visible copy that conflated "seeded example data" with "the whole app is a demo" (banner, Settings project-rename note and reset section, sidebar help dialog, reset-confirmation dialogs, Notes disclosure). Internal identifiers (`data-action="reset-demo"`, `demo_bootstrap`, etc.) intentionally left alone.
5. **AI Professional Edge** — new living-portfolio feature: `content/ai-professional-edge.md` is the single source of truth (real content, not spec placeholders), rendered client-side by `ai-professional-edge.html` via a hand-rolled markdown parser, no build step. Linked from the Learning Guide section of the root `index.html`. Two bugs fixed in QA: missing dark-mode variable overrides, and mobile nav overlapping the page content.
6. **Category-select styling fix** (this session's last change, `bce93d4`) — the "Add a project rule" category `<select>` in Settings was rendering as an unstyled native dropdown, stretched full-width next to the rule-text input (it had inherited `flex:1` from a shared label rule meant for the text input). Fixed in `implementation-context-prototype/context-settings.js`: gave the select its own compact sizing, custom border/arrow matching the app's input styling, and stopped it from flex-stretching (`label:has(select){flex:0 0 auto}`), with a mobile breakpoint that lets it go full-width when the form stacks. Verified visually on desktop and mobile (375px), light/dark — via a local static server preview (`.claude/launch.json`, `python3 -m http.server 8123`, untracked).

## Smoke-test checklist status (proposed 5 items, user said "yes" to running them)

1. ✅ **Banner visual check** (light/dark/mobile) — confirmed clean in dark mode during this pass (desktop + mobile screenshots taken). Not yet explicitly re-checked in light mode this session, but the CSS is theme-variable-driven and unchanged since the last explicit light-mode check earlier in the session.
2. ⬜ **Ask→Review/Question link live click-through** — NOT yet executed. Needs: open staging (or local+API), find an Ask answer with a Review link, resolve that Review, confirm the link disappears; separately click a Question from an Ask answer and confirm the modal opens without navigating away underneath it.
3. ✅ **Settings add-rule category round-trip / dropdown styling** — partially covered: the styling bug the user flagged mid-checklist is now fixed and verified visually (desktop + mobile). The *functional* full round-trip (submit with a specific category, confirm it saves under that category rather than silently defaulting to "Interpretation") has **not** been explicitly re-verified against a live backend this session — worth a quick check against the real staging deployment (local static server has no backend, so "Attention items could not be loaded" there is expected, not a bug).
4. ⬜ **Needs-attention list alignment on Open Items** — NOT yet executed with real data (fix was verified earlier in the session structurally, but not re-checked in this final pass).
5. ⬜ **AI Professional Edge quick re-check** post the dropdown-fix deploy — NOT yet executed.

## Immediate next step for whoever picks this up

Continue the smoke test against the live staging deployment (mint a fresh `get_access_to_vercel_url` link — old ones expire/get tangled with Vercel's login redirect): finish items 2, 4, and 5, and do a live functional check of item 3 (category actually saves correctly, not just looks right). Then report back and get explicit authorization before pushing local `main` (already fast-forwarded to `bce93d4`) to `origin/main`. After that push, hold off on further staging deploys for a while per the Hobby-plan conservation request.

## Not started (explicitly deferred, no action needed yet)

- Slack **Phase 2**: approved-channel configuration UI, connection health display, and eventually the LLM-driven Evidence/Review/Question creation from Slack conversations. User said "let's do that tomorrow" (relative to this session) — no further scoping done.
