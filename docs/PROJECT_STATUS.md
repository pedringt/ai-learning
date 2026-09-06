# Project status

This file is the canonical current-state handoff for State. Any AI assistant or new chat should read this first, then verify the repository before relying on older handoffs, historical notes, or conversation memory.

## Current production state

_Last updated: September 6, 2026 (post-promotion)_

`main` is production, currently at commit `3811ef6` (merged via [PR #64](https://github.com/pedringt/ai-learning/pull/64)). **Slack Phase 2, self-serve Slack OAuth, a full round of Ask reliability/UX hardening, the Slack empty-channels copy fix, a site-wide portfolio content/wording pass, a fix for a swallowed-click bug in the State prototype, confirmed production Slack channel approval, Settings' Slack button labels, a new Open Items "Draft notes" section, a further Open Items UX/copy round, and a stale-README fix are all now live in production** -- these promotions were explicitly authorized by Paige on 2026-09-06. `staging` and `main` now describe the same product with no pending items.

**PR #64** shipped two things together: a follow-up feedback round on the Open Items/Notes/Ask work from PR #63, and a README accuracy pass. The Open Items/Ask changes: fixed a Notes bug where drag-selecting note text was wiped out because the toggle-note click handler re-rendered the list on the same click that ended the text selection; Draft notes now starts collapsed instead of auto-expanded; Open Items sections were reordered (Draft notes last, after Open questions) and recolored -- Reviews=red, Blocking=yellow, Open questions=purple, Draft notes=green (unchanged) -- replacing several generations of layered CSS overrides with one consistent border-left method per section; and Ask's loading state gained explainer text clarifying that the five suggested prompts answer instantly while a free-typed question runs a live model check. The README pass corrected several claims that had gone stale: it said Ask streaming was disabled in the browser when streaming is actually the primary path for free-typed questions today; it described CI as parked/disabled at a `.disabled` file when it has been live at `.github/workflows/tests.yml` for a while; test counts were stale (248->328 Python, one JS suite listed instead of four); and the staging Render environment plus the Slack integration's backend files weren't documented anywhere in the file tables. Verified live end-to-end on staging before promotion; full JS (81+18+5+1) and Python (328) suites green.

Since PR #61, earlier promotions shipped: **PR #62** (docs-only) confirmed the production Slack channel approval env vars are set and documented a real gap -- inviting the Slack app to a channel does not itself approve that channel for evidence intake; those are two separate mechanisms with nothing bridging them yet, flagged as future work (see "Open work" below), not silently patched. **PR #63** shipped two UX fixes found while using State's own Settings/Open Items pages: Settings' Slack channel toggle buttons now show the action ("Disable"/"Enable") instead of the current state ("Enabled"/"Disabled"); and Open Items gained a new "Draft notes" ("Finish up") section surfacing any note saved but never sent to review, with "Send to review" always visible on each row -- addressing a real risk that Notes' intentional two-step flow (save draft, then separately send to review) could let a draft get silently forgotten. Verified live end-to-end on staging before promotion; full JS (81+18+5+1) and Python (325) suites green.

This fourth promotion (PR #61) fixed a real bug found via adversarial live QA on staging: resolving a Review with "Leave unchanged" (or a generic no-action "Evidence reviewed" outcome) left a full-screen confirmation dialog open indefinitely. Its backdrop silently absorbed the user's very next click as a dismiss instead of letting it reach whatever was actually clicked underneath (e.g. a sidebar nav tab) -- so the first click after resolving a review appeared to do nothing, and a second identical click worked. Fixed by auto-closing the two info-only confirmation variants (no action buttons) ~2.2s after they appear, guarded by a token so a stale timer can never close a different, later dialog; the variant with real actions ("View in Project" / "View in History") still requires explicit dismissal. Verified live: reproduced with raw coordinate clicks (ruling out a testing-tool artifact), confirmed the fix resolves it with realistic timing, full JS (81+18+5+1) and Python (325) suites green. One test (`test_project_subnav_scrolls_existing_document_without_rerender`) was also fixed -- it asserted a fragile whole-file text-order proxy that broke as a side effect of this fix; rescoped to check the actual handler snippet.

This promotion also shipped a round of feedback from an external site review (a "Kim" persona review simulating the portfolio's target reader), plus repo housekeeping:

- Fixed Applied Work's homepage grids rendering 3 columns for only 2 cards (both the major and secondary grid) -- the real bug was a later `!important` CSS override that survived an earlier attempted fix.
- Standardized the last remaining "person" -> "human" terminology mention (Applied Work's State card).
- Reworded the Learning Guide's Meridian eval-cycle sentence ("actually runs" -> "uses") since Meridian is an explicitly simulated exercise, not something that actually runs.
- Added a small "Sources / evidence reviewed" footer to the Legal AI case study, listing the evidence categories already named elsewhere on the page.
- Archived `CLEANUP_PLAN.md` and `POST_FREEZE_CHANGES.md` to `docs/history/` -- verified nearly everything both flagged (orphaned pages, duplicate root frontend files, stale README, dead branches) was already resolved in earlier sessions. Note: `CLEANUP_PLAN.md`'s claim that `phase2_current/` is dead spike code is **incorrect** as of this promotion -- it's a live import of `openai_provider.py`, `anthropic_provider.py`, `interpretation_pipeline_integrated.py`, and the Slack services. Do not act on that specific recommendation if this doc is reopened later.
- Deleted 34 stale GitHub branches (fully-merged or pre-Slack-era snapshots superseded by later work). Only `main` and `staging` remain on the remote.

This promotion shipped (all now on `main`):

- **Slack Phase 2**: LLM-driven relevance evaluation (`slack_relevance_service.py`) that turns approved Slack conversations into real Evidence, which flows into real Review the same way any other Evidence does. Verified live pre-promotion: a real workspace message became a real Review item end-to-end.
- **Self-serve Slack OAuth**: Settings' Connect/Reconnect/Disconnect buttons are fully wired (`slack_oauth_service.py`, `/api/integrations/slack/oauth/*`), replacing manual token setup. Disconnect clears the stored bot token and marks the connection disconnected -- it deliberately does **not** call Slack's real token-revoke API (out of scope for now).
- **Reliability fixes**: free-form Ask streaming has a 45s inactivity timeout (previously could hang indefinitely on a stalled connection); Settings' Slack channel list and health check fail independently (`Promise.allSettled`) instead of one failure blanking both; all frontend API calls abort after 30s instead of hanging, marked `isTimeout` so callers can show "try refreshing."
- **Authority-model fix**: distinguished evidence the system decided needed no human review (`no_review_needed`) from evidence a human actually reviewed (`reviewed`) -- previously both showed an identical "REVIEWED" badge, which blurred State's "LLM interprets -> software enforces -> human authorizes" model.
- **Fixed a real architectural bug**: the view-dispatch table in `context-app.js`'s `render()` had no `settings` entry, so a concurrent async call (e.g. `hydrateBackend()` completing right after a fresh page load, or a Slack OAuth redirect landing directly on Settings) could silently clobber Settings content back to Workspace content. Verified fixed both directions: fresh-load-into-Settings survives full hydration, and navigating away from Settings before its own async work resolves doesn't clobber the destination view either.
- **Ask relevance hardening**: a manual QA failure showed a specific lookup like "Who is the billing contact?" could pull a semantically adjacent record and build a confident but wrong answer. Ask now requires both subject and attribute to match for specific lookups and treats "unknown" as correct when the record doesn't actually establish the fact -- while preserving semantic paraphrase recall (`leads`/`owner`, `going live`/`launch date`, `cost`/`budget`) so legitimate facts aren't lost to over-filtering.
- **Ask follow-up mode hardening**: follow-ups are classified as fresh/topic-shift, dependent, or transformation, with backend and frontend normalization agreeing on punctuation (`Why?` vs `Why`).
- **Fixed a stale-answer-during-loading bug found via live QA on deployed staging** (not caught by unit tests): a fresh/topic-shift question computed the correct `followupMode` but never consulted it before entering the loading state, so the previous unrelated answer stayed visible the entire wait. Fixed, with a dedicated regression suite (`state-ask-loading-visibility-tests.js`) added to CI, plus a corrected Python contract test that had been pinning the buggy line as "expected."
- **UX/copy polish**: Project facts disclose provenance ("Why this is current ->"); the "How this works" help modal has a 5-step flow diagram; Notes' combined reviewed/no-review-needed bucket reads "Processed"; the Workspace Slack banner and Settings' Slack card no longer say "In development" (Slack shipped) and the banner is dismissable; the Ask "Related open items" footer no longer duplicates itself into two near-identical blocks; the Learning Guide intro no longer makes the same point twice.

This second promotion (PR #59) additionally shipped:

- **Settings' Slack empty-channels copy fix**: the stale "Planned" feature-preview (Approved channels / Threads / Noise control) in Settings' Slack card, shown whenever a workspace has zero approved channels, has been replaced with a plain "No channels approved yet." line. All three previously-"Planned" features are actually already built and shipped.
- **Site-wide portfolio content/wording pass** (four rounds of review with Paige, content-only, no application logic changed): standardized the site's own name/tagline to "AI Learning Portfolio" everywhere (previously three different taglines depending on which tab/page); removed a dangling "Meridian's Lab" reference in the Learning Guide by linking it to the actual case study; cut duplicated narrative (the AI-authority-boundary story on the search-cost page, the latency/streaming story between two pages, a repeated firm-size point on the Legal AI page); standardized "person" -> "human" terminology across the State case study to match the product's own authority-model language; reworded several long comma-list sentences for sentence-length variety; and switched two dense sections (State's merged learning-lessons list, Legal AI's three findings) to more visually compact layouts (a 2-column card grid, and tightened list spacing) without cutting content.

Independent manager-readiness review (a separate assistant session, 2026-09-06) gave a GO on product/design/content, contingent on live-verifying: Ask -> Review, Ask -> Question modal, Settings category-save round trip, and Open Items with real data. All four were verified directly against the deployed staging app before promotion (see git history around 2026-09-06 for the detailed QA trail). Additional adversarial scenarios also verified live: rapid-navigation races during hydration, and full Question lifecycle (wrong answer -> reject -> question stays open -> correct answer -> accept -> blocking count/Project/History all reconcile).

State is currently release-hardened with the following behavior in production:

- five product-owned Ask starters are assembled deterministically from live State data and skip the model call;
- recognized structural Ask refinements use deterministic shortcuts where appropriate;
- free-form Ask streams useful text before the validated final answer is complete;
- Ask timing instrumentation separates context work from provider time;
- browser Back/Forward works across Workspace, Project, Open Items, Notes, and History;
- production Ask structured-output headroom is 2400 tokens after live staging QA showed that 1650 and 1800 could truncate otherwise valid structured responses;
- adversarial live Ask QA passed cases covering unknown vs. zero, conflicting authority, superseded history, negation, ambiguous dates, and unresolved authority;
- Project stays focused on maintained Current State. Facts with relevant history can link into a filtered History view;
- History can show a compact, read-only "Why State treats this as current" explanation for a focused fact, grounded in accepted Review/Evidence provenance rather than open or rejected reviews;
- project rules and demo reset are accessed from a dedicated **Settings** entry in the sidebar below History rather than from the Project document;
- an open Question explicitly linked to an open Review is presented as **Answer found · Awaiting review**. This is a derived UI state only: the Question remains open until a human accepts the Review;
- Open Items' attention badge counts only pending Reviews + blocking Questions (not every open Question) -- signals "needs a decision," not "everything unresolved."

Free-form Ask remains primarily provider-bound. Context assembly is typically only a few milliseconds, while model-backed calls can take tens of seconds. Streaming is the main perceived-latency mitigation. Ask uses a single interactive attempt with no automatic retry spiral. The configured 30-second provider timeout should not be interpreted as a strict whole-request wall-clock ceiling.

Production Render is on a paid always-on plan, so production cold starts should be treated as solved unless live telemetry shows otherwise. Staging Render remains on the free tier and may sleep after inactivity; ignore the first staging request after idle when measuring performance, or wake staging first.

The production frontend must point to the production API. Staging intentionally points to the staging API. This is handled automatically by environment detection (`VERCEL_ENV==='production'` in `api/state-config.js` and hostname-based inference in `context-api.js`) -- no manual URL-swap step is needed when promoting, and none was needed for this promotion.

**Vercel Hobby-plan build-rate limit was hit on 2026-09-06** (a routine small commit's deploy failed with "Deployment rate limited — retry in 24 hours"). This is expected on the Hobby plan under heavy same-day push volume (this session alone did ~7 staging merges plus the main promotion), not a sign of anything broken. If a fresh session finds a recent commit isn't reflected on a live Vercel URL, check whether this is why before assuming a deploy failed for a real reason -- the code can be correct and merged while the visual deploy is simply queued/blocked. Batch pushes going forward; avoid a rapid sequence of small separate merges when a handful of fixes can go out together.

## Open work

~~**Remaining checklist item:** confirm the production Slack app credentials are set as Render env vars on the `state-api` (production) service.~~ Done 2026-09-06: `SLACK_TEAM_ID` and `SLACK_TEST_CHANNEL_ID` are set on production and the `state-test` channel (`C0BURAA7MCP`) is confirmed approved live (`/api/integrations/slack/channels` returns it with `enabled: true`).

**Known gap, confirmed 2026-09-06: inviting the State Slack app to a channel does not approve that channel.** Paige's reasonable assumption was that inviting the bot activates the channel; it doesn't. Slack-level membership (can the bot receive events from this channel) and State's own internal approval flag (`slack_channels.enabled`, will State actually evaluate what it hears) are two separate things today, with nothing bridging them -- `slack_intake_service.py` ignores every event type except `message`, so it doesn't even see a "bot added to channel" event to act on. The only way a channel becomes approved right now is the `SLACK_TEAM_ID`/`SLACK_TEST_CHANNEL_ID` env-var-driven startup bootstrap (Phase 1, no admin UI). **Future work:** build a real "auto-approve on invite" path (likely listening for Slack's channel-join event and calling `ensure_channel_approved` from it, or building the Phase-2-planned admin UI so approval doesn't depend on env vars/redeploys at all) -- scope this properly rather than a quick patch, since it changes who/what can add an approved evidence source.

Deliberately still out of scope: real Slack token revocation on Disconnect, and automatic channel discovery via the Slack Web API (channels are currently approved manually).

### Next up (queued 2026-09-06): tech debt pass

Paige asked to tackle tech debt in a fresh chat right after PR #64 promoted. Start from `README.md`'s "Known debt" section, which is current as of this promotion:

- **CSS override layering in `context-tool.css`** is the highest-priority item — around thirty `@media` blocks at various breakpoints, heavy `!important` use, and a pattern where each new visual pass adds one more override layer on top of the last rather than editing the original rule (the 2026-09-06 Open Items tier-color pass is the most recent example, and its own comment literally says it "supersedes the earlier layered overrides above"). Consolidate rather than adding a fourth or fifth generation of the same pattern.
- `context-app.js` is a single ~1,840-line module; splitting it was investigated and rejected for a documented reason (ES modules are CORS-blocked over `file://`, and the prototype must open from the filesystem) — re-read that reasoning in the README before reopening the idea, it's not a naive oversight.
- `phase2_current/` is named as though it were dead spike code but is load-bearing runtime code (imported by `anthropic_provider.py`, `openai_provider.py`, `interpretation_pipeline_integrated.py`, and the Slack services). Renaming it would be the honest fix, but touches every provider's import path — scope it as a real change, not a quick rename.

None of these are urgent bugs — they're the kind of thing worth a deliberate, scoped session rather than opportunistic edits mixed into feature work.

### Next planned work: approved-channel config UI polish and connection health display

Read this file's git history / ask Paige for the 2026-09-05 design discussion if more product-philosophy context is needed before scoping further Slack work; the short version:

- **Integration philosophy:** State takes in places where project knowledge is *created* and helps the team determine what's true; it sends approved outcomes to where people communicate or work. It does not become a workflow/task-management system -- no Jira/GitHub-issue-status ingestion, no board views.
- **Planned inputs stay small:** Slack (Phase 1 + Phase 2 shipped to production), Google Docs, Notion. Not Confluence/Obsidian/OneNote/Coda. No per-service transcription connectors (Fathom/Granola/Otter/etc.) -- generic file upload instead.
- **Slack is deliberately the one bidirectional input** (input+output), not a placeholder pending extension to other tools. Slack -> State (evidence in); State -> Slack (an explicit "Share to Slack" action after a change is accepted, posting a summary to the project channel).
- **New "Documents" area is the other big planned addition** -- a simple file cabinet for project resources (SOWs, briefs, transcripts, client PDFs, etc.). Document != Evidence: uploading a file must not trigger automatic extraction. V1 is deliberately boring (upload/list/open/delete, no folders, no AI processing). Storage recommendation: Vercel Blob for file bytes + a `documents` metadata row in State's existing database (decouple storage key from filename/id so the provider could change later) -- verify Blob's included tier fits the Hobby plan, and note `state-api` is a separate Python/Render service, not Next.js, so Blob integration is a REST call from the backend rather than framework-native. Falls back to a links-only model (no hosting at all) if a storage decision should be deferred further. Later (not V1): a per-document "Review with State" user-initiated action that surfaces candidate Evidence from a document's contents, routed through the existing Evidence -> Review -> Current State pipeline -- never automatic, never bypassing human authorization.
- **Outputs, generally:** State can propose sending an approved outcome elsewhere; it doesn't manage what happens there afterward (propose -> human authorizes -> external action happens, mirroring the existing internal authority model). GitHub Issues is the planned first output/action integration -- an accepted State change can suggest creating an issue; once created, GitHub owns it fully, State does not track/sync status.

Beyond Slack Phase 2, current work should otherwise focus on incremental quality and reliability improvements rather than redesigning or rebuilding State.

High-value areas that remain in scope:

- continue measuring Ask latency and failure rate before changing timeout or provider behavior;
- keep expanding adversarial AI-quality coverage when new failure modes are discovered;
- continue accessibility, mobile, dark-mode, security, observability, and small maintainability improvements when supported by evidence;
- keep temporary QA branches and PRs cleaned up once they are no longer useful.

The Current State provenance/"Why is this true?" work is no longer an open item. The settled product model is: Project answers what is true now; History explains how and why it became true.

Do not carry forward completed staging-era checklists as open work. Re-verify the repo and live environments before reviving an old issue.

## Working rules for AI assistants

- **Update this file whenever `main` changes.** Any push or merge to `main` must include a same-pass review of `docs/PROJECT_STATUS.md`: add relevant new facts, remove stale or completed information, and make sure the document still describes what is actually in production.
- **Read this file first in a new chat.** Then inspect the current repository and connected environments before assuming older handoffs are still accurate.
- **Treat `main` as production and `staging` as test-only.** Staging may be promoted wholesale when Paige explicitly requests it, but the promotion must preserve production-only environment configuration such as the production API URL.
- **Use a PR plus CI for production code changes.** The deterministic suite also runs automatically on direct `staging` pushes so the exact staging commit is validated before promotion. Run the JavaScript behavior suites and the Python/browser suite before promotion unless the change is purely non-runtime documentation.
- **Do not promote an experiment just because it looks promising on staging.** Validate the exact behavior, understand the failure mode, and then promote only when Paige authorizes it.
- **Prefer small, reversible changes.** Fix the narrow problem without opportunistic unrelated refactors.
- **Instrument before optimizing.** For Ask performance, separate provider time from State/context time before deciding what to change.
- **Do not use lower model output limits as a speed optimization without live structured-output testing.** Staging QA demonstrated truncation at both 1650 and 1800 tokens; 2400 passed the known failure cases.
- **Do not misdiagnose free-tier staging cold starts as a production performance problem.** Production is paid and always on; staging can sleep.
- **Historical docs are provenance, not current truth.** Files under `docs/history/` are snapshots. Current repository code, current architecture docs, `README.md`, and this file take precedence.
- **Keep the repo clean.** Remove temporary QA branches/PRs and obsolete handoff material when they no longer serve a purpose.
- **When Paige is giving iterative product, UI, or copy feedback, collect feedback first.** Do not start applying those edits until she says to go ahead.
- **Keep explanations product-oriented.** State is a product-learning and portfolio project. Paige is demonstrating AI product judgment, QA instincts, UX decisions, and the ability to build with AI, not positioning herself as an engineer.

## Core product constraints

- Preserve State's authority model: **LLM interprets -> software enforces -> human authorizes**.
- Current State must remain distinct from Evidence, Reviews, Questions, and History.
- Consequential Current State changes require human authorization.
- Keep deterministic schema, semantic, and authority enforcement around model output.
- Evidence remains immutable; corrections should supersede prior evidence rather than overwrite it.
- Review acceptance remains atomic and stale proposals must be blocked.
- Questions should resolve through evidence/review/state-change flow rather than silently mutating Current State.
- Avoid scope creep: no auth, multi-tenant/organizations, vector DB, RAG, agent framework, major rebuild, or major redesign unless Paige explicitly changes scope.
- Do not deploy or merge speculative production changes.

## Authority / credentials

Do not store raw credentials, tokens, cookies, API keys, session values, private keys, `.env` contents, or database connection secrets in this file.

Use connected or platform-provided access for GitHub, Render, Vercel, Neon, model providers, and other external systems. Destructive or externally visible actions require explicit authorization unless the user has already clearly authorized that specific action in the current task.