# Project status

This file is the canonical current-state handoff for State. Any AI assistant or new chat should read this first, then verify the repository before relying on older handoffs, historical notes, or conversation memory.

## Current production state

_Last updated: September 7, 2026 (Current State rename, Ask/onboarding polish, Learning Guide restructure -- fresh-chat handoff)_

`main` is production, currently at commit `2adb591` (merged via [PR #66](https://github.com/pedringt/ai-learning/pull/66)). Slack Phase 2, self-serve Slack OAuth, a full round of Ask reliability/UX hardening, and a site-wide portfolio content pass are live in production, promoted 2026-09-06. The *only* thing on `main` past that is `.github/workflows/deep-qa.yml` itself (PR #66) -- no application code -- added there deliberately, because GitHub only allows dispatching a `workflow_dispatch` workflow if its file exists on the default branch; the workflow's actual content still runs against whatever ref you dispatch it against (normally `staging`).

**`staging` has diverged substantially further and is not yet promoted -- 54 commits ahead of `main`, CI green throughout.** Nothing below has been promoted; it all requires Paige's explicit go-ahead per the usual workflow rule. See "Next up" below.

### This session's work (2026-09-07), all on `staging` (PRs #76-#78)

**Terminology decision, revisited a second time: "Knowledge" -> "Current State"** (PR #76). Discussed and decided with Paige before changing. "Knowledge" (chosen the same day, see below) reintroduced the exact two-concept problem it was meant to fix, just under a new name, and read like an AI-knowledge-base feature rather than State's actual authority model. **Current State is now the single user-facing name for the maintained project understanding** -- sidebar nav label, the Workspace orientation banner, the full "How this works" modal, the case study, and README were all updated; "Project State" stays fully retired (already removed in the same-day rename below). Internal code (`currentKnowledge()`, `state.data.knowledge`, `knowledgeId`, the `context-project-view.js` filename) was deliberately left alone -- Paige's own guidance was that renaming those would be unnecessary churn. Recommended information architecture, discussed and confirmed: Workspace (command center) / **Current State** (full maintained understanding, with internal subsections Overview / Product & Workflow / Safety & Constraints / Evaluation & Rollout -- unchanged) / Open Items / Notes / History. Bundled into the same PR: the "How Current State stays maintained" orientation banner now anchors to the Workspace heading instead of the Ask panel, so it renders above Needs your attention again (a position it lost when Attention was promoted above Ask on 2026-09-07, see below); Open Items' Reviews section no longer colors its "Needs your review" title text red, only the ACT NOW kicker does, matching Blocking/Open questions.

**Smarter Ask fallback, concrete "How this works" modal, Workspace first-load guidance** (PR #78). Adapted from an external planning spec (`IMPLEMENTATION_SPEC.md`, produced by Claude cowork on Paige's Desktop, not checked into this repo) that was reconciled against the actual codebase rather than applied as written -- several of its assumed function names/locations were stale, and one proposed fix duplicated something that already existed:

- `fallbackResult()` (the client-side deterministic Ask fallback, reached when the live Ask backend genuinely can't be used -- see the note on Ask architecture below) now shows up to 3 topic-matching notes (pending first) instead of a dead-end "I don't have a reliable answer," or 4 clickable example questions when there's no topic match at all. Fixed at the function itself so all 3 call sites benefit; reuses the existing `askTopics()`/`overlapsTopics()`/`simpleNote()` helpers and the existing generic `[data-prompt]` click handler rather than adding new ones.
- The "How this works" modal (`context-quickwins.js`'s `showOrientationHelp()`, the version users actually see) now explains the concrete Add -> Review & decide -> Know -> Ask workflow, naming the actual `+ Add note` button, the Open Items page, and real example questions, instead of abstract steps.
- **Bug found and fixed while verifying the modal change:** `context-app.js` has a second, normally-dormant copy of the same modal (`showDemoHelp()`) that renders instead whenever a user clicks "How this works" before `context-quickwins.js`'s capture-phase override finishes installing. It still said "Explore the maintained Project" and "reset ... from Project Settings" -- stale from before *both* the Project State -> Knowledge and Knowledge -> Current State renames. This isn't theoretical: the project's own Playwright browser test (`test_demo_help_start_actions_are_clickable_and_reset_is_discoverable`, which clicks the button at `hydration_ms=10`) was actually exercising this exact stale copy and had to be updated to match the corrected text.
- Workspace's "Needs your attention" section now says what to do next ("Click an item below to open it in Open Items and make a decision" / "Try asking a question above, or browsing Notes" when clear) -- no new CSS needed, it inherits the existing `.workspace-attention-head p` styling.
- The spec's 4th proposed fix (discoverable example questions in the empty Ask state) was skipped as redundant -- `context-quickwins.js`'s `addAskStarters()` already renders 5 clickable starters there.

**Note on Ask architecture, worth knowing before touching this area again:** `submitAsk()` routes to the live model-backed backend (`ASK.canHandle()`) for essentially every typed query in any environment where the Ask module loaded, which is always true in staging/production. The client-side deterministic `scenarioResult()`/`findScenario()`/`fallbackResult()` system (extensively covered by `state-ask-behavior-tests.js` and friends) is therefore **not** the code path a real deployed-site user hits when the model gives a low-confidence answer -- that's governed server-side, in the Ask prompts/service, not touched this session. The deterministic system is still real and tested (a genuine offline/degraded-backend fallback, and the harness the JS test suites use), but "smarter fallback" here improves that layer specifically, not the live model's own "I don't know" phrasing. If a future session wants to improve what reviewers see when the *live* model can't answer confidently, that's a backend/prompt change in `state-project-complete`, not a frontend one.

**Learning Guide restructured into a cleaner 8-domain framework** (PR #77, `index.html` -- portfolio-site content, not the State product itself). Consolidated a new Domain 03 "Data, Knowledge & Context" from material previously spread across the old Domains 01 and 02 (context engineering, retrieval/grounding with its concept diagram, knowledge systems, plus a new data-quality/lineage/schema item split out of an old combined SQL item); merged the old Implementation/Onboarding and Customer Operations domains into one "Implementation, Adoption & Customer Success"; renamed three domains for clarity (Discovery & Workflow Design; Quality, Risk & Governance; ...Organizational Decisions) with one new "Commercial & market fit" item added to the last. Still exactly eight domains; no content, PDFs, or practice exercises dropped, only reorganized; all internal cross-references updated.

All three PRs verified before merging: 342 Python passed/3 skipped, 136 JS behavior-test assertions across 8 suites (including a real Playwright browser test that caught the `showDemoHelp()` race above), plus live browser verification of the rename, the banner position, the modal content (both copies), and the Open Items color fix.

### Prior sessions, condensed (full detail in git history -- see PRs #59-#74)

A Deep QA harness (`qa/deployed/`, manual `workflow_dispatch` against real deployed staging, see `qa/deployed/README.md`) was built and used to find and fix three real bugs (a Vercel-bypass CORS break, an intermittent "Answer found · Awaiting review" indicator, a stale unused `askPreview()` surface). The State case study was condensed 894->669 words for a faster executive read. An 11-item live-staging QA round fixed, in priority order: Ask misclassifying informational questions as project updates and a dead-end "Answer found" state (P0); Workspace's attention-vs-Ask ordering, inconsistent briefing prioritization from two separate ranking bugs, and Ask prompt-grounding issues (P1); generic History headlines, leaked internal record IDs, and a broken browser-Back path out of History topic detail (P2). Mid-round, "Project State" (the nav label, chosen deliberately by Paige the day before) was discussed and renamed to "Knowledge" for being one term too many alongside "Current State" -- see above for why that didn't stick either. Before that: Slack Phase 2 (LLM-driven relevance evaluation turning approved Slack messages into real Evidence/Review), self-serve Slack OAuth, Ask reliability hardening (45s streaming timeout, independent Settings failure handling, 30s API abort), an authority-model badge fix (`no_review_needed` vs. `reviewed`), a `context-app.js` view-dispatch bug that could clobber Settings, and Ask relevance/follow-up-mode hardening all shipped to `main`. `context-app.js` was also split: Notes/Open Items/Current State view rendering extracted into their own modules (`context-notes-view.js`, `context-open-items-view.js`, `context-project-view.js`), each a pure given-data-return-HTML function.

State is currently release-hardened with the following behavior in production:

- five product-owned Ask starters are assembled deterministically from live State data and skip the model call;
- recognized structural Ask refinements use deterministic shortcuts where appropriate;
- free-form Ask streams useful text before the validated final answer is complete;
- Ask timing instrumentation separates context work from provider time;
- browser Back/Forward works across Workspace, Current State, Open Items, Notes, and History (including a History topic detail correctly returning to the History list, not skipping past it);
- production Ask structured-output headroom is 2400 tokens after live staging QA showed that 1650 and 1800 could truncate otherwise valid structured responses;
- adversarial live Ask QA passed cases covering unknown vs. zero, conflicting authority, superseded history, negation, ambiguous dates, and unresolved authority;
- **Current State** (the nav tab; renamed from Knowledge 2026-09-07, which was itself renamed from Project State earlier the same day -- see above) stays focused on maintained understanding. Facts with relevant history can link into a filtered History view;
- History can show a compact, read-only "Why State treats this as current" explanation for a focused fact, grounded in accepted Review/Evidence provenance rather than open or rejected reviews;
- project rules and demo reset are accessed from a dedicated **Settings** entry in the sidebar below History rather than from the Current State document;
- an open Question explicitly linked to an open Review is presented as **Answer found · Awaiting review**. This is a derived UI state only: the Question remains open until a human accepts the Review;
- Open Items' attention badge counts only pending Reviews + blocking Questions (not every open Question) -- signals "needs a decision," not "everything unresolved."

Free-form Ask remains primarily provider-bound. Context assembly is typically only a few milliseconds, while model-backed calls can take tens of seconds. Streaming is the main perceived-latency mitigation. Ask uses a single interactive attempt with no automatic retry spiral. The configured 30-second provider timeout should not be interpreted as a strict whole-request wall-clock ceiling.

Production Render is on a paid always-on plan, so production cold starts should be treated as solved unless live telemetry shows otherwise. Staging Render remains on the free tier and may sleep after inactivity; ignore the first staging request after idle when measuring performance, or wake staging first.

The production frontend must point to the production API. Staging intentionally points to the staging API. This is handled automatically by environment detection (`VERCEL_ENV==='production'` in `api/state-config.js` and hostname-based inference in `context-api.js`) -- no manual URL-swap step is needed when promoting.

**Vercel Hobby-plan build-rate limit was hit on 2026-09-06** (a routine small commit's deploy failed with "Deployment rate limited — retry in 24 hours"). This is expected on the Hobby plan under heavy same-day push volume, not a sign of anything broken. If a fresh session finds a recent commit isn't reflected on a live Vercel URL, check whether this is why before assuming a deploy failed for a real reason. Batch pushes; avoid a rapid sequence of small separate merges when a handful of fixes can go out together (this session's three PRs were each scoped to one coherent change, then merged back-to-back once each was individually green -- a reasonable middle ground, not a violation of this rule).

## Open work

**Known gap, confirmed 2026-09-06, still open: inviting the State Slack app to a channel does not approve that channel.** Paige's reasonable assumption was that inviting the bot activates the channel; it doesn't. Slack-level membership (can the bot receive events from this channel) and State's own internal approval flag (`slack_channels.enabled`, will State actually evaluate what it hears) are two separate things today, with nothing bridging them -- `slack_intake_service.py` ignores every event type except `message`, so it doesn't even see a "bot added to channel" event to act on. The only way a channel becomes approved right now is the `SLACK_TEAM_ID`/`SLACK_TEST_CHANNEL_ID` env-var-driven startup bootstrap (Phase 1, no admin UI). **Future work:** build a real "auto-approve on invite" path (likely listening for Slack's channel-join event and calling `ensure_channel_approved` from it, or building the Phase-2-planned admin UI so approval doesn't depend on env vars/redeploys at all) -- scope this properly rather than a quick patch, since it changes who/what can add an approved evidence source.

Deliberately still out of scope: real Slack token revocation on Disconnect, and automatic channel discovery via the Slack Web API (channels are currently approved manually).

### Next up: `staging` -> `main` promotion is the pending decision

`staging` is 54 commits ahead of `main`, CI green throughout, everything above individually verified (several live, not just via the deterministic suites). **Ask Paige whether to promote now or hold for more work** -- do not promote without her explicit authorization. If she says yes: this doc's "Current production state" intro needs a fresh rewrite afterward (same rule as always -- any push to `main` gets a same-pass review of this file), and double-check the production-only environment config (production API URL) survives the promotion, per the working rule below.

### Smaller tech debt still open (not urgent, no live QA evidence forcing it)

- `phase2_current/` is named as though it were dead spike code but is load-bearing runtime code (imported by `anthropic_provider.py`, `openai_provider.py`, `interpretation_pipeline_integrated.py`, and the Slack services). Renaming it would be the honest fix, but touches every provider's import path -- scope it as a real change, not a quick rename.
- `context-tool.css`'s ~1,100 non-media-query lines still have the same override-layering pattern the `@media` blocks were consolidated out of in an earlier pass -- harder to verify a merge here since there's no breakpoint to mechanically partition on.
- `index.html`'s version-stamped inline `<style>` blocks are still untouched.
- `context-app.js`'s remaining ~1,580 lines (Ask routing/submission, backend hydration/mapping, the event-dispatch handler) are controller logic that mutates `state` or calls the backend directly -- they don't fit the "given data, return HTML" contract the three already-extracted view modules use, so splitting further needs a different approach, not just repeating that extraction. See README's "Known debt" table for the current file-by-file map.
- Two divergent copies of the "How this works" modal exist (`context-app.js`'s `showDemoHelp()` and `context-quickwins.js`'s `showOrientationHelp()`), kept in sync by hand this session after a real load-order race exposed the stale one. A proper fix would consolidate to one implementation; not done this session to keep the change narrow. Worth doing deliberately if this modal changes again.

None of these are urgent bugs -- they're the kind of thing worth a deliberate, scoped session rather than opportunistic edits mixed into feature work.

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

The Current State provenance/"Why is this true?" work is no longer an open item. The settled product model is: Current State answers what is true now; History explains how and why it became true.

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
- **Before implementing an externally-produced spec (e.g. from Claude cowork or another tool), verify its assumed function names, file locations, and existing features against the actual current code.** This session's spec had all three problems (stale locations, and a proposed feature that already existed) -- treat such specs as a starting point for the *intent*, not as ground truth for the *implementation*.
- **Keep explanations product-oriented.** State is a product-learning and portfolio project. Paige is demonstrating AI product judgment, QA instincts, UX decisions, and the ability to build with AI, not positioning herself as an engineer.

## Core product constraints

- Preserve State's authority model: **AI interprets → software enforces → people decide**.
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
