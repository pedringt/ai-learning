# Project status

This file is the canonical current-state handoff for State. Any AI assistant or new chat should read this first, then verify the repository before relying on older handoffs, historical notes, or conversation memory.

## Current production state

_Last updated: September 5, 2026 (evening session)_

`main` is production, currently at commit `20dfe0b`, and matches `staging` exactly (both branches in sync). `staging` remains the test branch and intentionally uses the separate staging backend.

This evening's session shipped (all now on `main`):

- fixed a real bug in a `main`-shipped Ask-answer staleness fix: resolved items could reappear (in the on-screen list, the "Related open items" footer, and Copy output) after `hydrateBackend()` pruned them from local state, because the live-status check used a find-by-id-then-check-status lookup with a "not found -> still open" fallback. Replaced with an "is this id still in the live open set" check;
- Ask answers now show an inline notice with a "Refresh this answer" action when the headline/summary text has gone stale relative to a resolved item still shown in that answer's copy;
- all frontend API calls now abort after 30s instead of hanging indefinitely, with the error marked `isTimeout` so callers can show "try refreshing" instead of a silent hang. Root cause of the bug report that prompted this: **Render's `state-api-staging` auto-deploy was not scoped to `state-project-complete/`, so every staging push (including pure frontend commits) bounced the backend** -- Paige has since fixed the Render build-filter config herself; confirmed working (a subsequent frontend-only push produced zero backend redeploys);
- Settings: a failed project-rules fetch and a genuinely empty rules list used to render identically ("No project-specific rules yet.") -- now shows "unavailable" with a Try again action. Add/delete-rule failures now show a visible error instead of console-only;
- removed a stale `state-api-staging.onrender.com/health` wake-ping that was shipping in the production case-study page;
- portfolio copy/professionalism pass: "Open State prototype" corrected to "Open State" (Applied Work card), page title/meta now attributed ("Paige Edrington - Applied AI Product Portfolio"), case-study streaming paragraph updated to match what's actually shipped (streaming is real now, not deferred), stale `SESSION_HANDOFF_2026-09-05.md` archived to `docs/history/`.

State is currently release-hardened with the following behavior in production:

- five product-owned Ask starters are assembled deterministically from live State data and skip the model call;
- recognized structural Ask refinements use deterministic shortcuts where appropriate;
- free-form Ask streams useful text before the validated final answer is complete;
- Ask timing instrumentation separates context work from provider time;
- Ask related-item treatment and grounding language are tightened;
- browser Back/Forward works across Workspace, Project, Open Items, Notes, and History;
- review-completion wording and Open Items/empty-state behavior have been polished;
- production Ask structured-output headroom is 2400 tokens after live staging QA showed that 1650 and 1800 could truncate otherwise valid structured responses;
- adversarial live Ask QA passed cases covering unknown vs. zero, conflicting authority, superseded history, negation, ambiguous dates, and unresolved authority;
- Project stays focused on maintained Current State. Facts with relevant history can link into a filtered History view;
- History can show a compact, read-only "Why State treats this as current" explanation for a focused fact, grounded in accepted Review/Evidence provenance rather than open or rejected reviews;
- project rules and demo reset are accessed from a dedicated **Settings** entry in the sidebar below History rather than from the Project document;
- an open Question explicitly linked to an open Review is presented as **Answer found · Awaiting review**. This is a derived UI state only: the Question remains open until a human accepts the Review.

Free-form Ask remains primarily provider-bound. Context assembly is typically only a few milliseconds, while model-backed calls can take tens of seconds. Streaming is the main perceived-latency mitigation. Ask uses a single interactive attempt with no automatic retry spiral. The configured 30-second provider timeout should not be interpreted as a strict whole-request wall-clock ceiling.

Production Render is on a paid always-on plan, so production cold starts should be treated as solved unless live telemetry shows otherwise. Staging Render remains on the free tier and may sleep after inactivity; ignore the first staging request after idle when measuring performance, or wake staging first.

The production frontend must point to the production API. Staging intentionally points to the staging API. A full staging promotion is acceptable only when the promotion branch normalizes that environment-specific URL before merge.

## Open work

**Next planned work: Slack Phase 2.** Slack Phase 1 (deterministic intake -- signature verification, dedup, channel approval, noise filtering, conversation/thread aggregation, checkpoints) is done and stable, with no LLM calls and no Evidence/Review/Question creation yet. Phase 2 is the LLM-driven step: turning approved Slack conversations into Evidence, plus an approved-channel config UI and connection health display. Not started, not scoped in detail yet -- start there when picking this back up. Read this file's git history / ask Paige for the 2026-09-05 evening session's design discussion if more product-philosophy context is needed before scoping; the short version:

- **Integration philosophy:** State takes in places where project knowledge is *created* and helps the team determine what's true; it sends approved outcomes to where people communicate or work. It does not become a workflow/task-management system -- no Jira/GitHub-issue-status ingestion, no board views.
- **Planned inputs stay small:** Slack (Phase 1 shipped), Google Docs, Notion. Not Confluence/Obsidian/OneNote/Coda. No per-service transcription connectors (Fathom/Granola/Otter/etc.) -- generic file upload instead.
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
- **Use a PR plus CI for production code changes.** Run the JavaScript behavior suites and the Python/browser suite before promotion unless the change is purely non-runtime documentation.
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
