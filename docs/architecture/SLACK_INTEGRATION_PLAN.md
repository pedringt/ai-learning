# State Slack Integration Plan

_Status: product/architecture design only. No Slack runtime code has been added._

## Goal

Let approved Slack project channels continuously feed useful project information into State without turning Slack into Current State, treating channel chatter as authoritative truth, or flooding Notes with every message.

The integration should preserve State's authority model:

**Approved Slack channel -> filtered conversation activity -> immutable Evidence checkpoints -> interpretation -> Review/Question as needed -> human authorization -> Current State**

Slack supplies information. It never decides what is true.

## Recommended primary model: approved-channel ingestion

The first meaningful Slack integration should let a project owner connect a Slack workspace and explicitly approve one or more project channels in **Settings**.

Only approved channels are eligible to feed State.

State should then receive Slack events in near real time, group them into conversations, filter obvious noise, and create Evidence only when a standalone message or thread contains potentially meaningful project information.

This is preferable to making manual capture the primary workflow because it:

- better matches the original State problem: important project context emerges during normal work and is easy to lose;
- reduces reliance on people remembering to manually save important messages;
- keeps collection scope explicit and narrow through approved channels;
- lets State distinguish consequential information from normal Slack chatter;
- preserves the existing Evidence/Review authority model;
- supports long-running project threads that evolve over hours, days, or weeks.

Manual **Add to State** remains useful as a secondary path for important messages outside approved channels, DMs, or one-off conversations.

## Product principle: approved does not mean authoritative

An approved Slack channel means:

> State is allowed to observe project conversations here.

It does **not** mean:

> Everything said here is true.

Even messages from project leads, executives, or subject-matter experts remain Evidence until State's normal review flow authorizes a Current State change.

## End-to-end flow

```text
SLACK
  -> Approved channel?
      -> No: ignore
      -> Yes
          -> New message / reply / edit / delete event
          -> Deterministic noise filtering
          -> Group into standalone message or thread
          -> Conversation quiet-window / debounce
          -> Compare with last processed conversation checkpoint
          -> Materially new project information?
              -> No: retain ingestion metadata only; no new Evidence
              -> Yes: create immutable Slack Evidence checkpoint
                  -> AI interpretation
                  -> no action / Question / Review
                  -> human authorization
                  -> Current State
                  -> History
```

## Channel configuration in Settings

Slack should live under the existing **Settings** entry.

Conceptually:

```text
Slack
Connected workspace: Acme Workspace

Channels feeding State

#northstar-project      On
#northstar-security     On
#general                Off
#random                 Off
```

For each connected channel, State should eventually support a small, understandable configuration surface:

- ingestion enabled/disabled;
- thread replies included;
- bot/workflow messages excluded by default;
- files excluded initially;
- ingestion start date;
- source authority label fixed to **Supporting evidence** in v1;
- health/status information.

Do not expose a complex AI sensitivity slider in v1. The initial filtering rules should be product-owned and observable through real usage.

## Team awareness

People should be able to use connected project channels normally. State should not require sterile, decision-only Slack behavior.

However, connected channels should be visibly identified so the team understands that project-relevant conversations may flow into State.

When State is connected to a channel, a lightweight notice could say:

> **State is now following #northstar-project.** Project-relevant conversations may be captured as Evidence. Slack cannot change Current State without human review.

The product promise should be:

> Keep working normally in Slack. State pays attention to the parts that may matter.

not:

> Change how you use Slack so State can understand you.

## What becomes Evidence

Do **not** create one Evidence record per Slack message.

The preferred ingestion unit is:

- one meaningful standalone message; or
- one Slack thread/conversation checkpoint.

A thread is a long-lived source identity anchored by its parent message.

Logical source identity:

`workspace_id + channel_id + thread_root_ts`

For a standalone message with no replies, the message timestamp can act as the root identity.

## Threads are long-lived evidence streams

A thread does not need to be considered permanently "finished."

A thread may evolve over hours, days, or weeks. State should treat it as a continuing conversation source and create immutable Evidence checkpoints only when the conversation materially changes.

Example:

```text
Monday
Thread snapshot v1 -> Evidence A
"Salesforce appears to govern access, but legacy exceptions are unresolved."

Tuesday
New replies materially change the discussion
-> Evidence B supersedes Evidence A
"Salesforce handles standard access; AdminHub may govern overrides."

Friday
A correction arrives
-> Evidence C supersedes Evidence B
"AdminHub only governs enterprise overrides; support exceptions differ."
```

The newest Evidence checkpoint is the current source snapshot, while older checkpoints remain immutable for provenance and History.

## Quiet-window / debounce behavior

State should receive Slack events immediately but should not necessarily interpret every message immediately.

Recommended first behavior:

1. Slack delivers a new message/reply event.
2. State records it against the conversation source.
3. A short quiet window starts or resets.
4. When the conversation is quiet for a configurable period, State evaluates the current delta.
5. If the delta contains materially new project information, State creates a new Evidence checkpoint.
6. If the new activity is conversational noise or adds no meaningful information, no new Evidence is created.

The exact initial window should be configurable and evidence-driven; something in the approximate 10-30 minute range is reasonable for testing, but the product should not depend on a thread being permanently finished.

Any future reply wakes the thread again, regardless of thread age.

## Efficient processing of long threads

When a large old thread receives new replies, State should not repeatedly send the entire historical thread to the model if it can avoid doing so.

Prefer:

```text
previous processed checkpoint
+ new replies since checkpoint
-> "what changed?"
-> new Evidence checkpoint only if materially different
```

The full Slack conversation can remain available for source inspection and provenance even when interpretation operates primarily on the delta.

## Deterministic noise filtering

Before AI relevance classification, reject or ignore obvious non-content events where possible.

Initial deterministic exclusions should include:

- duplicate Slack event deliveries;
- reactions and reaction-only events;
- join/leave notifications;
- empty messages;
- Slack system events that contain no project content;
- State's own outbound Slack messages, to prevent loops;
- bot/workflow chatter by default;
- messages received before the channel's configured ingestion start time.

Thread replies remain eligible when their parent conversation belongs to an approved channel.

Do not use message length alone as a hard relevance rule; short messages can still be consequential in context.

## AI relevance filtering

After deterministic filtering, State can use a bounded relevance classifier to decide whether a Slack conversation contains information that could affect maintained project understanding.

The classifier should look primarily for things such as:

- decisions and changes;
- requirements and constraints;
- risks and blockers;
- answers or partial answers to open Questions;
- important corrections;
- changed ownership or authority;
- rollout/readiness changes;
- unresolved contradictions that matter to the project.

Casual conversation, scheduling chatter, acknowledgements, and social discussion should normally produce no Evidence.

Start slightly permissive. Missing consequential project information is worse than admitting a small amount of extra Evidence, especially while the filter is being tuned.

## Slack activity is not State activity

A connected channel can be very active without producing many Evidence records.

Example:

```text
100 Slack conversations observed
-> 28 potentially project-relevant
-> 18 Evidence checkpoints
-> 7 Reviews or Questions
-> 2 manually ignored as junk
```

This funnel should become an important quality signal for the integration.

If most observed conversations become Evidence and people frequently ignore them, filtering is too permissive.

If very little becomes Evidence and users repeatedly report missed important conversations, filtering is too aggressive.

## Evidence representation

Do not build a separate Slack knowledge store for interpreted content. Normalize meaningful Slack conversation checkpoints into the existing Evidence model plus Slack source metadata.

Minimum logical metadata:

- source type: `slack_thread` or `slack_message`;
- Slack workspace/team ID;
- channel ID and display name;
- thread root timestamp / stable source identifier;
- source message timestamps included in the checkpoint;
- participant Slack user IDs and display names where available;
- original thread/message permalink where available;
- ingestion timestamp;
- checkpoint version;
- previous/superseded Evidence ID when applicable;
- source status: active / ignored / removed-at-source / superseded.

The captured Slack conversation is the Evidence. Any generated summary shown in Notes is presentation, not the authoritative source record.

## Notes presentation

Slack should make Notes easier to scan rather than turning it into a message archive.

Conceptually:

```text
Slack · #northstar-project

Feature-access authority discussion
Maya Chen + 2 others · Sep 4
3 messages

Salesforce appears to cover standard access, but the thread identifies unresolved legacy-account exceptions.

Open conversation ->
```

For long-lived threads:

```text
Slack · #northstar-project

Feature-access authority discussion
18 participants · Aug 12-Sep 4
147 messages

Current evidence snapshot:
Salesforce governs standard access, while exception authority is still being clarified.

Last meaningful update: Sep 4
3 Evidence versions

Open Slack conversation
View evidence history
Ignore
```

Again: the summary is UI. The underlying Slack messages/checkpoint remain the Evidence.

## Junk / disposal model

Continuous ingestion makes an explicit junk-handling path mandatory.

Do not hard-delete ordinary junk Evidence as the default behavior because that can break provenance and make past interpretation impossible to explain.

Preferred lifecycle:

- **Active** - usable Evidence.
- **Ignored** - preserved for provenance but excluded from future reasoning/Ask and not allowed to create new downstream effects.
- **Superseded** - an older thread/message checkpoint replaced by a newer immutable checkpoint.
- **Removed at source** - Slack deleted the source content; State records that the upstream source disappeared.

The primary user action should be **Ignore**.

Possible future reasons:

- Not useful
- Wrong project
- Duplicate
- Sensitive / should not be in State

Do not require reason selection in the first implementation unless it meaningfully improves QA.

## Ignoring Evidence with downstream work

If a user ignores Slack Evidence that has not created any downstream Review/Question, simply exclude it from future reasoning.

If it created an open Review, State should warn before ignoring:

> This evidence has a Review waiting on it. Ignoring it will close or supersede that Review without changing Current State.

If it supports an unresolved Question, the Question should remain unresolved unless other valid Evidence supports the same answer.

Ignoring Evidence must never silently mutate Current State.

## Source edits

Slack message edits should not overwrite existing Evidence.

Preferred behavior:

```text
Slack source v1 -> Evidence A
message edited
Slack source v2 -> Evidence B
Evidence B supersedes Evidence A
```

State then interprets what changed between versions.

If the edit changes something consequential, it may create a new Review.

## Source deletions

Slack deletions require different behavior depending on whether the Evidence influenced Current State.

### Deleted before Current State changed

- mark the Evidence **removed at source**;
- exclude it from future reasoning;
- close/supersede any still-open Review based only on that Evidence;
- leave Current State unchanged.

### Deleted after Current State changed

Do not silently undo Current State.

Instead:

```text
supporting Slack source deleted
-> new Review / warning
"Supporting evidence was removed at source. Should this maintained fact still stand?"
-> human decision
```

This preserves State's human-authorization rule.

## Authority rules

These are hard constraints, not prompt instructions.

1. **Slack is Evidence, not authority.**
2. **Approved channel does not mean trusted truth.** Approval defines collection scope only.
3. **A person's Slack title or wording does not bypass Review.**
4. **Conflicting Slack conversations remain conflicting Evidence.** The model must not silently choose one as truth.
5. **Question resolution still requires reviewed evidence.** Slack may provide an answer, but the Question remains open until the linked Review is accepted.
6. **Edits create superseding Evidence rather than overwriting history.**
7. **Deletions do not silently rewrite Current State.**
8. **Thread summaries are presentation, not synthetic authoritative quotes.** Individual source messages remain inspectable.

## Secondary manual path: Add to State

Keep a Slack message shortcut named **Add to State**, but treat it as secondary to approved-channel ingestion.

Use cases:

- important message outside an approved channel;
- DM or private conversation intentionally captured;
- one-off conversation from a channel the project owner does not want continuously connected;
- recovery when a user believes State missed something.

Manual capture still goes through the same Evidence -> interpretation -> Review/Question -> human authorization flow.

If the source message is already represented by connected-channel ingestion, return **Already in State** rather than duplicating Evidence.

## Permissions and visibility

Slack permissions should be least-privilege and source visibility should be preserved as much as practical.

Channel approval and app membership should define what State is allowed to receive.

Do not assume that because State ingested a private-channel conversation every State user should automatically be able to inspect the raw Slack source.

Before private-channel ingestion ships, define a clear rule for source visibility in State, especially once multi-user/multi-project support exists.

For the current single-user portfolio demo, the architecture should still preserve workspace/channel identity so the model does not paint us into a corner.

## Technical shape

### Event delivery

Use Slack HTTP event delivery to the existing Render API rather than polling Slack as the primary mechanism.

Proposed endpoints:

- `POST /api/integrations/slack/events`
- `POST /api/integrations/slack/interactions`

`events` receives channel activity.

`interactions` handles admin/channel setup UI and manual **Add to State** interactions if implemented in Slack.

Responsibilities:

- verify Slack request signatures and timestamps before processing;
- respond to Slack's URL verification challenge;
- acknowledge valid events quickly;
- deduplicate Slack retries deterministically;
- enqueue/store event activity before any slow model processing;
- never hold the Slack request open while State interprets a conversation.

## Event-driven, not daily polling

The primary ingestion mechanism should be near-real-time Slack events.

State is not constantly polling Slack.

```text
Slack message/reply/edit/delete
-> Slack pushes event to State
-> State acknowledges
-> conversation buffer updates
-> quiet-window processing happens separately
```

A periodic reconciliation job can exist as a safety net to detect missed events, but it should not be the main ingestion path.

## Reconciliation

A low-frequency reconciliation process can verify that connected channels have not drifted because of missed/retried events or temporary outages.

Its job is recovery, not bulk re-indexing.

Example:

```text
real-time event ingestion
+
periodic reconciliation
"Did we miss anything from approved channels?"
```

The exact cadence can be chosen later based on Slack API limits and observed reliability.

## Slack app configuration

Keep a version-controlled Slack app manifest so staging and production configuration can be reproduced.

Initial capabilities likely include:

- event subscriptions for message activity needed by approved channels;
- interactivity for channel configuration and optional **Add to State**;
- least-privilege scopes required to read only the channel types we intentionally support;
- no workspace-wide historical backfill in v1;
- no arbitrary outbound posting requirement in v1.

Staging and production should use separate Slack apps or separate credentials/request URLs so testing cannot feed production State.

Suggested secret/config variables, never committed:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_ID`
- `SLACK_TEAM_ID` where useful for single-workspace validation
- per-environment approved-channel configuration or database-backed channel records.

## Duplicate and retry handling

Slack can retry event delivery. Deduplicate before any downstream processing.

Use Slack's event identifier for delivery-level idempotency when available.

Separately maintain conversation/source identity based on workspace/channel/thread root so multiple legitimate events can accumulate into one conversation stream.

Do not confuse:

- duplicate delivery of one Slack event;
- new reply in an existing thread;
- edited version of an existing message;
- new Evidence checkpoint for a materially changed conversation.

These are different cases.

## Integration health

Settings should eventually show compact health information so users can tell whether State is actually receiving Slack activity.

Conceptually:

```text
Slack
Connected: Acme Workspace

#northstar-project
Status: Connected
Last event received: 2 min ago
Last Evidence created: 18 min ago
Pending conversation checks: 0
```

This is more useful than exposing technical logs.

Health state should distinguish:

- connected and healthy;
- authorization/scopes problem;
- event delivery stale;
- backlog pending;
- rate limited/retrying;
- disconnected.

## Privacy and security

- Verify every Slack request using signing-secret verification and reject stale/replayed requests.
- Never log Slack tokens, signing secrets, raw authorization headers, or full private message payloads in ordinary operational logs.
- Keep channel scope explicit and minimal.
- Do not backfill broad workspace history by default.
- Exclude files from v1.
- Preserve immutable Evidence after a checkpoint is created.
- Preserve source status when Slack edits/deletes content.
- Avoid sending private Slack content into unrelated observability systems.
- Keep staging and production Slack credentials isolated.

## Observability

Add structured events without message bodies:

- Slack event received;
- event type;
- workspace/channel/thread identifiers;
- signature verification success/failure;
- duplicate event discarded;
- conversation buffer updated;
- quiet-window evaluation started;
- relevance result;
- Evidence created / no material change;
- Evidence ignored;
- source edited/deleted;
- interpretation succeeded/failed;
- resulting Review count and linked Question count;
- rate-limit/reconciliation events;
- correlation IDs.

Do not include Slack message text in operational logs.

## Metrics to tune the integration

Track at least:

- Slack conversations observed;
- conversations rejected deterministically;
- conversations evaluated by relevance model;
- Evidence checkpoints created;
- Reviews created;
- Questions created/answered;
- Evidence manually ignored;
- duplicate events;
- missed-event recoveries from reconciliation;
- processing latency from Slack activity to Evidence checkpoint.

A useful derived metric is the manual-ignore rate for Slack Evidence.

High ignore rate suggests noisy filtering.

Repeated reports of missed important Slack conversations suggest over-filtering.

## What not to build yet

Do not start with:

- workspace-wide ingestion;
- ingestion of every message as Evidence;
- broad historical backfill;
- automatic Current State updates;
- authority inferred from Slack role/title;
- Slack Ask/chatbot behavior;
- App Home dashboards;
- file ingestion;
- DMs/private channels until visibility rules are explicit;
- advanced per-channel sensitivity sliders;
- model-driven deletion of source Evidence;
- automatic posting of State answers back into project channels.

## Implementation sequence

### Phase 0 - product contract

- Lock approved channels as the primary collection boundary.
- Lock Slack as supporting Evidence only.
- Define thread/source identity and immutable checkpoint semantics.
- Define Ignore / supersede / removed-at-source behavior.
- Keep **Add to State** as a secondary path.

### Phase 1 - safe event plumbing

- Add Slack signing-verification utility and tests.
- Add `/api/integrations/slack/events` with URL verification and fast acknowledgment.
- Add deterministic retry/idempotency handling.
- Add a version-controlled staging Slack app manifest.
- Add environment configuration placeholders/documentation.
- Store incoming event metadata without calling the LLM in the request lifecycle.

### Phase 2 - approved-channel configuration

- Add Slack connection state to Settings.
- Add approved-channel records/configuration.
- Ignore events from unapproved channels.
- Show basic integration health.
- Start ingestion from connection time; no historical backfill.

### Phase 3 - conversation aggregation

- Group standalone messages and thread replies by stable conversation identity.
- Add quiet-window/debounce processing.
- Track last processed checkpoint and new-reply delta.
- Handle dormant threads waking up after days/weeks.
- Add deterministic noise filtering.

### Phase 4 - relevance and Evidence checkpoints

- Add bounded relevance classification.
- Create immutable Evidence only for materially relevant conversations.
- Add Slack provenance metadata.
- Add superseding checkpoint links.
- Feed Slack Evidence through the existing interpretation pipeline.
- Confirm Reviews and Question links behave exactly like other Evidence.

### Phase 5 - Notes + junk handling

- Add Slack-specific Notes presentation.
- Add **Open in Slack** when possible.
- Add **Ignore**.
- Close/supersede downstream open Review work safely when Evidence is ignored.
- Exclude ignored Evidence from future reasoning/Ask.
- Add manual-ignore metrics.

### Phase 6 - edits/deletes + reconciliation

- Subscribe to edit/delete events where supported.
- Create superseding Evidence on edits.
- Mark deleted Slack sources as removed-at-source.
- Surface Review when deleted/corrected source Evidence already influenced Current State.
- Add low-frequency missed-event reconciliation.

### Phase 7 - secondary Add to State

- Add the Slack message shortcut for one-off capture outside approved channels.
- Deduplicate against already-ingested conversation sources.
- Preserve the same Evidence/Review authority flow.

## QA matrix before production Slack ingestion

Test at minimum:

- unapproved-channel message -> ignored;
- approved-channel casual chatter -> no Evidence;
- approved-channel meaningful standalone message -> Evidence;
- short consequential message -> not incorrectly filtered;
- bot/workflow/system chatter -> ignored;
- thread with meaningful parent + replies -> one conversation checkpoint;
- long thread over several days -> multiple superseding Evidence checkpoints only when materially changed;
- old dormant thread revived weeks later -> reevaluated;
- same Slack event delivered twice -> one processing action;
- Slack edit -> superseding Evidence, not overwrite;
- Slack delete before Review acceptance -> removed-at-source, no Current State mutation;
- Slack delete after accepted Current State change -> new Review/warning, no automatic rollback;
- Slack conversation that conflicts with Current State -> Review, not silent override;
- Slack conversation that answers an open Question -> Answer found / Awaiting review until accepted;
- user ignores junk Evidence -> removed from future reasoning without rewriting Current State;
- ignored Evidence with pending Review -> pending Review safely closed/superseded;
- provider failure after Slack acknowledgment -> source event retained and retryable;
- malformed/forged Slack request -> rejected;
- stale replayed Slack request -> rejected;
- staging Slack app cannot feed production State.

## Current recommendation

Build **approved-channel event ingestion** first, not manual capture first.

The smallest useful Slack version for State is:

```text
approved channel
-> Slack events
-> conversation/thread grouping
-> deterministic noise filtering
-> short quiet window
-> relevance check
-> immutable Evidence checkpoint
-> existing Review/Question flow
-> human authorization
```

Add **Ignore** early because continuous sources inevitably produce some junk.

Add **Add to State** afterward as a manual escape hatch for important conversations outside the connected channel set.

This keeps State focused on maintained project understanding rather than becoming a general Slack search/indexing product.

## Product patterns borrowed from similar tools

The design intentionally borrows several established Slack-integration patterns while adapting them to State's stronger authority model:

- admin/project-owner selection of which channels are connected;
- thread/conversation-level records instead of one record per message;
- real-time source-change monitoring rather than daily bulk import;
- bot/workflow filtering before semantic processing;
- passive connected-source ingestion plus a manual capture path;
- visible integration health/status;
- preserving source permissions/provenance;
- separating searchable/source information from trusted/verified knowledge.

State adds one stricter rule on top of these patterns: no Slack-derived information becomes Current State without human authorization.

## Slack references checked for this design

- https://docs.slack.dev/interactivity/implementing-shortcuts/
- https://api.slack.com/interactivity/shortcuts/using
- https://api.slack.com/apis/event-delivery
- https://api.slack.com/reference/manifests
