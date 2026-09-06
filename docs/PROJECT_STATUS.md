# Project status

This file is the canonical current-state handoff for State. Any AI assistant or new chat should read this first, then verify the repository before relying on older handoffs, historical notes, or conversation memory.

## Current production state

_Last updated: September 6, 2026 (post-promotion)_

`main` is production, currently at commit `19ec1be` (merged via [PR #60](https://github.com/pedringt/ai-learning/pull/60)). **Slack Phase 2, self-serve Slack OAuth, a full round of Ask reliability/UX hardening, the Slack empty-channels copy fix, and a site-wide portfolio content/wording pass are all now live in production** -- this third promotion was explicitly authorized by Paige on 2026-09-06. `staging` and `main` now describe the same product with no pending items.

This third promotion (PR #60) additionally shipped a round of feedback from an external site review (a "Kim" persona review simulating the portfolio's target reader), plus repo housekeeping:

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

**Remaining checklist item:** confirm the production Slack app credentials are set as Render env vars on the `state-api` (production) service -- Paige's task, never to be written in this file (see "Authority / credentials" below).

Deliberately still out of scope: real Slack token revocation on Disconnect, and automatic channel discovery via the Slack Web API (channels are currently approved manually).

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