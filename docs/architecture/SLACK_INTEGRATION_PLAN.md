# State Slack Integration Plan

_Status: product/architecture design only. No Slack runtime code has been added._

## Goal

Let people deliberately send useful Slack conversations into State without turning Slack into Current State or treating channel chatter as authoritative truth.

The first integration should make Slack a low-friction source of **Evidence** while preserving State's existing authority model:

**Slack message -> immutable Evidence -> interpretation -> Review/Question as needed -> human authorization -> Current State**

Slack never writes directly to Current State.

## Recommended first version: explicit message capture

Start with a Slack **message shortcut** named **Add to State**.

A person opens a Slack message's context menu and chooses Add to State. Slack sends State the source message and channel context. State confirms the capture, stores an immutable evidence snapshot with Slack provenance, runs the existing interpretation pipeline, and creates Reviews/Question links exactly as a manually added Note would.

This is preferable to passive channel ingestion for the first version because it:

- captures information people actually consider project-relevant;
- avoids flooding State with conversational noise;
- makes user intent explicit;
- minimizes new permissions and data retention;
- keeps the existing Evidence/Review authority model intact;
- gives us a clean path to broader channel monitoring later if the manual workflow proves too burdensome.

## User experience

### In Slack

1. User opens the menu on a project-relevant message.
2. User chooses **Add to State**.
3. State immediately acknowledges the shortcut and opens a confirmation modal.
4. The modal shows:
   - the message being captured;
   - the destination State project (Northstar in the current single-project demo);
   - an optional note such as "why this matters";
   - a checkbox/choice to include the thread context when relevant.
5. User confirms.
6. Slack shows a private confirmation such as **Added to State as Evidence** with a link back to the relevant State Note/Review when possible.

The Slack interaction should not ask the user to classify something as fact, decision, question, or change. State's interpretation pipeline already owns that work.

### In State

Captured Slack messages appear in Notes like other submitted Evidence, with a visible source label such as **Slack** and compact provenance:

- channel name;
- sender display name when available;
- Slack message timestamp;
- link to the original Slack message when available.

If the Slack Evidence proposes a consequential change, it goes to Review. If it directly answers a tracked Question, the existing derived **Answer found · Awaiting review** treatment should apply until the Review is accepted.

## Authority rules

These are hard constraints, not prompt instructions.

1. **Slack is Evidence, not authority.** A Slack message may support or challenge Current State but cannot directly mutate it.
2. **A person's title or wording does not bypass Review.** Even a message from a project lead is still Evidence unless a future explicit project rule establishes a narrower authority behavior.
3. **Conflicting Slack messages remain conflicting Evidence.** The model must not silently choose one as truth.
4. **Question resolution still requires reviewed evidence.** Slack can provide the answer, but the Question remains open until the linked Review is accepted.
5. **Slack edits do not overwrite Evidence.** If we later support edit events, an edited message creates a superseding Evidence record rather than mutating the original snapshot.
6. **Slack deletions do not erase State history.** State preserves the evidence snapshot and can record that the source message was later deleted if we add deletion-event support.
7. **Thread context is supporting context, not a merged synthetic quote.** Preserve individual Slack messages and metadata so provenance remains inspectable.

## Technical shape

### Delivery

Use Slack HTTP interactivity against the existing Render API rather than Socket Mode for production. Slack recommends HTTP request URLs for production when a public endpoint is available; State already has one.

Proposed endpoint:

`POST /api/integrations/slack/interactions`

Responsibilities:

- verify Slack request signature and timestamp before parsing/processing;
- acknowledge valid shortcut payloads inside Slack's 3-second window;
- handle `message_action` shortcut invocation;
- open the confirmation modal;
- handle modal submission;
- enqueue or start evidence processing only after confirmation.

Long model work must happen after the Slack acknowledgment. Do not hold Slack's interaction request open while State interprets Evidence.

### Slack app configuration

Keep a version-controlled Slack app manifest so development/staging and production configuration can be reproduced.

Initial capability:

- one message shortcut: **Add to State**;
- interactivity enabled with the production/staging request URL;
- minimal bot scopes needed for the shortcut and any confirmation UI;
- no broad workspace-wide read scope;
- no posting to arbitrary channels in v1 unless needed for a private confirmation.

Slack documents the `commands` scope as required for shortcuts. A message shortcut payload includes the source message and channel context, so v1 should avoid adding history scopes unless thread expansion or message re-fetching proves necessary.

### Suggested environment variables

Do not commit values.

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN` only if required for modal/message APIs
- `SLACK_APP_ID` optional for validation/observability

Staging and production must use separate Slack apps or at minimum separate credentials/request URLs so testing cannot feed production State.

## Evidence representation

Do not build a separate Slack knowledge store for v1. Normalize Slack capture into the existing Evidence model plus source metadata.

Minimum logical metadata:

- source type: `slack_message`;
- Slack team/workspace ID;
- channel ID and channel display name when available;
- message timestamp / stable Slack message identifier;
- sender Slack user ID and display name when available;
- original permalink when available;
- capture actor (who chose Add to State);
- captured-at timestamp;
- optional thread root ID;
- optional parent/source Evidence ID for later superseding edits.

If schema changes are needed, add a small metadata table or structured metadata column rather than embedding display-only provenance into the evidence text itself.

## Duplicate handling

The same Slack message may be captured more than once. Treat `(workspace_id, channel_id, message_ts)` as the source identity.

Preferred behavior:

- first capture creates Evidence;
- later identical capture returns **Already in State** and links to the existing Evidence;
- an edited/revised source may create a superseding Evidence version later, but only when edit support is intentionally added.

## Security and privacy

- Verify every Slack request using Slack signing-secret verification and reject stale timestamps/replays.
- Store only the Slack content the user explicitly captures in v1.
- Do not ingest unrelated channel history.
- Keep scopes least-privilege.
- Never log Slack tokens, signing secrets, raw authorization headers, or full private message payloads in normal request logs.
- If private-channel capture is supported, State should only receive the explicitly selected message/context authorized by the installed app and user workflow.
- Preserve State's existing immutable Evidence behavior after capture.

## Observability

Add structured events without message bodies:

- Slack shortcut received;
- signature verification success/failure;
- modal submitted/cancelled;
- duplicate capture detected;
- Evidence created;
- interpretation succeeded/failed;
- resulting Review count and linked Question count;
- request/event correlation IDs.

Do not include Slack message text in operational logs.

## What not to build yet

Do not start with:

- automatic ingestion of every message in selected channels;
- AI continuously monitoring Slack for decisions;
- posting State answers into Slack;
- slash-command Ask;
- app Home dashboards;
- multi-workspace OAuth/distribution;
- user/role authority inferred from Slack profiles;
- file ingestion from Slack;
- automatic thread summarization;
- edits/deletes event subscriptions;
- background backfill of historical channels.

Those can be evaluated after explicit capture is working and we know where the friction actually is.

## Implementation sequence

### Phase 0 - product contract

- Lock the v1 rule: explicit user capture only.
- Confirm **Add to State** as the shortcut label.
- Confirm whether v1 captures just one message by default or offers optional thread context.

### Phase 1 - safe plumbing

- Add signing-verification utility and tests.
- Add Slack interaction endpoint that handles Slack URL verification/interactivity safely.
- Add a version-controlled Slack app manifest for staging.
- Add environment configuration placeholders/documentation.
- Return fast acknowledgments without calling the LLM in the Slack request lifecycle.

### Phase 2 - capture into Evidence

- Normalize confirmed message payloads into immutable Evidence.
- Add Slack provenance metadata and duplicate protection.
- Feed captured Evidence through the existing interpretation pipeline.
- Confirm Review and Question-link behavior is identical to manual Notes.

### Phase 3 - UX polish

- Show Slack provenance in Notes.
- Add **Open in Slack** when a permalink exists.
- Show duplicate/already-captured feedback.
- Provide private Slack confirmation with the State outcome/link.

### Phase 4 - QA before broader ingestion

Test at minimum:

- ordinary informational message;
- message that conflicts with Current State;
- message that answers an open Question;
- message that appears authoritative but still requires Review;
- same message captured twice;
- private-channel message;
- threaded message;
- malformed/forged Slack request;
- stale replayed Slack request;
- provider failure after Slack has already acknowledged the user action.

Only after this should we consider passive channel subscriptions.

## Possible second version

If explicit capture proves too manual, the next experiment should be **opt-in project channels**, not workspace-wide ingestion.

Even then, new channel messages should enter a staging/inbox layer and be filtered for project relevance before interpretation. Channel membership would define collection scope, not truth authority.

## Current recommendation

Build the message-shortcut path first. It creates real Slack integration value while changing very little about State's core model. It also gives us a clean learning surface for permissions, provenance, deduplication, request verification, and cross-product UX before attempting a noisier continuous-ingestion system.

## Slack references checked for this design

- https://docs.slack.dev/interactivity/implementing-shortcuts/
- https://api.slack.com/interactivity/shortcuts/using
- https://api.slack.com/apis/event-delivery
- https://api.slack.com/reference/manifests
